import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { addDays, daysBetween, deriveSubStatus, toNum } from '../club-subscriptions/club-subscription.utils';
import { resolveTreasuryPeriod } from '../gym-ops/treasury-range.util';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import {
  createdByFilter,
  resolveFinanceCreatorScope,
} from '../finance/finance-user-scope';

type DashboardLedgerRow = {
  date: string;
  account_type: 'revenue' | 'expense';
  account_name: string;
  amount: Prisma.Decimal;
};

@Injectable()
export class ClubDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly permissions: PermissionEngineService,
  ) {}

  private branchIds(user?: JwtUser, requested?: string | number | null) {
    return this.branchScope.resolveListFilter(user, requested ?? null);
  }

  private branchWhere(ids: number[] | null, field = 'branch_id') {
    return ids === null ? {} : { [field]: { in: ids } };
  }

  async cafeRevenueForPeriod(start: string, end: string, scopedBranches: number[] | null, creatorId: number | null = null) {
    const result = await this.prisma.sales_quick_sales.aggregate({
      where: {
        sale_date: { gte: start, lte: end },
        status: 'completed',
        sale_type: { not: 'partner' },
        ...this.branchWhere(scopedBranches),
        ...createdByFilter(creatorId),
      },
      _sum: { collected_amount: true },
    });
    return Math.round(toNum(result._sum.collected_amount) * 100) / 100;
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

  private financialLedgerRows(start: string, end: string, scopedBranches: number[] | null, creatorId: number | null = null) {
    const branchSql = scopedBranches === null
      ? Prisma.empty
      : scopedBranches.length
        ? Prisma.sql`AND e.branch_id IN (${Prisma.join(scopedBranches)})`
        // A scoped user with no branches sees nothing, never every branch.
        : Prisma.sql`AND 1 = 0`;
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
        ${creatorId === null ? Prisma.empty : Prisma.sql`AND e.created_by = ${creatorId}`}
      GROUP BY e.date, a.account_type, a.id, a.name
      ORDER BY e.date ASC, a.id ASC
    `;
  }

  async summary(
    query: { startDate?: string; endDate?: string; branchId?: string },
    user?: JwtUser,
    providedLedgerRows?: DashboardLedgerRow[],
    providedCreatorId?: number | null,
  ) {
    const { start, end } = this.dashboardPeriod(query.startDate, query.endDate);
    const scopedBranches = this.branchIds(user, query.branchId ?? null);
    const clubBranchWhere = this.branchWhere(scopedBranches);
    const lockerBranchWhere = this.branchWhere(scopedBranches, 'main_branch_id');
    const creatorId = providedCreatorId !== undefined ? providedCreatorId
      : user ? (await resolveFinanceCreatorScope(this.permissions, user)).selectedUserId : null;
    const creatorWhere = createdByFilter(creatorId);

    const memberWhere = { is_deleted: false, ...clubBranchWhere };
    const subWhere = {
      ...clubBranchWhere,
      ...creatorWhere,
      registration_date: { gte: start, lte: end },
      ...this.visibleSubscriptionWhere(),
    };
    const lockerSubWhere = {
      ...lockerBranchWhere,
      ...creatorWhere,
      subscription_start_date: { gte: start, lte: end },
    };

    const today = localDateString();

    const [totalMembers, members, newMembersInPeriod, subsInRange, lockerSubs, attendance, facilityCount, allSubs, trainerCount, classesToday, spaInvoices, inbodyInvoices, classEnrollmentsPaid, ledgerRows] =
      await Promise.all([
        this.prisma.club_members.count({ where: memberWhere }),
        this.prisma.club_members.findMany({
          where: memberWhere,
          select: { id: true, end_date: true, created_at: true },
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
        this.prisma.club_subscriptions.findMany({ where: subWhere }),
        this.prisma.club_locker_subscriptions.findMany({ where: lockerSubWhere }),
        this.prisma.club_attendance.findMany({
          where: {
            attendance_date: { gte: start, lte: end },
            ...clubBranchWhere,
          },
          select: { member_id: true },
        }),
        this.prisma.club_halls.count({ where: { is_deleted: false, ...clubBranchWhere } }),
        this.prisma.club_subscriptions.findMany({
          where: {
            ...clubBranchWhere,
            ...this.visibleSubscriptionWhere(),
          },
          select: {
            member_id: true,
            subscription_start_date: true,
            subscription_end_date: true,
          },
        }),
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
            ...creatorWhere,
            invoice_date: { gte: start, lte: end },
            ...clubBranchWhere,
          },
        }),
        this.prisma.club_inbody_invoices.findMany({
          where: {
            is_active: true,
            ...creatorWhere,
            invoice_date: { gte: start, lte: end },
            ...clubBranchWhere,
          },
        }),
        this.prisma.club_class_enrollments.findMany({
          where: {
            // Enrollments have no cashier identity. Do not expose unattributable
            // class revenue in an employee's personal financial summary.
            ...(creatorId === null ? {} : { id: -1 }),
            enrollment_date: { gte: start, lte: end },
            attendance_status: { not: 'cancelled' },
            class: {
              is_deleted: false,
              ...clubBranchWhere,
            },
          },
          include: { class: { select: { price: true } } },
        }),
        providedLedgerRows ?? this.financialLedgerRows(start, end, scopedBranches, creatorId),
      ]);

    const spaRevenue = spaInvoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + toNum(i.total_amount), 0);
    const inbodyRevenue = inbodyInvoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + toNum(i.total_amount), 0);
    const classRevenue = classEnrollmentsPaid.reduce(
      (sum, e) => sum + toNum(e.class.price),
      0,
    );

    const activeMemberIds = new Set<number>();
    for (const s of allSubs) {
      if (!s.member_id) continue;
      const st = deriveSubStatus(s.subscription_start_date, s.subscription_end_date);
      if (st === 'active' || st === 'upcoming') activeMemberIds.add(s.member_id);
    }

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

    const distinctAttendees = new Set(attendance.map((a) => a.member_id)).size;
    const activeMembers =
      activeMemberIds.size || members.filter((m) => m.end_date && m.end_date >= today).length;
    const attendanceRate = activeMembers > 0 ? Math.round((distinctAttendees / activeMembers) * 100) : 0;

    // Distribution of currently active/upcoming subscriptions (by real duration), not only new
    // registrations in the selected date range — hub users expect the live plan mix.
    const distribution = { monthly: 0, quarterly: 0, halfYearly: 0, yearly: 0 };
    for (const s of allSubs) {
      const st = deriveSubStatus(s.subscription_start_date, s.subscription_end_date);
      if (st !== 'active' && st !== 'upcoming') continue;
      const days = daysBetween(s.subscription_start_date, s.subscription_end_date);
      if (days <= 35) distribution.monthly++;
      else if (days <= 100) distribution.quarterly++;
      else if (days < 360) distribution.halfYearly++;
      else distribution.yearly++;
    }

    const expiredSubscriptions = allSubs.filter(
      (s) => deriveSubStatus(s.subscription_start_date, s.subscription_end_date) === 'expired',
    ).length;

    const renewalWindow = addDays(today, 7);
    const pendingRenewals = allSubs.filter((s) => {
      const st = deriveSubStatus(s.subscription_start_date, s.subscription_end_date);
      return st === 'active' && s.subscription_end_date <= renewalWindow;
    }).length;

    const recentMembers = await this.prisma.club_members.findMany({
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
    });

    const recentPayments = await this.prisma.club_receipts.findMany({
      where: {
        ...creatorWhere,
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
        ],
        // Honor the branch filter via the receipt's subscription/member (receipts have no branch column).
        ...(scopedBranches
          ? { OR: [{ subscription: { branch_id: { in: scopedBranches } } }, { member: { branch_id: { in: scopedBranches } } }] }
          : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: { id: true, member_name: true, amount: true, receipt_date: true, receipt_number: true },
    });

    const avgMonthlyMembership =
      subsInRange.length > 0
        ? subsInRange.reduce((s, x) => s + toNum(x.subscription_value), 0) / subsInRange.length
        : 0;

    // Committed subscription refunds in the range reduce net revenue (المرتجعات تُخصم من الإيراد).
    const refundsInRange = await this.prisma.club_subscription_refunds.findMany({
      where: {
        ...creatorWhere,
        status: 'completed',
        refund_date: { gte: start, lte: end },
        ...clubBranchWhere,
      },
      select: { refund_amount: true },
    });
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
    const { start, end, days, startMs } = this.dashboardPeriod(query.startDate, query.endDate);
    const scopedBranches = this.branchIds(user, query.branchId ?? null);
    const clubBranchWhere = this.branchWhere(scopedBranches);
    const creatorId = user ? (await resolveFinanceCreatorScope(this.permissions, user)).selectedUserId : null;
    const creatorWhere = createdByFilter(creatorId);
    const today = localDateString();
    const expiring7Date = addDays(today, 7);
    const expiring30Date = addDays(today, 30);
    const warehouseBranchSql = scopedBranches === null
      ? Prisma.empty
      : scopedBranches.length
        ? Prisma.sql`AND w.branch_id IN (${Prisma.join(scopedBranches)})`
        // A scoped user with no branches sees nothing, never every branch.
        : Prisma.sql`AND 1 = 0`;

    type CountRow = { total: bigint | number };
    const ledgerRows = await this.financialLedgerRows(start, end, scopedBranches, creatorId);

    const [base, subscriptions, members, attendances, allCurrentSubs, lowStockRows, employeeCount, quickSalesToday, cafeRevenue, bookingsToday] =
      await Promise.all([
        this.summary({ startDate: start, endDate: end, branchId: query.branchId }, user, ledgerRows, creatorId),
        this.prisma.club_subscriptions.findMany({
          where: {
            registration_date: { gte: start, lte: end },
            ...creatorWhere,
            ...clubBranchWhere,
            ...this.visibleSubscriptionWhere(),
          },
          select: {
            registration_date: true,
            subscription_type: true,
            subscription_value: true,
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
        this.prisma.club_subscriptions.findMany({
          where: {
            ...clubBranchWhere,
            ...this.visibleSubscriptionWhere(),
          },
          select: {
            subscription_start_date: true,
            subscription_end_date: true,
            remaining_amount: true,
            subscription_type: true,
            created_by: true,
            type: { select: { name: true } },
          },
        }),
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
        this.prisma.sales_quick_sales.findMany({
          where: { sale_date: today, status: 'completed', ...clubBranchWhere, ...creatorWhere },
          select: { collected_amount: true },
        }),
        this.cafeRevenueForPeriod(start, end, scopedBranches, creatorId),
        this.prisma.sales_bookings.count({
          where: {
            booking_date: today,
            status: { not: 'cancelled' },
            ...clubBranchWhere,
          },
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
    const activeSubscriptions = allCurrentSubs.filter(
      (s) => deriveSubStatus(s.subscription_start_date, s.subscription_end_date) === 'active',
    );
    const outstandingSubscriptions = activeSubscriptions.filter((s) => toNum(s.remaining_amount) > 0 && (creatorId === null || s.created_by === creatorId));
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
        cafeRevenue,
        margin: revenue !== 0 ? Math.round((profit / revenue) * 1000) / 10 : 0,
        source: 'member-management',
        expenseSource: 'general-ledger',
      },
      operations: {
        activeSubscriptions: activeSubscriptions.length,
        newSubscriptions: subscriptions.length,
        checkinsToday,
        checkinsInRange: attendances.length,
        uniqueVisitors,
        outstandingAmount: Math.round(
          outstandingSubscriptions.reduce((sum, s) => sum + toNum(s.remaining_amount), 0) * 100,
        ) / 100,
        outstandingCount: outstandingSubscriptions.length,
        expiring7: activeSubscriptions.filter((s) => s.subscription_end_date <= expiring7Date).length,
        expiring30: activeSubscriptions.filter((s) => s.subscription_end_date <= expiring30Date).length,
        lowStock: Number(lowStockRows[0]?.total ?? 0),
        employees: employeeCount,
        trainers: base.trainers,
        classesToday: base.classesToday ?? 0,
        facilities: base.facilities,
        quickSalesToday: quickSalesToday.length,
        quickSalesAmountToday: quickSalesToday.reduce((sum, sale) => sum + toNum(sale.collected_amount), 0),
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
      period: { start, end, days },
      branchId: scopedBranches?.length === 1 ? scopedBranches[0] : null,
    };
  }

  async treasury(
    params: { date?: string; dateFrom?: string; dateTo?: string; branchId?: string } | string | undefined,
    user?: JwtUser,
    legacyBranchId?: string,
  ) {
    const opts =
      typeof params === 'string' || params == null
        ? { date: params ?? undefined, branchId: legacyBranchId }
        : { ...params, branchId: params.branchId ?? legacyBranchId };

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

    if (summaryOnly) {
      const receiptWhere: Prisma.club_receiptsWhereInput = {
        ...dateFilter({ receipt_date: dateFrom ?? '' }),
        ...receiptBranchWhere,
        ...creatorWhere,
      };
      const receiptPaymentWhere: Prisma.club_receipt_paymentsWhereInput = {
        receipt: { is: receiptWhere },
      };
      const subscriptionWhere: Prisma.club_subscriptionsWhereInput = {
        ...dateFilter({ registration_date: dateFrom ?? '' }),
        ...clubBranchWhere,
        ...creatorWhere,
        paid_amount: { gt: 0 },
        receipts: {
          none: dateFrom && dateTo
            ? { receipt_date: dateFrom === dateTo ? dateFrom : { gte: dateFrom, lte: dateTo } }
            : {},
        },
      };

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
            paid_amount: { gt: 0 },
          },
          _sum: { paid_amount: true },
          _count: { _all: true },
        }),
        this.prisma.club_spa_invoices.groupBy({
          by: ['payment_method'],
          where: {
            ...dateFilter({ invoice_date: dateFrom ?? '' }),
            is_active: true,
            status: 'paid',
            ...clubBranchWhere,
            ...creatorWhere,
          },
          _sum: { total_amount: true },
          _count: { _all: true },
        }),
        this.prisma.club_inbody_invoices.groupBy({
          by: ['payment_method'],
          where: {
            ...dateFilter({ invoice_date: dateFrom ?? '' }),
            is_active: true,
            status: 'paid',
            ...clubBranchWhere,
            ...creatorWhere,
          },
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
        },
        include: { payments: { select: { method: true, amount: true }, orderBy: { id: 'asc' } } },
      }),
      this.prisma.club_subscriptions.findMany({
        where: {
          ...dateFilter({ registration_date: dateFrom ?? '' }),
          ...clubBranchWhere,
          ...creatorWhere,
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
            select: { id: true, name: true },
          })
        : [];
    const memberNameById = new Map(memberRows.map((m) => [m.id, m.name]));

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
      ...spaInvoices.map((i) => ({
        source: 'spa',
        customerName: memberNameById.get(i.member_id) ?? i.service?.name ?? '—',
        amount: toNum(i.total_amount),
        paymentMethod: i.payment_method ?? 'cash',
      })),
      ...inbodyInvoices.map((i) => ({
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
