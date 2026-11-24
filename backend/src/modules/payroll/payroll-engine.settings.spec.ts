import {
  PayrollEngineService,
  payrollAttendanceDeductions,
  payrollRateBase,
  payrollRates,
} from './payroll-engine.service';
import { defaultHrPayrollSettings, HrPayrollSettings } from '../hr-payroll-settings/hr-payroll-settings.defaults';
import { ladderDays } from './payroll-attendance.util';

const defaults = defaultHrPayrollSettings();
const config = { get: jest.fn().mockReturnValue(undefined) };

function engineWith(prisma: Record<string, unknown>, overrides: Partial<HrPayrollSettings> = {}) {
  const settings = { get: jest.fn().mockResolvedValue({ ...defaults, ...overrides }) };
  return new PayrollEngineService(prisma as never, config as never, settings as never);
}

describe('payroll settings: defaults reproduce the legacy formulas', () => {
  it('rate basis = basic + housing + transport + raise over 30 days × 8 hours', () => {
    const base = payrollRateBase({ ratebAsasy: 4000, badalSakn: 1000, badalMowaslat: 500, zeyadaRateb: 500 }, defaults);
    expect(base).toBe(6000);
    expect(payrollRates(base, defaults)).toEqual({ agrSa3a: 25, agrYom: 200 });
  });

  it('attendance deductions equal the old hard-coded maths', () => {
    const rates = { agrSa3a: 25, agrYom: 200 };
    const counts = {
      absenceDays: 2,
      paidLeaveDays: 1,
      unpaidLeaveDays: 1.5,
      missingPunchDays: 0.75,
      lateWithoutPermissionMin: 90,
      lateWithPermissionMin: 30,
    };
    expect(payrollAttendanceDeductions(counts, rates, defaults)).toEqual({
      khasmKeyab: 2 * 200,
      khasmAgazat: 1 * 200,
      agazaBdonRateb: 1.5 * 200,
      khasmBasma: 0.75 * 200,
      khasmTakher: (90 / 60) * 25,
      khasmEzn: (30 / 60) * 25,
      khasmEarlyLeave: 0,
    });
  });

  it('the default ladder is 1/4, 1/2, then a full day', () => {
    expect([1, 2, 3, 4].map((n) => ladderDays(n))).toEqual([0.25, 0.5, 1, 1]);
  });

  it('defaults follow the env-driven payroll config', () => {
    const s = defaultHrPayrollSettings({ workingDays: 26, hoursPerDay: 9, defaultOffDay: 'saturday', deductionExemptEmpCodes: [27, 2, 27] });
    expect(s.workingDaysPerMonth).toBe(26);
    expect(s.hoursPerDay).toBe(9);
    expect(s.defaultWeeklyOffDay).toBe('Saturday');
    expect(s.deductionExemptEmpCodes).toEqual([27, 2]);
  });
});

