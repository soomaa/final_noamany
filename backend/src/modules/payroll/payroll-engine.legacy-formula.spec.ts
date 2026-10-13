import { PayrollEngineService, legacyNetPay, legacyTargetPayable } from './payroll-engine.service';

describe('legacy payroll net formula', () => {
  it('preserves a negative net for review instead of silently flooring it', () => {
    expect(legacyNetPay(1_000, 1_250)).toBe(-250);
  });

  it('rounds the legacy arithmetic to currency precision', () => {
    expect(legacyNetPay(1000.555, 100.111)).toBe(900.44);
  });
});

describe('legacy forgotten fingerprint deduction', () => {
  it('uses 1/4 day, then 1/2 day, then a full day for every later occurrence', async () => {
    const prisma = {
      tbl_hdoor_emps: {
        findMany: jest.fn().mockResolvedValue([
          { hdoor_time: '09:00', ensraf_time: null },
          { hdoor_time: null, ensraf_time: '18:00' },
          { hdoor_time: '09:00', ensraf_time: null },
          { hdoor_time: null, ensraf_time: '18:00' },
          { hdoor_time: '09:00', ensraf_time: '18:00' },
        ]),
      },
    };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const engine = new PayrollEngineService(prisma as never, config as never);

    await expect(
      engine.getForgottenFingerprintByDate(1001, '2026-07-26', '2026-08-25'),
    ).resolves.toEqual({ count: 4, deductionDays: 2.75 });
  });
});

describe('legacy gym rate calculation', () => {
  it('uses the configured target commission unless the payroll officer replaces it', () => {
    expect(legacyTargetPayable(150)).toBe(150);
    expect(legacyTargetPayable(150, 90)).toBe(90);
    expect(legacyTargetPayable(150, 0)).toBe(0);
  });

  it('uses for_user percentages for target, protein, and classes', async () => {
    const prisma = {
      users: { findMany: jest.fn().mockResolvedValue([{ user_id: 9 }]) },
      tbl_gym_setting: { findMany: jest.fn().mockResolvedValue([
        { ttype: 'target', for_user: 10 },
        { ttype: 'proten', for_user: 7 },
        { ttype: 'classes', for_user: 40 },
      ]) },
      club_receipts: { aggregate: jest.fn()
        .mockResolvedValueOnce({ _sum: { amount: 1_000 } })
        .mockResolvedValueOnce({ _sum: { amount: 100 } }) },
      club_locker_subscriptions: { aggregate: jest.fn().mockResolvedValue({ _sum: { paid_amount: 500 } }) },
      sales_quick_sales: { aggregate: jest.fn().mockResolvedValue({ _sum: { collected_amount: 200 } }) },
    };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const engine = new PayrollEngineService(prisma as never, config as never);

    await expect(engine.getIncentives(4, 1004, '2026-07-26', '2026-08-25')).resolves.toEqual({
      targetBase: 1_500,
      proteinBase: 200,
      classesBase: 100,
      targetCommission: 150,
      proteinCommission: 14,
      classCommission: 40,
    });
  });
});
