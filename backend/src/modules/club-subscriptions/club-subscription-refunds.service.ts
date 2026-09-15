import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, club_subscription_refunds, club_subscriptions } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isDryRun, previewResponse, PreviewRow } from '../../common/preview';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString, parseDateOnly } from '../club-members/club-member.utils';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { EXPENSE_APPROVED, mapPaymentMethodToArabic, nextFinDocNumber, REVENUE_PAID } from '../finance/finance.utils';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubReceiptsService } from './club-receipts.service';
import { daysBetween, netValue, roundMoney, toNum } from './club-subscription.utils';
import { assertClubAccountingDayOpen } from './daily-close-lock.util';

/** Expense category refunds are booked under (also seeded in fin_expense_categories, is_system). */
export const REFUND_EXPENSE_CATEGORY = 'مردودات اشتراكات الجيم';

export interface RefundPreview {
  subscriptionId: number;
  customerName: string | null;
  stopDate: string;
  remainingDays: number;
  remainingSessions: number | null;
  refundBasis: 'days' | 'sessions';
  refundAmount: number;
  dailyRate: number;
  originalValue: number;
  /** Total subscription days (denominator of the consumption equation). */
  totalDays: number;
  /** Effective days spent = totalDays − remainingDays. */
  consumedDays: number;
  /** قيمة الاستهلاك الفعلية حسب الأيام/الحصص المستخدمة (من صافي قيمة الاشتراك). */
  consumedValue: number;
  /** المبلغ المدفوع فعلياً (سقف الاسترداد). */
  paidAmount: number;
  status: 'pending';
}

