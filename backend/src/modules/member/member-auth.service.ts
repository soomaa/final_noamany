import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  MemberBranchOption,
  MemberJwtUser,
  MemberLoginOutcome,
  MemberLoginResult,
} from '../../common/types/member-jwt-user';
import { MEMBER_DEFAULT_PASSWORD, MEMBER_MIN_PASSWORD_LENGTH } from '../../common/constants/member-auth.constants';
import { localDateString, normalizePhoneForStorage } from '../club-members/club-member.utils';
import { membershipStanding, standingRank } from './member-login-membership';

const LOGIN_FAILED = 'رقم الجوال أو كلمة المرور غير صحيحة';
const SELECTION_EXPIRED = 'انتهت مهلة اختيار الفرع، سجّل الدخول مرة أخرى';
const BRANCH_UNAVAILABLE = 'هذا الفرع غير متاح لحسابك';

/** Short-lived token proving the password step of a multi-branch login. */
const SELECTION_TOKEN_TYPE = 'member-branch-select';
const SELECTION_TOKEN_TTL = '10m';

/** The subscription columns the branch picker needs to describe a membership. */
const STANDING_SUBSCRIPTIONS = {
  select: {
    branch_id: true, subscription_start_date: true, subscription_end_date: true,
    status: true, is_linked_to_sessions: true, sessions_count: true, sessions_used: true,
  },
} as const;

type AppUserRow = {
  user_id: number;
  user_phone: string | null;
  user_name: string | null;
  user_pass: string | null;
  status: number | null;
};
type MembershipRow = { id: number; branch_id: number; member_code: string; name: string };

