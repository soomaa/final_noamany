/**
 * Pure aggregation math for «يومية الاستقبال» (reception daily closing).
 *
 * The service loads receipts, spa / InBody invoices, expenses and bar (POS) sales and turns each
 * into a normalized entry; everything the page shows — totals, payment-method split, the
 * reconciliation check, «الكاش في الدرج دلوقتي» and the per-user table — is computed here so the
 * money math is unit-tested without a database.
 */

/** Where a collected amount came from. */
export type CashierSource =
  | 'subscription' // اشتراك (receipt on a subscription registered in the same day)
  | 'installment' // قسط / سداد متبقي (receipt on an older subscription)
  | 'quick_service' // خدمة سريعة من الاستقبال
  | 'locker' // لوكر
  | 'spa' // سبا
  | 'inbody' // InBody
  | 'other' // إيصال يدوي آخر
  | 'bar'; // البار / الكافيه (POS)

/** cash | card (فيزا/بطاقة) | transfer (تحويل/محافظ/إنستا باي/بنك/أونلاين) | other. */
export type MethodGroup = 'cash' | 'card' | 'transfer' | 'other';

export interface CashierPayment {
  method: string;
  amount: number;
}

export interface CashierEntry {
  source: CashierSource;
  amount: number;
  /** Split tender lines. Their sum should equal `amount` (checked by the reconciliation). */
  payments: CashierPayment[];
  userId: number | null;
}

export interface CashierExpense {
  amount: number;
  method: string;
  userId: number | null;
  /** مرتجع اشتراك (booked by the refunds module as an expense). */
  isRefund: boolean;
}

const RECEPTION_SERVICE_SOURCES: ReadonlySet<CashierSource> = new Set([
  'quick_service',
  'locker',
  'spa',
  'inbody',
]);

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Normalize any stored method (ClubPaymentMethod / SalesPaymentMethod codes or the Arabic
 * strings fin_expenses keeps, e.g. «نقدي») to one code.
 */
export function normalizeCashierMethod(raw: string | null | undefined): string {
  const m = (raw ?? '').trim().toLowerCase();
  if (!m) return 'cash';
  if (m.includes('cash') || m.includes('نقد') || m.includes('كاش')) return 'cash';
  if (m.includes('instapay') || m.includes('إنستا') || m.includes('انستا')) return 'instapay';
  if (m.includes('wallet') || m.includes('محفظ') || m.includes('محافظ')) return 'wallet';
  if (m.includes('visa') || m.includes('فيزا')) return 'visa';
  if (m.includes('transfer') || m.includes('تحو')) return 'transfer';
  if (m.includes('bank') || m.includes('بنك')) return 'bank';
  if (m.includes('card') || m.includes('بطاق') || m.includes('كارت')) return 'card';
  if (m.includes('online') || m.includes('إلكتر') || m.includes('الكتر')) return 'online';
  return 'other';
}

export function methodGroup(method: string): MethodGroup {
  const code = normalizeCashierMethod(method);
  if (code === 'cash') return 'cash';
  if (code === 'card' || code === 'visa') return 'card';
  if (code === 'transfer' || code === 'bank' || code === 'instapay' || code === 'wallet' || code === 'online') {
    return 'transfer';
  }
  return 'other';
}

export function isReceptionServiceSource(source: CashierSource): boolean {
  return RECEPTION_SERVICE_SOURCES.has(source);
}

interface UserBucket {
  userId: number | null;
  cash: number;
  card: number;
  transfer: number;
  other: number;
  total: number;
  receptionTotal: number;
  barTotal: number;
  expensesCash: number;
  refundsCash: number;
  expensesTotal: number;
  cashInDrawer: number;
}

const emptyUser = (userId: number | null): UserBucket => ({
  userId,
  cash: 0,
  card: 0,
  transfer: 0,
  other: 0,
  total: 0,
  receptionTotal: 0,
  barTotal: 0,
  expensesCash: 0,
  refundsCash: 0,
  expensesTotal: 0,
  cashInDrawer: 0,
});

function addTo(record: Record<string, number>, key: string, amount: number) {
  record[key] = roundMoney((record[key] ?? 0) + amount);
}

function roundRecord(record: Record<string, number>) {
  for (const key of Object.keys(record)) record[key] = roundMoney(record[key]);
  return record;
}

/** Payment lines of an entry, falling back to one cash line when none were stored. */
function linesOf(entry: CashierEntry): CashierPayment[] {
  return entry.payments.length ? entry.payments : [{ method: 'cash', amount: entry.amount }];
}

