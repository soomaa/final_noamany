import { resolveSalesSettings, validateCommissionTiers } from './sales-defaults';

describe('sales settings defaults', () => {
  const defaults = {
    monthlyTarget: 25000,
    commissionMode: 'tiered' as const,
    flatCommissionPercent: 0,
    targetPeriodMode: 'monthly' as const,
    targetStartDate: null,
    targetEndDate: null,
    targetDays: null,
    tiers: [
      { minAchievementPct: 0, maxAchievementPct: 99.99, commissionPercent: 4, label: 'أساسي' },
      { minAchievementPct: 100, maxAchievementPct: null, commissionPercent: 7, label: 'محقق' },
    ],
  };

  it('uses global settings only when the rep opts in', () => {
    expect(resolveSalesSettings({ useDefaults: true }, defaults)).toMatchObject({
      monthlyTarget: 25000,
      commissionMode: 'tiered',
      source: 'defaults',
    });
    expect(resolveSalesSettings({ ...defaults, useDefaults: false, monthlyTarget: 31000 }, defaults))
      .toMatchObject({ monthlyTarget: 31000, source: 'individual' });
  });

  it('rejects gaps and overlaps while preserving tier labels', () => {
    expect(() => validateCommissionTiers([
      { minAchievementPct: 0, maxAchievementPct: 50, commissionPercent: 2, label: 'أ' },
      { minAchievementPct: 60, maxAchievementPct: null, commissionPercent: 3, label: 'ب' },
    ])).toThrow('متصلة');
    expect(validateCommissionTiers(defaults.tiers)[1].label).toBe('محقق');
  });
});
