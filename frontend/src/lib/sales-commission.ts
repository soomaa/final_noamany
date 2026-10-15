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
  useDefaults: boolean;
  isActive: boolean;
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

export type SalesDefaultSetting = Omit<SalesRepSetting, 'id' | 'name' | 'useDefaults' | 'isActive' | 'branchIds'>;

export interface TrainerCommissionSetting {
  trainerId: number;
  employeeId: number;
  name: string;
  targetUnit: 'members' | 'money';
  baseTarget: number;
  commissionMode: 'attendance' | 'tiered' | 'combined';
  privateCommissionMode: 'salary' | 'fixed';
  privateCommissionPercent: number;
  targetPeriodMode: 'monthly' | 'custom' | 'days';
  targetStartDate: string | null;
  targetEndDate: string | null;
  targetDays: number | null;
  currentCycle?: TargetCycle;
  tiers: CommissionTier[];
}

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
