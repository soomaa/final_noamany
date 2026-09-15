import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { JwtUser } from "../../common/types/jwt-user";
import { AccountingReportsService } from "../accounting/accounting-reports.service";
import {
  ExpenseReportsQueryDto,
  FinanceAnalysisQueryDto,
  FinanceDashboardQueryDto,
  ProfitLossQueryDto,
  RevenueReportsQueryDto,
} from "./dto/finance.dto";
import {
  monthKey,
  plRevenueWhere,
  roundMoney,
  toNumber,
} from "./finance.utils";

/**
 * NOTE ON REVENUE SOURCE OF TRUTH:
 * These reports read the operational fin_revenues log. The AUTHORITATIVE income statement is the
 * GL one (AccountingReportsService.incomeStatement), which sums revenue-type GL accounts. As of the
 * revenue-GL alignment fix, ALL real revenue now reaches the GL: sale/subscription/spa receipts post
 * at their source module, paid legacy bookings are backfilled during sync, and manual + recurring
 * non-sale revenue post via
 * ModuleLedgerService.postOtherRevenue (RevenuesService.create + FinanceRecurringCron). fin_revenues
 * remains the operational log and may still differ from the GL until revenues.sync() is run to
 * backfill sale/subscription rows into the log.
 * Dashboard, analysis, P&L, report totals, monthly trends, and account breakdowns therefore read
 * the GL directly. Operational tables remain the source for document lists and customer/tax detail,
 * plus an explicit operational-source filter when requested by older clients.
 */
