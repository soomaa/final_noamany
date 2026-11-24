import { BadRequestException } from '@nestjs/common';
import { HrPayrollSettingsService, invalidateHrPayrollSettingsCache } from './hr-payroll-settings.service';
import { defaultHrPayrollSettings } from './hr-payroll-settings.defaults';

describe('HrPayrollSettingsService', () => {
  beforeEach(() => invalidateHrPayrollSettingsCache());

  it('uses the defaults when the table is missing (never fails payroll)', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error("Table 'hr_payroll_settings' doesn't exist")) };
    const service = new HrPayrollSettingsService(prisma as never);
    await expect(service.get()).resolves.toEqual(defaultHrPayrollSettings());
  });

  it('overlays stored values, ignores invalid ones, and caches the read', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { setting_key: 'permittedLateDeduct', setting_value: 'false', updated_by: 1, updated_by_name: 'HR', updated_at: new Date() },
        { setting_key: 'missingPunchFirstDays', setting_value: '0.5', updated_by: 1, updated_by_name: 'HR', updated_at: new Date() },
        { setting_key: 'hoursPerDay', setting_value: '"abc"', updated_by: 1, updated_by_name: 'HR', updated_at: new Date() },
        { setting_key: 'unknownKey', setting_value: '1', updated_by: 1, updated_by_name: 'HR', updated_at: new Date() },
      ]),
    };
    const service = new HrPayrollSettingsService(prisma as never);
    const values = await service.get();
    expect(values.permittedLateDeduct).toBe(false);
    expect(values.missingPunchFirstDays).toBe(0.5);
    expect(values.hoursPerDay).toBe(8);
    await service.get();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid value and an unknown key without writing', async () => {
    const tx = { $executeRaw: jest.fn() };
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]), $transaction: jest.fn((fn) => fn(tx)) };
    const service = new HrPayrollSettingsService(prisma as never);
    await expect(service.save({ workingDaysPerMonth: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.save({ nope: 1 })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('saves values (null resets to default) and invalidates the cache', async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1) };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((fn) => fn(tx)),
      employees: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new HrPayrollSettingsService(prisma as never);
    await service.get();
    await service.save({ permittedLateRatePercent: '50', lateCapEnabled: null, deductionExemptEmpCodes: '27, 2' }, { sub: 3, name: 'Owner' } as never);
    const sql = tx.$executeRaw.mock.calls.map(([q]: [{ strings: string[]; values: unknown[] }]) => q);
    expect(sql).toHaveLength(3);
    expect(sql[0].values).toEqual(['permittedLateRatePercent', '50', 3, 'Owner']);
    expect(sql[1].strings.join('?')).toContain('DELETE FROM hr_payroll_settings');
    expect(sql[2].values).toEqual(['deductionExemptEmpCodes', '[27,2]', 3, 'Owner']);
    // view() after save re-reads the table.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
