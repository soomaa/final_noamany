import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { assertDateOrder } from '../../common/validators';
import { localDateString } from '../club-members/club-member.utils';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import {
  EXPENSE_APPROVED,
  mapPaymentMethodToArabic,
  nextFinDocNumber,
  REVENUE_PAID,
} from '../finance/finance.utils';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import {
  addDays,
  daysBetween,
  deriveSessionAwareStatus,
  resolveSessionMatrixPrice,
  resolveSubscriptionEndDate,
  roundMoney,
  primaryClubPaymentMethod,
  resolveClubPayments,
  toClubPaymentMethod,
  toNum,
} from './club-subscription.utils';
import { TransferSubscriptionToMemberDto } from './dto/transfer-subscription-to-member.dto';
import { TransferSubscriptionPlanDto } from './dto/transfer-subscription-plan.dto';
import { isSubscriptionTypeAvailableAtBranch } from './subscription-type-branch-scope';

const PLAN_TRANSFER_REFUND_CATEGORY = 'مردودات اشتراكات الجيم';

export interface PlanTransferPreview {
  subscriptionId: number;
  sourceType: string | null;
  sourceKind: 'subscription' | 'sessions';
  targetTypeId: number;
  targetType: string;
  targetKind: 'subscription' | 'sessions';
  transferDate: string;
  consumedValue: number;
  transferableCredit: number;
  creditApplied: number;
  targetValue: number;
  targetSessionsCount: number | null;
  targetUnitPrice: number | null;
  refundAmount: number;
  additionalDue: number;
  toStartDate: string;
  toEndDate: string;
}

