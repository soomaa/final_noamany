export type InvoicePayment = { method: string; amount: number };
export type InvoicePaymentChange = { method: string; before: number; after: number; difference: number };

/** Settlement of an edit is a delta; final allocations still represent the entire invoice. */
export function completedInvoicePaymentChanges(before: InvoicePayment[], after: InvoicePayment[]): InvoicePaymentChange[] {
  const totals = (rows: InvoicePayment[]) => rows.reduce<Record<string, number>>((result, row) => {
    result[row.method] = (result[row.method] ?? 0) + Math.round(Number(row.amount) * 100);
    return result;
  }, {});
  const oldTotals = totals(before);
  const newTotals = totals(after);
  return [...new Set([...Object.keys(oldTotals), ...Object.keys(newTotals)])].map(method => ({
    method,
    before: (oldTotals[method] ?? 0) / 100,
    after: (newTotals[method] ?? 0) / 100,
    difference: ((newTotals[method] ?? 0) - (oldTotals[method] ?? 0)) / 100,
  }));
}

export function completedInvoiceTaxRate(invoice: { taxPercentage?: number; subtotal: number; discountAmount: number; taxAmount: number }): number {
  if (invoice.taxPercentage != null) return Number(invoice.taxPercentage);
  const taxable = Number(invoice.subtotal) - Number(invoice.discountAmount);
  return taxable > 0 ? Number(invoice.taxAmount) / taxable * 100 : 0;
}

export function reservedProductQuantity(items: Array<{ cafeProductId?: number | null; quantity: number }>, productId: number): number {
  return items.reduce((sum, item) => item.cafeProductId === productId ? sum + Number(item.quantity) : sum, 0);
}
