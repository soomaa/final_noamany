import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { JwtUser } from '../../common/types/jwt-user';
import { getPhoneValidationError, localDateString, normalizePhoneForStorage } from './club-member.utils';
import { CreateReceptionInvitationDto } from './dto/reception-invitation.dto';

/** Egypt is UTC+2 or UTC+3; the earlier offset makes sure the whole start day is counted. */
const CAIRO_MAX_OFFSET_MS = 3 * 60 * 60 * 1000;

type Db = Prisma.TransactionClient | PrismaService;

interface SubscriptionRow {
  id: number;
  member_id: number | null;
  branch_id: number;
  status: string;
  subscription_start_date: string;
  subscription_end_date: string;
  type: { invitations_count: number | null } | null;
}

/**
 * Guest invitations from reception, counted against the plan's invitation allowance.
 *
 * Invitations live in `am_invitations` (the same table the member app and the invitations
 * pages use) and are linked to the inviting member, not to a subscription. A subscription's
 * used count is therefore the member's invitations sent since that subscription started,
 * rejected ones excluded.
 */
@Injectable()
export class ClubReceptionInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private static since(startDate: string): Date {
    return new Date(Date.parse(`${startDate}T00:00:00Z`) - CAIRO_MAX_OFFSET_MS);
  }

  private async used(db: Db, memberId: number, startDate: string) {
    return db.am_invitations.count({
      where: {
        inviter_member_id: memberId,
        status: { not: 'rejected' },
        sent_date: { gte: ClubReceptionInvitationsService.since(startDate) },
      },
    });
  }

  private async allowance(db: Db, memberId: number, sub: SubscriptionRow, today: string) {
    const allowed = Math.max(0, Number(sub.type?.invitations_count ?? 0));
    const used = allowed > 0 ? await this.used(db, memberId, sub.subscription_start_date) : 0;
    const activeToday = sub.status === 'active'
      && sub.subscription_start_date <= today && sub.subscription_end_date >= today;
    return { subscriptionId: sub.id, allowed, used, remaining: Math.max(0, allowed - used), activeToday };
  }

  private async member(memberId: number, user: JwtUser) {
    const member = await this.prisma.club_members.findUnique({
      where: { id: memberId }, select: { id: true, name: true, branch_id: true, gender: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    if (!this.branchScope.isMemberGenderAllowed(user, member.gender)) {
      throw new ForbiddenException('لا تملك صلاحية التعامل مع أعضاء هذا القسم');
    }
    return member;
  }

  /** Remaining invitations for each of the member's current subscriptions. */
  async summary(memberId: number, user: JwtUser) {
    await this.member(memberId, user);
    const today = localDateString();
    const subs = await this.prisma.club_subscriptions.findMany({
      where: { member_id: memberId, status: { in: ['active', 'frozen'] }, subscription_end_date: { gte: today } },
      select: {
        id: true, member_id: true, branch_id: true, status: true,
        subscription_start_date: true, subscription_end_date: true,
        type: { select: { invitations_count: true } },
      },
    });
    const subscriptions = await Promise.all(subs.map((sub) => this.allowance(this.prisma, memberId, sub, today)));
    return { memberId, subscriptions };
  }

  /** Record a guest against one subscription's allowance; refuses when none are left. */
  async create(dto: CreateReceptionInvitationDto, user: JwtUser) {
    const member = await this.member(dto.memberId, user);
    const guestName = dto.guestName.trim();
    if (guestName.length < 2) throw new BadRequestException('اكتب اسم الضيف');
    const phoneError = getPhoneValidationError(dto.guestPhone);
    if (phoneError) throw new BadRequestException(phoneError);
    const guestPhone = normalizePhoneForStorage(dto.guestPhone);
    const today = localDateString();
    const now = new Date();

    const row = await retryOnUniqueViolation(() => this.prisma.$transaction(async (tx) => {
      // Two desks inviting for the same subscription queue here, so the last invitation can't be used twice.
      await tx.$queryRaw`SELECT id FROM club_subscriptions WHERE id = ${dto.subscriptionId} FOR UPDATE`;
      const sub = await tx.club_subscriptions.findUnique({
        where: { id: dto.subscriptionId },
        select: {
          id: true, member_id: true, branch_id: true, status: true,
          subscription_start_date: true, subscription_end_date: true,
          type: { select: { invitations_count: true } },
        },
      });
      if (!sub || sub.member_id !== member.id) throw new BadRequestException('الاشتراك غير متاح لهذا العضو');
      this.branchScope.assertBranchAllowed(user, sub.branch_id, 'لا تملك صلاحية تسجيل دعوات لاشتراكات هذا الفرع');
      const allowance = await this.allowance(tx, member.id, sub, today);
      if (!allowance.activeToday) throw new BadRequestException('الاشتراك غير نشط اليوم');
      if (allowance.allowed < 1) throw new BadRequestException('الاشتراك لا يشمل دعوات');
      if (allowance.remaining < 1) throw new BadRequestException('لا توجد دعوات متبقية في هذا الاشتراك');

      const last = await tx.am_invitations.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
      const attended = dto.guestHere !== false;
      const created = await tx.am_invitations.create({
        data: {
          invitation_code: `INV${String((last?.id ?? 0) + 1).padStart(6, '0')}`,
          recipient_name: guestName,
          recipient_phone: guestPhone,
          inviter_member_id: member.id,
          branch_id: user.branch > 0 ? user.branch : sub.branch_id,
          sent_date: now,
          // Reception has already accepted the guest; "here now" also records the visit.
          status: attended ? 'attended' : 'accepted',
          accepted_date: now,
          accepted_by_user_id: user.sub,
          attendance_date: attended ? now : null,
        },
      });
      return { created, remaining: allowance.remaining - 1, allowed: allowance.allowed };
    }));

    return {
      id: row.created.id,
      invitationCode: row.created.invitation_code,
      status: row.created.status,
      subscriptionId: dto.subscriptionId,
      allowed: row.allowed,
      remaining: row.remaining,
    };
  }
}
