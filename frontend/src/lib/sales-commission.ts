import { uiStatic } from '@/lib/ui-static';
export interface CommissionTier {
  minAchievementPct: number;
  maxAchievementPct: number | null;
  commissionPercent: number;
  label?: string | null;
}

export interface TargetCycle {
  mode: 'monthly' | 'custom' | 'days';
  startDate: string;
  endDate: string;
  resetDate: string;
  payoutDate: string;
  state: 'upcoming' | 'active' | 'completed';
}

export interface SalesRepSetting {
  id: number;
  name: string;
  isActive: boolean;
  useDefaultSettings?: boolean;
  branchId: number | null;
  branchIds: number[];
  monthlyTarget: number;
  targetPeriodMode: 'monthly' | 'custom' | 'days';
  targetStartDate: string | null;
  targetEndDate: string | null;
  targetDays: number | null;
  currentCycle?: TargetCycle;
  commissionMode: 'flat' | 'tiered';
  flatCommissionPercent: number;
  tiers: CommissionTier[];
}

export interface TrainerCommissionSetting {
  commissionMode?: 'attendance' | 'tiered' | 'combined';
  trainerId: number;
  employeeId: number;
  name: string;
  targetUnit: 'members' | 'money';
  baseTarget: number;
  targetPeriodMode: 'monthly' | 'custom' | 'days';
  targetStartDate: string | null;
  targetEndDate: string | null;
  targetDays: number | null;
  currentCycle?: TargetCycle;
  /** Follows the house trainer defaults instead of values frozen on this trainer. */
  useDefaultSettings?: boolean;
  tiers: CommissionTier[];
}

/** The house trainer setup — the same fields, minus whose they are. */
export type TrainerDefaults = Omit<
  TrainerCommissionSetting,
  'trainerId' | 'employeeId' | 'name' | 'useDefaultSettings'
>;

export interface SalesDashboardKpis {
  totalSales: number;
  teamTarget: number;
  achievementPct: number;
  conversionRate: number;
  assignedLeads: number;
  overdueLeads: number;
  totalLeads: number;
}

export interface SalesRepPerformance {
  isActive?: boolean;
  salesRepId: number;
  name: string;
  receivedLeads?: number;
  contacted?: number;
  converted?: number;
  financialTarget: number;
  actual: number;
  achievementPct: number;
  commissionPercent?: number;
  commissionDue?: number;
}

export const defaultCommissionTiers = (): CommissionTier[] => [
  { minAchievementPct: 0, maxAchievementPct: 79.99, commissionPercent: 5, label: 'تحت التارجت' },
  { minAchievementPct: 80, maxAchievementPct: 100, commissionPercent: 10, label: 'على التارجت' },
  { minAchievementPct: 100.01, maxAchievementPct: null, commissionPercent: 15, label: 'فوق التارجت' },
];

/**
 * The bracket a given achievement actually earns — the same rule the server pays by.
 *
 * The dialog used to preview with a plain `find`, so an achievement sitting in a gap
 * between brackets previewed as 0% while the server paid a real rate. Two answers to the
 * same question is worse than either answer.
 */
export function selectCommissionTier(
  tiers: CommissionTier[],
  achievementPct: number,
): CommissionTier | null {
  const sorted = [...tiers].sort((a, b) => a.minAchievementPct - b.minAchievementPct);
  const exact = sorted.find((tier) => achievementPct + 0.0001 >= tier.minAchievementPct
    && (tier.maxAchievementPct == null || achievementPct <= tier.maxAchievementPct + 0.0001));
  if (exact) return exact;
  const passed = sorted.filter((tier) => achievementPct + 0.0001 >= tier.minAchievementPct);
  return passed.length ? passed[passed.length - 1] : null;
}

/**
 * Achievement ranges the brackets do not cover.
 *
 * Typing "من 80 إلى 80" reads like a band but is a single point, so 0-79 and 81-99 fall
 * through. Naming the holes on screen is the difference between a deliberate design and a
 * commission table nobody realises is broken.
 */
export function findCommissionTierGaps(tiers: CommissionTier[]): string[] {
  const sorted = [...tiers]
    .filter((tier) => Number.isFinite(tier.minAchievementPct))
    .sort((a, b) => a.minAchievementPct - b.minAchievementPct);
  if (!sorted.length) return [];

  const gaps: string[] = [];
  if (sorted[0].minAchievementPct > 0) {
    gaps.push(`${uiStatic('٠٪ — ')}${sorted[0].minAchievementPct}${uiStatic('٪')}`);
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const upper = sorted[i].maxAchievementPct;
    const nextFloor = sorted[i + 1].minAchievementPct;
    if (upper == null) break;
    if (nextFloor > upper + 0.01) gaps.push(`${upper}${uiStatic('٪ — ')}${nextFloor}${uiStatic('٪')}`);
  }
  return gaps;
}
