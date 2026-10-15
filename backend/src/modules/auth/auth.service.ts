import { BadRequestException, Injectable, UnauthorizedException, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { isBcryptHash, legacyMatches } from './legacy-hash.util';
import { randomUUID } from 'node:crypto';
import { parseTtlMilliseconds } from './staff-session.policy';
import { SessionContext, StaffSessionService } from './staff-session.service';
import { DisabledWorkforceAdapter, WORKFORCE_ADAPTER, WorkforceAdapter } from '../../ports/workforce/workforce.adapter';
import {
  DisabledExternalIdentityAdapter,
  EXTERNAL_IDENTITY_ADAPTER,
  ExternalIdentityAdapter,
  ExternalIdentityClaims,
  ExternalIdentitySelectionResult,
} from '../../ports/identity/external-identity.adapter';

/** Faithful to legacy Auth.php: same failure message whether user is missing,
 *  password is wrong, or the account is not approved. */
const LOGIN_FAILED = 'لا يمكنك الدخول هناك بيان خاطىء';

const DEFAULT_USER_AVATAR = 'user-20250803a67b668cca.png';

function resolveSessionImage(userImage: string | null, personalPhoto: string | null): string | null {
  const photo = personalPhoto?.trim();
  if (photo && photo !== '0') return photo;
  const img = userImage?.trim();
  if (img && img !== DEFAULT_USER_AVATAR) return img;
  return img ?? null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: JwtUser | ExternalIdentityClaims;
  message: string;
  accountType: string;
  /** Host identities may require a password change. Always false for staff. */
  mustChangePassword: boolean;
  exposeTokensInBody: boolean;
  requiresBranchSelection?: false;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Optional() @Inject(EXTERNAL_IDENTITY_ADAPTER)
    private readonly externalIdentity: ExternalIdentityAdapter = new DisabledExternalIdentityAdapter(),
    private readonly staffSessions: StaffSessionService,
    @Optional() @Inject(WORKFORCE_ADAPTER)
    private readonly workforce: WorkforceAdapter = new DisabledWorkforceAdapter(),
  ) {}

  async login(
    username: string,
    password: string,
    context: SessionContext = {},
  ): Promise<LoginResult | ExternalIdentitySelectionResult> {
    const normalizedUsername = username.trim();
    const user = await this.prisma.users.findFirst({
      where: { username: normalizedUsername },
    });
    if (user && user.approved === 1) {
      const staffResult = await this.loginStaff(user, password, context);
      return {
        ...staffResult,
        accountType: 'staff',
        mustChangePassword: false,
        exposeTokensInBody: false,
      };
    }

    return this.externalIdentity.login(username, password);
  }

  /**
   * Staff-only authentication used by the POS handover flow. It deliberately does not
   * fall back to external identity login, and returns a complete token pair so the refresh cookie
   * cannot silently restore the previous cashier later.
   */
  async authenticateStaff(
    username: string,
    password: string,
    context: SessionContext = {},
  ) {
    const normalizedUsername = username.trim();
    const user = await this.prisma.users.findFirst({
      where: { username: normalizedUsername, approved: 1 },
    });
    if (!user) throw new UnauthorizedException(LOGIN_FAILED);
    return this.loginStaff(user, password, context);
  }

  /** Verify a staff handover credential without creating a browser session yet. */
  async verifyStaffCredentials(username: string, password: string): Promise<JwtUser> {
    const user = await this.prisma.users.findFirst({
      where: { username: username.trim(), approved: 1 },
    });
    if (!user) throw new UnauthorizedException(LOGIN_FAILED);
    return this.verifyStaffIdentity(user, password);
  }

  private async loginStaff(
    user: {
      user_id: number;
      password: string | null;
      approved: number | null;
      user_pass?: string | null;
      app_pass?: string | null;
      pass_demo?: string | null;
      x_y_z?: string | null;
    },
    password: string,
    context: SessionContext,
  ): Promise<Omit<LoginResult, 'accountType' | 'mustChangePassword' | 'exposeTokensInBody'>> {
    const claims = await this.verifyStaffIdentity(user, password);
    return {
      ...(await this.signTokens(claims, context)),
      user: claims,
      message: 'تم تسجيل الدخول بنجاح',
    };
  }

  private async verifyStaffIdentity(
    user: {
      user_id: number;
      password: string | null;
      approved: number | null;
      user_pass?: string | null;
      app_pass?: string | null;
      pass_demo?: string | null;
      x_y_z?: string | null;
    },
    password: string,
  ): Promise<JwtUser> {
    const { valid, needsRehash, plaintext } = await this.verifyStaffPassword(user, password);
    if (!valid) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    // 3) Transparent migration: rehash legacy password to bcrypt, drop plaintext copies.
    if (needsRehash) {
      const rounds = this.config.get<number>('bcryptRounds') ?? 12;
      const bhash = await bcrypt.hash(plaintext, rounds);
      await this.prisma.users.update({
        where: { user_id: user.user_id },
        data: { password: bhash, x_y_z: null, app_pass: null, pass_demo: null, user_pass: null },
      });
    }

    return this.buildJwtUser(user.user_id);
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.users.findUnique({ where: { user_id: userId } });
    if (!user || user.approved !== 1) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const { valid } = await this.verifyStaffPassword(user, currentPassword);
    if (!valid) {
      throw new BadRequestException('كلمة المرور الحالية غير صحيحة');
    }

    const rounds = this.config.get<number>('bcryptRounds') ?? 12;
    const bhash = await bcrypt.hash(newPassword, rounds);
    await this.prisma.users.update({
      where: { user_id: user.user_id },
      data: { password: bhash, x_y_z: null, app_pass: null, pass_demo: null, user_pass: null },
    });
    await this.staffSessions.revokeAllForUser(user.user_id, 'password_changed');
    return { message: 'تم تغيير كلمة المرور بنجاح' };
  }

  private async verifyStaffPassword(
    user: {
      password: string | null;
      user_pass?: string | null;
      app_pass?: string | null;
      pass_demo?: string | null;
      x_y_z?: string | null;
    },
    password: string,
  ): Promise<{ valid: boolean; needsRehash: boolean; plaintext: string }> {
    const attempts = [password, password.trim()].filter((value, index, values) => value && values.indexOf(value) === index);
    const hashedStores = [user.password, user.user_pass, user.app_pass, user.pass_demo]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value);

    for (const attempt of attempts) {
      for (const stored of hashedStores) {
        if (isBcryptHash(stored)) {
          if (await bcrypt.compare(attempt, stored)) {
            return {
              valid: true,
              needsRehash: stored !== user.password,
              plaintext: attempt,
            };
          }
        } else if (legacyMatches(attempt, stored) || stored === attempt) {
          return { valid: true, needsRehash: true, plaintext: attempt };
        }
      }

      const clearText = user.x_y_z?.trim();
      if (clearText && clearText === attempt) {
        return { valid: true, needsRehash: true, plaintext: attempt };
      }
    }

    return { valid: false, needsRehash: false, plaintext: password };
  }

  async signTokens(
    claims: JwtUser,
    context: SessionContext = {},
  ): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const accessToken = await this.jwt.signAsync({ ...claims, sessionId }, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.accessTtl'),
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: claims.sub, type: 'staff-refresh', sid: sessionId, familyId },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.refreshTtl'),
      },
    );
    const ttl = parseTtlMilliseconds(
      this.config.get<string | number>('jwt.refreshTtl'),
    );
    await this.staffSessions.create({
      id: sessionId,
      familyId,
      userId: claims.sub,
      refreshToken,
      expiresAt: new Date(Date.now() + ttl),
      ...context,
    });
    return { accessToken, refreshToken, sessionId };
  }

  async refresh(
    refreshToken: string,
    context: SessionContext = {},
  ): Promise<{ accessToken: string; refreshToken: string; user: JwtUser }> {
    let payload: { sub: number; type: string; sid: string; familyId: string };
    try {
      payload = await this.jwt.verifyAsync<{
        sub: number;
        type: string;
        sid: string;
        familyId: string;
      }>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      if (
        payload.type !== 'staff-refresh' ||
        !Number.isInteger(payload.sub) ||
        !payload.sid ||
        !payload.familyId
      ) {
        throw new UnauthorizedException('انتهت الجلسة');
      }
    } catch {
      throw new UnauthorizedException('انتهت الجلسة');
    }
    const user = await this.prisma.users.findUnique({ where: { user_id: payload.sub } });
    if (!user || user.approved !== 1) throw new UnauthorizedException('انتهت الجلسة');

    const claims = await this.buildJwtUser(payload.sub);
    const successorId = randomUUID();
    const accessToken = await this.jwt.signAsync({ ...claims, sessionId: successorId }, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.accessTtl'),
    });
    const nextRefreshToken = await this.jwt.signAsync(
      {
        sub: claims.sub,
        type: 'staff-refresh',
        sid: successorId,
        familyId: payload.familyId,
      },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.refreshTtl'),
      },
    );
    const ttl = parseTtlMilliseconds(
      this.config.get<string | number>('jwt.refreshTtl'),
    );
    await this.staffSessions.rotate({
      currentSessionId: payload.sid,
      familyId: payload.familyId,
      userId: payload.sub,
      currentRefreshToken: refreshToken,
      successor: {
        id: successorId,
        refreshToken: nextRefreshToken,
        expiresAt: new Date(Date.now() + ttl),
      },
      ...context,
    });
    return { accessToken, refreshToken: nextRefreshToken, user: claims };
  }

  /** Fresh session claims (branch/scope from DB — not stale JWT payload). */
  async getSessionUser(userId: number, sessionId?: string): Promise<JwtUser> {
    if (sessionId) await this.staffSessions.assertAccessSession(userId, sessionId);
    return { ...(await this.buildJwtUser(userId)), ...(sessionId ? { sessionId } : {}) };
  }

  async logout(userId: number, sessionId?: string): Promise<void> {
    if (!sessionId) return;
    await this.staffSessions.revokeFamily(userId, sessionId, 'logout');
  }

  /**
   * Resolve branch + man/women scope for JWT claims.
   * users.emp_code stores employees.id (legacy convention), not employees.emp_code.
   */
  private async buildJwtUser(userId: number): Promise<JwtUser> {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: {
        user_id: true,
        level: true,
        emp_code: true,
        name: true,
        image: true,
        branch_id_fk: true,
        approved: true,
      },
    });
    if (!user || user.approved !== 1) throw new UnauthorizedException('انتهت الجلسة');

    let branch = user.branch_id_fk ?? 0;
    let employeeCode: number | null = null;
    let manWomenType = 0;
    let jobTitle: string | null = null;
    let personalPhoto: string | null = null;
    let trainerId: number | null = null;
    let branchIds: number[] | undefined;
    if (user.emp_code != null) {
      const emp = await this.prisma.employees.findUnique({
        where: { id: user.emp_code },
        select: {
          id: true,
          emp_code: true,
          branch_id_fk: true,
          emp_type: true,
          mosma_wazefy_n: true,
          mosma_wazefy_code: true,
          personal_photo: true,
          leave_emp: true,
          employee_type: true,
        },
      });
      if (emp) {
        if (emp.leave_emp === 1 || emp.employee_type !== 1) {
          throw new UnauthorizedException('انتهت الجلسة');
        }
        employeeCode = emp.emp_code ?? null;
        branch = emp.branch_id_fk ?? branch;
        manWomenType = emp.emp_type ?? 0;
        personalPhoto = emp.personal_photo;
        jobTitle = emp.mosma_wazefy_n?.trim() || null;
        if (!jobTitle && emp.mosma_wazefy_code) {
          const job = await this.prisma.department_jobs.findUnique({
            where: { id: emp.mosma_wazefy_code },
            select: { name: true },
          });
          jobTitle = job?.name?.trim() || null;
        }
        trainerId = (await this.workforce.identityForEmployee(user.emp_code)).providerRecordId;
        const salesBranches = await this.prisma.club_sales_rep_branches.findMany({
          where: { employee_id: user.emp_code },
          select: { branch_id: true },
          orderBy: { branch_id: 'asc' },
        });
        if (salesBranches.length) branchIds = salesBranches.map((row) => row.branch_id);
      }
    }

    let branchName: string | null = null;
    if (branch > 0) {
      const branchRow = await this.prisma.tbl_branches.findUnique({
        where: { branch_id: branch },
        select: { branch_name: true },
      });
      branchName = branchRow?.branch_name?.trim() || null;
    }

    return {
      sub: user.user_id,
      level: user.level ?? null,
      employeeId: user.emp_code ?? null,
      employeeCode,
      emp_code: user.emp_code ?? null,
      branch,
      ...(branchIds ? { branchIds } : {}),
      branch_name: branchName,
      man_women_type: manWomenType,
      name: user.name ?? null,
      image: resolveSessionImage(user.image, personalPhoto),
      job_title: jobTitle,
      is_trainer: trainerId != null,
      trainer_id: trainerId,
    };
  }
}
