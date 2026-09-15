import type { PosReceiptData } from '@/components/sales/pos-printing';
import type { QuickSaleRow } from '@/types/gym-sales';

export function savedPosReceipt(sale: QuickSaleRow, branding: Partial<PosReceiptData> = {}): PosReceiptData {
  const payments = (sale.payments ?? []).map((payment) => ({ methodName: payment.methodName || payment.method, amount: payment.amount, reference: payment.reference || undefined }));
  const employeeFreeAmount = Math.min(sale.discountAmount, Math.round((sale.items ?? []).reduce((sum, item) =>
    sum + item.unitPrice * Math.min(item.quantity, Math.max(0, item.freeQuantity ?? 0)), 0) * 100) / 100);
  return {
    ...branding,
    saleType: sale.saleType,
    customerName: sale.customerName,
    employeeName: sale.saleType === 'employee' ? sale.employeeName || sale.customerName : undefined,
    employeeFreeAmount,
    saleNumber: sale.saleNumber, dailyNumber: sale.dailyNumber,
    saleDate: sale.saleDate,
    paymentMethod: payments.map((payment) => payment.methodName).join(' + ') || sale.paymentMethod,
    payments,
    subtotal: sale.subtotal, discountAmount: sale.discountAmount, taxAmount: sale.taxAmount, totalAmount: sale.totalAmount,
    receiptComment: sale.receiptComment || undefined,
    items: (sale.items ?? []).map((item) => ({
      name: item.name, variantName: item.variantName || undefined,
      itemNote: item.itemNote || undefined,
      freeQuantity: Math.min(item.quantity, Math.max(0, item.freeQuantity ?? 0)),
      quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal,
    })),
  };
}

/** Split the saved discount for display only; never reprice a historical sale. */
export function receiptDiscountRows(receipt: Pick<PosReceiptData, 'employeeFreeAmount' | 'discountAmount'>) {
  const freeAmount = Math.max(0, Math.min(receipt.employeeFreeAmount ?? 0, receipt.discountAmount));
  const otherDiscount = Math.round((receipt.discountAmount - freeAmount) * 100) / 100;
  return [
    ...(freeAmount > 0 ? [{ label: 'مشروبات الموظف المجانية (خصم ١٠٠٪)', amount: freeAmount }] : []),
    ...(otherDiscount > 0 ? [{ label: freeAmount > 0 ? 'خصم إضافي' : 'الخصم', amount: otherDiscount }] : []),
  ];
}