@Injectable()
export class FinanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly accountingReports: AccountingReportsService,
  ) {}

  async disbursementOrders(pageValue?: string, limitValue?: string) {
    const page = Math.max(Number.parseInt(pageValue ?? "1", 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(limitValue ?? "50", 10) || 50, 1),
      200,
    );
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.fin_disbursement_orders.findMany({
        orderBy: [{ order_date: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.fin_disbursement_orders.count(),
    ]);
    return {
      data: rows.map((row) => ({
        ...row,
        total_amount: toNumber(row.total_amount),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async disbursementOrder(id: number) {
    const order = await this.prisma.fin_disbursement_orders.findUnique({
      where: { id },
    });
    if (!order) throw new NotFoundException("Disbursement order not found");
    const [details, attachments] = await this.prisma.$transaction([
      this.prisma.fin_disbursement_order_details.findMany({
        where: { order_id: id },
        orderBy: { id: "asc" },
      }),
      this.prisma.fin_disbursement_order_attachments.findMany({
        where: { order_id: id },
        orderBy: { id: "asc" },
      }),
    ]);
    return {
      ...order,
      total_amount: toNumber(order.total_amount),
      details: details.map((detail) => ({
        ...detail,
        mother_amount: toNumber(detail.mother_amount),
        young_amount: toNumber(detail.young_amount),
        adult_amount: toNumber(detail.adult_amount),
        amount: toNumber(detail.amount),
      })),
      attachments,
    };
  }

  private accountingRange(q: {
    branchId?: string;
    dateFrom?: string;
    dateTo?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const requestedBranch =
      q.branchId && q.branchId !== "all" ? Number(q.branchId) : undefined;
    return {
      dateFrom: q.dateFrom ?? q.startDate,
      dateTo: q.dateTo ?? q.endDate,
      branchId: Number.isFinite(requestedBranch) ? requestedBranch : undefined,
    };
  }

  private branchRevenueFilter(
    branchId?: string,
    user?: JwtUser,
  ): Prisma.fin_revenuesWhereInput {
    const ids = this.branchScope.resolveListFilter(user, branchId ?? null);
    return ids ? { branch_id: { in: ids } } : {};
  }

  private dateRevenueFilter(
    dateFrom?: string,
    dateTo?: string,
  ): Prisma.fin_revenuesWhereInput {
    if (!dateFrom && !dateTo) return {};
    return {
      revenue_date: {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      },
    };
  }

  private growthRate(current: number, previous: number): number | null {
    if (previous === 0) return current > 0 ? 100 : null;
    return roundMoney(((current - previous) / previous) * 100);
  }

  private aggregateMonthlyWithCount(
    rows: { date: string; amount: number }[],
  ): { month: string; total: number; count: number }[] {
    const map = new Map<string, { total: number; count: number }>();
    for (const row of rows) {
      const month = monthKey(row.date);
      const current = map.get(month) ?? { total: 0, count: 0 };
      current.total = roundMoney(current.total + row.amount);
      current.count += 1;
      map.set(month, current);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({ month, ...values }));
  }

  private resolveDateRange(q: {
    dateFrom?: string;
    dateTo?: string;
    startDate?: string;
    endDate?: string;
  }) {
    return {
      dateFrom: q.dateFrom ?? q.startDate,
      dateTo: q.dateTo ?? q.endDate,
    };
  }

  async dashboard(q: FinanceDashboardQueryDto, user?: JwtUser) {
    const activity = await this.accountingReports.profitLossActivity(
      this.accountingRange(q),
      user,
    );

    const totalExpenses = activity.totalExpenses;
    const totalRevenues = activity.totalRevenue;
    const netProfit = activity.netProfit;

    const profitMargin =
      totalRevenues > 0 ? roundMoney((netProfit / totalRevenues) * 100) : 0;

    return {
      totalRevenue: totalRevenues,
      totalRevenues,
      totalExpenses,
      netProfit,
      profitMargin,
      expenseCount: activity.expenseCount,
      revenueCount: activity.revenueCount,
      expenseToRevenueRatio:
        totalRevenues > 0 ? roundMoney(totalExpenses / totalRevenues) : null,
      monthlyTrend: activity.monthlyTrend,
      expensesByCategory: activity.expenseByAccount.map((account) => ({
        category: `${account.code} — ${account.name}`,
        count: account.count,
        total: account.total,
      })),
      revenuesBySource: activity.revenueByAccount.map((account) => ({
        source: `${account.code} — ${account.name}`,
        count: account.count,
        total: account.total,
      })),
    };
  }

  async expenseReports(q: ExpenseReportsQueryDto, user?: JwtUser) {
    const activity = await this.accountingReports.profitLossActivity(
      this.accountingRange(q),
      user,
    );
    const expensesByCategory = activity.expenseByAccount.map((account) => ({
      category: `${account.code} — ${account.name}`,
      count: account.count,
      total: account.total,
      totalAmount: account.total,
    }));
    const monthlyExpenses = activity.monthlyTrend
      .filter((row) => row.expenses !== 0)
      .map((row) => ({ month: row.month, total: row.expenses, count: 0 }));
    const grandTotal = activity.totalExpenses;

    return {
      // Canonical fields used by the finance UI.
      totalAmount: grandTotal,
      totalExpenses: activity.expenseCount,
      expensesByCategory,
      monthlyExpenses,
      // Backward-compatible aliases used by older report clients.
      byCategory: expensesByCategory,
      byMonth: monthlyExpenses.map((row) => ({
        month: row.month,
        amount: row.total,
      })),
      grandTotal,
    };
  }

  async revenueReports(q: RevenueReportsQueryDto, user?: JwtUser) {
    const { dateFrom, dateTo } = this.resolveDateRange(q);
    const where = plRevenueWhere({
      ...this.branchRevenueFilter(q.branchId, user),
      ...this.dateRevenueFilter(dateFrom, dateTo),
      ...(q.source && q.source !== "all" ? { source: q.source } : {}),
    });

    const subscriptionTypeId =
      q.subscriptionTypeId && q.subscriptionTypeId !== "all"
        ? Number(q.subscriptionTypeId)
        : undefined;
    const allowedBranchIds = this.branchScope.resolveListFilter(
      user,
      q.branchId ?? null,
    );

    const subscriptionFilter: Prisma.club_subscriptionsWhereInput = {
      ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
      ...(subscriptionTypeId
        ? { subscription_type_id: subscriptionTypeId }
        : {}),
    };
    const dateRange = (field: "receipt_date" | "refund_date") =>
      dateFrom || dateTo
        ? {
            [field]: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {};

    const [
      activity,
      bySource,
      rows,
      subscriptionReceipts,
      subscriptionRefunds,
    ] = await Promise.all([
      this.accountingReports.profitLossActivity(this.accountingRange(q), user),
      this.prisma.fin_revenues.groupBy({
        by: ["source"],
        where,
        _count: true,
        _sum: { net_amount: true },
        orderBy: { _sum: { net_amount: "desc" } },
      }),
      this.prisma.fin_revenues.findMany({
        where,
        select: {
          revenue_date: true,
          net_amount: true,
          tax_amount: true,
          discount_amount: true,
          customer_name: true,
        },
      }),
      // Subscriptions breakdown reads the club subledger directly (receipts + committed refunds),
      // so it stays correct even before revenues.sync() backfills the operational log.
      this.prisma.club_receipts.findMany({
        where: {
          ...dateRange("receipt_date"),
          status: { in: ["مدفوعة", "paid"] },
          ...(Object.keys(subscriptionFilter).length
            ? { subscription: { is: subscriptionFilter } }
            : {}),
        },
        select: {
          amount: true,
          subscription: {
            select: {
              id: true,
              subscription_type_id: true,
              subscription_type: true,
            },
          },
        },
      }),
      this.prisma.club_subscription_refunds.findMany({
        where: {
          status: "completed",
          ...dateRange("refund_date"),
          ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
          ...(subscriptionTypeId
            ? {
                subscription: {
                  is: { subscription_type_id: subscriptionTypeId },
                },
              }
            : {}),
        },
        select: {
          refund_amount: true,
          subscription_type: true,
          subscription: {
            select: { subscription_type_id: true, subscription_type: true },
          },
        },
      }),
    ]);

    // Group subscription money by type: receipts add to gross, refunds subtract to reach net.
    const byType = new Map<
      string,
      {
        subscriptionTypeId: number | null;
        typeName: string;
        receiptsCount: number;
        gross: number;
        refunds: number;
      }
    >();
    const typeEntry = (typeId: number | null, typeName: string | null) => {
      const key =
        typeId != null ? `id:${typeId}` : `name:${typeName ?? "غير محدد"}`;
      let entry = byType.get(key);
      if (!entry) {
        entry = {
          subscriptionTypeId: typeId,
          typeName: typeName ?? "غير محدد",
          receiptsCount: 0,
          gross: 0,
          refunds: 0,
        };
        byType.set(key, entry);
      }
      return entry;
    };
    for (const r of subscriptionReceipts) {
      const entry = typeEntry(
        r.subscription?.subscription_type_id ?? null,
        r.subscription?.subscription_type ?? null,
      );
      entry.receiptsCount += 1;
      entry.gross += toNumber(r.amount);
    }
    for (const r of subscriptionRefunds) {
      const entry = typeEntry(
        r.subscription?.subscription_type_id ?? null,
        r.subscription?.subscription_type ?? r.subscription_type ?? null,
      );
      entry.refunds += toNumber(r.refund_amount);
    }

    // Refunds are booked as an expense (بند "مردودات اشتراكات الجيم"), NOT deducted from revenue,
    // so subscription revenue is reported GROSS here. `refunds` stays for reference only.
    const bySubscriptionType = [...byType.values()]
      .map((t) => ({
        subscriptionTypeId: t.subscriptionTypeId,
        typeName: t.typeName,
        receiptsCount: t.receiptsCount,
        gross: roundMoney(t.gross),
        refunds: roundMoney(t.refunds),
        net: roundMoney(t.gross),
      }))
      .sort((a, b) => b.net - a.net);

    const subscriptionsGross = roundMoney(
      bySubscriptionType.reduce((s, t) => s + t.gross, 0),
    );
    const refundsTotal = roundMoney(
      bySubscriptionType.reduce((s, t) => s + t.refunds, 0),
    );

    const useOperationalFilter = Boolean(q.source && q.source !== "all");
    const operationalBySource = bySource.map((r) => ({
      source: r.source,
      count: r._count,
      total: toNumber(r._sum.net_amount),
      netAmount: toNumber(r._sum.net_amount),
    }));
    const revenuesBySource = useOperationalFilter
      ? operationalBySource
      : activity.revenueByAccount.map((account) => ({
          source: `${account.code} — ${account.name}`,
          count: account.count,
          total: account.total,
          netAmount: account.total,
        }));
    const operationalMonthly = this.aggregateMonthlyWithCount(
      rows.map((r) => ({
        date: r.revenue_date,
        amount: toNumber(r.net_amount),
      })),
    );
    const monthlyRevenues = useOperationalFilter
      ? operationalMonthly
      : activity.monthlyTrend
          .filter((row) => row.revenues !== 0)
          .map((row) => ({ month: row.month, total: row.revenues, count: 0 }));
    const operationalTotal = roundMoney(
      rows.reduce((s, r) => s + toNumber(r.net_amount), 0),
    );
    const grandTotal = useOperationalFilter
      ? operationalTotal
      : activity.totalRevenue;
    const topCustomerMap = new Map<string, { total: number; count: number }>();
    for (const row of rows) {
      const name = row.customer_name?.trim();
      if (!name) continue;
      const current = topCustomerMap.get(name) ?? { total: 0, count: 0 };
      current.total = roundMoney(current.total + toNumber(row.net_amount));
      current.count += 1;
      topCustomerMap.set(name, current);
    }
    const topCustomers = [...topCustomerMap.entries()]
      .map(([customerName, values]) => ({ customerName, ...values }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return {
      // Canonical fields used by the finance UI.
      totalAmount: grandTotal,
      totalRevenues: useOperationalFilter ? rows.length : activity.revenueCount,
      totalTax: roundMoney(
        rows.reduce((sum, row) => sum + toNumber(row.tax_amount), 0),
      ),
      totalDiscount: roundMoney(
        rows.reduce((sum, row) => sum + toNumber(row.discount_amount), 0),
      ),
      revenuesBySource,
      monthlyRevenues,
      topCustomers,
      // Backward-compatible aliases used by older report clients.
      bySource: revenuesBySource,
      byMonth: monthlyRevenues.map((row) => ({
        month: row.month,
        amount: row.total,
      })),
      // Revenue is gross — refunds are booked as an expense line, not a revenue deduction.
      grandTotal,
      subscriptions: {
        gross: subscriptionsGross,
        refunds: refundsTotal,
        net: subscriptionsGross,
        byType: bySubscriptionType,
      },
    };
  }

  async analysis(q: FinanceAnalysisQueryDto, user?: JwtUser) {
    const { dateFrom, dateTo } = this.resolveDateRange(q);

    let prevFrom: string | undefined;
    let prevTo: string | undefined;
    if (dateFrom && dateTo) {
      const start = new Date(dateFrom);
      const end = new Date(dateTo);
      const days = Math.max(
        1,
        Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1,
      );
      const prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - days + 1);
      prevFrom = prevStart.toISOString().slice(0, 10);
      prevTo = prevEnd.toISOString().slice(0, 10);
    }

    const branchId = this.accountingRange(q).branchId;
    const [currentActivity, previousActivity] = await Promise.all([
      this.accountingReports.profitLossActivity(
        { dateFrom, dateTo, branchId },
        user,
      ),
      this.accountingReports.profitLossActivity(
        { dateFrom: prevFrom, dateTo: prevTo, branchId },
        user,
      ),
    ]);

    const currentExpenses = currentActivity.totalExpenses;
    const currentRevenues = currentActivity.totalRevenue;
    const previousExpenses = previousActivity.totalExpenses;
    const previousRevenues = previousActivity.totalRevenue;

    const currentProfit = roundMoney(currentRevenues - currentExpenses);
    const previousProfit = roundMoney(previousRevenues - previousExpenses);
    const profitMargin =
      currentRevenues > 0
        ? roundMoney((currentProfit / currentRevenues) * 100)
        : 0;
    const expenseToRevenueRatio =
      currentRevenues > 0
        ? roundMoney(currentExpenses / currentRevenues)
        : null;

    const growth = {
      expenseGrowthRate: this.growthRate(currentExpenses, previousExpenses),
      revenueGrowthRate: this.growthRate(currentRevenues, previousRevenues),
      profitGrowthRate: this.growthRate(currentProfit, previousProfit),
    };

    const dashboard = await this.dashboard(q, user);

    const ratioAnalysis: { label: string; value: number }[] = [];
    if (expenseToRevenueRatio != null) {
      ratioAnalysis.push({
        label: "نسبة المصروف للإيراد %",
        value: expenseToRevenueRatio * 100,
      });
    }
    if (growth.revenueGrowthRate != null) {
      ratioAnalysis.push({
        label: "نمو الإيرادات %",
        value: growth.revenueGrowthRate,
      });
    }
    if (growth.expenseGrowthRate != null) {
      ratioAnalysis.push({
        label: "نمو المصروفات %",
        value: growth.expenseGrowthRate,
      });
    }
    if (growth.profitGrowthRate != null) {
      ratioAnalysis.push({
        label: "نمو الربح %",
        value: growth.profitGrowthRate,
      });
    }

    return {
      totalRevenue: dashboard.totalRevenue,
      totalExpenses: dashboard.totalExpenses,
      netProfit: dashboard.netProfit,
      profitMargin,
      monthlyComparison: dashboard.monthlyTrend,
      expensesByCategory: dashboard.expensesByCategory,
      revenuesBySource: dashboard.revenuesBySource,
      ratioAnalysis,
      revenueGrowth: growth.revenueGrowthRate,
      expenseGrowth: growth.expenseGrowthRate,
      period: { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null },
      previousPeriod: { dateFrom: prevFrom ?? null, dateTo: prevTo ?? null },
      current: {
        expenses: currentExpenses,
        revenues: currentRevenues,
        profit: currentProfit,
        expenseToRevenueRatio,
      },
      previous: {
        expenses: previousExpenses,
        revenues: previousRevenues,
        profit: previousProfit,
        expenseToRevenueRatio:
          previousRevenues > 0
            ? roundMoney(previousExpenses / previousRevenues)
            : null,
      },
      growth,
    };
  }

  async profitLoss(q: ProfitLossQueryDto, user?: JwtUser) {
    const dateFrom = q.dateFrom ?? q.startDate;
    const dateTo = q.dateTo ?? q.endDate;
    const branchId = this.accountingRange(q).branchId;
    const income = await this.accountingReports.incomeStatement(
      { dateFrom, dateTo, branchId },
      user,
    );
    const totalExpenses = income.expenses.total;
    const totalRevenues = income.revenue.total;
    const netProfit = income.netIncome;

    return {
      dateFrom,
      dateTo,
      branchId: q.branchId ?? null,
      totalRevenues,
      totalExpenses,
      netProfit,
      profitMargin:
        totalRevenues > 0
          ? roundMoney((netProfit / totalRevenues) * 100)
          : null,
      revenueLines: income.revenue.items.map((item) => ({
        source: `${item.code} — ${item.name}`,
        amount: item.amount,
      })),
      expenseLines: income.expenses.items.map((item) => ({
        category: `${item.code} — ${item.name}`,
        amount: item.amount,
      })),
    };
  }
}