@Injectable()
export class MemberAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * A person enrolled in several branches has one `club_members` row — and one app
   * account (`api_users`) — per branch. The password is checked against each of those
   * accounts, and only memberships whose own account accepts it count: a branch account
   * with a different password is never revealed.
   *
   * One match signs in directly with the exact response single-branch members always got.
   * Several return the branch picker instead of a session (`requiresBranchSelection`); the
   * member's choice is exchanged for tokens at {@link selectBranch}. The matched set travels
   * in the tokens as `linkedMemberIds`, which is what later allows switching branch without
   * the password.
   */
  async login(phone: string, password: string, branchId?: number): Promise<MemberLoginOutcome> {
    const normalized = normalizePhoneForStorage(phone);
    if (!normalized) throw new UnauthorizedException(LOGIN_FAILED);

    const memberships = await this.prisma.club_members.findMany({
      where: {
        phone: normalized,
        is_deleted: false,
        is_active: true,
        app_user_id: { not: null },
        ...(branchId != null ? { branch_id: branchId } : {}),
      },
      orderBy: { id: 'asc' },
      include: { subscriptions: STANDING_SUBSCRIPTIONS },
    });
    if (!memberships.length) throw new UnauthorizedException(LOGIN_FAILED);

    const appUserIds = [...new Set(memberships.map((m) => m.app_user_id!))];
    const appUsers = await this.prisma.api_users.findMany({ where: { user_id: { in: appUserIds } } });
    const accepted = new Map<number, AppUserRow>();
    for (const appUser of appUsers) {
      if (appUser.status !== 1) continue;
      if (await bcrypt.compare(password, appUser.user_pass ?? '')) accepted.set(appUser.user_id, appUser);
    }
    const verified = memberships.filter((m) => accepted.has(m.app_user_id!));
    if (!verified.length) throw new UnauthorizedException(LOGIN_FAILED);

    const linkedMemberIds = verified.map((m) => m.id);
    if (verified.length === 1) {
      return this.issueSession(accepted.get(verified[0].app_user_id!)!, verified[0], linkedMemberIds);
    }

    const selectionToken = await this.jwt.signAsync(
      { type: SELECTION_TOKEN_TYPE, memberIds: linkedMemberIds },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: SELECTION_TOKEN_TTL,
      },
    );
    return {
      requiresBranchSelection: true,
      selectionToken,
      branches: await this.describeBranches(verified),
      message: 'اختر الفرع الذي تريد الدخول إليه',
    };
  }

  /** Second step of a multi-branch login: the chosen membership becomes the session. */
  async selectBranch(selectionToken: string, memberId: number): Promise<MemberLoginResult> {
    let memberIds: number[];
    try {
      const payload = await this.jwt.verifyAsync<{ type?: string; memberIds?: unknown }>(selectionToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      if (payload.type !== SELECTION_TOKEN_TYPE || !Array.isArray(payload.memberIds)) {
        throw new Error('wrong token');
      }
      memberIds = payload.memberIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    } catch {
      throw new UnauthorizedException(SELECTION_EXPIRED);
    }
    if (!memberIds.includes(memberId)) throw new UnauthorizedException(BRANCH_UNAVAILABLE);
    return this.openLinkedMembership(memberId, memberIds);
  }

  /** The member's branches for the in-app switcher; `current` marks this session's. */
  async listBranches(user: MemberJwtUser): Promise<MemberBranchOption[]> {
    const ids = user.linkedMemberIds?.length ? user.linkedMemberIds : [user.memberId];
    const memberships = await this.prisma.club_members.findMany({
      where: { id: { in: ids }, is_deleted: false, is_active: true, app_user_id: { not: null } },
      include: { subscriptions: STANDING_SUBSCRIPTIONS },
    });
    const options = await this.describeBranches(memberships);
    return options.map((option) => ({ ...option, current: option.memberId === user.memberId }));
  }

  /** Moves the session to another membership proved at login — no password needed. */
  async switchBranch(user: MemberJwtUser, memberId: number): Promise<MemberLoginResult> {
    const ids = user.linkedMemberIds?.length ? user.linkedMemberIds : [user.memberId];
    if (!ids.includes(memberId)) throw new UnauthorizedException(BRANCH_UNAVAILABLE);
    return this.openLinkedMembership(memberId, ids);
  }

  /**
   * Re-validates [memberId] now — still active, still linked to an enabled app account —
   * rather than trusting the moment the password was checked, then issues its tokens.
   */
  private async openLinkedMembership(memberId: number, linkedMemberIds: number[]): Promise<MemberLoginResult> {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false, is_active: true, app_user_id: { not: null } },
    });
    if (!member?.app_user_id) throw new UnauthorizedException(BRANCH_UNAVAILABLE);
    const appUser = await this.prisma.api_users.findUnique({ where: { user_id: member.app_user_id } });
    if (!appUser || appUser.status !== 1) throw new UnauthorizedException(BRANCH_UNAVAILABLE);
    return this.issueSession(appUser, member, linkedMemberIds);
  }

  private async issueSession(
    appUser: AppUserRow,
    member: MembershipRow,
    linkedMemberIds: number[],
  ): Promise<MemberLoginResult> {
    // Still on the shared default password → app must force a change before anything else.
    const mustChangePassword = await bcrypt.compare(MEMBER_DEFAULT_PASSWORD, appUser.user_pass ?? '');
    const claims = this.buildClaims(appUser, member, linkedMemberIds);
    const tokens = await this.signTokens(claims);
    return {
      ...tokens,
      user: claims,
      message: 'تم تسجيل الدخول بنجاح',
      mustChangePassword,
    };
  }

  /** Branch name, code and today's standing per membership; usable ones first. */
  private async describeBranches(
    memberships: Array<MembershipRow & { subscriptions?: Parameters<typeof membershipStanding>[0]['subscriptions'] }>,
  ): Promise<MemberBranchOption[]> {
    const branchIds = [...new Set(memberships.map((m) => m.branch_id))];
    const [branches, profiles] = await Promise.all([
      this.prisma.tbl_branches.findMany({
        where: { branch_id: { in: branchIds } },
        select: { branch_id: true, branch_name: true },
      }),
      this.prisma.club_branch_profiles.findMany({
        where: { branch_id: { in: branchIds } },
        select: { branch_id: true, display_name: true },
      }),
    ]);
    const today = localDateString();
    const nameOf = (branchId: number) =>
      profiles.find((p) => p.branch_id === branchId)?.display_name?.trim() ||
      branches.find((b) => b.branch_id === branchId)?.branch_name?.trim() ||
      `فرع ${branchId}`;
    return memberships
      .map((m) => {
        const { standing, endsAt } = membershipStanding(m, today);
        return {
          memberId: m.id,
          branchId: m.branch_id,
          branchName: nameOf(m.branch_id),
          memberCode: m.member_code,
          standing,
          endsAt,
        };
      })
      .sort((a, b) => standingRank(b.standing) - standingRank(a.standing) || a.branchId - b.branchId);
  }

  /**
   * Changes the password of the signed-in account and of every other branch account the
   * member proved at login ([linkedMemberIds]), so one person keeps one password — and
   * the next login still finds all their branches.
   */
  async changePassword(
    appUserId: number,
    currentPassword: string,
    newPassword: string,
    linkedMemberIds: number[] = [],
  ): Promise<{ message: string }> {
    const appUser = await this.prisma.api_users.findUnique({ where: { user_id: appUserId } });
    if (!appUser || appUser.status !== 1) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const valid = await bcrypt.compare(currentPassword, appUser.user_pass ?? '');
    if (!valid) throw new BadRequestException('كلمة المرور الحالية غير صحيحة');

    // Block re-using the shared default so mustChangePassword actually clears.
    if (newPassword === MEMBER_DEFAULT_PASSWORD) {
      throw new BadRequestException('كلمة المرور الجديدة يجب أن تختلف عن كلمة المرور الافتراضية');
    }
    if (newPassword.length < MEMBER_MIN_PASSWORD_LENGTH) {
      throw new BadRequestException('كلمة المرور يجب ألا تقل عن 6 خانات');
    }

    const linkedAccounts = linkedMemberIds.length
      ? await this.prisma.club_members.findMany({
          where: { id: { in: linkedMemberIds }, is_deleted: false, app_user_id: { not: null } },
          select: { app_user_id: true },
        })
      : [];
    const accountIds = [...new Set([appUserId, ...linkedAccounts.map((m) => m.app_user_id!)])];
    const rounds = this.config.get<number>('bcryptRounds') ?? 12;
    const user_pass = await bcrypt.hash(newPassword, rounds);
    if (accountIds.length === 1) {
      await this.prisma.api_users.update({
        where: { user_id: appUserId },
        data: { user_pass },
      });
    } else {
      await this.prisma.api_users.updateMany({
        where: { user_id: { in: accountIds }, status: 1 },
        data: { user_pass },
      });
    }
    return { message: 'تم تغيير كلمة المرور بنجاح' };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; user: MemberJwtUser }> {
    let sub: number;
    let refreshMemberId: number | undefined;
    let refreshBranchId: number | undefined;
    let refreshLinkedIds: number[] = [];
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: number;
        type?: string;
        memberId?: number;
        branchId?: number;
        linkedMemberIds?: unknown;
      }>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      if (payload.type !== 'member') throw new UnauthorizedException('انتهت الجلسة');
      sub = payload.sub;
      refreshMemberId = payload.memberId;
      refreshBranchId = payload.branchId;
      refreshLinkedIds = Array.isArray(payload.linkedMemberIds)
        ? payload.linkedMemberIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
        : [];
    } catch {
      throw new UnauthorizedException('انتهت الجلسة');
    }

    const appUser = await this.prisma.api_users.findUnique({ where: { user_id: sub } });
    if (!appUser || appUser.status !== 1) throw new UnauthorizedException('انتهت الجلسة');

    const member = refreshMemberId
      ? await this.prisma.club_members.findFirst({
          where: {
            id: refreshMemberId,
            app_user_id: appUser.user_id,
            is_deleted: false,
            is_active: true,
            ...(refreshBranchId != null ? { branch_id: refreshBranchId } : {}),
          },
        })
      : await this.resolveSingleLegacyMembership(appUser.user_id);
    if (!member) throw new UnauthorizedException('انتهت الجلسة');

    const claims = this.buildClaims(appUser, member, refreshLinkedIds);
    return { ...(await this.signTokens(claims)), user: claims };
  }

  /**
   * Permanently removes the member's mobile-app identity and revokes all tokens.
   * The club membership and its accounting/attendance records remain untouched because
   * they are contractual business records, not the optional app account.
   */
  async deleteAccount(
    appUserId: number,
    memberId: number,
    password: string,
  ): Promise<{ message: string; accountDeleted: true; membershipDeleted: false }> {
    const [appUser, member] = await Promise.all([
      this.prisma.api_users.findUnique({ where: { user_id: appUserId } }),
      this.prisma.club_members.findFirst({
        where: { id: memberId, app_user_id: appUserId, is_deleted: false },
        select: { id: true },
      }),
    ]);
    if (!appUser || appUser.status !== 1 || !member) {
      throw new UnauthorizedException('الحساب غير متاح');
    }

    const valid = await bcrypt.compare(password, appUser.user_pass ?? '');
    if (!valid) throw new BadRequestException('كلمة المرور غير صحيحة');

    // api_users is a legacy table, so anonymize and deactivate instead of relying on a
    // physical delete that could break old staff links. Clearing the member link makes
    // all already-issued access/refresh tokens fail immediately.
    await this.prisma.$transaction([
      this.prisma.am_member_notifications.deleteMany({ where: { member_id: memberId } }),
      this.prisma.am_invitations.updateMany({
        where: { inviter_member_id: memberId },
        data: { inviter_member_id: null },
      }),
      this.prisma.club_members.update({
        where: { id: memberId },
        data: { app_user_id: null },
      }),
      this.prisma.api_users.update({
        where: { user_id: appUserId },
        data: {
          user_name: null,
          user_phone: null,
          user_email: null,
          user_city: null,
          user_pass: null,
          status: 0,
          rand_key: null,
          m_image: null,
        },
      }),
    ]);

    return {
      message: 'تم حذف حساب التطبيق بنجاح',
      accountDeleted: true,
      membershipDeleted: false,
    };
  }

  private buildClaims(
    appUser: { user_id: number; user_phone: string | null; user_name: string | null },
    member: MembershipRow,
    linkedMemberIds: number[] = [],
  ): MemberJwtUser {
    const linked = [...new Set([member.id, ...linkedMemberIds])];
    return {
      sub: appUser.user_id,
      memberId: member.id,
      branchId: member.branch_id,
      memberCode: member.member_code,
      phone: appUser.user_phone ?? '',
      name: appUser.user_name ?? member.name,
      type: 'member',
      // Only worth carrying when there is somewhere to switch to, so a single-branch
      // member's token (and login response) is exactly what it always was.
      ...(linked.length > 1 ? { linkedMemberIds: linked } : {}),
    };
  }

  private async signTokens(claims: MemberJwtUser): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.accessTtl'),
    });
    const refreshToken = await this.jwt.signAsync(
      {
        sub: claims.sub,
        type: 'member',
        memberId: claims.memberId,
        branchId: claims.branchId,
        ...(claims.linkedMemberIds ? { linkedMemberIds: claims.linkedMemberIds } : {}),
      },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.refreshTtl'),
      },
    );
    return { accessToken, refreshToken };
  }

  private async resolveSingleLegacyMembership(appUserId: number) {
    const rows = await this.prisma.club_members.findMany({
      where: { app_user_id: appUserId, is_deleted: false, is_active: true },
      orderBy: { id: 'asc' },
      take: 2,
    });
    return rows.length === 1 ? rows[0] : null;
  }

  async resolveMember(memberId: number) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    return member;
  }
}
