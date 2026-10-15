import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { assertDateOrder } from '../../common/validators';
import { localDateString } from '../club-members/club-member.utils';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { ClubReceiptsService } from './club-receipts.service';
import { deriveSessionAwareStatus, resolveSubscriptionEndDate, toNum } from './club-subscription.utils';

@Injectable()
export class ClubSubscriptionTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ClubReceiptsService,
    private readonly audit: BusinessAuditService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number | null | undefined) {
    if (branchId == null || !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private branchWhere(user?: JwtUser): Prisma.club_subscription_transfersWhereInput {
    const allowed = this.branchScope.allowedBranchIds(user);
    return allowed === null ? {} : { branch_id: { in: allowed } };
  }

  /** Plan/period change on the same subscription row — not a member-to-member transfer. */
  async create(body: {
    subscriptionId: number;
    toSubscriptionType?: string;
    toSubscriptionTypeId?: number;
    toStartDate: string;
    toEndDate: string;
    toValue?: number;
    transferDate?: string;
    reason?: string;
    createdBy?: number;
  }, user?: JwtUser) {
    const sub = await this.prisma.club_subscriptions.findUnique({ where: { id: body.subscriptionId } });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    this.assertBranchAccess(user, sub.branch_id);

    if (sub.status === 'frozen') {
      throw new BadRequestException('لا يمكن تحويل خطة اشتراك مجمّد — ألغِ التجميد أولاً');
    }

    let toTypeName = body.toSubscriptionType ?? sub.subscription_type ?? '';
    let toValue = body.toValue ?? toNum(sub.subscription_value);
    let toEndDate = body.toEndDate;
    let toLinkedToSessions = sub.is_linked_to_sessions;
    let toSessionsCount = sub.sessions_count;

    if (body.toSubscriptionTypeId) {
      const type = await this.prisma.club_subscription_types.findUnique({
        where: { id: body.toSubscriptionTypeId },
      });
      if (!type) throw new BadRequestException('نوع الاشتراك الجديد غير موجود');
      if (Boolean(type.is_linked_to_sessions) !== Boolean(sub.is_linked_to_sessions)) {
        throw new BadRequestException(
          'التحويل مسموح فقط من باقة اشتراك لباقة اشتراك، أو من حصص لحصص',
        );
      }
      toTypeName = type.name;
      toValue = toNum(type.price);
      toLinkedToSessions = type.is_linked_to_sessions;
      toSessionsCount = type.sessions_count;
      toEndDate = resolveSubscriptionEndDate(
        body.toStartDate,
        type.days,
        type.is_linked_to_sessions,
      );
    }

    if (!toEndDate) {
      throw new BadRequestException('تاريخ نهاية الاشتراك الجديد مطلوب');
    }
    assertDateOrder(body.toStartDate, toEndDate);

    if (sub.member_id && body.toSubscriptionTypeId) {
      const matchingSubscriptions = await this.prisma.club_subscriptions.findMany({
        where: {
          id: { not: sub.id },
          member_id: sub.member_id,
          subscription_type_id: body.toSubscriptionTypeId,
        },
        select: {
          status: true,
          subscription_start_date: true,
          subscription_end_date: true,
          is_linked_to_sessions: true,
          sessions_count: true,
          sessions_used: true,
        },
      });
      const duplicate = matchingSubscriptions.some((subscription) =>
        subscription.status === 'frozen' ||
        deriveSessionAwareStatus({
          startDate: subscription.subscription_start_date,
          endDate: subscription.subscription_end_date,
          isLinkedToSessions: subscription.is_linked_to_sessions,
          sessionsCount: subscription.sessions_count,
          sessionsUsed: subscription.sessions_used,
        }) !== 'expired',
      );
      if (duplicate) {
        throw new BadRequestException('العضو مشترك بالفعل في هذا الاشتراك');
      }
    }

    // Atomic: write the transfer row + apply the new plan/value + re-derive paid/remaining together
    // so a failure can't leave the subscription value changed without a transfer record (or vice versa).
    const transfer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.club_subscription_transfers.create({
        data: {
          subscription_id: body.subscriptionId,
          member_id: sub.member_id,
          customer_name: sub.customer_name,
          from_subscription_type: sub.subscription_type,
          to_subscription_type: toTypeName,
          from_start_date: sub.subscription_start_date,
          from_end_date: sub.subscription_end_date,
          to_start_date: body.toStartDate,
          to_end_date: toEndDate,
          from_value: sub.subscription_value,
          to_value: toValue,
          transfer_date: body.transferDate ?? localDateString(),
          reason: body.reason ?? null,
          branch_id: sub.branch_id,
          created_by: body.createdBy ?? null,
        },
      });

      await tx.club_subscriptions.update({
        where: { id: body.subscriptionId },
        data: {
          subscription_type_id: body.toSubscriptionTypeId ?? sub.subscription_type_id,
          subscription_type: toTypeName,
          subscription_start_date: body.toStartDate,
          subscription_end_date: toEndDate,
          subscription_value: toValue,
          is_linked_to_sessions: toLinkedToSessions,
          sessions_count: toLinkedToSessions ? toSessionsCount : null,
          sessions_used: toLinkedToSessions ? 0 : sub.sessions_used,
          status: deriveSessionAwareStatus({
            startDate: body.toStartDate,
            endDate: toEndDate,
            isLinkedToSessions: toLinkedToSessions,
            sessionsCount: toLinkedToSessions ? toSessionsCount : null,
            sessionsUsed: toLinkedToSessions ? 0 : sub.sessions_used,
          }),
        },
      });

      // Derive paid/remaining from the receipts ledger against the NEW value (single source of truth)
      // rather than a direct column write that a later receipt recalc would clobber. After recalc,
      // remaining = value − discount − paidReceipts (clamped ≥0), which is correct even on a downgrade
      // (an overpayment is resolved by staff via a refund, not auto-posted).
      //
      // NO cash/revenue journal is posted on a transfer: a plan change moves the subscription VALUE
      // but no cash changes hands at transfer time. Revenue is recognized only via receipts (which
      // post their own GL), so posting here would recognize phantom cash on an upgrade and post the
      // wrong direction on a downgrade.
      await this.receipts.recalculateSubscriptionPayments(body.subscriptionId, tx);

      return created;
    });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: body.subscriptionId,
      action: 'plan_transfer',
      actorUserId: body.createdBy,
      branchId: sub.branch_id,
      reason: body.reason,
      before: {
        subscriptionType: sub.subscription_type,
        startDate: sub.subscription_start_date,
        endDate: sub.subscription_end_date,
        value: toNum(sub.subscription_value),
      },
      after: {
        transferId: transfer.id,
        subscriptionType: toTypeName,
        startDate: body.toStartDate,
        endDate: body.toEndDate,
        value: toValue,
      },
    });

    return transfer;
  }

  async list(user?: JwtUser) {
    return this.prisma.club_subscription_transfers.findMany({
      where: this.branchWhere(user),
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_subscription_transfers.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('التحويل غير موجود');
    this.assertBranchAccess(user, row.branch_id);
    return row;
  }

  async memberHistory(memberId: number, user?: JwtUser) {
    const member = await this.prisma.club_members.findUnique({
      where: { id: memberId },
      select: { branch_id: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    this.assertBranchAccess(user, member.branch_id);
    const [subscriptions, transfers] = await Promise.all([
      this.prisma.club_subscriptions.findMany({ where: { member_id: memberId }, orderBy: { id: 'asc' } }),
      this.prisma.club_subscription_transfers.findMany({ where: { member_id: memberId }, orderBy: { id: 'asc' } }),
    ]);
    const history = [
      ...subscriptions.map((s) => ({ type: 'subscription' as const, data: s, date: s.registration_date })),
      ...transfers.map((t) => ({ type: 'transfer' as const, data: t, date: t.transfer_date })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    return { subscriptions, transfers, history };
  }

  async statistics(user?: JwtUser) {
    const rows = await this.prisma.club_subscription_transfers.findMany({
      where: this.branchWhere(user),
    });
    const totalValueDifference = rows.reduce(
      (s, r) => s + (toNum(r.to_value) - toNum(r.from_value)),
      0,
    );
    return {
      totalTransfers: rows.length,
      totalValueDifference,
      averageValueDifference: rows.length ? totalValueDifference / rows.length : 0,
    };
  }
}
