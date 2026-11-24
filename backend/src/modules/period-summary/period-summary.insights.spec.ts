import { RESOURCE_TREE } from '../rbac/catalog/rbac.catalog';
import {
  branchManagerCells,
  captainCells,
  defaultPermissionCellsForJobTitle,
  receptionCells,
} from '../rbac/job-title-defaults';
import { buildInsights } from './period-summary.insights';
import { durationBucket, hasComparableData } from './period-summary.service';
import type { PeriodSummary, PeriodTotals } from './period-summary.types';

const totals = (over: Partial<PeriodTotals> = {}): PeriodTotals => ({
  revenue: 500_000,
  subscriptionRevenue: 500_000,
  barRevenue: 0,
  productRevenue: 0,
  inbodyRevenue: 0,
  spaRevenue: 0,
  lockerRevenue: 0,
  expenses: 200_000,
  netProfit: 300_000,
  margin: 60,
  subscriptions: 100,
  newMembers: 40,
  outstanding: 0,
  ...over,
});

function input(over: Partial<Omit<PeriodSummary, 'insights' | 'skipped'>> = {}): Omit<PeriodSummary, 'insights' | 'skipped'> {
  return {
    filters: {
      start: '2026-01-01', end: '2026-06-30', days: 181, prevStart: '2025-07-04', prevEnd: '2025-12-31',
      yoyStart: '2025-01-01', yoyEnd: '2025-06-30', branchIds: null, branchNames: [], branchLabel: 'كل الفروع',
      groupId: null, gender: null, genderLabel: 'الكل', generatedAt: '2026-11-24T10:00:00Z', today: '2026-11-24',
    },
    current: totals(),
    previous: totals({ newMembers: 40 }),
    previousAvailable: true,
    yoy: { available: false, totals: totals(), monthly: [] },
    monthly: [],
    revenueBreakdown: [],
    expenseBreakdown: [],
    branches: [],
    durations: [],
    packages: [],
    discounts: {
      totalCount: 100, discountedCount: 0, share: 0, grossTotal: 500_000, discountTotal: 0,
      discountShareOfGross: 0, prevDiscountShareOfGross: null, topEmployees: [], threshold: 30,
      aboveThresholdCount: 0, aboveThresholdAmount: 0,
    },
    outstanding: { amount: 0, members: 0, subscriptions: 0, olderThan30Amount: 0, olderThan30Count: 0 },
    renewal: { ended: 0, renewed: 0, rate: null, worstPackage: null },
    attendance: { evaluated: 0, low: 0, share: null, threshold: 30, avgRate: null },
    peaks: [],
    freezes: { count: 0, prevCount: 0, totalDays: 0, avgDays: null, members: 0, longFreezes: 0, longFreezeDays: 0, repeatMembers: 0 },
    notes: [],
    ...over,
  };
}

