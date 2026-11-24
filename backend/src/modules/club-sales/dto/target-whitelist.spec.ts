import { ValidationPipe } from '@nestjs/common';
import { UpsertSalesRepSettingsDto, UpsertTrainerCommissionDto } from './leads.dto';

/**
 * The app runs its global pipe with `whitelist: true`, which deletes every property that
 * carries no validation decorator. `@Type(() => Number)` is a transform, not a validation,
 * so a number declared with only `@Type` was silently removed from the request body and
 * written to the database as 0.
 *
 * That is exactly what happened to the sales target: the manager typed a number, saved,
 * reopened the dialog, and found it empty — every single time, with no error anywhere.
 * These tests run the real pipe, so the numbers have to survive it.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const run = <T>(metatype: new () => T, body: Record<string, unknown>) =>
  pipe.transform(body, { type: 'body', metatype }) as Promise<T>;

describe('target values survive the global validation pipe', () => {
  it('keeps the sales specialist monthly target', async () => {
    const dto = await run(UpsertSalesRepSettingsDto, {
      employeeId: 5,
      monthlyTarget: 50000,
      commissionMode: 'flat',
      flatCommissionPercent: 7,
    });
    expect(dto.monthlyTarget).toBe(50000);
  });

  it('converts a target typed as text, because form inputs send strings', async () => {
    const dto = await run(UpsertSalesRepSettingsDto, {
      employeeId: 5,
      monthlyTarget: '50000',
      commissionMode: 'flat',
    });
    expect(dto.monthlyTarget).toBe(50000);
  });

  it('keeps a zero target rather than dropping the field', async () => {
    const dto = await run(UpsertSalesRepSettingsDto, {
      employeeId: 5,
      monthlyTarget: 0,
      commissionMode: 'flat',
    });
    expect(dto.monthlyTarget).toBe(0);
  });

  it('keeps the trainer base target', async () => {
    const dto = await run(UpsertTrainerCommissionDto, {
      employeeId: 9,
      targetUnit: 'money',
      baseTarget: 12000,
      tiers: [{ minAchievementPct: 0, maxAchievementPct: null, commissionPercent: 5 }],
    });
    expect(dto.baseTarget).toBe(12000);
  });

  it('keeps every number on a commission tier', async () => {
    const dto = await run(UpsertSalesRepSettingsDto, {
      employeeId: 5,
      monthlyTarget: 1000,
      commissionMode: 'tiered',
      tiers: [
        { minAchievementPct: 80, maxAchievementPct: 100, commissionPercent: 10, label: 'على التارجت' },
      ],
    });
    expect(dto.tiers?.[0]).toMatchObject({
      minAchievementPct: 80,
      maxAchievementPct: 100,
      commissionPercent: 10,
      label: 'على التارجت',
    });
  });

  it('rejects a negative target instead of storing it', async () => {
    await expect(run(UpsertSalesRepSettingsDto, {
      employeeId: 5,
      monthlyTarget: -1,
      commissionMode: 'flat',
    })).rejects.toThrow();
  });
});
