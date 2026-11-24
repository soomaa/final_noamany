/** «ملخص الفترة» response — mirrors backend/src/modules/period-summary/period-summary.types.ts. */

export type MemberSection = 'male' | 'female';

export interface PeriodTotals {
  revenue: number;
  subscriptionRevenue: number;
  barRevenue: number;
  productRevenue: number;
  inbodyRevenue: number;
  spaRevenue: number;
  lockerRevenue: number;
  expenses: number;
  netProfit: number;
  margin: number | null;
  subscriptions: number;
  newMembers: number;
  outstanding: number;
}

export interface MonthPoint {
  month: string; // YYYY-MM
  revenue: number;
  expenses: number;
  profit: number;
  subscriptions: number;
}

export interface BranchRow {
  branchId: number;
  branchName: string;
  revenue: number;
  expenses: number;
  profit: number;
  prevRevenue: number;
  prevExpenses: number;
  subscriptions: number;
  newMembers: number;
}

export interface DurationRow {
  key: string;
  label: string;
  count: number;
  gross: number;
  discount: number;
  paid: number;
}

export interface PackageRow {
  name: string;
  count: number;
  paid: number;
  discountPct: number;
  ended: number;
  renewed: number;
  renewalRate: number | null;
}

export interface DiscountEmployee {
  employeeId: number | null;
  name: string;
  count: number;
  amount: number;
  avgPct: number;
}

export interface DiscountStats {
  totalCount: number;
  discountedCount: number;
  share: number | null;
  grossTotal: number;
  discountTotal: number;
  discountShareOfGross: number | null;
  prevDiscountShareOfGross: number | null;
  topEmployees: DiscountEmployee[];
  threshold: number;
  aboveThresholdCount: number;
  aboveThresholdAmount: number;
}

export interface OutstandingStats {
  amount: number;
  members: number;
  subscriptions: number;
  olderThan30Amount: number;
  olderThan30Count: number;
}

export interface RenewalStats {
  ended: number;
  renewed: number;
  rate: number | null;
  worstPackage: { name: string; ended: number; renewed: number; rate: number } | null;
}

export interface AttendanceStats {
  evaluated: number;
  low: number;
  share: number | null;
  threshold: number;
  avgRate: number | null;
}

export interface PeakRow {
  branchId: number;
  branchName: string;
  checkins: number;
  topDay: string | null;
  topDayShare: number | null;
  topHour: number | null;
  topHourShare: number | null;
  quietHour: number | null;
}

export interface FreezeStats {
  count: number;
  prevCount: number;
  totalDays: number;
  avgDays: number | null;
  members: number;
  longFreezes: number;
  longFreezeDays: number;
  repeatMembers: number;
}

export type InsightTone = 'good' | 'warn' | 'bad' | 'info';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  text: string;
}

export interface SkippedInsight {
  id: string;
  title: string;
  reason: string;
}

export interface PeriodSummaryFilters {
  start: string;
  end: string;
  days: number;
  prevStart: string;
  prevEnd: string;
  yoyStart: string;
  yoyEnd: string;
  branchIds: number[] | null;
  branchNames: string[];
  branchLabel: string;
  groupId: number | null;
  gender: MemberSection | null;
  genderLabel: string;
  generatedAt: string;
  /** Cairo date the summary was computed on. */
  today: string;
}

export interface PeriodSummary {
  filters: PeriodSummaryFilters;
  current: PeriodTotals;
  previous: PeriodTotals;
  /** false when the previous period has (almost) no data — ↑/↓ comparisons are hidden. */
  previousAvailable: boolean;
  yoy: { available: boolean; totals: PeriodTotals; monthly: Array<{ month: string; current: number; previous: number }> };
  monthly: MonthPoint[];
  revenueBreakdown: Array<{ key: string; name: string; value: number }>;
  expenseBreakdown: Array<{ name: string; value: number }>;
  branches: BranchRow[];
  durations: DurationRow[];
  packages: PackageRow[];
  discounts: DiscountStats;
  outstanding: OutstandingStats;
  renewal: RenewalStats;
  attendance: AttendanceStats;
  peaks: PeakRow[];
  freezes: FreezeStats;
  insights: Insight[];
  skipped: SkippedInsight[];
  notes: string[];
}