@Injectable()
export class ClubSubscriptionTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ClubReceiptsService,
    private readonly accounting: ClubSubscriptionAccountingService,
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

  /**
   * Move all currently-unused service entitlement to another member. This deliberately creates
   * no receipt and no accounting journal: transferred_credit_amount is a non-cash settlement.
   * The source row is retained as history, while its usable period/sessions are exhausted.
   */
  async transferToMember(body: TransferSubscriptionToMemberDto, user: JwtUser) {
    const effectiveDate = body.effectiveDate ?? localDateString();
    if (effectiveDate !== localDateString()) {
      throw new BadRequestException('تحويل الاشتراك بين الأعضاء يجب تنفيذه بتاريخ اليوم');
    }
    const reason = body.reason?.trim();
    if (!reason) throw new BadRequestException('سبب التحويل مطلوب');

    const transfer = await this.prisma.$transaction(async (tx) => {
      // Lock before reading business state. Together with the unique source id in the transfer
      // table this makes retry/double-click and concurrent requests safe.
      await tx.$queryRaw`SELECT id FROM club_subscriptions WHERE id = ${body.sourceSubscriptionId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${body.destinationMemberId} FOR UPDATE`;

      const source = await tx.club_subscriptions.findUnique({
        where: { id: body.sourceSubscriptionId },
        include: { member: true, type: { include: { branches: true } } },
      });
      if (!source) throw new NotFoundException('الاشتراك المصدر غير موجود');
      if (!source.member_id || !source.member) {
        throw new BadRequestException('لا يمكن تحويل اشتراك غير مرتبط بعضو');
      }
      this.assertBranchAccess(user, source.branch_id);
      if (source.member_id === body.destinationMemberId) {
        throw new BadRequestException('يجب اختيار عضو آخر لاستلام الاشتراك');
      }
      const sourceLooksPrivate =
        source.private_package_id != null ||
        /private|برايفت/i.test(source.subscription_type ?? '');
      if (source.is_special || sourceLooksPrivate) {
        throw new BadRequestException('تحويل الاشتراكات الخاصة بين الأعضاء غير مدعوم');
      }
      if (source.status === 'frozen') {
        throw new BadRequestException('لا يمكن تحويل اشتراك مجمّد — ألغِ التجميد أولاً');
      }
      if (toNum(source.remaining_amount) > 0.009) {
        throw new BadRequestException('يجب سداد أو إعفاء المبلغ المتبقي قبل تحويل الاشتراك');
      }
      const sourceStatus = deriveSessionAwareStatus({
        startDate: source.subscription_start_date,
        endDate: source.subscription_end_date,
        isLinkedToSessions: source.is_linked_to_sessions,
        sessionsCount: source.sessions_count,
        sessionsUsed: source.sessions_used,
      });
      if (sourceStatus !== 'active') {
        throw new BadRequestException('يمكن تحويل اشتراك نشط فقط');
      }

      const destination = await tx.club_members.findUnique({
        where: { id: body.destinationMemberId },
      });
      if (!destination || destination.is_deleted) {
        throw new NotFoundException('العضو المستلم غير موجود');
      }
      if (!destination.is_active) {
        throw new BadRequestException('لا يمكن التحويل إلى عضو غير نشط');
      }
      this.assertBranchAccess(user, destination.branch_id);
      if (destination.branch_id !== source.branch_id) {
        throw new BadRequestException('التحويل بين الأعضاء مسموح داخل نفس الفرع فقط');
      }
      const sourceGender = source.gender ?? source.member.gender;
      if (sourceGender !== destination.gender) {
        throw new BadRequestException('نوع العضوية (رجالي/حريمي) للعضوين غير متطابق');
      }

      const entitlementIdentity: Prisma.club_subscriptionsWhereInput | null =
        source.subscription_type_id != null
          ? { subscription_type_id: source.subscription_type_id }
          : source.subscription_type?.trim()
            ? { subscription_type: source.subscription_type.trim() }
            : null;
      if (entitlementIdentity) {
        const destinationSubscriptions = await tx.club_subscriptions.findMany({
          where: {
            member_id: destination.id,
            ...entitlementIdentity,
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
        const hasSameLiveEntitlement = destinationSubscriptions.some((subscription) =>
          subscription.status === 'frozen' ||
          deriveSessionAwareStatus({
            startDate: subscription.subscription_start_date,
            endDate: subscription.subscription_end_date,
            isLinkedToSessions: subscription.is_linked_to_sessions,
            sessionsCount: subscription.sessions_count,
            sessionsUsed: subscription.sessions_used,
          }) !== 'expired',
        );
        if (hasSameLiveEntitlement) {
          throw new BadRequestException('العضو المستلم لديه بالفعل نفس الاشتراك بحالة نشطة أو موقوفة');
        }
      }

      const remainingSessions = source.is_linked_to_sessions
        ? Math.max(0, (source.sessions_count ?? 0) - source.sessions_used)
        : null;
      const remainingDays = source.is_linked_to_sessions
        ? null
        : Math.max(1, daysBetween(effectiveDate, source.subscription_end_date) + 1);
      if (source.is_linked_to_sessions && (!source.sessions_count || !remainingSessions)) {
        throw new BadRequestException('لا توجد حصص متبقية قابلة للتحويل');
      }

      const netValue = Math.max(
        0,
        toNum(source.subscription_value) -
          (source.discount_enabled ? toNum(source.discount_value) : 0),
      );
      const totalUnits = source.is_linked_to_sessions
        ? Math.max(1, source.sessions_count ?? 0)
        : Math.max(1, daysBetween(source.subscription_start_date, source.subscription_end_date) + 1);
      const remainingUnits = source.is_linked_to_sessions ? remainingSessions! : remainingDays!;
      const transferredValue = roundMoney(netValue * (remainingUnits / totalUnits));
      const destinationNumber = `MT${source.id}D${destination.id}`;
      const sourceBefore = {
        subscriptionId: source.id,
        memberId: source.member_id,
        startDate: source.subscription_start_date,
        endDate: source.subscription_end_date,
        sessionsCount: source.sessions_count,
        sessionsUsed: source.sessions_used,
        value: toNum(source.subscription_value),
      };

      const destinationSubscription = await tx.club_subscriptions.create({
        data: {
          subscription_number: destinationNumber,
          registration_date: effectiveDate,
          branch_id: destination.branch_id,
          member_id: destination.id,
          customer_name: destination.name,
          subscription_type_id: source.subscription_type_id,
          special_class_type_id: source.special_class_type_id,
          subscription_type: source.subscription_type,
          subscription_start_date: effectiveDate,
          subscription_end_date: source.subscription_end_date,
          subscription_value: transferredValue,
          discount_enabled: false,
          discount_value: 0,
          paid_amount: 0,
          waived_amount: 0,
          transferred_credit_amount: transferredValue,
          transferred_out_amount: 0,
          remaining_amount: 0,
          gender: destination.gender,
          employee_id: source.employee_id,
          sales_id: source.sales_id,
          payment_method: null,
          receipt_number: null,
          customer_source_id: source.customer_source_id,
          guardian_name: destination.guardian_name,
          guardian_phone: destination.guardian_phone,
          status: 'active',
          is_special: false,
          is_linked_to_sessions: source.is_linked_to_sessions,
          sessions_count: source.is_linked_to_sessions ? remainingSessions : null,
          sessions_used: 0,
          inbody_used: source.inbody_used,
          spa_used: source.spa_used,
          allow_multiple_daily_entries: source.allow_multiple_daily_entries,
          is_time_based: source.is_time_based,
          time_from: source.time_from,
          time_to: source.time_to,
          created_by: user.sub,
        },
      });

      await tx.club_subscriptions.update({
        where: { id: source.id },
        data: {
          subscription_end_date: addDays(effectiveDate, -1),
          status: 'expired',
          sessions_used: source.is_linked_to_sessions
            ? source.sessions_count ?? source.sessions_used
            : source.sessions_used,
          transferred_out_amount: transferredValue,
        },
      });

      const destinationAfter = {
        subscriptionId: destinationSubscription.id,
        memberId: destination.id,
        startDate: destinationSubscription.subscription_start_date,
        endDate: destinationSubscription.subscription_end_date,
        sessionsCount: destinationSubscription.sessions_count,
        sessionsUsed: 0,
        transferredCreditAmount: transferredValue,
      };
      const createdTransfer = await tx.club_member_subscription_transfers.create({
        data: {
          source_subscription_id: source.id,
          destination_subscription_id: destinationSubscription.id,
          source_member_id: source.member_id,
          destination_member_id: destination.id,
          source_branch_id: source.branch_id,
          destination_branch_id: destination.branch_id,
          entitlement_kind: source.is_linked_to_sessions ? 'sessions' : 'days',
          remaining_days: remainingDays,
          remaining_sessions: remainingSessions,
          transferred_value: transferredValue,
          effective_date: effectiveDate,
          reason,
          created_by: user.sub,
          before_json: sourceBefore,
          after_json: destinationAfter,
        },
        include: {
          source_member: { select: { id: true, member_code: true, name: true } },
          destination_member: { select: { id: true, member_code: true, name: true } },
          source_subscription: true,
          destination_subscription: true,
        },
      });
      await tx.business_audit_log.create({
        data: {
          entity_type: 'club_member_subscription_transfer',
          entity_id: String(createdTransfer.id),
          action: 'member_entitlement_transfer',
          actor_user_id: user.sub,
          branch_id: source.branch_id,
          before_json: sourceBefore,
          after_json: destinationAfter,
          changed_fields: [
            'memberId',
            'subscriptionId',
            source.is_linked_to_sessions ? 'remainingSessions' : 'remainingDays',
            'transferredValue',
          ],
          reason,
        },
      });
      return createdTransfer;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return transfer;
  }

  async listMemberTransfers(user?: JwtUser) {
    const allowed = this.branchScope.allowedBranchIds(user);
    return this.prisma.club_member_subscription_transfers.findMany({
      where: allowed === null
        ? {}
        : { OR: [{ source_branch_id: { in: allowed } }, { destination_branch_id: { in: allowed } }] },
      include: {
        source_member: { select: { id: true, member_code: true, name: true } },
        destination_member: { select: { id: true, member_code: true, name: true } },
      },
      orderBy: { id: 'desc' },
    });
  }

  private async computePlanTransferPreview(
    body: TransferSubscriptionPlanDto,
    user: JwtUser | undefined,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<PlanTransferPreview> {
    const [sub, target] = await Promise.all([
      client.club_subscriptions.findUnique({ where: { id: body.subscriptionId } }),
      client.club_subscription_types.findUnique({
        where: { id: body.toSubscriptionTypeId },
        include: { branches: { select: { branch_id: true } } },
      }),
    ]);
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    if (!target || !target.is_active) throw new BadRequestException('نوع الاشتراك الجديد غير موجود أو غير نشط');
    this.assertBranchAccess(user, sub.branch_id);
    if (!isSubscriptionTypeAvailableAtBranch(target, sub.branch_id)) {
      throw new ForbiddenException('الخطة المختارة غير متاحة في فرع الاشتراك الحالي');
    }
    if (sub.status === 'frozen') {
      throw new BadRequestException('لا يمكن تحويل خطة اشتراك مجمّد — ألغِ التجميد أولاً');
    }
    const currentStatus = deriveSessionAwareStatus({
      startDate: sub.subscription_start_date,
      endDate: sub.subscription_end_date,
      isLinkedToSessions: sub.is_linked_to_sessions,
      sessionsCount: sub.sessions_count,
      sessionsUsed: sub.sessions_used,
    });
    if (currentStatus !== 'active') throw new BadRequestException('يمكن تحويل الاشتراك النشط فقط');
    if (sub.subscription_type_id === target.id) {
      throw new BadRequestException('اختر خطة مختلفة عن الخطة الحالية');
    }

    const transferDate = body.transferDate ?? localDateString();
    if (transferDate !== localDateString()) {
      throw new BadRequestException('تحويل الخطة يجب تنفيذه بتاريخ اليوم');
    }
    const net = roundMoney(
      toNum(sub.subscription_value) -
        (sub.discount_enabled ? toNum(sub.discount_value) : 0),
    );
    const paidEquivalent = roundMoney(
      toNum(sub.paid_amount) + toNum(sub.transferred_credit_amount),
    );
    const priorRefunds = await client.club_subscription_refunds.aggregate({
      where: { subscription_id: sub.id, status: 'completed' },
      _sum: { refund_amount: true },
    });
    const refundablePaid = Math.max(0, paidEquivalent - toNum(priorRefunds._sum.refund_amount));

    let consumedValue = 0;
    let unusedValue = 0;
    if (sub.is_linked_to_sessions && sub.sessions_count && sub.sessions_count > 0) {
      const sessionRate = roundMoney(net / sub.sessions_count);
      consumedValue = roundMoney(Math.max(0, sub.sessions_used) * sessionRate);
      unusedValue = roundMoney(
        Math.max(0, sub.sessions_count - sub.sessions_used) * sessionRate,
      );
    } else {
      const totalDays = Math.max(
        1,
        daysBetween(sub.subscription_start_date, sub.subscription_end_date),
      );
      const consumedDays = Math.min(
        totalDays,
        Math.max(0, daysBetween(sub.subscription_start_date, transferDate)),
      );
      const dailyRate = roundMoney(net / totalDays);
      consumedValue = roundMoney(consumedDays * dailyRate);
      unusedValue = roundMoney(Math.max(0, totalDays - consumedDays) * dailyRate);
    }
    const transferableCredit = roundMoney(
      Math.max(0, Math.min(unusedValue, Math.max(0, refundablePaid - consumedValue))),
    );
    if (transferableCredit <= 0) {
      throw new BadRequestException('لا يوجد رصيد مدفوع غير مستهلك قابل للتحويل');
    }

    let targetValue = toNum(target.price);
    let targetSessionsCount: number | null = null;
    let targetUnitPrice: number | null = null;
    if (target.is_linked_to_sessions) {
      const maxSessions = Number(target.sessions_count);
      if (!Number.isInteger(maxSessions) || maxSessions < 1) {
        throw new BadRequestException('عدد حصص الخطة الجديدة غير مضبوط');
      }
      const matrixRows = await client.club_subscription_type_session_prices.findMany({
        where: { subscription_type_id: target.id },
        select: { sessions_count: true, price: true },
        orderBy: { sessions_count: 'asc' },
      });
      const matrix = matrixRows.map((row) => ({
        sessionsCount: row.sessions_count,
        price: toNum(row.price),
      }));
      // Afford as many sessions as credit allows, using matrix prices (fallback proportional).
      const MAX_MATRIX_SCAN = 365;
      if (maxSessions > MAX_MATRIX_SCAN) {
        throw new BadRequestException('عدد حصص الخطة الجديدة غير منطقي');
      }
      let bestCount = 0;
      let bestValue = 0;
      for (let n = 1; n <= maxSessions; n += 1) {
        const priceN = resolveSessionMatrixPrice({
          packagePrice: toNum(target.price),
          maxSessions,
          selectedSessions: n,
          matrix,
        });
        if (priceN <= transferableCredit + 0.0001) {
          bestCount = n;
          bestValue = priceN;
        }
      }
      if (bestCount < 1) {
        throw new BadRequestException('الرصيد القابل للتحويل أقل من سعر حصة واحدة');
      }
      targetSessionsCount = bestCount;
      targetValue = bestValue;
      targetUnitPrice = resolveSessionMatrixPrice({
        packagePrice: toNum(target.price),
        maxSessions,
        selectedSessions: 1,
        matrix,
      });
    }

    const creditApplied = roundMoney(Math.min(transferableCredit, targetValue));
    const refundAmount = roundMoney(Math.max(0, transferableCredit - targetValue));
    const additionalDue = roundMoney(Math.max(0, targetValue - transferableCredit));
    const toEndDate = resolveSubscriptionEndDate(
      body.toStartDate,
      target.days,
      target.is_linked_to_sessions,
    );
    assertDateOrder(body.toStartDate, toEndDate);

    return {
      subscriptionId: sub.id,
      sourceType: sub.subscription_type,
      sourceKind: sub.is_linked_to_sessions ? 'sessions' : 'subscription',
      targetTypeId: target.id,
      targetType: target.name,
      targetKind: target.is_linked_to_sessions ? 'sessions' : 'subscription',
      transferDate,
      consumedValue,
      transferableCredit,
      creditApplied,
      targetValue,
      targetSessionsCount,
      targetUnitPrice,
      refundAmount,
      additionalDue,
      toStartDate: body.toStartDate,
      toEndDate,
    };
  }

  async previewPlanTransfer(body: TransferSubscriptionPlanDto, user: JwtUser) {
    return this.computePlanTransferPreview(body, user);
  }

  /** Close the old entitlement and create a new one. Only the difference moves through treasury. */
  async create(body: TransferSubscriptionPlanDto, user: JwtUser) {
    const additionalPaidAmount = roundMoney(Number(body.additionalPaidAmount) || 0);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_subscriptions WHERE id = ${body.subscriptionId} FOR UPDATE`;
      const preview = await this.computePlanTransferPreview(body, user, tx);
      if (additionalPaidAmount > preview.additionalDue) {
        throw new BadRequestException('المبلغ المحصل يتجاوز فرق التحويل المطلوب');
      }
      const pendingRefund = await tx.club_subscription_refunds.findFirst({
        where: { subscription_id: body.subscriptionId, status: 'pending' },
      });
      if (pendingRefund) {
        throw new BadRequestException('يوجد طلب استرداد معلق لهذا الاشتراك');
      }
      const source = await tx.club_subscriptions.findUnique({ where: { id: body.subscriptionId } });
      const target = await tx.club_subscription_types.findUnique({
        where: { id: body.toSubscriptionTypeId },
      });
      if (!source || !target) throw new NotFoundException('بيانات التحويل غير موجودة');

      if (source.member_id) {
        const matching = await tx.club_subscriptions.findMany({
          where: {
            id: { not: source.id },
            member_id: source.member_id,
            subscription_type_id: target.id,
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
        const duplicate = matching.some((subscription) =>
          subscription.status === 'frozen' ||
          deriveSessionAwareStatus({
            startDate: subscription.subscription_start_date,
            endDate: subscription.subscription_end_date,
            isLinkedToSessions: subscription.is_linked_to_sessions,
            sessionsCount: subscription.sessions_count,
            sessionsUsed: subscription.sessions_used,
          }) !== 'expired',
        );
        if (duplicate) throw new BadRequestException('العضو مشترك بالفعل في الخطة الجديدة');
      }

      const transferCount = await tx.club_subscription_transfers.count({
        where: { subscription_id: source.id },
      });
      const destinationNumber = `PT${source.id}T${target.id}N${transferCount + 1}`;
      const paymentSplits = resolveClubPayments(
        additionalPaidAmount,
        body.paymentMethod,
        body.payments,
      );
      const destination = await tx.club_subscriptions.create({
        data: {
          subscription_number: destinationNumber,
          registration_date: preview.transferDate,
          branch_id: source.branch_id,
          member_id: source.member_id,
          customer_name: source.customer_name,
          subscription_type_id: target.id,
          subscription_type: target.name,
          subscription_start_date: preview.toStartDate,
          subscription_end_date: preview.toEndDate,
          subscription_value: preview.targetValue,
          discount_enabled: false,
          discount_code_id: null,
          discount_percentage: null,
          discount_value: 0,
          paid_amount: additionalPaidAmount,
          waived_amount: 0,
          transferred_credit_amount: preview.creditApplied,
          transferred_out_amount: 0,
          remaining_amount: roundMoney(preview.additionalDue - additionalPaidAmount),
          gender: source.gender,
          employee_id: source.employee_id,
          sales_id: source.sales_id,
          payment_method: primaryClubPaymentMethod(paymentSplits),
          customer_source_id: source.customer_source_id,
          guardian_name: source.guardian_name,
          guardian_phone: source.guardian_phone,
          status: deriveSessionAwareStatus({
            startDate: preview.toStartDate,
            endDate: preview.toEndDate,
            isLinkedToSessions: target.is_linked_to_sessions,
            sessionsCount: preview.targetSessionsCount,
            sessionsUsed: 0,
          }),
          is_special: false,
          is_linked_to_sessions: target.is_linked_to_sessions,
          sessions_count: target.is_linked_to_sessions ? preview.targetSessionsCount : null,
          sessions_used: 0,
          allow_multiple_daily_entries: target.allow_multiple_daily_entries,
          is_time_based: false,
          time_from: null,
          time_to: null,
          created_by: user.sub,
        },
      });

      const transfer = await tx.club_subscription_transfers.create({
        data: {
          subscription_id: source.id,
          destination_subscription_id: destination.id,
          member_id: source.member_id,
          customer_name: source.customer_name,
          from_subscription_type: source.subscription_type,
          to_subscription_type: target.name,
          from_start_date: source.subscription_start_date,
          from_end_date: source.subscription_end_date,
          to_start_date: preview.toStartDate,
          to_end_date: preview.toEndDate,
          from_value: source.subscription_value,
          to_value: preview.targetValue,
          consumed_value: preview.consumedValue,
          credit_amount: preview.transferableCredit,
          refund_amount: preview.refundAmount,
          additional_paid_amount: additionalPaidAmount,
          destination_sessions_count: preview.targetSessionsCount,
          difference_payment_method:
            toClubPaymentMethod(body.refundPaymentMethod ?? body.paymentMethod) ?? source.payment_method,
          transfer_date: preview.transferDate,
          reason: body.reason?.trim() || null,
          branch_id: source.branch_id,
          created_by: user.sub,
        },
      });

      await tx.club_subscriptions.update({
        where: { id: source.id },
        data: {
          subscription_end_date: addDays(preview.transferDate, -1),
          status: 'expired',
          sessions_used: source.is_linked_to_sessions
            ? source.sessions_count ?? source.sessions_used
            : source.sessions_used,
          transferred_out_amount: roundMoney(
            toNum(source.transferred_out_amount) + preview.transferableCredit,
          ),
          remaining_amount: 0,
        },
      });
      await tx.club_subscription_freezes.updateMany({
        where: { subscription_id: source.id, is_active: true },
        data: { is_active: false, freeze_end_date: preview.transferDate },
      });

      if (additionalPaidAmount > 0) {
        const receipt = await this.receipts.createForSubscription(
          destination.id,
          additionalPaidAmount,
          {
            memberName: source.customer_name ?? 'عميل',
            memberId: source.member_id ?? undefined,
            paymentMethod: body.paymentMethod,
            payments: paymentSplits,
            description: `فرق تحويل خطة إلى ${target.name}`,
            createdBy: user.sub,
          },
          tx,
        );
        await this.accounting.postJournal({
          subscriptionNumber: destination.subscription_number,
          sourceDocId: receipt?.receipt_number ?? destination.subscription_number,
          paidAmount: additionalPaidAmount,
          subscriptionValue: preview.targetValue,
          discountValue: 0,
          discountEnabled: false,
          paymentMethod: body.paymentMethod,
          payments: paymentSplits,
          branchId: source.branch_id,
          createdBy: user.sub,
          registrationDate: preview.transferDate,
          kind: 'payment',
        }, tx);
      }

      if (preview.refundAmount > 0) {
        const refundMethod =
          toClubPaymentMethod(body.refundPaymentMethod) ?? source.payment_method ?? 'cash';
        const invoiceNumber = `PTR-${String(transfer.id).padStart(7, '0')}`;
        await tx.club_subscription_refunds.create({
          data: {
            subscription_id: source.id,
            member_id: source.member_id,
            customer_name: source.customer_name,
            subscription_type: source.subscription_type,
            original_start_date: source.subscription_start_date,
            original_end_date: source.subscription_end_date,
            stop_date: preview.transferDate,
            remaining_days: 0,
            original_value: toNum(source.subscription_value),
            daily_rate: 0,
            refund_amount: preview.refundAmount,
            invoice_number: invoiceNumber,
            refund_date: preview.transferDate,
            reason: 'فرق تحويل خطة',
            notes: body.reason?.trim() || null,
            status: 'completed',
            branch_id: source.branch_id,
            created_by: user.sub,
          },
        });
        await this.accounting.postJournal({
          subscriptionNumber: source.subscription_number,
          sourceDocId: invoiceNumber,
          paidAmount: preview.refundAmount,
          subscriptionValue: toNum(source.subscription_value),
          discountValue: toNum(source.discount_value),
          discountEnabled: source.discount_enabled,
          paymentMethod: refundMethod,
          branchId: source.branch_id,
          createdBy: user.sub,
          registrationDate: preview.transferDate,
          kind: 'refund',
        }, tx);
        const expenseNumber = await nextFinDocNumber(tx, 'fin_expenses', 'expense_number', 'EXP');
        await tx.fin_expenses.create({
          data: {
            expense_number: expenseNumber,
            expense_date: preview.transferDate,
            category: PLAN_TRANSFER_REFUND_CATEGORY,
            amount: preview.refundAmount,
            tax_amount: 0,
            total_amount: preview.refundAmount,
            payment_method: mapPaymentMethodToArabic(refundMethod),
            payment_status: REVENUE_PAID,
            approval_status: EXPENSE_APPROVED,
            approved_by: user.sub,
            approved_at: new Date(),
            description: `فرق تحويل خطة ${source.subscription_number} — ${invoiceNumber}`,
            vendor: source.customer_name,
            invoice_number: invoiceNumber,
            branch_id: source.branch_id,
            created_by: user.sub,
          },
        });
      }

      return { transfer, preview, destination };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: body.subscriptionId,
      action: 'plan_transfer',
      actorUserId: user.sub,
      branchId: result.transfer.branch_id ?? undefined,
      reason: body.reason,
      before: {
        subscriptionType: result.preview.sourceType,
        consumedValue: result.preview.consumedValue,
        transferableCredit: result.preview.transferableCredit,
      },
      after: {
        transferId: result.transfer.id,
        destinationSubscriptionId: result.destination.id,
        subscriptionType: result.preview.targetType,
        value: result.preview.targetValue,
        sessionsCount: result.preview.targetSessionsCount,
        refundAmount: result.preview.refundAmount,
        additionalPaidAmount,
      },
    });

    return { ...result.transfer, preview: result.preview };
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
    const [subscriptions, transfers, memberTransfers] = await Promise.all([
      this.prisma.club_subscriptions.findMany({ where: { member_id: memberId }, orderBy: { id: 'asc' } }),
      this.prisma.club_subscription_transfers.findMany({ where: { member_id: memberId }, orderBy: { id: 'asc' } }),
      this.prisma.club_member_subscription_transfers.findMany({
        where: { OR: [{ source_member_id: memberId }, { destination_member_id: memberId }] },
        include: {
          source_member: { select: { id: true, member_code: true, name: true } },
          destination_member: { select: { id: true, member_code: true, name: true } },
        },
        orderBy: { id: 'asc' },
      }),
    ]);
    const history = [
      ...subscriptions.map((s) => ({ type: 'subscription' as const, data: s, date: s.registration_date })),
      ...transfers.map((t) => ({ type: 'transfer' as const, data: t, date: t.transfer_date })),
      ...memberTransfers.map((t) => ({
        type: t.source_member_id === memberId
          ? ('member_transfer_out' as const)
          : ('member_transfer_in' as const),
        data: t,
        date: t.effective_date,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    return { subscriptions, transfers, memberTransfers, history };
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
