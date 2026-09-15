export type PeriodPreset = 'today' | '7d' | '30d' | 'month' | 'custom';

export interface DashboardSummary {
  updatedAt: string;
  period: {
    startDate: string;
    endDate: string;
    previousStartDate: string;
    previousEndDate: string;
  };
  outcomes: {
    netSales: number;
    orders: number;
    averageTicket: number;
    grossProfit: number;
    grossMargin: number;
    salesChange: number | null;
  };
  operations: {
    openShift: { id: number; sessionDate: string } | null;
    cashVariance: number;
    expectedCash: number;
    actualCash: number;
    wasteCost: number;
    wasteQuantity: number;
    lowStockCount: number;
  };
  trend: Array<{ date: string; sales: number; orders: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number; cost: number }>;
  paymentMix: Array<{ method: string; amount: number }>;
  attention: {
    lowStock: Array<{ id: number; name: string; quantity: number; reorderPoint: number }>;
    highWaste: Array<{ name: string; quantity: number; cost: number; reason: string }>;
    shiftVariance: Array<{ id: number; date: string; variance: number }>;
  };
}

export interface DashboardInsight {
  key: 'sales-change' | 'waste-ratio' | 'cash-variance' | 'top-product-share';
  value: number;
  tone: 'positive' | 'warning' | 'neutral';
}

const finite = (value: number) => Number.isFinite(value) ? value : 0;

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function subtractDays(value: string, days: number) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() - days);
  return localDate(date);
}

export function periodRange(
  preset: Exclude<PeriodPreset, 'custom'>,
  today: string,
): { startDate: string; endDate: string } {
  if (preset === 'today') return { startDate: today, endDate: today };
  if (preset === '7d') return { startDate: subtractDays(today, 6), endDate: today };
  if (preset === '30d') return { startDate: subtractDays(today, 29), endDate: today };
  return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
}

export function normalizeBranchOptions(
  branches: Array<{ id: number; name: string | null }>,
  fallbackName: (id: number) => string,
): Array<{ id: number; name: string }> {
  return branches.map((branch) => ({
    id: branch.id,
    name: branch.name?.trim() || fallbackName(branch.id),
  }));
}

export function paymentBreakdown(rows: DashboardSummary['paymentMix']) {
  const normalized = rows.map((row) => ({ ...row, amount: finite(Number(row.amount)) }));
  const total = normalized.reduce((sum, row) => sum + row.amount, 0);
  return normalized.map((row) => ({
    ...row,
    percentage: total > 0 ? row.amount / total * 100 : 0,
  }));
}

export function productRanking(rows: DashboardSummary['topProducts']) {
  const sorted = rows
    .map((row, index) => ({ ...row, revenue: finite(Number(row.revenue)), originalIndex: index }))
    .sort((a, b) => b.revenue - a.revenue || a.originalIndex - b.originalIndex);
  const total = sorted.reduce((sum, row) => sum + row.revenue, 0);
  return sorted.map(({ originalIndex: _originalIndex, ...row }, index) => ({
    ...row,
    rank: index + 1,
    percentage: total > 0 ? row.revenue / total * 100 : 0,
  }));
}

export function deriveInsights(data: DashboardSummary): DashboardInsight[] {
  const insights: DashboardInsight[] = [];
  if (data.outcomes.salesChange != null && Number.isFinite(data.outcomes.salesChange)) {
    insights.push({
      key: 'sales-change',
      value: data.outcomes.salesChange,
      tone: data.outcomes.salesChange >= 0 ? 'positive' : 'warning',
    });
  }
  if (data.outcomes.netSales > 0) {
    const wasteRatio = finite(data.operations.wasteCost) / finite(data.outcomes.netSales) * 100;
    insights.push({
      key: 'waste-ratio',
      value: wasteRatio,
      tone: wasteRatio > 0 ? 'warning' : 'positive',
    });
  }
  insights.push({
    key: 'cash-variance',
    value: finite(data.operations.cashVariance),
    tone: Math.abs(finite(data.operations.cashVariance)) > 0.01 ? 'warning' : 'positive',
  });
  const topRevenue = productRanking(data.topProducts)[0]?.revenue ?? 0;
  if (data.outcomes.netSales > 0 && topRevenue > 0) {
    insights.push({
      key: 'top-product-share',
      value: topRevenue / data.outcomes.netSales * 100,
      tone: 'neutral',
    });
  }
  return insights;
}
