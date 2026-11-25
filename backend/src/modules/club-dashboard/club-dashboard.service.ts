import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { addDays, toNum } from '../club-subscriptions/club-subscription.utils';
import { resolveTreasuryPeriod } from '../gym-ops/treasury-range.util';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { followUpAlerts, managerInsights, revenueMix, summarizeDiscounts } from './club-dashboard-manager';
import {
  createdByFilter,
  resolveFinanceCreatorScope,
} from '../finance/finance-user-scope';

type MemberSection = 'male' | 'female';

type DashboardLedgerRow = {
  date: string;
  account_type: 'revenue' | 'expense';
  account_name: string;
  amount: Prisma.Decimal;
};

type DashboardBranchExpenseRow = {
  branch_id: number;
  amount: Prisma.Decimal | number;
};

type DashboardBranchSalesRow = {
  branch_id: number;
  sale_date: string;
  bar_revenue: Prisma.Decimal | number;
  product_revenue: Prisma.Decimal | number;
};

type DashboardSubscriptionMetricsRow = {
  active_members: bigint | number;
  active_subscriptions: bigint | number;
  outstanding_count: bigint | number;
  outstanding_amount: Prisma.Decimal | number;
  expired: bigint | number;
  pending_renewals: bigint | number;
  expiring_7: bigint | number;
  expiring_30: bigint | number;
  monthly: bigint | number;
  quarterly: bigint | number;
  half_yearly: bigint | number;
  yearly: bigint | number;
};

