import { PayrollEngineService } from './payroll-engine.service';
import { ENGINE_BADL } from './salary-component.util';

function configStub() {
  return {
    get: (key: string) => {
      if (key === 'payroll.workingDays') return 30;
      if (key === 'payroll.hoursPerDay') return 8;
      if (key === 'payroll.defaultOffDay') return 'Friday';
      if (key === 'payroll.deductionExemptEmpCodes') return [];
      return undefined;
    },
  };
}

const taxPoliciesStub = {
  resolveForPeriod: jest.fn(),
};

describe('PayrollEngineService integrity', () => {
  it('resolves housing allowance from catalog title, not legacy code 101', async () => {
    const prisma = {
      hr_finance_employes: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            badl_code: 3,
            badl_discount_id_fk: 3,
            badl_type: 1,
            value: 800,
            method_to_count: 1,
            specific_period: '0',
            date_to: null,
          },
        ]),
      },
      all_defined_setting: {
        findMany: jest.fn().mockResolvedValue([{ defined_id: 3, defined_title: 'بدل سكن', defined_type: 1 }]),
      },
    };
    const engine = new PayrollEngineService(prisma as never, configStub() as never, taxPoliciesStub as never);
    const amount = await engine.getBadlValue(ENGINE_BADL.HOUSING, 1001, 9);
    expect(amount).toBe(800);
  });

  it('applies a percent finance-tab deduction as a recurring deduction', async () => {
    const prisma = {
      hr_finance_employes: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 2,
            badl_code: 8,
            badl_discount_id_fk: 8,
            badl_type: 2,
            value: 10,
            method_to_count: 2,
            specific_period: '0',
            date_to: null,
          },
        ]),
      },
      all_defined_setting: {
        findMany: jest.fn().mockResolvedValue([{ defined_id: 8, defined_title: 'خصم نسبة', defined_type: 2 }]),
      },
    };
    const engine = new PayrollEngineService(prisma as never, configStub() as never, taxPoliciesStub as never);
    const resolved = await engine.resolveSalaryComponents(9, 1001, 5000);
    expect(resolved.recurringDeductions).toBe(500);
    expect(resolved.named.housing).toBe(0);
  });

  it('clips unpaid leave to the payroll window and drops weekly offs', async () => {
    const prisma = {
      hr_emp_agazat_dayes: { findFirst: jest.fn().mockResolvedValue({ off_day: 'Friday' }) },
      holiday_setting: {
        findMany: jest.fn().mockResolvedValue([{ id: 23 }]),
      },
      hr_all_agzat_orders: {
        findMany: jest.fn().mockResolvedValue([
          {
            num_days: 40,
            no3_agaza: 23,
            agaza_from_date_m: '2026-07-01',
            agaza_to_date_m: '2026-08-10',
          },
        ]),
      },
    };
    const engine = new PayrollEngineService(prisma as never, configStub() as never, taxPoliciesStub as never);
    const keyab = await engine.getKeyabByDate(1001, '2026-07-26', '2026-08-25');
    // Intersection 26 Jul–10 Aug = 16 calendar days, minus Fridays 31 Jul + 7 Aug = 14.
    expect(keyab.withoutSalaryDays).toBe(14);
    expect(keyab.withSalaryDays).toBe(0);
  });

  it('treats all other configured leave types as paid', async () => {
    const prisma = {
      hr_emp_agazat_dayes: { findFirst: jest.fn().mockResolvedValue(null) },
      holiday_setting: { findMany: jest.fn().mockResolvedValue([{ id: 23 }]) },
      hr_all_agzat_orders: {
        findMany: jest.fn().mockResolvedValue([
          {
            num_days: 2,
            no3_agaza: 4,
            agaza_from_date_m: '2026-08-02',
            agaza_to_date_m: '2026-08-03',
          },
        ]),
      },
    };
    const engine = new PayrollEngineService(prisma as never, configStub() as never, taxPoliciesStub as never);
    await expect(engine.getKeyabByDate(1001, '2026-08-01', '2026-08-31')).resolves.toEqual({
      withSalaryDays: 2,
      withoutSalaryDays: 0,
    });
  });

  it('uses a portable zero incentive when no provider adapter is installed', async () => {
    const engine = new PayrollEngineService({} as never, configStub() as never, taxPoliciesStub as never);
    await expect(engine.getIncentives(44, 9001, '2026-07-26', '2026-08-25')).resolves.toBe(0);
  });

  it('delegates optional incentives without reading provider tables in core', async () => {
    const incentives = { calculate: jest.fn().mockResolvedValue(25) };
    const engine = new PayrollEngineService(
      {} as never,
      configStub() as never,
      taxPoliciesStub as never,
      incentives,
    );
    await expect(engine.getIncentives(44, 9001, '2026-07-26', '2026-08-25')).resolves.toBe(25);
    expect(incentives.calculate).toHaveBeenCalledWith({
      employeeId: 44,
      employeeCode: 9001,
      fromDate: '2026-07-26',
      toDate: '2026-08-25',
    });
  });

  it('does not stamp penalties for employees missing from the run slip', async () => {
    const executeRaw = jest.fn();
    const prisma = {
      hr_mosayer_details: {
        findMany: jest.fn().mockResolvedValue([{ emp_code: 1001 }]),
      },
      $executeRaw: executeRaw,
    };
    const engine = new PayrollEngineService(prisma as never, configStub() as never, taxPoliciesStub as never);
    await engine.stampConsumedPenalties(77, '2026-07-26', '2026-08-25', prisma as never);
    expect(executeRaw).toHaveBeenCalled();
    const sql = String(executeRaw.mock.calls[0][0].strings?.join(' ') ?? executeRaw.mock.calls[0][0]);
    expect(sql).toContain('emp_code IN');
  });

  it('skips stamp updates when the run has no employees', async () => {
    const executeRaw = jest.fn();
    const prisma = {
      hr_mosayer_details: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: executeRaw,
    };
    const engine = new PayrollEngineService(prisma as never, configStub() as never, taxPoliciesStub as never);
    const n = await engine.stampConsumedBonuses(77, '2026-07-26', '2026-08-25', prisma as never);
    expect(n).toBe(0);
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
