import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { addDays } from './club-subscription.utils';
import { ClubSubscriptionsService } from './club-subscriptions.service';
import { ListClubSubscriptionsDto } from './dto/list-club-subscriptions.dto';

/** «اشتراكات على وشك الانتهاء»: expiring / expired tabs on GET /club-subscriptions. */
const admin = { sub: 1, level: 1, branch: 0 } as JwtUser;

function makePrisma() {
  return {
    club_subscriptions: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    users: { findMany: jest.fn().mockResolvedValue([]) },
    tbl_branches: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  };
}

const query = (patch: Partial<ListClubSubscriptionsDto>) => Object.assign(new ListClubSubscriptionsDto(), patch);

describe('subscriptions list — expiring / expired filters', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: ClubSubscriptionsService;
  const where = () => prisma.club_subscriptions.findMany.mock.calls[0][0].where.AND as unknown[];
  const orderBy = () => prisma.club_subscriptions.findMany.mock.calls[0][0].orderBy;
  const today = localDateString();

  beforeEach(() => {
    prisma = makePrisma();
    service = new ClubSubscriptionsService(
      prisma as never, {} as never, {} as never, {} as never, {} as never,
      new BranchScopeService(), { isSuperAdmin: jest.fn(async () => true) } as never, {} as never, {} as never,
      { sharesGroup: async () => false, siblingBranchIds: async (id: number) => [id] },
    );
  });

  it('expiresWithinDays uses Cairo calendar days from today', async () => {
    await service.list(query({ expiresWithinDays: '7', status: 'active' }), admin);
    expect(where()).toContainEqual({ subscription_end_date: { gte: today, lte: addDays(today, 7) } });
  });

  it('expiresWithinDays=0 means ending today only', async () => {
    await service.list(query({ expiresWithinDays: '0' }), admin);
    expect(where()).toContainEqual({ subscription_end_date: { gte: today, lte: today } });
  });

  it('ignores a non-integer or negative day count', async () => {
    await service.list(query({ expiresWithinDays: '-3', expiredWithinDays: 'abc' }), admin);
    expect(JSON.stringify(where())).not.toContain('subscription_end_date');
  });

  it('expiredWithinDays keeps subscriptions that ended in the last N days, not today', async () => {
    await service.list(query({ expiredWithinDays: '30', status: 'expired' }), admin);
    expect(where()).toContainEqual({ subscription_end_date: { gte: addDays(today, -30), lt: today } });
  });

  it('notRenewed hides members who already have a current or upcoming subscription', async () => {
    await service.list(query({ status: 'expired', notRenewed: 'true' }), admin);
    expect(where()).toContainEqual({
      member_id: { not: null },
      member: { is: { subscriptions: { none: { subscription_end_date: { gte: today } } } } },
    });
  });

  it('sorts by end date when asked and keeps newest-first by default', async () => {
    await service.list(query({ sort: 'endDateAsc' }), admin);
    expect(orderBy()).toEqual([{ subscription_end_date: 'asc' }, { id: 'asc' }]);
    prisma.club_subscriptions.findMany.mockClear();
    await service.list(query({}), admin);
    expect(orderBy()).toEqual({ id: 'desc' });
  });

  it('combines with the رجالي/حريمي filter', async () => {
    await service.list(query({ expiresWithinDays: '7', gender: 'female' }), admin);
    expect(JSON.stringify(where())).toContain('"female"');
  });
});
