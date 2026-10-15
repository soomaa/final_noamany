import { uiStatic } from '@/lib/ui-static';
export interface PartialPaymentRow {
  method: string;
  amount: string;
}

export function buildClubPartialPayment(rows: PartialPaymentRow[], total: number) {
  const payments = rows
    .map((row) => ({ method: row.method, amount: Math.round((Number(row.amount) || 0) * 100) / 100 }))
    .filter((row) => row.amount > 0);
  const paidAmount = Math.round(payments.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
  const expected = Math.round(total * 100) / 100;
  if (paidAmount > expected) return { error: uiStatic('المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الخدمة') } as const;
  return {
    payload: {
      paidAmount,
      paymentMethod: payments[0]?.method ?? rows[0]?.method ?? 'cash',
      payments,
    },
    paidAmount,
    remainingAmount: Math.round((expected - paidAmount) * 100) / 100,
  } as const;
}