describe('period summary insights', () => {
  it("raises the owner's discount question when discounts are a big share of gross value", () => {
    const { insights } = buildInsights(input({
      discounts: {
        totalCount: 100, discountedCount: 60, share: 60, grossTotal: 500_000, discountTotal: 200_000,
        discountShareOfGross: 40, prevDiscountShareOfGross: null, threshold: 30, aboveThresholdCount: 12,
        aboveThresholdAmount: 90_000,
        topEmployees: [{ employeeId: 7, name: 'أحمد', count: 30, amount: 120_000, avgPct: 45 }],
      },
    }));
    const volume = insights.find((i) => i.id === 'discount-volume')!;
    expect(volume.tone).toBe('bad');
    expect(volume.text).toContain('هل موافقين');
    expect(insights.find((i) => i.id === 'discount-employees')!.text).toContain('أحمد');
    expect(insights.find((i) => i.id === 'discount-threshold')).toBeDefined();
  });

  it('stays quiet about small things and reports missing data as skipped', () => {
    const { insights, skipped } = buildInsights(input());
    expect(insights.map((i) => i.id)).toEqual([]);
    const ids = skipped.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['discount-volume', 'renewal', 'low-attendance', 'peaks', 'freezes', 'best-worst-month']));
  });

  it('hides ↑/↓ comparisons when the previous period has no data', () => {
    const { insights, skipped } = buildInsights(input({
      previous: totals({ revenue: 100, newMembers: 1 }),
      previousAvailable: false,
    }));
    expect(insights.find((i) => i.id === 'revenue-trend')).toBeUndefined();
    expect(insights.find((i) => i.id === 'new-members')).toBeUndefined();
    expect(skipped.map((s) => s.id)).toContain('comparisons');
  });

  it('skips expense insights for a men/women section (expenses are not split by section)', () => {
    const base = input({ expenseBreakdown: [{ name: 'الرواتب', value: 200_000 }] });
    const { insights, skipped } = buildInsights({ ...base, filters: { ...base.filters, gender: 'female' } });
    expect(insights.find((i) => i.id === 'top-expense')).toBeUndefined();
    expect(skipped.find((s) => s.id === 'top-expense')?.reason).toContain('رجالي/حريمي');
  });

  it('flags a branch whose expenses grow faster than its revenue', () => {
    const { insights } = buildInsights(input({
      branches: [{ branchId: 2, branchName: 'طنطا', revenue: 110, expenses: 150, profit: -40, prevRevenue: 100, prevExpenses: 100, subscriptions: 5, newMembers: 1 }],
    }));
    expect(insights.find((i) => i.id === 'expense-growth')!.text).toContain('طنطا');
  });

  it('ignores the running month and data gaps when picking the best/worst month', () => {
    const month = (m: string, revenue: number, expenses: number) => ({ month: m, revenue, expenses, profit: revenue - expenses, subscriptions: 10 });
    const { insights } = buildInsights(input({
      monthly: [month('2026-01', 100_000, 50_000), month('2026-02', 80_000, 60_000), month('2026-03', 150_000, 40_000), month('2026-04', 500, 0), month('2026-11', 10, 0)],
    }));
    const text = insights.find((i) => i.id === 'best-worst-month')!.text;
    expect(text).toContain('مارس');
    expect(text).toContain('فبراير');
    expect(text).not.toContain('أبريل');
    expect(text).not.toContain('نوفمبر');
  });
});

describe('period summary helpers', () => {
  it('buckets subscriptions by real duration', () => {
    expect(durationBucket(0).key).toBe('day');
    expect(durationBucket(29).key).toBe('m1');
    expect(durationBucket(59).key).toBe('m2');
    expect(durationBucket(89).key).toBe('m3');
    expect(durationBucket(179).key).toBe('m6');
    expect(durationBucket(359).key).toBe('y1');
  });

  it('treats a near-empty comparison period as unavailable', () => {
    expect(hasComparableData(totals(), totals({ revenue: 670 }))).toBe(false);
    expect(hasComparableData(totals(), totals({ revenue: 300_000 }))).toBe(true);
  });
});

describe('period summary permission', () => {
  it('lives under the admin module in the RBAC catalog', () => {
    const admin = RESOURCE_TREE.find((node) => node.key === 'admin');
    const page = admin?.children?.find((node) => node.key === 'admin.period_summary');
    expect(page?.route).toBe('/reports/period-summary');
  });

  it('is never granted to managers, captains or reception by job-title defaults', () => {
    const cells = [
      ...defaultPermissionCellsForJobTitle('مدير عام'),
      ...defaultPermissionCellsForJobTitle('مدير فرع'),
      ...defaultPermissionCellsForJobTitle('كابتن'),
      ...branchManagerCells(),
      ...captainCells(),
      ...receptionCells(),
    ];
    // A grant on the page itself or on its ancestor (admin) would expose it.
    expect(cells.filter((c) => c.resourceKey === 'admin' || c.resourceKey === 'admin.period_summary')).toEqual([]);
  });
});
