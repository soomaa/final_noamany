import { rateBucket, subscriptionUtilizationReport, utilizationFigures, utilizationStatus } from './club-subscription-utilization';

const base = {
  status: 'active',
  subscription_start_date: '2026-11-01',
  subscription_end_date: '2026-11-30',
  is_linked_to_sessions: false,
  sessions_count: null,
  sessions_used: 0,
};

describe('member commitment (subscription utilization)', () => {
  it('rates by distinct attendance days over elapsed days', () => {
    const figures = utilizationFigures(base, { entries: 12, days: 9, lastDate: '2026-11-17' }, '2026-11-11');
    expect(figures).toMatchObject({ totalDays: 29, attendanceDays: 9, attendanceEntries: 12, attendanceRate: 90, remainingDays: 19, status: 'active' });
    expect(rateBucket(figures.attendanceRate)).toBe('high');
  });

  it('rates session packages by sessions used', () => {
    const sub = { ...base, is_linked_to_sessions: true, sessions_count: 10, sessions_used: 3 };
    expect(utilizationFigures(sub, { entries: 3, days: 3, lastDate: null }, '2026-11-20').attendanceRate).toBe(30);
    expect(rateBucket(30)).toBe('low');
    expect(rateBucket(40)).toBe('medium');
    expect(rateBucket(75)).toBe('high');
  });

  it('decides status like the profile summary', () => {
    expect(utilizationStatus({ ...base, status: 'frozen' }, '2026-11-10')).toBe('frozen');
    expect(utilizationStatus(base, '2026-10-30')).toBe('upcoming');
    expect(utilizationStatus(base, '2026-12-01')).toBe('expired');
    expect(utilizationStatus({ ...base, is_linked_to_sessions: true, sessions_count: 5, sessions_used: 5 }, '2026-11-10')).toBe('expired');
  });

  it('filters by commitment level, sorts by rate and counts each level', async () => {
    const member = { id: 1, member_code: 'M1', name: 'A', phone: null, profile_picture: null, branch_id: 1 };
    const subs = [11, 12, 13].map((id) => ({ ...base, id, subscription_number: `S${id}`, subscription_type: 'شهر', branch_id: 1, member }));
    const findMany = jest.fn().mockResolvedValue(subs);
    const prisma = {
      club_subscriptions: { findMany },
      $queryRaw: jest.fn().mockResolvedValue([
        { subscription_id: 11, entries: 10n, days: 9n, last_date: '2026-11-10' },
        { subscription_id: 12, entries: 5n, days: 5n, last_date: '2026-11-09' },
        { subscription_id: 13, entries: 1n, days: 1n, last_date: '2026-11-02' },
      ]),
    };
    const q = { page: 1, pageSize: 20, skip: 0, take: 20, status: 'active', order: 'asc', sort: 'attendanceRate' } as never;
    const result = await subscriptionUtilizationReport(prisma as never, q, { branchIds: [1], gender: 'female', today: '2026-11-11' });
    expect(result.data.map((row) => row.attendanceRate)).toEqual([10, 50, 90]);
    expect(result.buckets).toEqual({ all: 3, high: 1, medium: 1, low: 1 });
    const where = findMany.mock.calls[0][0].where;
    expect(where.branch_id).toEqual({ in: [1] });
    expect(where.member.is.gender).toBe('female');

    const lowOnly = await subscriptionUtilizationReport(prisma as never, { ...(q as object), rateBucket: 'low' } as never, { branchIds: null, gender: null, today: '2026-11-11' });
    expect(lowOnly.total).toBe(1);
    expect(lowOnly.data[0].subscriptionNumber).toBe('S13');
  });
});
