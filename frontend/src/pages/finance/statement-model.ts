const PAID = new Set(['مدفوع', 'paid', 'Paid']);
const IGNORED = new Set(['ملغي', 'cancelled', 'canceled', 'مرفوض', 'rejected']);

export interface StatusAmount {
  status: string;
  amount: number;
  count: number;
}

export interface AmountCount {
  amount: number;
  count: number;
}

export function uncollected(rows: StatusAmount[]): AmountCount {
  return rows.reduce<AmountCount>(
    (sum, row) => {
      if (PAID.has(row.status) || IGNORED.has(row.status)) return sum;
      return { amount: sum.amount + row.amount, count: sum.count + row.count };
    },
    { amount: 0, count: 0 },
  );
}

export function pendingApproval(rows: StatusAmount[]): AmountCount {
  const row = rows.find((item) => item.status === 'معلق');
  return { amount: row?.amount ?? 0, count: row?.count ?? 0 };
}

export interface PayrollRunSpan {
  status: string;
  period_start: string;
  period_end: string;
  total_net: number | string;
  branch_id?: number | null;
}

export interface OpenPayroll {
  waitingAmount: number;
  waitingCount: number;
  partialCount: number;
}

/** `branchId` 'all' keeps every run; a branch keeps only that branch's runs. */
export function openPayroll(runs: PayrollRunSpan[], start: string, end: string, branchId = 'all'): OpenPayroll {
  const open = runs.filter(
    (run) => run.status !== 'paid'
      && run.period_start <= end
      && run.period_end >= start
      && (branchId === 'all' || String(run.branch_id ?? '') === branchId),
  );
  const waiting = open.filter((run) => run.status === 'draft' || run.status === 'submitted');
  return {
    waitingAmount: waiting.reduce((sum, run) => sum + (Number(run.total_net) || 0), 0),
    waitingCount: waiting.length,
    partialCount: open.filter((run) => run.status === 'partially_paid').length,
  };
}

export function signedPercent(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface StatementFilters {
  startDate: string;
  endDate: string;
  branchId: string;
}

/** Filters carried by a link (old report pages, list links use dateFrom/dateTo). */
export function statementFiltersFromSearch(search: string, fallback: StatementFilters): StatementFilters {
  const params = new URLSearchParams(search);
  const date = (...keys: string[]) => keys.map((key) => params.get(key)).find((value) => value && DATE_ONLY.test(value));
  const branchId = params.get('branchId');
  return {
    startDate: date('startDate', 'dateFrom') ?? fallback.startDate,
    endDate: date('endDate', 'dateTo') ?? fallback.endDate,
    branchId: branchId && /^\d+$/.test(branchId) ? branchId : fallback.branchId,
  };
}