describe('payroll settings: owner changes take effect', () => {
  const rates = { agrSa3a: 25, agrYom: 200 };
  const counts = {
    absenceDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    missingPunchDays: 0,
    lateWithoutPermissionMin: 0,
    lateWithPermissionMin: 30,
  };

  it('permitted lateness not deducted → khasmEzn 0', () => {
    expect(payrollAttendanceDeductions(counts, rates, { ...defaults, permittedLateDeduct: false }).khasmEzn).toBe(0);
  });

  it('permitted lateness at 50% → half the hourly value', () => {
    expect(payrollAttendanceDeductions(counts, rates, { ...defaults, permittedLateRatePercent: 50 }).khasmEzn).toBe(6.25);
  });

  it('early leave: off by default; when on, minutes × hourly rate × multiplier (permitted only if allowed)', () => {
    const early = { ...counts, lateWithPermissionMin: 0, earlyWithoutPermissionMin: 60, earlyWithPermissionMin: 30 };
    expect(payrollAttendanceDeductions(early, rates, defaults).khasmEarlyLeave).toBe(0);
    expect(payrollAttendanceDeductions(early, rates, { ...defaults, earlyLeaveDeduct: true }).khasmEarlyLeave).toBe(25);
    expect(payrollAttendanceDeductions(early, rates, { ...defaults, earlyLeaveDeduct: true, earlyLeaveHourMultiplier: 2 }).khasmEarlyLeave).toBe(50);
    expect(payrollAttendanceDeductions(early, rates, { ...defaults, earlyLeaveDeduct: true, permittedEarlyLeaveDeduct: true }).khasmEarlyLeave).toBe(37.5);
  });

  it('early-leave minutes skip days the manager resolved; «إذن» goes to the permitted bucket', async () => {
    const prisma = {
      hr_all_ozonat_orders: { findMany: jest.fn().mockResolvedValue([{ ezn_date: '2026-08-04' }]) },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([
          { mobaker_min: 40, action_date: '2026-08-01', dwam_id_fk: null },
          { mobaker_min: 20, action_date: '2026-08-02', dwam_id_fk: null },
          { mobaker_min: 15, action_date: '2026-08-03', dwam_id_fk: null },
          { mobaker_min: 10, action_date: '2026-08-04', dwam_id_fk: null },
        ]),
      },
    };
    const decisions: Record<string, string> = { '2026-08-02': 'excused', '2026-08-03': 'permission' };
    const ctx = {
      schedule: null,
      resolutions: { forDay: (date: string) => (decisions[date] ? { decision: decisions[date] } : undefined), forSlot: () => undefined },
    } as never;
    await expect(engineWith(prisma, { earlyLeaveDeduct: true }).getEarlyLeaveByDate(1001, '2026-07-26', '2026-08-25', ctx))
      .resolves.toEqual({ earlyWithPermission: 25, earlyWithoutPermission: 40 });
  });

  it('rate basis without housing and with 26 days changes the hourly rate', () => {
    const s = { ...defaults, rateIncludeHousing: false, workingDaysPerMonth: 26 };
    const base = payrollRateBase({ ratebAsasy: 4160, badalSakn: 1000, badalMowaslat: 0, zeyadaRateb: 0 }, s);
    expect(payrollRates(base, s)).toEqual({ agrSa3a: 20, agrYom: 160 });
  });

  it('ladder fractions (and free occurrences) change the missing-punch deduction', async () => {
    const prisma = {
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([
          { hdoor_time: '09:00', ensraf_time: null },
          { hdoor_time: null, ensraf_time: '18:00' },
          { hdoor_time: '09:00', ensraf_time: null },
          { hdoor_time: null, ensraf_time: '18:00' },
        ]),
      },
    };
    await expect(engineWith(prisma).getForgottenFingerprintByDate(1001, '2026-07-26', '2026-08-25'))
      .resolves.toEqual({ count: 4, deductionDays: 2.75 });
    await expect(
      engineWith(prisma, { missingPunchFirstDays: 0, missingPunchSecondDays: 0.25, missingPunchThirdPlusDays: 0.5 })
        .getForgottenFingerprintByDate(1001, '2026-07-26', '2026-08-25'),
    ).resolves.toEqual({ count: 4, deductionDays: 1.25 });
    await expect(
      engineWith(prisma, { missingPunchFreePerMonth: 2 }).getForgottenFingerprintByDate(1001, '2026-07-26', '2026-08-25'),
    ).resolves.toEqual({ count: 4, deductionDays: 0.75 });
  });

  it('the late cap threshold / value come from the settings', async () => {
    const prisma = {
      hr_all_ozonat_orders: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([
          { late_min: 150, action_date: '2026-08-01', dwam_id_fk: null },
          { late_min: 30, action_date: '2026-08-02', dwam_id_fk: null },
        ]),
      },
    };
    const ctx = { schedule: null, resolutions: { forDay: () => undefined, forSlot: () => undefined } } as never;
    await expect(engineWith(prisma).getLateByDate(1001, '2026-07-26', '2026-08-25', ctx))
      .resolves.toEqual({ lateWithPermission: 0, lateWithoutPermission: 270 });
    await expect(engineWith(prisma, { lateCapEnabled: false }).getLateByDate(1001, '2026-07-26', '2026-08-25', ctx))
      .resolves.toEqual({ lateWithPermission: 0, lateWithoutPermission: 180 });
    await expect(
      engineWith(prisma, { lateCapThresholdMin: 20, lateCapValueMin: 60 }).getLateByDate(1001, '2026-07-26', '2026-08-25', ctx),
    ).resolves.toEqual({ lateWithPermission: 0, lateWithoutPermission: 120 });
  });
});
