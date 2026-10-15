export type SalesCommissionMode = 'flat' | 'tiered';

export type SalesTier = {
  minAchievementPct: number;
  maxAchievementPct?: number | null;
  commissionPercent: number;
  label?: string | null;
};

export type SalesFinancialSettings = {
  monthlyTarget: number;
  commissionMode: SalesCommissionMode;
  flatCommissionPercent: number;
  targetPeriodMode: 'monthly' | 'custom' | 'days';
  targetStartDate?: string | null;
  targetEndDate?: string | null;
  targetDays?: number | null;
  tiers: SalesTier[];
};

export function validateCommissionTiers(input: SalesTier[]): SalesTier[] {
  const tiers = input.map((tier) => ({
    minAchievementPct: Number(tier.minAchievementPct),
    maxAchievementPct: tier.maxAchievementPct == null ? null : Number(tier.maxAchievementPct),
    commissionPercent: Number(tier.commissionPercent),
    label: tier.label?.trim() || null,
  })).sort((a, b) => a.minAchievementPct - b.minAchievementPct);
  if (!tiers.length) return tiers;
  if (tiers[0].minAchievementPct !== 0) throw new Error('شرائح العمولة يجب أن تبدأ من صفر وتكون متصلة');
  tiers.forEach((tier, index) => {
    if (!Number.isFinite(tier.minAchievementPct) || tier.minAchievementPct < 0) throw new Error('حد الشريحة غير صالح');
    if (tier.maxAchievementPct != null && tier.maxAchievementPct < tier.minAchievementPct) throw new Error('حد الشريحة غير صالح');
    if (!Number.isFinite(tier.commissionPercent) || tier.commissionPercent < 0 || tier.commissionPercent > 100) throw new Error('نسبة العمولة غير صالحة');
    const next = tiers[index + 1];
    if (next && (tier.maxAchievementPct == null || Math.abs(next.minAchievementPct - tier.maxAchievementPct) > 0.011)) {
      throw new Error('شرائح العمولة يجب أن تكون متصلة بلا فجوات أو تداخل');
    }
  });
  return tiers;
}

export function resolveSalesSettings(
  rep: Partial<SalesFinancialSettings> & { useDefaults?: boolean },
  defaults: SalesFinancialSettings,
): SalesFinancialSettings & { source: 'defaults' | 'individual' } {
  return rep.useDefaults
    ? { ...defaults, tiers: [...defaults.tiers], source: 'defaults' }
    : { ...defaults, ...rep, tiers: rep.tiers ? [...rep.tiers] : [...defaults.tiers], source: 'individual' } as SalesFinancialSettings & { source: 'individual' };
}

type DatabaseSalesSettings = {
  monthly_target?: unknown;
  commission_mode?: string;
  flat_commission_percent?: unknown;
  target_period_mode?: string;
  target_start_date?: string | null;
  target_end_date?: string | null;
  target_days?: number | null;
  use_defaults?: boolean;
  tiers?: Array<{
    min_achievement_pct: unknown;
    max_achievement_pct?: unknown;
    commission_percent: unknown;
    label?: string | null;
  }>;
};

function normalizeDatabaseRow(row?: DatabaseSalesSettings | null): SalesFinancialSettings {
  return {
    monthlyTarget: Number(row?.monthly_target ?? 0),
    commissionMode: row?.commission_mode === 'tiered' ? 'tiered' : 'flat',
    flatCommissionPercent: Number(row?.flat_commission_percent ?? 0),
    targetPeriodMode: row?.target_period_mode === 'custom' || row?.target_period_mode === 'days' ? row.target_period_mode : 'monthly',
    targetStartDate: row?.target_start_date ?? null,
    targetEndDate: row?.target_end_date ?? null,
    targetDays: row?.target_days ?? null,
    tiers: (row?.tiers ?? []).map((tier) => ({
      minAchievementPct: Number(tier.min_achievement_pct),
      maxAchievementPct: tier.max_achievement_pct == null ? null : Number(tier.max_achievement_pct),
      commissionPercent: Number(tier.commission_percent),
      label: tier.label ?? null,
    })),
  };
}

export function resolveDatabaseSalesSettings(
  rep: DatabaseSalesSettings | null | undefined,
  defaults: DatabaseSalesSettings | null | undefined,
) {
  return resolveSalesSettings(
    { ...normalizeDatabaseRow(rep), useDefaults: rep ? rep.use_defaults ?? false : true },
    normalizeDatabaseRow(defaults),
  );
}
