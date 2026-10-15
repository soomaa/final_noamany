import { BadRequestException } from '@nestjs/common';
import { ExpensePaymentDto } from './dto/finance.dto';
import { mapPaymentMethodToArabic, roundMoney } from './finance.utils';

export function expensePayments(total: number, input: {
  paidAmount?: number;
  payments?: ExpensePaymentDto[];
  paymentMethod?: string;
  paymentStatus?: string;
}) {
  const paid = roundMoney(input.paidAmount ?? (input.paymentStatus === 'مدفوع' ? total : 0));
  if (!Number.isFinite(paid) || paid < 0 || paid > total) {
    throw new BadRequestException('المدفوع يجب أن يكون بين صفر وإجمالي المصروف');
  }
  const payments = input.payments?.filter((row) => row.amount > 0).map((row) => ({
    method: row.method, amount: roundMoney(row.amount),
  }));
  if (payments && (payments.some((row) => !Number.isFinite(row.amount))
    || roundMoney(payments.reduce((sum, row) => sum + row.amount, 0)) !== paid)) {
    throw new BadRequestException('توزيع طرق الدفع لا يساوي المبلغ المدفوع');
  }
  return {
    paidAmount: paid,
    payments,
    paymentStatus: paid === 0 ? 'معلق' : paid < total ? 'جزئي' : 'مدفوع',
    paymentMethod: payments?.length
      ? payments.length === 1 ? mapPaymentMethodToArabic(payments[0].method) : 'متعدد'
      : input.paymentMethod ?? 'نقدي',
  };
}
