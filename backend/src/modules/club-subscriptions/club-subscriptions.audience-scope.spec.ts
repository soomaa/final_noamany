import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubSubscriptionsService } from './club-subscriptions.service';

describe('ClubSubscriptionsService audience authorization', () => {
  const prisma = {
    club_subscriptions: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    club_receipts: {
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    club_members: {
      findUnique: jest.fn().mockResolvedValue({ gender: 'male', is_deleted: false }),
    },
    users: { findMany: jest.fn().mockResolvedValue([]) },
    tbl_branches: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new ClubSubscriptionsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    new BranchScopeService(),
    {} as never,
    {} as never,
  );
  const menUser = { sub: 9, level: 3, branch: 5, man_women_type: 0 } as never;

  beforeEach(() => jest.clearAllMocks());

  it('scopes both rows and count to the JWT audience even when the query asks for women', async () => {
    await service.list({ page: 1, pageSize: 25, skip: 0, take: 25, gender: 'female' } as never, menUser);
    const rowsWhere = prisma.club_subscriptions.findMany.mock.calls[0][0].where;
    const countWhere = prisma.club_subscriptions.count.mock.calls[0][0].where;

    expect(rowsWhere.AND).toContainEqual({
      member: { is: { is_deleted: false, gender: 'male' } },
    });
    expect(rowsWhere.AND).not.toContainEqual({ gender: 'male' });
    expect(rowsWhere.AND).not.toContainEqual({ gender: 'female' });
    expect(countWhere).toEqual(rowsWhere);
  });

  it('rejects direct detail access to a women subscription in the same branch', async () => {
    prisma.club_subscriptions.findUnique.mockResolvedValue({ id: 4, branch_id: 5, gender: 'female' });
    await expect(service.findOne(4, menUser)).rejects.toThrow('لا تملك صلاحية الوصول لبيانات هذا القسم');
  });

  it('derives accounting-day audience from the canonical member when the legacy snapshot is null', async () => {
    const gender = await (service as unknown as {
      assertSubscriptionAccess: (
        user: unknown,
        subscription: { branch_id: number; member_id: number; gender: null },
      ) => Promise<string | null>;
    }).assertSubscriptionAccess(menUser, { branch_id: 5, member_id: 12, gender: null });

    expect(gender).toBe('male');
  });

  it('allows an admin report filter but applies it to both subscription and receipt analytics', async () => {
    await service.userAnalytics({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      gender: 'female',
    }, { sub: 1, level: 1, branch: 0, man_women_type: -1 } as never);

    expect(prisma.club_subscriptions.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        member: { is: { is_deleted: false, gender: 'female' } },
      }),
    }));
    expect(prisma.club_receipts.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{
          OR: [
            {
              subscription_id: { not: null },
              subscription: { is: { member: { is: { is_deleted: false, gender: 'female' } } } },
            },
            {
              subscription_id: null,
              locker_subscription_id: { not: null },
              locker_subscription: { is: { member: { is: { is_deleted: false, gender: 'female' } } } },
            },
            {
              subscription_id: null,
              locker_subscription_id: null,
              member_id: { not: null },
              member: { is: { is_deleted: false, gender: 'female' } },
            },
          ],
        }]),
      }),
    }));
  });
});
