import { Prisma } from '@prisma/client';

export type SalesSettingsValues = {
  monthly_target: unknown; commission_mode: string; flat_commission_percent: unknown;
  target_period_mode: string; target_start_date: string | null; target_end_date: string | null; target_days: number | null;
  tiers: Array<{ id?: number; min_achievement_pct: unknown; max_achievement_pct: unknown; commission_percent: unknown; label?: string | null }>;
  is_active?: boolean; use_default_settings?: boolean;
};

export const emptySalesDefaults: SalesSettingsValues = {
  monthly_target: 0, commission_mode: 'flat', flat_commission_percent: 0,
  target_period_mode: 'monthly', target_start_date: null, target_end_date: null, target_days: null, tiers: [],
};

export async function readSalesDefaults(db: Prisma.TransactionClient): Promise<SalesSettingsValues> {
  const row = await db.club_sales_defaults.findUnique({ where: { id: 1 } });
  return row ? { ...emptySalesDefaults, ...(row.settings as object) } : { ...emptySalesDefaults };
}

export function effectiveSalesSettings(personal: SalesSettingsValues | null | undefined, defaults: SalesSettingsValues) {
  const inherited = !personal || personal.use_default_settings === true;
  return { ...(inherited ? defaults : personal), is_active: personal?.is_active ?? true, use_default_settings: inherited };
}
