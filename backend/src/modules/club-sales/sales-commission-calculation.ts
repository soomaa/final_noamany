import { pickCommissionTier } from './club-sales.constants';

export function resolveSalesCommission(
    settings: {
      commission_mode: string;
      flat_commission_percent: unknown;
      tiers: Array<{ min_achievement_pct: unknown; max_achievement_pct: unknown; commission_percent: unknown; label?: string | null }>;
    } | null,
    achievementPct: number,
    revenue: number,
  ) {
    if (!settings) return { mode: 'flat', percent: 0, amount: 0, tierLabel: null as string | null };
    if (settings.commission_mode === 'tiered') {
      const tier = pickCommissionTier(
        settings.tiers.map((row) => ({
          minAchievementPct: Number(row.min_achievement_pct),
          maxAchievementPct: row.max_achievement_pct == null ? null : Number(row.max_achievement_pct),
          commissionPercent: Number(row.commission_percent),
          label: row.label ?? null,
        })),
        achievementPct,
      );
      const percent = tier?.commissionPercent ?? 0;
      return { mode: 'tiered', percent, amount: Math.round(revenue * percent) / 100, tierLabel: tier?.label ?? null };
    }
    const percent = Number(settings.flat_commission_percent) || 0;
    return { mode: 'flat', percent, amount: Math.round(revenue * percent) / 100, tierLabel: null };
  }

