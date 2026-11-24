import {
  birthdayKey,
  looksLikeBranchName,
  managerInsights,
  percentChange,
  rankPerformance,
  revenueMix,
  summarizeDiscounts,
} from './club-dashboard-manager';

describe('club dashboard manager helpers', () => {
  it('percentChange: signed change with one decimal, null without a base', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 200)).toBe(-75);
    expect(percentChange(1, 3)).toBe(-66.7);
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });

  it('summarizeDiscounts: discount as a share of gross value, honouring discount_enabled', () => {
    const result = summarizeDiscounts([
      { subscription_value: 1000, discount_enabled: true, discount_value: 200 },
      { subscription_value: '500', discount_enabled: true, discount_value: '0' },
      { subscription_value: 500, discount_enabled: false, discount_value: 100 },
      { subscription_value: 100, discount_enabled: true, discount_value: 400 },
    ]);
    expect(result).toEqual({
      subscriptionsCount: 4,
      discountedCount: 2,
      grossValue: 2100,
      discountValue: 300,
      netValue: 1800,
      discountPct: 14.3,
    });
    expect(summarizeDiscounts([])).toMatchObject({ grossValue: 0, discountValue: 0, discountPct: 0 });
  });

  it('revenueMix: rounds parts and totals them', () => {
    expect(revenueMix(100.004, 50.5, 0)).toEqual({ subscriptions: 100, bar: 50.5, products: 0, total: 150.5 });
  });

  it('rankPerformance: ranks by achievement %, flags hit target, drops empty rows', () => {
    const result = rankPerformance([
      { id: 1, name: 'أحمد', achieved: 5000, target: 10000, count: 3, unit: 'money' },
      { id: 2, name: 'منى', achieved: 12000, target: 10000, count: 6, unit: 'money' },
      { id: 3, name: 'بدون تارجت', achieved: 9000, target: 0, count: 4, unit: 'money' },
      { id: 4, name: 'فاضي', achieved: 0, target: 0, count: 0, unit: 'money' },
      { id: 5, name: 'كابتن', achieved: 4, target: 4, count: 4, unit: 'count' },
    ]);
    expect(result.rows.map((row) => row.id)).toEqual([2, 5, 1, 3]);
    expect(result.rows.find((row) => row.id === 2)).toMatchObject({ achievementPct: 120, hitTarget: true });
    expect(result.rows.find((row) => row.id === 3)).toMatchObject({ achievementPct: null, hitTarget: false });
    expect(result.withTarget).toBe(3);
    expect(result.hitCount).toBe(2);
  });

  it('birthdayKey: month and day of an ISO date', () => {
    expect(birthdayKey('2026-11-24')).toBe('11-24');
  });

  it('managerInsights: a failing widget becomes null instead of failing the dashboard', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('db down')),
      club_attendance: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    };
    const permissions = { canAny: jest.fn().mockResolvedValue(false) };
    const result = await managerInsights({
      prisma: prisma as never,
      permissions: permissions as never,
      user: { sub: 9 } as never,
      scopedBranches: [3],
      today: '2026-11-24',
    });
    expect(result).toEqual({ today: null, alerts: null, salesTeam: null, captains: null });
    expect(permissions.canAny).toHaveBeenCalledWith(9, ['club.sales.reports:view', 'club.sales.dashboard:view']);
  });

  it('looksLikeBranchName: flags staff records named after a branch', () => {
    const branches = ['فرع البر الشرقي -شبين الكوم', 'الجلاء'];
    expect(looksLikeBranchName('فرع البر الشرقي', branches)).toBe(true);
    expect(looksLikeBranchName('الجلاء', branches)).toBe(true);
    expect(looksLikeBranchName('كابتن أحمد فرعون', branches)).toBe(false);
    expect(looksLikeBranchName('محمد علي', branches)).toBe(false);
  });
});