export function summarizeDailyCashier(entries: CashierEntry[], expenses: CashierExpense[]) {
  const reception = entries.filter((e) => e.source !== 'bar');
  const bar = entries.filter((e) => e.source === 'bar');

  const bySource: Record<string, { count: number; total: number; cash: number }> = {};
  const receptionByMethod: Record<string, number> = {};
  const barByMethod: Record<string, number> = {};
  const users = new Map<number | null, UserBucket>();
  const userOf = (id: number | null) => {
    let bucket = users.get(id);
    if (!bucket) {
      bucket = emptyUser(id);
      users.set(id, bucket);
    }
    return bucket;
  };

  let receptionCollected = 0;
  let receptionPaymentsTotal = 0;
  let unreconciledCount = 0;
  let subscriptionsCash = 0;
  let servicesCash = 0;
  let otherReceiptsCash = 0;
  let barCash = 0;
  let barCollected = 0;

  for (const entry of entries) {
    const isBar = entry.source === 'bar';
    const lines = linesOf(entry);
    const linesTotal = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
    if (!isBar) {
      receptionCollected += entry.amount;
      receptionPaymentsTotal += linesTotal;
      if (roundMoney(entry.amount - linesTotal) !== 0) unreconciledCount += 1;
    } else {
      barCollected += entry.amount;
    }

    const src = bySource[entry.source] ?? { count: 0, total: 0, cash: 0 };
    src.count += 1;
    src.total += entry.amount;

    const user = userOf(entry.userId);
    user.total += entry.amount;
    if (isBar) user.barTotal += entry.amount;
    else user.receptionTotal += entry.amount;

    for (const line of lines) {
      const code = normalizeCashierMethod(line.method);
      addTo(isBar ? barByMethod : receptionByMethod, code, line.amount);
      const group = methodGroup(code);
      user[group] += line.amount;
      if (group !== 'cash') continue;
      src.cash += line.amount;
      if (isBar) barCash += line.amount;
      else if (entry.source === 'subscription' || entry.source === 'installment') subscriptionsCash += line.amount;
      else if (isReceptionServiceSource(entry.source)) servicesCash += line.amount;
      else otherReceiptsCash += line.amount;
    }
    bySource[entry.source] = src;
  }

  let expensesCash = 0;
  let refundsCash = 0;
  let expensesTotal = 0;
  let refundsTotal = 0;
  const expensesByMethod: Record<string, number> = {};
  for (const expense of expenses) {
    const code = normalizeCashierMethod(expense.method);
    addTo(expensesByMethod, code, expense.amount);
    const user = userOf(expense.userId);
    user.expensesTotal += expense.amount;
    if (expense.isRefund) refundsTotal += expense.amount;
    else expensesTotal += expense.amount;
    if (methodGroup(code) !== 'cash') continue;
    if (expense.isRefund) {
      refundsCash += expense.amount;
      user.refundsCash += expense.amount;
    } else {
      expensesCash += expense.amount;
      user.expensesCash += expense.amount;
    }
  }

  const byUser = [...users.values()]
    .map((u) => ({
      ...u,
      cash: roundMoney(u.cash),
      card: roundMoney(u.card),
      transfer: roundMoney(u.transfer),
      other: roundMoney(u.other),
      total: roundMoney(u.total),
      receptionTotal: roundMoney(u.receptionTotal),
      barTotal: roundMoney(u.barTotal),
      expensesCash: roundMoney(u.expensesCash),
      refundsCash: roundMoney(u.refundsCash),
      expensesTotal: roundMoney(u.expensesTotal),
      cashInDrawer: roundMoney(u.cash - u.expensesCash - u.refundsCash),
    }))
    .sort((a, b) => b.cashInDrawer - a.cashInDrawer || b.total - a.total);

  for (const key of Object.keys(bySource)) {
    bySource[key] = {
      count: bySource[key].count,
      total: roundMoney(bySource[key].total),
      cash: roundMoney(bySource[key].cash),
    };
  }

  const collectedCash = roundMoney(subscriptionsCash + servicesCash + otherReceiptsCash + barCash);
  const reconciliationDifference = roundMoney(receptionCollected - receptionPaymentsTotal);

  return {
    receptionCollected: roundMoney(receptionCollected),
    receptionCount: reception.length,
    subscriptionsAmount: roundMoney((bySource.subscription?.total ?? 0) + (bySource.installment?.total ?? 0)),
    servicesAmount: roundMoney(
      [...RECEPTION_SERVICE_SOURCES].reduce((sum, s) => sum + (bySource[s]?.total ?? 0), 0),
    ),
    otherReceiptsAmount: roundMoney(bySource.other?.total ?? 0),
    receptionByMethod: roundRecord(receptionByMethod),
    paymentsTotal: roundMoney(receptionPaymentsTotal),
    reconciliationDifference,
    unreconciledCount,
    isReconciled: reconciliationDifference === 0 && unreconciledCount === 0,
    bar: {
      count: bar.length,
      collected: roundMoney(barCollected),
      byMethod: roundRecord(barByMethod),
    },
    expenses: {
      count: expenses.length,
      total: roundMoney(expensesTotal),
      refundsTotal: roundMoney(refundsTotal),
      byMethod: roundRecord(expensesByMethod),
    },
    drawer: {
      subscriptionsCash: roundMoney(subscriptionsCash),
      servicesCash: roundMoney(servicesCash),
      otherReceiptsCash: roundMoney(otherReceiptsCash),
      barCash: roundMoney(barCash),
      collectedCash,
      expensesCash: roundMoney(expensesCash),
      refundsCash: roundMoney(refundsCash),
      cashInDrawer: roundMoney(collectedCash - expensesCash - refundsCash),
    },
    bySource,
    byUser,
  };
}

/**
 * Period of the report: `dateFrom`/`dateTo` (or a single legacy `date`), default today, never in
 * the future, at most `maxDays` long. Throws a message string when invalid.
 */
export function resolveCashierPeriod(
  input: { date?: string | null; dateFrom?: string | null; dateTo?: string | null },
  today: string,
  maxDays = 366,
): { dateFrom: string; dateTo: string } {
  const valid = (d?: string | null) => {
    if (d == null || d === '') return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
      throw new Error('تاريخ غير صالح');
    }
    return d;
  };
  const single = valid(input.date);
  let dateFrom = valid(input.dateFrom) ?? single ?? valid(input.dateTo) ?? today;
  let dateTo = valid(input.dateTo) ?? single ?? today;
  if (dateTo > today) dateTo = today;
  if (dateFrom > today) dateFrom = today;
  if (dateFrom > dateTo) throw new Error('تاريخ البداية يجب أن يسبق تاريخ النهاية');
  const days = (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > maxDays) throw new Error(`أقصى مدة للتقرير ${maxDays} يوم`);
  return { dateFrom, dateTo };
}
