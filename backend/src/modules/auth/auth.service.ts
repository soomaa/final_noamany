import { BadRequestException, Injectable, UnauthorizedException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { MemberLoginResult } from '../../common/types/member-jwt-user';
import { MemberAuthService } from '../member/member-auth.service';
import { isBcryptHash, legacyMatches } from './legacy-hash.util';
import { legacyAudienceScopeFromEmployeeType } from './audience-scope.util';

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

export interface StaffLoginResult {
  accessToken: string;
  refreshToken: string;
  user: JwtUser;
  message: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: JwtUser | MemberLoginResult['user'];
  message: string;
  accountType: 'staff' | 'member';
  /** Members only: true while still on the default password (000000). Always false for staff. */
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => MemberAuthService))
    private readonly memberAuth: MemberAuthService,
  ) {}

  async login(username: string, password: string): Promise<LoginResult> {
    const normalizedUsername = username.trim();
    const user = await this.prisma.users.findFirst({
      where: { username: normalizedUsername },
    });
    if (user && user.approved === 1) {
      const staffResult = await this.loginStaff(user, password);
      return { ...staffResult, accountType: 'staff', mustChangePassword: false };
    }

    const memberResult = await this.memberAuth.login(username, password);
    return {
      accessToken: memberResult.accessToken,
      refreshToken: memberResult.refreshToken,
      user: memberResult.user,
      message: memberResult.message,
      accountType: 'member',
      mustChangePassword: memberResult.mustChangePassword,
    };
  }

  /**
   * Staff-only authentication used by the POS handover flow. It deliberately does not
   * fall back to member login, and returns a complete token pair so the refresh cookie
   * cannot silently restore the previous cashier later.
   */
  async authenticateStaff(username: string, password: string): Promise<StaffLoginResult> {
    const normalizedUsername = username.trim();
    const user = await this.prisma.users.findFirst({
      where: { username: normalizedUsername, approved: 1 },
    });
    if (!user) throw new UnauthorizedException(LOGIN_FAILED);
    return this.loginStaff(user, password);
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
  ): Promise<StaffLoginResult> {
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

    const claims = await this.buildJwtUser(user.user_id);
    return {
      ...(await this.signTokens(claims)),
      user: claims,
      message: 'تم تسجيل الدخول بنجاح',
    };
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

  async signTokens(claims: JwtUser): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.accessTtl'),
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: claims.sub },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.refreshTtl'),
      },
    );
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; user: JwtUser }> {
    let sub: number;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: number; type?: string }>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      if (payload.type === 'member') throw new UnauthorizedException('انتهت الجلسة');
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('انتهت الجلسة');
    }
    const user = await this.prisma.users.findUnique({ where: { user_id: sub } });
    if (!user || user.approved !== 1) throw new UnauthorizedException('انتهت الجلسة');

    const claims = await this.buildJwtUser(sub);
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.accessTtl'),
    });
    return { accessToken, user: claims };
  }

  /** Fresh session claims (branch/scope from DB — not stale JWT payload). */
  async getSessionUser(userId: number): Promise<JwtUser> {
    return this.buildJwtUser(userId);
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
    let manWomenType: 0 | 1 | -1 = -1;
    let jobTitle: string | null = null;
    let personalPhoto: string | null = null;
    let trainerId: number | null = null;
    if (user.emp_code != null) {
      const emp = await this.prisma.employees.findUnique({
        where: { id: user.emp_code },
        select: {
          branch_id_fk: true,
          emp_type: true,
          mosma_wazefy_n: true,
          mosma_wazefy_code: true,
          personal_photo: true,
        },
      });
      if (emp) {
        branch = emp.branch_id_fk ?? branch;
        manWomenType = legacyAudienceScopeFromEmployeeType(emp.emp_type);
        personalPhoto = emp.personal_photo;
        jobTitle = emp.mosma_wazefy_n?.trim() || null;
        if (!jobTitle && emp.mosma_wazefy_code) {
          const job = await this.prisma.department_jobs.findUnique({
            where: { id: emp.mosma_wazefy_code },
            select: { name: true },
          });
          jobTitle = job?.name?.trim() || null;
        }
        const trainer = await this.prisma.club_trainers.findUnique({
          where: { employee_id: user.emp_code },
          select: { id: true, is_active: true, is_deleted: true },
        });
        if (trainer?.is_active && !trainer.is_deleted) trainerId = trainer.id;
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
      emp_code: user.emp_code ?? null,
      branch,
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
