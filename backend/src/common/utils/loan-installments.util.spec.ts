import { addCalendarMonths, buildLoanInstallments, khsmToDateM } from './loan-installments.util';

describe('loan installment calendar dates', () => {
  it('caps month-end installments instead of skipping February', () => {
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addCalendarMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addCalendarMonths('2026-12-31', 1)).toBe('2027-01-31');
    expect(addCalendarMonths('2026-02-28', 1)).toBe('2026-03-31');
    expect(addCalendarMonths('2026-01-30', 1)).toBe('2026-02-28');
  });

  it('builds deterministic month/year values from date-only input', () => {
    const rows = buildLoanInstallments(300, 3, '2026-12-31');
    expect(rows.map((row) => [row.dueDate, row.month, row.year])).toEqual([
      ['2026-12-31', 12, 2026],
      ['2027-01-31', 1, 2027],
      ['2027-02-28', 2, 2027],
    ]);
    expect(khsmToDateM('2026-12-31', 3)).toBe('2027-02-28');
  });

  it('keeps canonical Cairo due-date epochs aligned across the DST boundary', () => {
    const rows = buildLoanInstallments(200, 2, '2026-03-31');
    expect(rows.map((row) => row.dueDate)).toEqual(['2026-03-31', '2026-04-30']);
    expect(rows.map((row) => new Date(Number(row.qstDate) * 1000).toISOString())).toEqual([
      '2026-03-30T22:00:00.000Z',
      '2026-04-29T21:00:00.000Z',
    ]);
  });

  it('fails closed for invalid date-only input', () => {
    expect(() => addCalendarMonths('2026-02-30', 1)).toThrow('التاريخ غير صحيح');
    expect(() => buildLoanInstallments(100, 2, 'not-a-date')).toThrow();
    expect(() => khsmToDateM('2026-13-01', 2)).toThrow();
  });
});
