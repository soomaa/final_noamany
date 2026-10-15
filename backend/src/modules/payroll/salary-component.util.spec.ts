import {
  applyNamedAllowance,
  buildPayrollEmployeeWhere,
  clipIsoRange,
  computeComponentAmount,
  countInclusiveDays,
  ENGINE_BADL,
  emptyNamedAllowances,
  isFinanceRowExpired,
  resolveEngineBadlCode,
} from './salary-component.util';

describe('salary-component resolution', () => {
  it('maps housing catalog title to engine code 101', () => {
    expect(resolveEngineBadlCode({ catalogId: 3, title: 'بدل سكن' })).toBe(ENGINE_BADL.HOUSING);
  });

  it('keeps a legacy engine code even when the catalog id differs', () => {
    expect(resolveEngineBadlCode({ badlCode: 102, catalogId: 4, title: 'بدل نقل' })).toBe(
      ENGINE_BADL.TRANSPORT,
    );
  });

  it('computes a percent deduction against basic salary', () => {
    expect(
      computeComponentAmount({ value: 10, method: 'percent', basicSalary: 5000, periodDays: 30 }),
    ).toBe(500);
  });

  it('computes a per-day component across the payroll period', () => {
    expect(
      computeComponentAmount({ value: 20, method: 'days', basicSalary: 5000, periodDays: 30 }),
    ).toBe(600);
  });

  it('excludes show_in_mosayer=no and includes a leaver only in their last period', () => {
    const where = buildPayrollEmployeeWhere({ fromDate: '2026-07-26', toDate: '2026-08-25' });
    expect(where.NOT).toEqual({ show_in_mosayer: 'no' });
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { leave_emp: null },
        { leave_emp: 0 },
        { leave_emp: 1, end_service_date_m: { gte: '2026-07-26', lte: '2026-08-25' } },
      ]),
    );
  });

  it('clips unpaid leave to the payroll window', () => {
    expect(clipIsoRange('2026-07-01', '2026-08-10', '2026-07-26', '2026-08-25')).toEqual({
      from: '2026-07-26',
      to: '2026-08-10',
    });
    expect(countInclusiveDays('2026-07-26', '2026-08-10')).toBe(16);
  });

  it('treats an expired specific-period row as inactive', () => {
    expect(isFinanceRowExpired({ specific_period: '1', date_to: '2026-01-01' }, '2026-08-24')).toBe(
      true,
    );
    expect(isFinanceRowExpired({ specific_period: '0', date_to: '2026-01-01' }, '2026-08-24')).toBe(
      false,
    );
  });

  it('accumulates housing onto the named slip field', () => {
    const named = emptyNamedAllowances();
    applyNamedAllowance(named, ENGINE_BADL.HOUSING, 800);
    expect(named.housing).toBe(800);
  });
});
