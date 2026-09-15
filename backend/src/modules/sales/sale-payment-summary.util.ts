export interface SavedPaymentAmount {
  id?: number; method: string; amount: number;
  catalogPaymentMethodId?: number | null; methodCode?: string | null; methodName?: string | null;
}
export interface ShiftPaymentInvoice {
  status: string; paymentMethod: string; totalAmount: number; collectedAmount?: number;
  saleType?: string; billingCycle?: string | null; payments?: SavedPaymentAmount[];
}
export interface InvoicePaymentAmount { key: string; method: string; label: string; amount: number }

const labels: Record<string, string> = { cash: 'نقدي', card: 'بطاقة', wallet: 'محفظة', transfer: 'تحويل', mixed: 'دفع مختلط (غير مفصل)' };
const cents = (value: number) => Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;

function combinePayments(rows: InvoicePaymentAmount[]) {
  const grouped = new Map<string, InvoicePaymentAmount>();
  for (const row of rows) {
    const previous = grouped.get(row.key);
    grouped.set(row.key, { ...row, amount: (cents(previous?.amount ?? 0) + cents(row.amount)) / 100 });
  }
  const order = ['cash', 'card', 'wallet', 'transfer', 'mixed'];
  return [...grouped.values()].sort((a, b) => order.indexOf(a.method) - order.indexOf(b.method));
}

/** Saved allocations are authoritative; a deferred/free invoice must never become cash. */
export function invoicePaymentAmounts(invoice: ShiftPaymentInvoice): InvoicePaymentAmount[] {
  const rows = (invoice.payments ?? []).filter(payment => cents(payment.amount) > 0);
  if (rows.length) {
    return combinePayments(rows.map(payment => {
      const name = payment.methodName?.trim();
      const isDefault = !name || name.toLowerCase() === payment.method || name === labels[payment.method]
        || payment.methodCode?.toLowerCase() === payment.method;
      return {
        key: isDefault ? payment.method : `custom:${payment.catalogPaymentMethodId ?? payment.methodCode ?? name}`,
        method: payment.method,
        label: isDefault ? labels[payment.method] || payment.method : name,
        amount: cents(payment.amount) / 100,
      };
    }));
  }
  const deferred = invoice.saleType !== 'customer' && ['daily', 'monthly'].includes(invoice.billingCycle ?? '');
  const amount = cents(invoice.collectedAmount ?? (deferred ? 0 : invoice.totalAmount)) / 100;
  return amount > 0 ? [{ key: invoice.paymentMethod, method: invoice.paymentMethod, label: labels[invoice.paymentMethod] || invoice.paymentMethod, amount }] : [];
}

/** Counts each completed invoice once and each mixed-payment allocation once. */
export function shiftPaymentSummary(invoices: ShiftPaymentInvoice[]) {
  const completed = invoices.filter(invoice => invoice.status === 'completed');
  const payments = combinePayments(completed.flatMap(invoicePaymentAmounts));
  const total = completed.reduce((sum, invoice) => sum + cents(invoice.totalAmount), 0) / 100;
  const collected = payments.reduce((sum, row) => sum + cents(row.amount), 0) / 100;
  return { payments, total, collected, outstanding: Math.max(0, Math.round((total - collected) * 100)) / 100 };
}

/** Adapter shared by the shift board and date/branch-scoped café reports. */
export function savedSalePaymentInvoice(sale: {
  status: string; payment_method: string; total_amount: unknown; collected_amount: unknown;
  sale_type?: string; billing_cycle?: string | null;
  payments?: Array<{ method: string; amount: unknown; catalog_payment_method_id?: number | null; method_code?: string | null; method_name?: string | null }>;
}): ShiftPaymentInvoice {
  return {
    status: sale.status, paymentMethod: sale.payment_method, totalAmount: Number(sale.total_amount),
    collectedAmount: sale.collected_amount == null ? undefined : Number(sale.collected_amount),
    saleType: sale.sale_type, billingCycle: sale.billing_cycle,
    payments: sale.payments?.map(payment => ({ method: payment.method, amount: Number(payment.amount),
      catalogPaymentMethodId: payment.catalog_payment_method_id, methodCode: payment.method_code, methodName: payment.method_name })),
  };
}

