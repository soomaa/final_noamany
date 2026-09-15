export interface PosPaymentAllocationLike {
  amount: string | number;
}

export function filterConfiguredPaymentMethods<T extends { id: number; isEnabled: boolean }>(
  catalog: readonly T[] | undefined,
  savedPayments: readonly { catalogPaymentMethodId?: number | null }[] = [],
): T[] {
  if (!catalog) return [];
  return catalog.filter((method) => (
    method.isEnabled
    || savedPayments.some((payment) => payment.catalogPaymentMethodId === method.id)
  ));
}

function toCents(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

export function paymentTotalCents(rows: PosPaymentAllocationLike[]): number {
  return rows.reduce((total, row) => total + toCents(row.amount), 0);
}

export function paymentRemainingCents(
  total: number,
  rows: PosPaymentAllocationLike[],
): number {
  return Math.round(total * 100) - paymentTotalCents(rows);
}

export function fillPaymentRemainder<T extends PosPaymentAllocationLike>(
  total: number,
  rows: T[],
  targetIndex: number,
): T[] {
  const otherTotal = rows.reduce(
    (sum, row, index) => sum + (index === targetIndex ? 0 : toCents(row.amount)),
    0,
  );
  const remainder = Math.max(0, Math.round(total * 100) - otherTotal);
  return rows.map((row, index) =>
    index === targetIndex
      ? { ...row, amount: (remainder / 100).toFixed(2) }
      : row,
  );
}
