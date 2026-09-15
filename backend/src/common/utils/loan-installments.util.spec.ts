import {
  buildLoanInstallments,
  khsmToDateM,
  resolveLoanInstallmentCount,
} from './loan-installments.util';

describe('legacy loan installment rules', () => {
  it.each([1, 2])('forces repayment method %s to one installment', (method) => {
    expect(resolveLoanInstallmentCount(method, 12)).toBe(1);
  });

  it('keeps the requested count for monthly payroll deduction', () => {
    expect(resolveLoanInstallmentCount(3, 6)).toBe(6);
  });

  it('creates the schedule immediately from the deduction start date', () => {
    const schedule = buildLoanInstallments(1000, 6, '2026-08-11');

    expect(schedule).toHaveLength(6);
    expect(schedule[0]).toMatchObject({ dueDate: '2026-08-11', amount: 167, month: 8, year: 2026 });
    expect(schedule[5]).toMatchObject({ dueDate: '2027-01-11', amount: 165, month: 1, year: 2027 });
    expect(schedule.reduce((sum, installment) => sum + installment.amount, 0)).toBe(1000);
    expect(khsmToDateM('2026-08-11', 6)).toBe('2027-01-11');
  });
});
