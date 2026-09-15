import type {
  FinanceDashboard,
  FinancialAnalysisData,
  MonthlyTrendPoint,
  ProfitLossData,
  RevenueSyncResult,
} from '@/types/finance';

/** Backend accepts either dateFrom/dateTo or startDate/endDate. */
export function financeQueryDates(startDate: string, endDate: string) {
  return { dateFrom: startDate, dateTo: endDate, startDate, endDate };
}

function normalizeTrendPoint(raw: Record<string, unknown>): MonthlyTrendPoint {
  return {
    month: String(raw.month ?? ''),
    revenue: Number(raw.revenue ?? raw.revenues ?? 0),
    expense: Number(raw.expense ?? raw.expenses ?? 0),
    profit: Number(raw.profit ?? 0),
  };
}

/** Normalize dashboard payload — tolerates legacy backend field names. */
export function normalizeFinanceDashboard(raw: Record<string, unknown>): FinanceDashboard {
  const monthlyTrend = Array.isArray(raw.monthlyTrend)
    ? raw.monthlyTrend.map((p) => normalizeTrendPoint(p as Record<string, unknown>))
    : [];

  const totalRevenue = Number(raw.totalRevenue ?? raw.totalRevenues ?? 0);
  const totalExpenses = Number(raw.totalExpenses ?? 0);
  const netProfit = Number(raw.netProfit ?? totalRevenue - totalExpenses);

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin: Number(
      raw.profitMargin ?? (totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0),
    ),
    revenueCount: Number(raw.revenueCount ?? 0),
    expenseCount: Number(raw.expenseCount ?? 0),
    monthlyTrend,
    expensesByCategory: Array.isArray(raw.expensesByCategory) ? raw.expensesByCategory : [],
    revenuesBySource: Array.isArray(raw.revenuesBySource) ? raw.revenuesBySource : [],
  };
}

function mapProfitLossLines(
  lines: unknown,
  labelKey: string,
): { label: string; amount: number }[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      label: String(item.label ?? item[labelKey] ?? ''),
      amount: Number(item.amount ?? 0),
    };
  });
}

/** Normalize profit-loss payload — tolerates backend revenueLines/expenseLines shape. */
export function normalizeProfitLoss(raw: Record<string, unknown>): ProfitLossData {
  const startDate = String(raw.startDate ?? raw.dateFrom ?? '');
  const endDate = String(raw.endDate ?? raw.dateTo ?? '');
  const revenueBlock = raw.revenue as Record<string, unknown> | undefined;
  const expensesBlock = raw.expenses as Record<string, unknown> | undefined;
  const totalRevenues = Number(raw.totalRevenues ?? revenueBlock?.total ?? 0);
  const totalExpenses = Number(raw.totalExpenses ?? expensesBlock?.total ?? 0);
  const netProfit = Number(raw.netProfit ?? totalRevenues - totalExpenses);

  return {
    period: { startDate, endDate },
    revenue: {
      items: mapProfitLossLines(raw.revenueLines ?? revenueBlock?.items, 'source'),
      total: totalRevenues,
    },
    expenses: {
      items: mapProfitLossLines(raw.expenseLines ?? expensesBlock?.items, 'category'),
      total: totalExpenses,
    },
    netProfit,
    profitMargin: Number(raw.profitMargin ?? (totalRevenues > 0 ? (netProfit / totalRevenues) * 100 : 0)),
  };
}

/** Normalize analysis payload — maps legacy current/growth-only responses. */
export function normalizeFinancialAnalysis(raw: Record<string, unknown>): FinancialAnalysisData {
  const current = raw.current as Record<string, unknown> | undefined;
  const growth = raw.growth as Record<string, unknown> | undefined;
  const totalRevenue = Number(raw.totalRevenue ?? raw.totalRevenues ?? current?.revenues ?? 0);
  const totalExpenses = Number(raw.totalExpenses ?? current?.expenses ?? 0);
  const netProfit = Number(raw.netProfit ?? current?.profit ?? totalRevenue - totalExpenses);

  const monthlyComparison = Array.isArray(raw.monthlyComparison)
    ? raw.monthlyComparison.map((p) => normalizeTrendPoint(p as Record<string, unknown>))
    : Array.isArray(raw.monthlyTrend)
      ? raw.monthlyTrend.map((p) => normalizeTrendPoint(p as Record<string, unknown>))
      : [];

  const ratioAnalysis = Array.isArray(raw.ratioAnalysis)
    ? (raw.ratioAnalysis as { label: string; value: number }[])
    : [];

  return {
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin: Number(
      raw.profitMargin ?? (totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0),
    ),
    revenueGrowth: growth?.revenueGrowthRate != null ? Number(growth.revenueGrowthRate) : undefined,
    expenseGrowth: growth?.expenseGrowthRate != null ? Number(growth.expenseGrowthRate) : undefined,
    ratioAnalysis,
    monthlyComparison,
    expensesByCategory: Array.isArray(raw.expensesByCategory) ? raw.expensesByCategory : [],
    revenuesBySource: Array.isArray(raw.revenuesBySource) ? raw.revenuesBySource : [],
  };
}

/** Normalize revenue sync counts — backend returns created/skipped. */
export function normalizeRevenueSync(raw: Record<string, unknown>): RevenueSyncResult {
  return {
    syncedCount: Number(raw.syncedCount ?? raw.created ?? 0),
    skippedCount: Number(raw.skippedCount ?? raw.skipped ?? 0),
    totalFoundInPeriod: raw.total != null ? Number(raw.total) : undefined,
  };
}

/** Build a finance list URL with optional date/branch filters. */
export function financeListLink(
  base: string,
  startDate: string,
  endDate: string,
  branchId: string,
): string {
  const params = new URLSearchParams({ dateFrom: startDate, dateTo: endDate });
  if (branchId !== 'all') params.set('branchId', branchId);
  return `${base}?${params.toString()}`;
}