@Injectable()
export class ClubDashboardService {
  private readonly executiveCache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly permissions: PermissionEngineService,
  ) {}

  /**
   * The «مركز التنبيهات» counts on their own (ending today / in 3 days, frozen, birthdays, absent),
   * for the notifications bell on every page — without the cost of the whole dashboard.
   */
  async followUpAlerts(user?: JwtUser) {
    return followUpAlerts({
      prisma: this.prisma,
      scopedBranches: this.branchIds(user),
      today: localDateString(),
    });
  }

  private branchIds(user?: JwtUser, requested?: string | number | null) {
    return this.branchScope.resolveListFilter(user, requested ?? null);
  }

  private branchWhere(ids: number[] | null, field = 'branch_id') {
    return ids === null ? {} : { [field]: { in: ids } };
  }

  /**
   * Operational dashboards must follow the membership screens, not archived member history.
   * Unlinked subscriptions remain visible because they are still legitimate subscription records.
   */
  private visibleSubscriptionWhere(): Prisma.club_subscriptionsWhereInput {
    return {
      OR: [
        { member_id: null },
        { member: { is_deleted: false } },
      ],
    };
  }

  /** رجالي/حريمي: a subscription's own section, falling back to its member's. */
  private subscriptionSectionWhere(gender: MemberSection): Prisma.club_subscriptionsWhereInput {
    return {
      OR: [
        { gender },
        { gender: null, member: { is: { gender } } },
      ],
    };
  }

  private lockerSectionWhere(gender: MemberSection): Prisma.club_locker_subscriptionsWhereInput {
    return {
      OR: [
        { gender },
        { gender: null, member: { is: { gender } } },
      ],
    };
  }

  /** Receipts follow their subscription's section, else the member's, else the locker contract's. */
  private receiptSectionWhere(gender: MemberSection): Prisma.club_receiptsWhereInput {
    return {
      OR: [
        { subscription: { is: this.subscriptionSectionWhere(gender) } },
        { subscription_id: null, member: { is: { gender } } },
        {
          subscription_id: null,
          member_id: null,
          locker_subscription: { is: this.lockerSectionWhere(gender) },
        },
      ],
    };
  }

  /**
   * Spa/InBody invoices and class enrollments carry a bare member_id (no relation), so their
   * section is checked against the members table. Returns the ids that belong to `gender`.
   */
  private async sectionMemberIds(
    gender: MemberSection,
    memberIds: Array<number | null | undefined>,
  ): Promise<Set<number>> {
    const ids = [...new Set(memberIds.filter((id): id is number => typeof id === 'number'))];
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.club_members.findMany({
      where: { id: { in: ids }, gender },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }

  private dashboardPeriod(startDate?: string, endDate?: string) {
    const end = endDate ?? localDateString();
    const start = startDate ?? end.slice(0, 8) + '01';
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDate.test(start) || !isoDate.test(end) || start > end) {
      throw new BadRequestException('نطاق التاريخ غير صحيح');
    }
    const startMs = Date.parse(`${start}T00:00:00Z`);
    const endMs = Date.parse(`${end}T00:00:00Z`);
    const days = Math.floor((endMs - startMs) / 86_400_000) + 1;
    if (!Number.isFinite(days) || days < 1 || days > 366) {
      throw new BadRequestException('يجب ألا تتجاوز فترة لوحة التحكم سنة واحدة');
    }
    return { start, end, days, startMs };
  }

  private financialLedgerRows(start: string, end: string, scopedBranches: number[] | null) {
    const branchSql = scopedBranches?.length
      ? Prisma.sql`AND e.branch_id IN (${Prisma.join(scopedBranches)})`
      : Prisma.empty;
    return this.prisma.$queryRaw<DashboardLedgerRow[]>`
      SELECT
        e.date,
        a.account_type,
        a.name AS account_name,
        SUM(
          CASE
            WHEN a.account_type = 'revenue' THEN l.credit - l.debit
            ELSE l.debit - l.credit
          END
        ) AS amount
      FROM acc_journal_entries e
      INNER JOIN acc_journal_entry_lines l ON l.entry_id = e.id
      INNER JOIN acc_accounts a ON a.id = l.account_id
      WHERE e.status IN ('posted', 'reversed')
        AND e.date BETWEEN ${start} AND ${end}
        AND a.account_type IN ('revenue', 'expense')
        ${branchSql}
      GROUP BY e.date, a.account_type, a.id, a.name
      ORDER BY e.date ASC, a.id ASC
    `;
  }

  private branchExpenseRows(start: string, end: string, scopedBranches: number[] | null) {
    const branchSql = scopedBranches?.length
      ? Prisma.sql`AND e.branch_id IN (${Prisma.join(scopedBranches)})`
      : Prisma.empty;
    return this.prisma.$queryRaw<DashboardBranchExpenseRow[]>`
      SELECT e.branch_id, SUM(l.debit - l.credit) AS amount
      FROM acc_journal_entries e
      INNER JOIN acc_journal_entry_lines l ON l.entry_id = e.id
      INNER JOIN acc_accounts a ON a.id = l.account_id
      WHERE e.status IN ('posted', 'reversed')
        AND e.date BETWEEN ${start} AND ${end}
        AND a.account_type = 'expense'
        AND e.branch_id IS NOT NULL
        ${branchSql}
      GROUP BY e.branch_id
    `;
  }

  private branchSalesRows(start: string, end: string, scopedBranches: number[] | null) {
    const branchSql = scopedBranches?.length
      ? Prisma.sql`AND s.branch_id IN (${Prisma.join(scopedBranches)})`
      : Prisma.empty;
    return this.prisma.$queryRaw<DashboardBranchSalesRow[]>`
      SELECT
        s.branch_id,
        s.sale_date,
        COALESCE(SUM(CASE WHEN i.item_type = 'cafe' THEN i.line_total ELSE 0 END), 0) AS bar_revenue,
        COALESCE(SUM(CASE WHEN i.item_type <> 'cafe' THEN i.line_total ELSE 0 END), 0) AS product_revenue
      FROM sales_quick_sales s
      INNER JOIN sales_quick_sale_items i ON i.quick_sale_id = s.id
      WHERE s.status = 'completed'
        AND s.sale_date BETWEEN ${start} AND ${end}
        ${branchSql}
      GROUP BY s.branch_id, s.sale_date
    `;
  }

  async summary(
    query: { startDate?: string; endDate?: string; branchId?: string; gender?: string },
    user?: JwtUser,
    providedLedgerRows?: DashboardLedgerRow[],
    // The executive dashboard reuses this summary as its base; it is not section-filtered.
    applyMemberSection = true,
  ) {
    const { start, end } = this.dashboardPeriod(query.startDate, query.endDate);
    const scopedBranches = this.branchIds(user, query.branchId ?? null);
    const clubBranchWhere = this.branchWhere(scopedBranches);
    const lockerBranchWhere = this.branchWhere(scopedBranches, 'main_branch_id');
    // رجالي/حريمي/الكل: one-section staff are forced to their section (403 for the other one).
    const gender = applyMemberSection
      ? this.branchScope.resolveMemberGenderRequest(user, query.gender)
      : null;

    const memberWhere = { is_deleted: false, ...clubBranchWhere, ...(gender ? { gender } : {}) };
    const subWhere: Prisma.club_subscriptionsWhereInput = {
      ...clubBranchWhere,
      registration_date: { gte: start, lte: end },
      ...this.visibleSubscriptionWhere(),
      ...(gender ? { AND: [this.subscriptionSectionWhere(gender)] } : {}),
    };
    const lockerSubWhere: Prisma.club_locker_subscriptionsWhereInput = {
      ...lockerBranchWhere,
      subscription_start_date: { gte: start, lte: end },
      ...(gender ? { AND: [this.lockerSectionWhere(gender)] } : {}),
    };

    const today = localDateString();
    const renewalWindow = addDays(today, 7);
    const subscriptionBranchSql = scopedBranches?.length
      ? Prisma.sql`AND s.branch_id IN (${Prisma.join(scopedBranches)})`
      : Prisma.empty;
    const subscriptionSectionSql = gender
      ? Prisma.sql`AND COALESCE(s.gender, m.gender) = ${gender}`
      : Prisma.empty;

    const [totalMembers, legacyActiveMembers, newMembersInPeriod, subsInRange, lockerSubs, attendance, facilityCount, subscriptionMetricsRows, trainerCount, classesToday, spaInvoices, inbodyInvoices, classEnrollmentsPaid, ledgerRows] =
      await Promise.all([
        this.prisma.club_members.count({ where: memberWhere }),
        this.prisma.club_members.count({
          where: { ...memberWhere, end_date: { gte: today } },
        }),
        this.prisma.club_members.count({
          where: {
            ...memberWhere,
            created_at: {
              gte: new Date(`${start}T00:00:00.000Z`),
              lte: new Date(`${end}T23:59:59.999Z`),
            },
          },
        }),
        this.prisma.club_subscriptions.findMany({
          where: subWhere,
          select: { paid_amount: true, remaining_amount: true, subscription_value: true },
        }),
        this.prisma.club_locker_subscriptions.findMany({
          where: lockerSubWhere,
          select: { paid_amount: true },
        }),
        this.prisma.club_attendance.groupBy({
          by: ['member_id'],
          where: {
            attendance_date: { gte: start, lte: end },
            ...clubBranchWhere,
            ...(gender ? { member: { is: { gender } } } : {}),
          },
        }),
        this.prisma.club_halls.count({ where: { is_deleted: false, ...clubBranchWhere } }),
        this.prisma.$queryRaw<DashboardSubscriptionMetricsRow[]>`
          SELECT
            COUNT(DISTINCT CASE WHEN s.subscription_end_date >= ${today} THEN s.member_id END) AS active_members,
            SUM(CASE WHEN s.subscription_start_date <= ${today} AND s.subscription_end_date >= ${today} THEN 1 ELSE 0 END) AS active_subscriptions,
            SUM(CASE WHEN s.subscription_start_date <= ${today} AND s.subscription_end_date >= ${today} AND s.remaining_amount > 0 THEN 1 ELSE 0 END) AS outstanding_count,
            COALESCE(SUM(CASE WHEN s.subscription_start_date <= ${today} AND s.subscription_end_date >= ${today} AND s.remaining_amount > 0 THEN s.remaining_amount ELSE 0 END), 0) AS outstanding_amount,
            SUM(CASE WHEN s.subscription_end_date < ${today} THEN 1 ELSE 0 END) AS expired,
            SUM(CASE WHEN s.subscription_start_date <= ${today} AND s.subscription_end_date BETWEEN ${today} AND ${renewalWindow} THEN 1 ELSE 0 END) AS pending_renewals,
            SUM(CASE WHEN s.subscription_start_date <= ${today} AND s.subscription_end_date BETWEEN ${today} AND ${renewalWindow} THEN 1 ELSE 0 END) AS expiring_7,
            SUM(CASE WHEN s.subscription_start_date <= ${today} AND s.subscription_end_date BETWEEN ${today} AND ${addDays(today, 30)} THEN 1 ELSE 0 END) AS expiring_30,
            SUM(CASE WHEN s.subscription_end_date >= ${today} AND DATEDIFF(s.subscription_end_date, s.subscription_start_date) <= 35 THEN 1 ELSE 0 END) AS monthly,
            SUM(CASE WHEN s.subscription_end_date >= ${today} AND DATEDIFF(s.subscription_end_date, s.subscription_start_date) BETWEEN 36 AND 100 THEN 1 ELSE 0 END) AS quarterly,
            SUM(CASE WHEN s.subscription_end_date >= ${today} AND DATEDIFF(s.subscription_end_date, s.subscription_start_date) BETWEEN 101 AND 359 THEN 1 ELSE 0 END) AS half_yearly,
            SUM(CASE WHEN s.subscription_end_date >= ${today} AND DATEDIFF(s.subscription_end_date, s.subscription_start_date) >= 360 THEN 1 ELSE 0 END) AS yearly
          FROM club_subscriptions s
          LEFT JOIN club_members m ON m.id = s.member_id
          WHERE (s.member_id IS NULL OR m.is_deleted = 0)
            ${subscriptionBranchSql}
            ${subscriptionSectionSql}
        `,
        this.prisma.club_trainers.count({ where: { is_deleted: false, is_active: true } }),
        this.prisma.club_classes.count({
          where: {
            is_deleted: false,
            class_date: today,
            ...clubBranchWhere,
          },
        }),
        this.prisma.club_spa_invoices.findMany({
          where: {
            is_active: true,
            invoice_date: { gte: start, lte: end },
            ...clubBranchWhere,
          },
          select: { status: true, total_amount: true, member_id: true },
        }),
        this.prisma.club_inbody_invoices.findMany({
          where: {
            is_active: true,
            invoice_date: { gte: start, lte: end },
            ...clubBranchWhere,
          },
          select: { status: true, total_amount: true, member_id: true },
        }),
        this.prisma.club_class_enrollments.findMany({
          where: {
            enrollment_date: { gte: start, lte: end },
            attendance_status: { not: 'cancelled' },
            class: {
              is_deleted: false,
              ...clubBranchWhere,
            },
          },
          include: { class: { select: { price: true } } },
        }),
        providedLedgerRows ?? this.financialLedgerRows(start, end, scopedBranches),
      ]);

    const sectionMembers = gender
      ? await this.sectionMemberIds(gender, [
          ...spaInvoices.map((i) => i.member_id),
          ...inbodyInvoices.map((i) => i.member_id),
          ...classEnrollmentsPaid.map((e) => e.member_id),
        ])
      : null;
    const inSection = (memberId: number | null) =>
      sectionMembers === null || (memberId != null && sectionMembers.has(memberId));

    const spaRevenue = spaInvoices
      .filter((i) => i.status === 'paid' && inSection(i.member_id))
      .reduce((sum, i) => sum + toNum(i.total_amount), 0);
    const inbodyRevenue = inbodyInvoices
      .filter((i) => i.status === 'paid' && inSection(i.member_id))
      .reduce((sum, i) => sum + toNum(i.total_amount), 0);
    const classRevenue = classEnrollmentsPaid
      .filter((e) => inSection(e.member_id))
      .reduce((sum, e) => sum + toNum(e.class.price), 0);

    const subscriptionMetrics = subscriptionMetricsRows[0];

    const subscriptionRevenue = subsInRange.reduce((sum, s) => sum + toNum(s.paid_amount), 0);
    const subscriptionRemaining = subsInRange.reduce(
      (sum, s) => sum + toNum(s.remaining_amount),
      0,
    );
    const lockerRevenue = lockerSubs.reduce((sum, s) => sum + toNum(s.paid_amount), 0);
    // The club dashboards follow exactly the same paid amount shown by subscription management.
    // Accounting stays the source of expenses only; it may contain Cafe and other revenue streams.
    const monthlyRevenue = subscriptionRevenue;
    const totalRevenueAllSources = monthlyRevenue;
    const expenses = ledgerRows
      .filter((row) => row.account_type === 'expense')
      .reduce((sum, row) => sum + toNum(row.amount), 0);
    const expensesAvailable = true;
    const expenseByAccount = new Map<string, number>();
    for (const row of ledgerRows) {
      if (row.account_type !== 'expense') continue;
      expenseByAccount.set(
        row.account_name,
        (expenseByAccount.get(row.account_name) ?? 0) + toNum(row.amount),
      );
    }
    const expenseBreakdown = [...expenseByAccount.entries()]
      .map(([name, value]) => ({
        name,
        value: Math.round(value * 100) / 100,
      }))
      .filter((item) => Math.abs(item.value) >= 0.01)
      .sort((a, b) => b.value - a.value);

    const distinctAttendees = attendance.length;
    const activeMembers = Number(subscriptionMetrics?.active_members ?? 0) || legacyActiveMembers;
    const attendanceRate = activeMembers > 0 ? Math.round((distinctAttendees / activeMembers) * 100) : 0;

    // Distribution of currently active/upcoming subscriptions (by real duration), not only new
    // registrations in the selected date range — hub users expect the live plan mix.
    const distribution = {
      monthly: Number(subscriptionMetrics?.monthly ?? 0),
      quarterly: Number(subscriptionMetrics?.quarterly ?? 0),
      halfYearly: Number(subscriptionMetrics?.half_yearly ?? 0),
      yearly: Number(subscriptionMetrics?.yearly ?? 0),
    };
    const expiredSubscriptions = Number(subscriptionMetrics?.expired ?? 0);
    const pendingRenewals = Number(subscriptionMetrics?.pending_renewals ?? 0);

    const [recentMembers, recentPayments, refundsInRange] = await Promise.all([
      this.prisma.club_members.findMany({
        where: {
          ...memberWhere,
          created_at: {
            gte: new Date(`${start}T00:00:00.000Z`),
            lte: new Date(`${end}T23:59:59.999Z`),
          },
        },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { id: true, name: true, member_code: true, created_at: true },
      }),
      this.prisma.club_receipts.findMany({
        where: {
          receipt_date: { gte: start, lte: end },
          status: { in: ['مدفوعة', 'paid'] },
          AND: [
            {
              OR: [
                { member: { is_deleted: false } },
                {
                  member_id: null,
                  subscription: { member: { is_deleted: false } },
                },
              ],
            },
            ...(gender ? [this.receiptSectionWhere(gender)] : []),
          ],
          // Honor the branch filter via the receipt's subscription/member (receipts have no branch column).
          ...(scopedBranches
            ? { OR: [{ subscription: { branch_id: { in: scopedBranches } } }, { member: { branch_id: { in: scopedBranches } } }] }
            : {}),
        },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { id: true, member_name: true, amount: true, receipt_date: true, receipt_number: true },
      }),
      this.prisma.club_subscription_refunds.findMany({
        where: {
          status: 'completed',
          refund_date: { gte: start, lte: end },
          ...clubBranchWhere,
          ...(gender ? { subscription: { is: this.subscriptionSectionWhere(gender) } } : {}),
        },
        select: { refund_amount: true },
      }),
    ]);

    const avgMonthlyMembership =
      subsInRange.length > 0
        ? subsInRange.reduce((s, x) => s + toNum(x.subscription_value), 0) / subsInRange.length
        : 0;

    // Committed subscription refunds in the range reduce net revenue (المرتجعات تُخصم من الإيراد).
    const subscriptionRefunds = refundsInRange.reduce((sum, r) => sum + toNum(r.refund_amount), 0);

    return {
      totalMembers: {
        total: totalMembers,
        active: activeMembers,
        inactive: totalMembers - activeMembers,
        newThisMonth: newMembersInPeriod,
      },
      monthlyRevenue,
      totalPaid: subscriptionRevenue,
      totalRemaining: subscriptionRemaining,
      subscriptionRevenue,
      lockerRevenue,
      spaRevenue,
      inbodyRevenue,
      classRevenue,
      otherRevenue: spaRevenue + inbodyRevenue + classRevenue,
      totalRevenueAllSources,
      subscriptionRefunds,
      // Revenue is gross; refunds are already inside `expenses` (booked as an expense line), so
      // they are NOT deducted from revenue and NOT subtracted again here.
      netRevenueAfterRefunds: totalRevenueAllSources,
      expenses,
      expenseBreakdown,
      netProfit: totalRevenueAllSources - expenses,
      expensesAvailable,
      trainers: trainerCount,
      classesToday,
      facilities: facilityCount,
      avgMonthlyMembership,
      attendanceRate,
      subscriptionDistribution: distribution,
      alerts: {
        expiredSubscriptions,
        pendingRenewals,
        newMembers: newMembersInPeriod,
      },
      recentActivities: {
        members: recentMembers.map((m) => ({
          type: 'member',
          label: m.name,
          code: m.member_code,
          date: m.created_at,
        })),
        payments: recentPayments.map((p) => ({
          type: 'payment',
          label: p.member_name,
          amount: toNum(p.amount),
          date: p.receipt_date,
          receiptNumber: p.receipt_number,
        })),
      },
      startDate: start,
      endDate: end,
      branchId: scopedBranches?.length === 1 ? scopedBranches[0] : null,
    };
  }

  /**
   * Executive dashboard for the whole gym.
   *
   * Member collection and remaining balances come from subscription management so they match the
   * member/subscription screens. Expenses still come from posted accounting entries and include a
   * category breakdown.
   */
  async executive(query: { startDate?: string; endDate?: string; branchId?: string }, user?: JwtUser) {
    const { start, end } = this.dashboardPeriod(query.startDate, query.endDate);
    const scopedBranches = this.branchIds(user, query.branchId ?? null);
    const key = [start, end, scopedBranches?.join(',') ?? 'all', user?.sub ?? 'anonymous'].join('|');
    const now = Date.now();
    const cached = this.executiveCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const value = this.buildExecutive({ startDate: start, endDate: end, branchId: query.branchId }, user)
      .catch((error) => {
        if (this.executiveCache.get(key)?.value === value) this.executiveCache.delete(key);
        throw error;
      });
    this.executiveCache.set(key, { expiresAt: now + 30_000, value });

    // Bound per-process memory even when admins inspect many custom ranges.
    if (this.executiveCache.size > 100) {
      for (const [cacheKey, entry] of this.executiveCache) {
        if (entry.expiresAt <= now || this.executiveCache.size > 100) this.executiveCache.delete(cacheKey);
      }
    }
    return value;
  }

  private async buildExecutive(query: { startDate?: string; endDate?: string; branchId?: string }, user?: JwtUser) {
    const { start, end, days, startMs } = this.dashboardPeriod(query.startDate, query.endDate);
    const scopedBranches = this.branchIds(user, query.branchId ?? null);
    const clubBranchWhere = this.branchWhere(scopedBranches);
    const today = localDateString();
    const expiring7Date = addDays(today, 7);
    const expiring30Date = addDays(today, 30);
    const warehouseBranchSql = scopedBranches?.length
      ? Prisma.sql`AND w.branch_id IN (${Prisma.join(scopedBranches)})`
      : Prisma.empty;
    const subscriptionBranchSql = scopedBranches?.length
      ? Prisma.sql`AND s.branch_id IN (${Prisma.join(scopedBranches)})`
      : Prisma.empty;

    type CountRow = { total: bigint | number };
    // Start the expensive ledger aggregation immediately and overlap it with
    // membership, attendance, inventory and sales queries.
    const ledgerRowsPromise = this.financialLedgerRows(start, end, scopedBranches);
    const basePromise = ledgerRowsPromise.then((ledgerRows) =>
      this.summary({ startDate: start, endDate: end, branchId: query.branchId }, user, ledgerRows, false),
    );

    const [
      base,
      subscriptions,
      members,
      attendances,
      subscriptionMetricsRows,
      lowStockRows,
      employeeCount,
      quickSalesToday,
      bookingsToday,
      ledgerRows,
      dashboardBranches,
      branchSubscriptions,
      branchNewMembers,
      branchBlockedMembers,
      branchInbody,
      branchExpenses,
      branchSales,
      manager,
    ] =
      await Promise.all([
        basePromise,
        this.prisma.club_subscriptions.findMany({
          where: {
            registration_date: { gte: start, lte: end },
            ...clubBranchWhere,
            ...this.visibleSubscriptionWhere(),
          },
          select: {
            registration_date: true,
            branch_id: true,
            subscription_type: true,
            subscription_value: true,
            discount_enabled: true,
            discount_value: true,
            paid_amount: true,
            remaining_amount: true,
            type: { select: { name: true } },
          },
        }),
        this.prisma.club_members.findMany({
          where: {
            is_deleted: false,
            created_at: {
              gte: new Date(`${start}T00:00:00.000Z`),
              lte: new Date(`${end}T23:59:59.999Z`),
            },
            ...clubBranchWhere,
          },
          select: { created_at: true },
        }),
        this.prisma.club_attendance.findMany({
          where: { attendance_date: { gte: start, lte: end }, ...clubBranchWhere },
          select: { attendance_date: true, member_id: true },
        }),
        this.prisma.$queryRaw<DashboardSubscriptionMetricsRow[]>`
          SELECT
            COUNT(DISTINCT CASE WHEN s.subscription_end_date >= ${today} THEN s.member_id END) AS active_members,
            SUM(CASE WHEN s.subscription_start_date <= ${today} AND s.subscription_end_date >= ${today} THEN 1 ELSE 0 END) AS active_subscriptions,
            SUM(CASE WHEN s.subscription_start_date <= ${today} AND s.subscription_end_date >= ${today} AND s.remaining_amount > 0 THEN 1 ELSE 0 END) AS outstanding_count,
            COALESCE(SUM(CASE WHEN s.subscription_start_date <= ${today} AND s.subscription_end_date >= ${today} AND s.remaining_amount > 0 THEN s.remaining_amount ELSE 0 END), 0) AS outstanding_amount,
            SUM(CASE WHEN s.subscription_end_date < ${today} THEN 1 ELSE 0 END) AS expired,
            SUM(CASE WHEN s.subscription_start_date <= ${today} AND s.subscription_end_date BETWEEN ${today} AND ${expiring7Date} THEN 1 ELSE 0 END) AS pending_renewals,
            SUM(CASE WHEN s.subscription_start_date <= ${today} AND s.subscription_end_date BETWEEN ${today} AND ${expiring7Date} THEN 1 ELSE 0 END) AS expiring_7,
            SUM(CASE WHEN s.subscription_start_date <= ${today} AND s.subscription_end_date BETWEEN ${today} AND ${expiring30Date} THEN 1 ELSE 0 END) AS expiring_30,
            0 AS monthly, 0 AS quarterly, 0 AS half_yearly, 0 AS yearly
          FROM club_subscriptions s
          LEFT JOIN club_members m ON m.id = s.member_id
          WHERE (s.member_id IS NULL OR m.is_deleted = 0)
            ${subscriptionBranchSql}
        `,
        this.prisma.$queryRaw<CountRow[]>`
          SELECT COUNT(*) AS total
          FROM inv_stock_balances b
          INNER JOIN inv_warehouses w ON w.id = b.warehouse_id
          INNER JOIN inv_products p ON p.id = b.product_id
          WHERE w.is_deleted = 0
            AND p.is_deleted = 0
            AND b.current_stock <= b.reorder_point
            ${warehouseBranchSql}
        `,
        this.prisma.employees.count({
          where: {
            OR: [{ leave_emp: null }, { leave_emp: 0 }],
            ...(scopedBranches ? { branch_id_fk: { in: scopedBranches } } : {}),
          },
        }),
        this.prisma.sales_quick_sales.aggregate({
          where: { sale_date: today, status: 'completed', ...clubBranchWhere },
          _count: { _all: true },
          _sum: { collected_amount: true },
        }),
        this.prisma.sales_bookings.count({
          where: {
            booking_date: today,
            status: { not: 'cancelled' },
            ...clubBranchWhere,
          },
        }),
        ledgerRowsPromise,
        this.prisma.tbl_branches.findMany({
          where: scopedBranches ? { branch_id: { in: scopedBranches } } : {},
          orderBy: { branch_id: 'asc' },
          select: { branch_id: true, branch_name: true },
        }),
        this.prisma.club_subscriptions.groupBy({
          by: ['branch_id'],
          where: {
            registration_date: { gte: start, lte: end },
            ...clubBranchWhere,
            ...this.visibleSubscriptionWhere(),
          },
          _count: { _all: true },
          _sum: { paid_amount: true },
        }),
        this.prisma.club_members.groupBy({
          by: ['branch_id'],
          where: {
            is_deleted: false,
            created_at: {
              gte: new Date(`${start}T00:00:00.000Z`),
              lte: new Date(`${end}T23:59:59.999Z`),
            },
            ...clubBranchWhere,
          },
          _count: { _all: true },
        }),
        this.prisma.club_members.groupBy({
          by: ['branch_id'],
          where: { is_deleted: false, is_blocked: true, ...clubBranchWhere },
          _count: { _all: true },
        }),
        this.prisma.club_inbody_invoices.groupBy({
          by: ['branch_id'],
          where: {
            is_active: true,
            invoice_date: { gte: start, lte: end },
            ...clubBranchWhere,
          },
          _count: { _all: true },
          _sum: { total_amount: true },
        }),
        this.branchExpenseRows(start, end, scopedBranches),
        this.branchSalesRows(start, end, scopedBranches),
        managerInsights({
          prisma: this.prisma,
          permissions: this.permissions,
          user,
          scopedBranches,
          today,
        }),
      ]);

    const daily = new Map<string, {
      date: string;
      label: string;
      revenue: number;
      expenses: number;
      profit: number;
      newMembers: number;
      newSubscriptions: number;
      checkins: number;
    }>();
    for (let i = 0; i < days; i++) {
      const date = new Date(startMs + i * 86_400_000).toISOString().slice(0, 10);
      daily.set(date, {
        date,
        label: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
        revenue: 0,
        expenses: 0,
        profit: 0,
        newMembers: 0,
        newSubscriptions: 0,
        checkins: 0,
      });
    }

    const expenseByAccount = new Map<string, number>();
    for (const row of ledgerRows) {
      const amount = toNum(row.amount);
      const point = daily.get(row.date);
      if (row.account_type !== 'expense') continue;
      if (point) point.expenses += amount;
      expenseByAccount.set(
        row.account_name,
        (expenseByAccount.get(row.account_name) ?? 0) + amount,
      );
    }
    for (const m of members) {
      const date = m.created_at.toISOString().slice(0, 10);
      const point = daily.get(date);
      if (point) point.newMembers += 1;
    }
    for (const s of subscriptions) {
      const point = daily.get(s.registration_date);
      if (point) {
        point.newSubscriptions += 1;
        point.revenue += toNum(s.paid_amount);
      }
    }
    for (const sale of branchSales) {
      const point = daily.get(sale.sale_date);
      if (point) point.revenue += toNum(sale.bar_revenue) + toNum(sale.product_revenue);
    }
    for (const attendance of attendances) {
      const point = daily.get(attendance.attendance_date);
      if (point) point.checkins += 1;
    }
    const trends = [...daily.values()].map((point) => ({
      ...point,
      revenue: Math.round(point.revenue * 100) / 100,
      expenses: Math.round(point.expenses * 100) / 100,
      profit: Math.round((point.revenue - point.expenses) * 100) / 100,
    }));

    const revenue = trends.reduce((sum, row) => sum + row.revenue, 0);
    const expenses = trends.reduce((sum, row) => sum + row.expenses, 0);
    const profit = revenue - expenses;
    const subscriptionMetrics = subscriptionMetricsRows[0];
    const packageMap = new Map<string, { name: string; count: number; revenue: number }>();
    for (const sub of subscriptions) {
      const name = sub.type?.name || sub.subscription_type || 'اشتراك غير مصنف';
      const item = packageMap.get(name) ?? { name, count: 0, revenue: 0 };
      item.count += 1;
      item.revenue += toNum(sub.paid_amount);
      packageMap.set(name, item);
    }

    const breakdown = (source: Map<string, number>) => [...source.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .filter((item) => Math.abs(item.value) >= 0.01)
      .sort((a, b) => b.value - a.value);
    const checkinsToday = attendances.filter((a) => a.attendance_date === today).length;
    const uniqueVisitors = new Set(attendances.map((a) => a.member_id)).size;
    const byBranch = <T extends { branch_id: number }>(rows: T[]) =>
      new Map(rows.map((row) => [row.branch_id, row]));
    const subscriptionsByBranch = byBranch(branchSubscriptions);
    const newMembersByBranch = byBranch(branchNewMembers);
    const blockedMembersByBranch = byBranch(branchBlockedMembers);
    const inbodyByBranch = byBranch(branchInbody);
    // «قياسات InBody»: measurements recorded on «قياسات الأعضاء» in the period, by the member's
    // branch — not InBody invoices (most measurements come from the package, with no invoice).
    const measurementRows = await this.prisma.$queryRaw<Array<{ branch_id: number; total: bigint }>>(Prisma.sql`
      SELECT m.branch_id, COUNT(*) AS total
      FROM club_inbody_measurements im
      INNER JOIN club_members m ON m.id = im.member_id AND m.is_deleted = 0
      WHERE im.measurement_date BETWEEN ${start} AND ${end}
        ${scopedBranches ? Prisma.sql`AND m.branch_id IN (${Prisma.join(scopedBranches.length ? scopedBranches : [-1])})` : Prisma.empty}
      GROUP BY m.branch_id`);
    const measurementsByBranch = new Map(measurementRows.map((row) => [Number(row.branch_id), Number(row.total)]));
    const expensesByBranch = byBranch(branchExpenses);
    const salesByBranch = new Map<number, { barRevenue: number; productRevenue: number }>();
    for (const sale of branchSales) {
      const current = salesByBranch.get(sale.branch_id) ?? { barRevenue: 0, productRevenue: 0 };
      current.barRevenue += toNum(sale.bar_revenue);
      current.productRevenue += toNum(sale.product_revenue);
      salesByBranch.set(sale.branch_id, current);
    }
    const branchBreakdown = dashboardBranches.map((branch) => {
      const subscription = subscriptionsByBranch.get(branch.branch_id);
      const inbody = inbodyByBranch.get(branch.branch_id);
      const sale = salesByBranch.get(branch.branch_id);
      const subscriptionRevenue = toNum(subscription?._sum.paid_amount ?? 0);
      const barRevenue = sale?.barRevenue ?? 0;
      const productRevenue = sale?.productRevenue ?? 0;
      return {
        branchId: branch.branch_id,
        branchName: branch.branch_name || `#${branch.branch_id}`,
        totalRevenue: Math.round((subscriptionRevenue + barRevenue + productRevenue) * 100) / 100,
        subscriptionRevenue: Math.round(subscriptionRevenue * 100) / 100,
        barRevenue: Math.round(barRevenue * 100) / 100,
        productRevenue: Math.round(productRevenue * 100) / 100,
        expenses: Math.round(toNum(expensesByBranch.get(branch.branch_id)?.amount ?? 0) * 100) / 100,
        subscriptionsCount: subscription?._count._all ?? 0,
        newMembers: newMembersByBranch.get(branch.branch_id)?._count._all ?? 0,
        inbodyCount: measurementsByBranch.get(branch.branch_id) ?? 0,
        inbodyRevenue: Math.round(toNum(inbody?._sum.total_amount ?? 0) * 100) / 100,
        blockedMembers: blockedMembersByBranch.get(branch.branch_id)?._count._all ?? 0,
      };
    });

    return {
      ...base,
      monthlyRevenue: revenue,
      totalRevenueAllSources: revenue,
      netRevenueAfterRefunds: revenue,
      expenses,
      netProfit: profit,
      financials: {
        paid: Math.round(revenue * 100) / 100,
        remaining: Math.round(base.totalRemaining * 100) / 100,
        revenue: Math.round(revenue * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        margin: revenue !== 0 ? Math.round((profit / revenue) * 1000) / 10 : 0,
        source: 'member-management',
        expenseSource: 'general-ledger',
      },
      operations: {
        activeSubscriptions: Number(subscriptionMetrics?.active_subscriptions ?? 0),
        newSubscriptions: subscriptions.length,
        checkinsToday,
        checkinsInRange: attendances.length,
        uniqueVisitors,
        outstandingAmount: Math.round(toNum(subscriptionMetrics?.outstanding_amount ?? 0) * 100) / 100,
        outstandingCount: Number(subscriptionMetrics?.outstanding_count ?? 0),
        expiring7: Number(subscriptionMetrics?.expiring_7 ?? 0),
        expiring30: Number(subscriptionMetrics?.expiring_30 ?? 0),
        lowStock: Number(lowStockRows[0]?.total ?? 0),
        employees: employeeCount,
        trainers: base.trainers,
        classesToday: base.classesToday ?? 0,
        facilities: base.facilities,
        quickSalesToday: quickSalesToday._count._all,
        quickSalesAmountToday: toNum(quickSalesToday._sum.collected_amount),
        bookingsToday,
      },
      trends,
      revenueBreakdown: [...packageMap.values()]
        .map((item) => ({ name: item.name, value: Math.round(item.revenue * 100) / 100 }))
        .filter((item) => Math.abs(item.value) >= 0.01)
        .sort((a, b) => b.value - a.value),
      expenseBreakdown: breakdown(expenseByAccount),
      packagePerformance: [...packageMap.values()]
        .map((item) => ({ ...item, revenue: Math.round(item.revenue * 100) / 100 }))
        .sort((a, b) => b.revenue - a.revenue),
      membershipStatus: [
        { name: 'نشط', value: base.totalMembers.active },
        { name: 'غير نشط', value: base.totalMembers.inactive },
      ],
      branchBreakdown,
      // Manager widgets (additive; each is null when its data is unavailable or not permitted).
      todaySnapshot: manager.today,
      managerAlerts: manager.alerts,
      salesTeamPerformance: manager.salesTeam,
      captainsPerformance: manager.captains,
      revenueMix: revenueMix(
        subscriptions.reduce((sum, row) => sum + toNum(row.paid_amount), 0),
        branchSales.reduce((sum, row) => sum + toNum(row.bar_revenue), 0),
        branchSales.reduce((sum, row) => sum + toNum(row.product_revenue), 0),
      ),
      discounts: {
        ...summarizeDiscounts(subscriptions),
        // Each branch: its discounts on its own subscriptions in the period (client, 25 Nov).
        byBranch: [...new Set(subscriptions.map((row) => row.branch_id))]
          .map((id) => ({
            branchId: id,
            branchName: branchBreakdown.find((row) => row.branchId === id)?.branchName ?? `فرع ${id}`,
            ...summarizeDiscounts(subscriptions.filter((row) => row.branch_id === id)),
          }))
          .sort((a, b) => b.discountValue - a.discountValue),
      },
      period: { start, end, days },
      branchId: scopedBranches?.length === 1 ? scopedBranches[0] : null,
    };
  }

  async treasury(
    params:
      | { date?: string; dateFrom?: string; dateTo?: string; branchId?: string; gender?: string }
      | string
      | undefined,
    user?: JwtUser,
    legacyBranchId?: string,
  ) {
    const opts =
      typeof params === 'string' || params == null
        ? { date: params ?? undefined, branchId: legacyBranchId }
        : { ...params, branchId: params.branchId ?? legacyBranchId };
    // رجالي/حريمي/الكل: member money only (receipts, subscriptions, lockers, spa, InBody).
    const gender = this.branchScope.resolveMemberGenderRequest(
      user,
      typeof params === 'object' && params ? params.gender : undefined,
    );

    const {
      dateFrom,
      dateTo,
      periodMode,
      summaryOnly,
      detailRangeLimitDays,
    } = resolveTreasuryPeriod(opts);

    const dateFilter = (exactField: Record<string, string | { gte?: string; lte?: string }>) => {
      if (!dateFrom || !dateTo) return {};
      if (dateFrom === dateTo) return exactField;
      const key = Object.keys(exactField)[0];
      return { [key]: { gte: dateFrom, lte: dateTo } };
    };

    const scopedBranches = this.branchIds(user, opts.branchId ?? null);
    const clubBranchWhere = this.branchWhere(scopedBranches);
    const lockerBranchWhere = this.branchWhere(scopedBranches, 'main_branch_id');
    const creatorScope = await resolveFinanceCreatorScope(this.permissions, user);
    const creatorWhere = createdByFilter(creatorScope.selectedUserId);
    const receiptBranchWhere: Prisma.club_receiptsWhereInput = scopedBranches
      ? {
          OR: [
            { branch_id: { in: scopedBranches } },
            { subscription: { branch_id: { in: scopedBranches } } },
            { member: { branch_id: { in: scopedBranches } } },
          ],
        }
      : {};
    const receiptSectionWhere: Prisma.club_receiptsWhereInput = gender
      ? { AND: [this.receiptSectionWhere(gender)] }
      : {};
    const subscriptionSectionWhere: Prisma.club_subscriptionsWhereInput = gender
      ? { AND: [this.subscriptionSectionWhere(gender)] }
      : {};
    const lockerSectionWhere: Prisma.club_locker_subscriptionsWhereInput = gender
      ? { AND: [this.lockerSectionWhere(gender)] }
      : {};

    if (summaryOnly) {
      const receiptWhere: Prisma.club_receiptsWhereInput = {
        ...dateFilter({ receipt_date: dateFrom ?? '' }),
        ...receiptBranchWhere,
        ...creatorWhere,
        ...receiptSectionWhere,
      };
      const receiptPaymentWhere: Prisma.club_receipt_paymentsWhereInput = {
        receipt: { is: receiptWhere },
      };
      const subscriptionWhere: Prisma.club_subscriptionsWhereInput = {
        ...dateFilter({ registration_date: dateFrom ?? '' }),
        ...clubBranchWhere,
        ...creatorWhere,
        ...subscriptionSectionWhere,
        paid_amount: { gt: 0 },
        receipts: {
          none: dateFrom && dateTo
            ? { receipt_date: dateFrom === dateTo ? dateFrom : { gte: dateFrom, lte: dateTo } }
            : {},
        },
      };
      const spaWhere: Prisma.club_spa_invoicesWhereInput = {
        ...dateFilter({ invoice_date: dateFrom ?? '' }),
        is_active: true,
        status: 'paid',
        ...clubBranchWhere,
        ...creatorWhere,
      };
      const inbodyWhere: Prisma.club_inbody_invoicesWhereInput = {
        ...dateFilter({ invoice_date: dateFrom ?? '' }),
        is_active: true,
        status: 'paid',
        ...clubBranchWhere,
        ...creatorWhere,
      };
      if (gender) {
        const [spaMembers, inbodyMembers] = await Promise.all([
          this.prisma.club_spa_invoices.findMany({ where: spaWhere, select: { member_id: true }, distinct: ['member_id'] }),
          this.prisma.club_inbody_invoices.findMany({ where: inbodyWhere, select: { member_id: true }, distinct: ['member_id'] }),
        ]);
        const allowed = [
          ...(await this.sectionMemberIds(gender, [
            ...spaMembers.map((row) => row.member_id),
            ...inbodyMembers.map((row) => row.member_id),
          ])),
        ];
        spaWhere.member_id = { in: allowed };
        inbodyWhere.member_id = { in: allowed };
      }

      const [
        receiptPayments,
        legacyReceipts,
        subscriptions,
        lockerSubscriptions,
        spaInvoices,
        inbodyInvoices,
      ] = await Promise.all([
        this.prisma.club_receipt_payments.groupBy({
          by: ['method'],
          where: receiptPaymentWhere,
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.club_receipts.groupBy({
          by: ['payment_method'],
          where: { ...receiptWhere, payments: { none: {} } },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        this.prisma.club_subscriptions.groupBy({
          by: ['payment_method'],
          where: subscriptionWhere,
          _sum: { paid_amount: true },
          _count: { _all: true },
        }),
        this.prisma.club_locker_subscriptions.groupBy({
          by: ['payment_method'],
          where: {
            ...dateFilter({ subscription_start_date: dateFrom ?? '' }),
            ...lockerBranchWhere,
            ...creatorWhere,
            ...lockerSectionWhere,
            paid_amount: { gt: 0 },
          },
          _sum: { paid_amount: true },
          _count: { _all: true },
        }),
        this.prisma.club_spa_invoices.groupBy({
          by: ['payment_method'],
          where: spaWhere,
          _sum: { total_amount: true },
          _count: { _all: true },
        }),
        this.prisma.club_inbody_invoices.groupBy({
          by: ['payment_method'],
          where: inbodyWhere,
          _sum: { total_amount: true },
          _count: { _all: true },
        }),
      ]);

      const byMethodSummary: Record<string, { count: number; total: number }> = {};
      const bySource: Record<string, { count: number; total: number }> = {};
      const add = (source: string, method: string | null, amount: unknown, count: number) => {
        const total = toNum(amount);
        if (total <= 0 && count <= 0) return;
        const methodKey = method ?? 'cash';
        const methodBucket = byMethodSummary[methodKey] ?? { count: 0, total: 0 };
        methodBucket.count += count;
        methodBucket.total += total;
        byMethodSummary[methodKey] = methodBucket;
        const sourceBucket = bySource[source] ?? { count: 0, total: 0 };
        sourceBucket.count += count;
        sourceBucket.total += total;
        bySource[source] = sourceBucket;
      };

      receiptPayments.forEach((r) => add('receipt', r.method, r._sum.amount, r._count._all));
      legacyReceipts.forEach((r) =>
        add('receipt', r.payment_method, r._sum.amount, r._count._all),
      );
      subscriptions.forEach((r) =>
        add('subscription', r.payment_method, r._sum.paid_amount, r._count._all),
      );
      lockerSubscriptions.forEach((r) =>
        add('locker', r.payment_method, r._sum.paid_amount, r._count._all),
      );
      spaInvoices.forEach((r) =>
        add('spa', r.payment_method, r._sum.total_amount, r._count._all),
      );
      inbodyInvoices.forEach((r) =>
        add('inbody', r.payment_method, r._sum.total_amount, r._count._all),
      );

      const byMethod = Object.fromEntries(
        Object.entries(byMethodSummary).map(([method, bucket]) => [method, bucket.total]),
      );
      const total = Object.values(bySource).reduce((sum, bucket) => sum + bucket.total, 0);
      return {
        date: dateFrom && dateTo && dateFrom === dateTo ? dateFrom : null,
        dateFrom,
        dateTo,
        periodMode,
        branchId: scopedBranches?.length === 1 ? scopedBranches[0] : null,
        total,
        byMethod,
        byMethodSummary,
        bySource,
        entries: [],
        summaryOnly: true,
        detailRangeLimitDays,
        lockedUser: creatorScope.lockedUser,
        selectedUserId: creatorScope.selectedUserId,
      };
    }

    const [receipts, subs, lockerSubs, spaInvoices, inbodyInvoices] = await Promise.all([
      this.prisma.club_receipts.findMany({
        where: {
          ...dateFilter({ receipt_date: dateFrom ?? '' }),
          ...receiptBranchWhere,
          ...creatorWhere,
          ...receiptSectionWhere,
        },
        include: { payments: { select: { method: true, amount: true }, orderBy: { id: 'asc' } } },
      }),
      this.prisma.club_subscriptions.findMany({
        where: {
          ...dateFilter({ registration_date: dateFrom ?? '' }),
          ...clubBranchWhere,
          ...creatorWhere,
          ...subscriptionSectionWhere,
          receipts: {
            none: dateFrom && dateTo
              ? { receipt_date: dateFrom === dateTo ? dateFrom : { gte: dateFrom, lte: dateTo } }
              : {},
          },
        },
      }),
      this.prisma.club_locker_subscriptions.findMany({
        where: {
          ...dateFilter({ subscription_start_date: dateFrom ?? '' }),
          ...lockerBranchWhere,
          ...creatorWhere,
          ...lockerSectionWhere,
        },
      }),
      this.prisma.club_spa_invoices.findMany({
        where: {
          ...dateFilter({ invoice_date: dateFrom ?? '' }),
          is_active: true,
          status: 'paid',
          ...clubBranchWhere,
          ...creatorWhere,
        },
        include: { service: { select: { name: true } } },
      }),
      this.prisma.club_inbody_invoices.findMany({
        where: {
          ...dateFilter({ invoice_date: dateFrom ?? '' }),
          is_active: true,
          status: 'paid',
          ...clubBranchWhere,
          ...creatorWhere,
        },
      }),
    ]);

    const memberIds = [
      ...new Set([
        ...spaInvoices.map((i) => i.member_id),
        ...inbodyInvoices.filter((i) => i.member_id).map((i) => i.member_id!),
      ]),
    ];
    const memberRows =
      memberIds.length > 0
        ? await this.prisma.club_members.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, name: true, gender: true },
          })
        : [];
    const memberNameById = new Map(memberRows.map((m) => [m.id, m.name]));
    const memberGenderById = new Map(memberRows.map((m) => [m.id, m.gender]));
    const inSection = (memberId: number | null) =>
      !gender || (memberId != null && memberGenderById.get(memberId) === gender);

    // Every subscription payment also creates a club_receipts row, so receipts are the single
    // source of truth for subscription cash. Only emit a subscription-sourced entry when the
    // subscription has NO receipt in this period — otherwise the same money would be counted twice.
    const entries: Array<{
      source: string;
      subscriptionId?: number | null;
      customerName: string;
      amount: number;
      paymentMethod: string;
    }> = [
      // A receipt may be split across methods (cash + transfer …), so emit one entry per tender
      // line — collapsing it onto the header method would misreport the cash drawer.
      ...receipts.flatMap((r) =>
        r.payments.length > 0
          ? r.payments.map((p) => ({
              source: r.type === 'quick_service' ? 'quick_service' : 'receipt',
              subscriptionId: r.subscription_id ?? null,
              customerName: r.member_name ?? '—',
              amount: toNum(p.amount),
              paymentMethod: p.method as string,
            }))
          : [
              {
                source: r.type === 'quick_service' ? 'quick_service' : 'receipt',
                subscriptionId: r.subscription_id ?? null,
                customerName: r.member_name ?? '—',
                amount: toNum(r.amount),
                paymentMethod: r.payment_method ?? 'cash',
              },
            ],
      ),
      ...subs
        .filter((s) => toNum(s.paid_amount) > 0)
        .map((s) => ({
          source: 'subscription',
          subscriptionId: s.id,
          customerName: s.customer_name ?? '—',
          amount: toNum(s.paid_amount),
          paymentMethod: s.payment_method ?? 'cash',
        })),
      ...lockerSubs
        .filter((s) => toNum(s.paid_amount) > 0)
        .map((s) => ({
          source: 'locker',
          customerName: s.customer_name ?? '—',
          amount: toNum(s.paid_amount),
          paymentMethod: s.payment_method ?? 'cash',
        })),
      ...spaInvoices.filter((i) => inSection(i.member_id)).map((i) => ({
        source: 'spa',
        customerName: memberNameById.get(i.member_id) ?? i.service?.name ?? '—',
        amount: toNum(i.total_amount),
        paymentMethod: i.payment_method ?? 'cash',
      })),
      ...inbodyInvoices.filter((i) => inSection(i.member_id)).map((i) => ({
        source: 'inbody',
        customerName:
          (i.member_id ? memberNameById.get(i.member_id) : null) ?? i.customer_name ?? '—',
        amount: toNum(i.total_amount),
        paymentMethod: i.payment_method ?? 'cash',
      })),
    ];

    const byMethod: Record<string, number> = {};
    const byMethodSummary: Record<string, { count: number; total: number }> = {};
    const bySource: Record<string, { count: number; total: number }> = {};
    let total = 0;
    for (const e of entries) {
      total += e.amount;
      byMethod[e.paymentMethod] = (byMethod[e.paymentMethod] ?? 0) + e.amount;
      const methodBucket = byMethodSummary[e.paymentMethod] ?? { count: 0, total: 0 };
      methodBucket.count += 1;
      methodBucket.total += e.amount;
      byMethodSummary[e.paymentMethod] = methodBucket;
      const sourceBucket = bySource[e.source] ?? { count: 0, total: 0 };
      sourceBucket.count += 1;
      sourceBucket.total += e.amount;
      bySource[e.source] = sourceBucket;
    }
    return {
      date: dateFrom && dateTo && dateFrom === dateTo ? dateFrom : null,
      dateFrom,
      dateTo,
      periodMode,
      branchId: scopedBranches?.length === 1 ? scopedBranches[0] : null,
      total,
      byMethod,
      byMethodSummary,
      bySource,
      entries,
      summaryOnly: false,
      detailRangeLimitDays,
      lockedUser: creatorScope.lockedUser,
      selectedUserId: creatorScope.selectedUserId,
    };
  }
}
