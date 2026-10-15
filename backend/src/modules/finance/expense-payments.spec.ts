import { expensePayments } from './expense-payments';

describe('expense payment allocation', () => {
  it('keeps an unpaid expense open', () => {
    expect(expensePayments(100, { paidAmount: 0, payments: [] })).toMatchObject({ paidAmount: 0, paymentStatus: 'معلق' });
  });
  it('derives partial and fully paid statuses from the actual splits', () => {
    expect(expensePayments(100, { paidAmount: 40, payments: [{ method: 'cash', amount: 40 }] })).toMatchObject({ paidAmount: 40, paymentStatus: 'جزئي', paymentMethod: 'نقدي' });
    expect(expensePayments(100, { paidAmount: 100, payments: [{ method: 'cash', amount: 40 }, { method: 'card', amount: 60 }] })).toMatchObject({ paymentStatus: 'مدفوع', paymentMethod: 'متعدد' });
  });
  it('rejects overpayment and allocations that do not equal the paid amount', () => {
    expect(() => expensePayments(100, { paidAmount: 101 })).toThrow();
    expect(() => expensePayments(100, { paidAmount: 40, payments: [{ method: 'cash', amount: 20 }] })).toThrow();
  });
  it('preserves fully paid legacy expenses', () => {
    expect(expensePayments(100, { paymentStatus: 'مدفوع' }).paidAmount).toBe(100);
  });
});
