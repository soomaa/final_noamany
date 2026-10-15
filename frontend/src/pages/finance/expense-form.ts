import type { ExpenseFormPayload } from '@/types/finance';

export interface ExpenseFormState {
  expenseDate: string;
  category: string;
  subCategory: string;
  amount: string;
  paymentMethod: string;
  paymentStatus: string;
  description: string;
  vendor: string;
  invoiceNumber: string;
  receiptNumber: string;
  taxAmount: string;
  notes: string;
  branchId: string;
  deductFromDrawer: boolean;
  businessUnit?: 'gym' | 'cafe';
  paidAmount?: string;
  payments?: { method: string; amount: number }[];
}

export function buildExpensePayload(
  form: ExpenseFormState,
  isNewExpense: boolean,
): ExpenseFormPayload {
  return {
    expenseDate: form.expenseDate,
    businessUnit: form.businessUnit,
    paidAmount: form.paidAmount != null ? Number(form.paidAmount) : undefined,
    payments: form.payments,
    category: form.category,
    subCategory: form.subCategory || undefined,
    amount: Number(form.amount),
    paymentMethod: form.paymentMethod,
    paymentStatus: form.paymentStatus,
    description: form.description || undefined,
    vendor: form.vendor || undefined,
    invoiceNumber: form.invoiceNumber || undefined,
    receiptNumber: form.receiptNumber || undefined,
    taxAmount: form.taxAmount ? Number(form.taxAmount) : undefined,
    notes: form.notes || undefined,
    branchId: form.branchId ? Number(form.branchId) : undefined,
    deductFromDrawer: isNewExpense && form.deductFromDrawer,
  };
}
