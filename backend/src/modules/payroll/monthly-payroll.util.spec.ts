import { calendarPayrollPeriod, sumPayrollEvents } from './monthly-payroll.util';

describe('monthly payroll contract', () => {
  it('uses actual calendar month lengths including leap years', () => {
    expect(calendarPayrollPeriod(3, 2026)).toEqual({ fromDate: '2026-03-01', toDate: '2026-03-31' });
    expect(calendarPayrollPeriod(2, 2024).toDate).toBe('2024-02-29');
    expect(calendarPayrollPeriod(2, 2026).toDate).toBe('2026-02-28');
    expect(calendarPayrollPeriod(1, 2026).fromDate).toBe('2026-01-01');
  });
  it('adds separate events and only reverses the identified event', () => {
    const events = [
      { id: 1, kind: 'deduction', amount: 100, reverses_id: null },
      { id: 2, kind: 'bonus', amount: 250, reverses_id: null },
      { id: 3, kind: 'increase', amount: 50, reverses_id: null },
      { id: 4, kind: 'deduction', amount: 25.25, reverses_id: null },
      { id: 5, kind: 'reversal', amount: 100, reverses_id: 1 },
      { id: 6, kind: 'cafe_select', amount: 800, reverses_id: null },
    ];
    expect(sumPayrollEvents(events)).toEqual({ privateBonus: 250, taqeemValue: 0, targetValue: 0, manualIncrease: 50, manualDeduction: 25.25 });
  });
});
