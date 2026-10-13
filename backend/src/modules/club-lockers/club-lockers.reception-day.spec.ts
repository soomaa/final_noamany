import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { cairoDayRange } from '../../common/utils/cairo-day-range.util';
import { ClubLockersService } from './club-lockers.service';

const receptionist = { sub: 10, level: 2, branch: 3, job_title: 'موظف استقبال', man_women_type: 1 };
const query = { page: 1, pageSize: 20, skip: 0, take: 20 };

function setup() {
  const subscriptions = { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) };
  const service = new ClubLockersService(
    { club_locker_subscriptions: subscriptions } as never, {} as never,
    new BranchScopeService(), {} as never, {} as never,
  );
  return { service, subscriptions };
}

describe('reception locker subscription list', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-13T08:00:00Z')); });
  afterEach(() => jest.useRealTimers());

  it('limits rows and totals to registrations today within the branch and section', async () => {
    const { service, subscriptions } = setup();
    await service.listSubscriptions(query as never, receptionist as never);
    const where = { AND: [
      { created_at: { gte: new Date('2026-10-12T21:00:00Z'), lt: new Date('2026-10-13T21:00:00Z') } },
      { main_branch_id: { in: [3] } }, { gender: 'male' },
    ] };
    expect(subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 0, take: 20 }));
    expect(subscriptions.count).toHaveBeenCalledWith({ where });
  });

  it('retains the day restriction alongside search, member, status and historical date filters', async () => {
    const { service, subscriptions } = setup();
    await service.listSubscriptions({ ...query, search: 'LOCK', memberId: '42', status: 'active',
      dateFrom: '2000-01-01', dateTo: '2099-12-31' } as never, receptionist as never);
    const where = subscriptions.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([
      { created_at: cairoDayRange() }, { member_id: 42 },
      { main_branch_id: { in: [3] } }, { gender: 'male' },
      { subscription_start_date: { gte: '2000-01-01', lte: '2099-12-31' } },
    ]));
    expect(where.AND.some((condition: object) => 'OR' in condition)).toBe(true);
    expect(subscriptions.count).toHaveBeenCalledWith({ where });
  });

  it.each([
    { ...receptionist, level: 1 }, { ...receptionist, is_super_admin: true },
    { ...receptionist, level: 3 }, { ...receptionist, job_title: 'مشرف استقبال' },
  ])('preserves historical lists for administrators and supervisors: %j', async user => {
    const { service, subscriptions } = setup();
    await service.listSubscriptions(query as never, user as never);
    expect(subscriptions.findMany.mock.calls[0][0].where.AND ?? [])
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ created_at: expect.anything() })]));
  });

  it.each([
    ['2026-01-13T08:00:00Z', '2026-01-12T22:00:00Z', '2026-01-13T22:00:00Z'],
    ['2026-04-24T08:00:00Z', '2026-04-23T22:00:00Z', '2026-04-24T21:00:00Z'],
    ['2026-10-29T08:00:00Z', '2026-10-28T21:00:00Z', '2026-10-29T22:00:00Z'],
    ['2026-10-12T22:00:00Z', '2026-10-12T21:00:00Z', '2026-10-13T21:00:00Z'],
  ])('uses Cairo day boundaries for %s, independently of server timezone', (now, start, end) => {
    expect(cairoDayRange(new Date(now))).toEqual({ gte: new Date(start), lt: new Date(end) });
  });
});
