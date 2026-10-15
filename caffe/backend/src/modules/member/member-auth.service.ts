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
import { MemberJwtUser, MemberLoginResult } from '../../common/types/member-jwt-user';
import { MEMBER_DEFAULT_PASSWORD, MEMBER_MIN_PASSWORD_LENGTH } from '../../common/constants/member-auth.constants';
import { normalizePhoneForStorage } from '../club-members/club-member.utils';

const LOGIN_FAILED = 'رقم الجوال أو كلمة المرور غير صحيحة';

@Injectable()
export class MemberAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(phone: string, password: string): Promise<MemberLoginResult> {
    const normalized = normalizePhoneForStorage(phone);
    if (!normalized) throw new UnauthorizedException(LOGIN_FAILED);

    const appUser = await this.prisma.api_users.findFirst({
      where: { user_phone: normalized },
    });
    if (!appUser || appUser.status !== 1) {
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    const valid = await bcrypt.compare(password, appUser.user_pass ?? '');
    if (!valid) throw new UnauthorizedException(LOGIN_FAILED);

    const member = await this.prisma.club_members.findFirst({
      where: { app_user_id: appUser.user_id, is_deleted: false },
    });
    if (!member) throw new UnauthorizedException('لا يوجد عضوية مرتبطة بهذا الحساب');

    // Still on the shared default password → app must force a change before anything else.
    const mustChangePassword = await bcrypt.compare(MEMBER_DEFAULT_PASSWORD, appUser.user_pass ?? '');

    const claims = this.buildClaims(appUser, member);
    const tokens = await this.signTokens(claims);
    return {
      ...tokens,
      user: claims,
      message: 'تم تسجيل الدخول بنجاح',
      mustChangePassword,
    };
  }

  async changePassword(
    appUserId: number,
    currentPassword: string,
    newPassword: string,
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

    const rounds = this.config.get<number>('bcryptRounds') ?? 12;
    await this.prisma.api_users.update({
      where: { user_id: appUserId },
      data: { user_pass: await bcrypt.hash(newPassword, rounds) },
    });
    return { message: 'تم تغيير كلمة المرور بنجاح' };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; user: MemberJwtUser }> {
    let sub: number;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: number; type?: string }>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      if (payload.type !== 'member') throw new UnauthorizedException('انتهت الجلسة');
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('انتهت الجلسة');
    }

    const appUser = await this.prisma.api_users.findUnique({ where: { user_id: sub } });
    if (!appUser || appUser.status !== 1) throw new UnauthorizedException('انتهت الجلسة');

    const member = await this.prisma.club_members.findFirst({
      where: { app_user_id: appUser.user_id, is_deleted: false },
    });
    if (!member) throw new UnauthorizedException('انتهت الجلسة');

    const claims = this.buildClaims(appUser, member);
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.accessTtl'),
    });
    return { accessToken, user: claims };
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
    member: { id: number; branch_id: number; name: string },
  ): MemberJwtUser {
    return {
      sub: appUser.user_id,
      memberId: member.id,
      branchId: member.branch_id,
      phone: appUser.user_phone ?? '',
      name: appUser.user_name ?? member.name,
      type: 'member',
    };
  }

  private async signTokens(claims: MemberJwtUser): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwt.signAsync(claims, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.accessTtl'),
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: claims.sub, type: 'member' },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<JwtSignOptions['expiresIn']>('jwt.refreshTtl'),
      },
    );
    return { accessToken, refreshToken };
  }

  async resolveMember(memberId: number) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    return member;
  }
}