@Injectable()
export class ClubSubscriptionRefundsService {
  private readonly logger = new Logger(ClubSubscriptionRefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: ClubSubscriptionAccountingService,
    private readonly receipts: ClubReceiptsService,
    private readonly audit: BusinessAuditService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number | null | undefined) {
    if (branchId == null || !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private assertSubscriptionAccess(
    user: JwtUser | undefined,
    subscription: {
      branch_id: number;
      member?: { gender: string | null; is_deleted: boolean } | null;
    },
  ) {
    this.assertBranchAccess(user, subscription.branch_id);
    const audience = this.branchScope.memberGenderFilter(user);
    if (audience && (
      !subscription.member ||
      subscription.member.is_deleted ||
      subscription.member.gender !== audience
    )) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا القسم');
    }
    return subscription.member?.gender ?? null;
  }

  private branchWhere(user?: JwtUser): Prisma.club_subscription_refundsWhereInput {
    const allowed = this.branchScope.allowedBranchIds(user);
    const audience = this.branchScope.memberGenderFilter(user);
    return {
      ...(allowed === null ? {} : { branch_id: { in: allowed } }),
      ...(audience
        ? {
            subscription: {
              member: { is: { is_deleted: false, gender: audience } },
            },
          }
        : {}),
    };
  }

  async list(user?: JwtUser) {
    const rows = await this.prisma.club_subscription_refunds.findMany({
      where: this.branchWhere(user),
      orderBy: { id: 'desc' },
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_subscription_refunds.findUnique({
      where: { id },
      include: {
        subscription: {
          select: {
            branch_id: true,
            member: { select: { gender: true, is_deleted: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('الاسترداد غير موجود');
    this.assertSubscriptionAccess(user, row.subscription);
    return this.map(row);
  }

  private map(r: Record<string, unknown>) {
    return {
      id: r.id,
      subscriptionId: r.subscription_id,
      memberId: r.member_id,
      customerName: r.customer_name,
      subscriptionType: r.subscription_type,
      originalStartDate: r.original_start_date,
      originalEndDate: r.original_end_date,
      stopDate: r.stop_date,
      remainingDays: r.remaining_days,
      originalValue: toNum(r.original_value),
      dailyRate: toNum(r.daily_rate),
      refundAmount: toNum(r.refund_amount),
      invoiceNumber: r.invoice_number,
      refundDate: r.refund_date,
      reason: r.reason,
      notes: r.notes,
      status: r.status,
      branchId: r.branch_id,
      createdAt: r.created_at,
    };
  }

  private previewRows(p: RefundPreview): PreviewRow[] {
    const rows: PreviewRow[] = [];
    if (p.refundBasis === 'sessions' && p.remainingSessions != null) {
      rows.push({ label: 'الحصص المتبقية', after: String(p.remainingSessions) });
    } else {
      rows.push({ label: 'الأيام المتبقية', after: String(p.remainingDays) });
    }
    rows.push({ label: 'المبلغ المدفوع', after: `${p.paidAmount.toFixed(2)}` });
    rows.push({ label: 'قيمة الاستهلاك', after: `${p.consumedValue.toFixed(2)}` });
    rows.push({ label: 'مبلغ الاسترداد', after: `${p.refundAmount.toFixed(2)}` });
    rows.push({ label: 'تاريخ الإيقاف', after: p.stopDate });
    return rows;
  }

  /** Compute refund amounts without writing. */
  async computePreview(body: {
    subscriptionId: number;
    stopDate: string;
  }, user?: JwtUser): Promise<RefundPreview> {
    return this.computePreviewWithClient(this.prisma, body, user);
  }

  private async computePreviewWithClient(
    client: PrismaService | Prisma.TransactionClient,
    body: { subscriptionId: number; stopDate: string },
    user?: JwtUser,
  ): Promise<RefundPreview> {
    const sub = await client.club_subscriptions.findUnique({
      where: { id: body.subscriptionId },
      include: { member: { select: { gender: true, is_deleted: true } } },
    });
    if (!sub) throw new NotFoundException('الاشتراك غير موجود');
    this.assertSubscriptionAccess(user, sub);

    const start = sub.subscription_start_date;
    const end = sub.subscription_end_date;
    const stop = body.stopDate;
    if (parseDateOnly(stop) < parseDateOnly(start) || parseDateOnly(stop) > parseDateOnly(end)) {
      throw new BadRequestException('تاريخ الإيقاف يجب أن يكون ضمن فترة الاشتراك');
    }

    const net = netValue(toNum(sub.subscription_value), sub.discount_enabled, toNum(sub.discount_value));
    const paid = toNum(sub.paid_amount);
    const priorAgg = await client.club_subscription_refunds.aggregate({
      where: { subscription_id: body.subscriptionId, status: 'completed' },
      _sum: { refund_amount: true },
    });
    const alreadyRefunded = toNum(priorAgg._sum.refund_amount);
    const refundableCap = Math.max(0, paid - alreadyRefunded);
    if (refundableCap <= 0) {
      throw new BadRequestException('لا يوجد مبلغ متبقٍ للاسترداد لهذا الاشتراك');
    }

    let remainingDays = daysBetween(stop, end);
    let remainingSessions: number | null = null;
    let refundBasis: 'days' | 'sessions' = 'days';
    let dailyRate = 0;
    let consumedValue = 0;
    let unusedValue = 0;
    const totalDays = daysBetween(start, end);

    if (sub.is_linked_to_sessions && sub.sessions_count != null && sub.sessions_count > 0) {
      remainingSessions = Math.max(0, sub.sessions_count - sub.sessions_used);
      if (remainingSessions <= 0) {
        throw new BadRequestException('لا توجد حصص متبقية للاسترداد');
      }
      refundBasis = 'sessions';
      const sessionRate = roundMoney(net / sub.sessions_count);
      dailyRate = sessionRate;
      consumedValue = roundMoney(Math.max(0, sub.sessions_used) * sessionRate);
      unusedValue = roundMoney(remainingSessions * sessionRate);
      remainingDays = daysBetween(stop, end);
    } else {
      if (remainingDays <= 0) throw new BadRequestException('لا توجد أيام متبقية للاسترداد');
      dailyRate = roundMoney(totalDays > 0 ? net / totalDays : 0);
      const consumedDaysForValue = Math.max(0, totalDays - remainingDays);
      consumedValue = roundMoney(consumedDaysForValue * dailyRate);
      unusedValue = roundMoney(remainingDays * dailyRate);
    }

    // الاسترداد = المتبقي غير المستهلك من المدفوع فقط:
    // لا يتجاوز غير المستخدم، ولا يتجاوز (المدفوع − الاستهلاك − استردادات سابقة).
    // مثال: اشتراك 300 دفع 100 واستهلك بقيمة 100 → يسترد 0 (مش 100).
    // نرجّع المعاينة حتى لو المسترد 0 عشان الواجهة تعرض التفاصيل المالية.
    const refundAmount = roundMoney(
      Math.max(0, Math.min(unusedValue, Math.max(0, refundableCap - consumedValue))),
    );

    const consumedDays = Math.max(0, totalDays - remainingDays);

    return {
      subscriptionId: body.subscriptionId,
      customerName: sub.customer_name,
      stopDate: stop,
      remainingDays,
      remainingSessions,
      refundBasis,
      refundAmount,
      dailyRate,
      originalValue: net,
      totalDays,
      consumedDays,
      consumedValue,
      paidAmount: paid,
      status: 'pending',
    };
  }

  async create(body: {
    subscriptionId: number;
    stopDate: string;
    reason?: string;
    notes?: string;
    createdBy?: number;
    dryRun?: boolean;
  }, user?: JwtUser) {
    if (isDryRun(body.dryRun)) {
      const preview = await this.computePreview(body, user);
      return previewResponse(preview, {
        rows: this.previewRows(preview),
        warning:
          preview.refundAmount <= 0
            ? 'لا يوجد مبلغ للاسترداد — قيمة الاستهلاك تغطي المبلغ المدفوع'
            : 'سيتم صرف المبلغ من الخزينة وترحيله كمصروف استرداد وإنهاء الاشتراك',
      });
    }

    let refund: club_subscription_refunds | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        const out = await this.prisma.$transaction(async (tx) => {
          // Serialize all refunds for one subscription. The row lock is released only when the
          // transaction commits, so two concurrent requests cannot both use the same refundable cap.
          const locked = await tx.$queryRaw<{ id: number }[]>`
            SELECT id FROM club_subscriptions
            WHERE id = ${body.subscriptionId}
            FOR UPDATE
          `;
          if (!locked.length) throw new NotFoundException('الاشتراك غير موجود');

          const preview = await this.computePreviewWithClient(tx, body, user);
          if (preview.refundAmount <= 0) {
            throw new BadRequestException(
              'لا يوجد مبلغ للاسترداد — قيمة الاستهلاك تغطي المبلغ المدفوع أو لا يوجد متبقٍ غير مستهلك',
            );
          }

          const sub = await tx.club_subscriptions.findUnique({
            where: { id: body.subscriptionId },
            include: { member: { select: { gender: true, is_deleted: true } } },
          });
          if (!sub) throw new NotFoundException('الاشتراك غير موجود');
          const accountingGender = this.assertSubscriptionAccess(user, sub);
          await assertClubAccountingDayOpen(tx, {
            date: localDateString(),
            branchId: sub.branch_id,
            gender: accountingGender,
          });
          const pendingExists = await tx.club_subscription_refunds.findFirst({
            where: { subscription_id: body.subscriptionId, status: 'pending' },
          });
          if (pendingExists) {
            throw new BadRequestException(
              'يوجد طلب استرداد معلّق لهذا الاشتراك — اعتمده أو ألغِه أولاً',
            );
          }

          const last = await tx.club_subscription_refunds.findFirst({ orderBy: { id: 'desc' } });
          const invNo = `REF-${String((last?.id ?? 0) + 1).padStart(6, '0')}`;
          const created = await tx.club_subscription_refunds.create({
            data: {
              subscription_id: body.subscriptionId,
              member_id: sub.member_id,
              customer_name: sub.customer_name,
              subscription_type: sub.subscription_type,
              original_start_date: sub.subscription_start_date,
              original_end_date: sub.subscription_end_date,
              stop_date: preview.stopDate,
              remaining_days: preview.remainingDays,
              original_value: preview.originalValue,
              daily_rate: preview.dailyRate,
              refund_amount: preview.refundAmount,
              invoice_number: invNo,
              refund_date: localDateString(),
              reason: body.reason ?? null,
              notes: body.notes ?? null,
              status: 'pending',
              branch_id: sub.branch_id,
              created_by: body.createdBy ?? null,
            },
          });
          return { created, invNo };
        });
        refund = out.created;
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 4) {
          continue;
        }
        throw e;
      }
    }
    if (!refund) throw new BadRequestException('تعذّر إنشاء الاسترداد — حاول مرة أخرى');

    await this.commitRefund(refund, body.createdBy, user);
    const completed = await this.prisma.club_subscription_refunds.findUnique({ where: { id: refund.id } });
    if (!completed) throw new BadRequestException('تعذّر إتمام الاسترداد');

    return this.map(completed);
  }

  /** Apply financial side effects when a pending refund is approved. */
  private async commitRefund(
    refund: club_subscription_refunds,
    actorUserId?: number,
    user?: JwtUser,
  ) {
    const refundAmount = toNum(refund.refund_amount);
    const stop = refund.stop_date;

    const committed = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM club_subscriptions
        WHERE id = ${refund.subscription_id}
        FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundException('الاشتراك غير موجود');
      const sub = await tx.club_subscriptions.findUnique({
        where: { id: refund.subscription_id },
        include: { member: { select: { gender: true, is_deleted: true } } },
      });
      if (!sub) throw new NotFoundException('الاشتراك غير موجود');
      const accountingGender = this.assertSubscriptionAccess(user, sub);
      await assertClubAccountingDayOpen(tx, {
        date: refund.refund_date,
        branchId: sub.branch_id,
        gender: accountingGender,
      });

      // Re-check the paid cap under the same row lock used by every refund approval.
      const prior = await tx.club_subscription_refunds.aggregate({
        where: {
          subscription_id: refund.subscription_id,
          status: 'completed',
          id: { not: refund.id },
        },
        _sum: { refund_amount: true },
      });
      const refundableCap = Math.max(0, toNum(sub.paid_amount) - toNum(prior._sum.refund_amount));
      if (refundAmount > refundableCap) {
        throw new BadRequestException('مبلغ الاسترداد يتجاوز المبلغ المدفوع المتبقي');
      }

      const claim = await tx.club_subscription_refunds.updateMany({
        where: { id: refund.id, status: 'pending' },
        data: { status: 'completed' },
      });
      if (claim.count === 0) return null;

      await tx.club_subscriptions.update({
        where: { id: refund.subscription_id },
        data: { subscription_end_date: stop, status: 'expired' },
      });

      await this.receipts.recalculateSubscriptionPayments(refund.subscription_id, tx);
      // Cancelled via refund: write off any unpaid remaining so it no longer shows as debt.
      await tx.club_subscriptions.update({
        where: { id: refund.subscription_id },
        data: { remaining_amount: 0 },
      });

      await this.accounting.postJournal({
        subscriptionNumber: sub.subscription_number,
        sourceDocId: refund.invoice_number,
        paidAmount: refundAmount,
        subscriptionValue: toNum(sub.subscription_value),
        discountValue: toNum(sub.discount_value),
        discountEnabled: sub.discount_enabled,
        paymentMethod: sub.payment_method ?? 'cash',
        branchId: sub.branch_id,
        createdBy: actorUserId ?? refund.created_by ?? undefined,
        kind: 'refund',
      }, tx);

      return sub;
    });
    if (!committed) throw new BadRequestException('تم اعتماد الاسترداد بالفعل');

    await this.postRefundExpense(refund, committed);

    await this.audit.log({
      entityType: 'club_subscription',
      entityId: refund.subscription_id,
      action: 'refund',
      actorUserId,
      branchId: committed.branch_id,
      after: {
        refundId: refund.id,
        refundAmount,
        invoiceNumber: refund.invoice_number,
        stopDate: stop,
        status: 'completed',
      },
    });
  }

  /**
   * Book the committed refund as an EXPENSE under the "مردودات اشتراكات الجيم" line — NOT as a
   * revenue deduction. Auto-approved + paid so it lands on the P&L expense side immediately
   * (dated refund_date). Idempotent on (category, invoice_number); failures are logged, not fatal.
   *
   * NOTE: refunds intentionally no longer write a negative fin_revenues row — revenue stays gross
   * and the refund shows as its own expense line, so net profit is unchanged (no double count).
   */
  private async postRefundExpense(
    refund: club_subscription_refunds,
    sub: club_subscriptions,
  ) {
    const amount = roundMoney(toNum(refund.refund_amount));
    if (amount <= 0) return;
    try {
      await this.prisma.$transaction(async (tx) => {
        const exists = await tx.fin_expenses.findFirst({
          where: { category: REFUND_EXPENSE_CATEGORY, invoice_number: refund.invoice_number },
        });
        if (exists) return;
        const expenseNumber = await nextFinDocNumber(tx, 'fin_expenses', 'expense_number', 'EXP');
        await tx.fin_expenses.create({
          data: {
            expense_number: expenseNumber,
            expense_date: refund.refund_date,
            category: REFUND_EXPENSE_CATEGORY,
            amount,
            tax_amount: 0,
            total_amount: amount,
            payment_method: mapPaymentMethodToArabic(sub.payment_method),
            payment_status: REVENUE_PAID,
            approval_status: EXPENSE_APPROVED,
            approved_by: refund.created_by,
            approved_at: new Date(),
            description: `مرتجع اشتراك ${sub.subscription_number} — ${refund.invoice_number}`,
            vendor: refund.customer_name,
            invoice_number: refund.invoice_number,
            branch_id: refund.branch_id,
            created_by: refund.created_by,
          },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
      this.logger.error(
        `تعذّر تسجيل مرتجع الاشتراك ${refund.invoice_number} كمصروف`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }

  async updateStatus(
    id: number,
    status: 'pending' | 'completed' | 'cancelled',
    actorUserId?: number,
    user?: JwtUser,
  ) {
    const existing = await this.prisma.club_subscription_refunds.findUnique({
      where: { id },
      include: {
        subscription: {
          select: {
            branch_id: true,
            member: { select: { gender: true, is_deleted: true } },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('الاسترداد غير موجود');
    this.assertSubscriptionAccess(user, existing.subscription);

    if (status === 'completed') {
      if (existing.status === 'completed') {
        return this.map(existing);
      }
      if (existing.status === 'cancelled') {
        throw new BadRequestException('لا يمكن اعتماد استرداد ملغى');
      }
      await this.commitRefund(existing, actorUserId, user);
      const row = await this.prisma.club_subscription_refunds.findUnique({ where: { id } });
      return this.map(row!);
    }

    if (status === 'cancelled' && existing.status === 'completed') {
      throw new BadRequestException('لا يمكن إلغاء استرداد مُعتمد — استخدم قيد عكسي');
    }

    const row = await this.prisma.club_subscription_refunds.update({ where: { id }, data: { status } });
    return this.map(row);
  }

  async statistics(user?: JwtUser) {
    const rows = await this.prisma.club_subscription_refunds.findMany({ where: this.branchWhere(user) });
    const totalRefundAmount = rows.reduce((s, r) => s + toNum(r.refund_amount), 0);
    return {
      totalRefunds: rows.length,
      totalRefundAmount,
      averageRefundAmount: rows.length ? totalRefundAmount / rows.length : 0,
      pendingRefunds: rows.filter((r) => r.status === 'pending').length,
      completedRefunds: rows.filter((r) => r.status === 'completed').length,
      cancelledRefunds: rows.filter((r) => r.status === 'cancelled').length,
    };
  }
}
