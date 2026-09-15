import { ClubLockersService } from './club-lockers.service';

describe('ClubLockersService report audience scope', () => {
  const query = {
    page: 1,
    pageSize: 25,
    skip: 0,
    take: 25,
    mainBranchId: '3',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
  };

  function makeService(locked: 'male' | 'female' | null) {
    const prisma = {
      club_locker_subscriptions: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      club_members: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([3]),
      memberGenderFilter: jest.fn().mockReturnValue(locked),
    };
    return {
      prisma,
      service: new ClubLockersService(prisma as never, {} as never, branchScope as never),
    };
  }

  it('applies authoritative gender and overlap dates before pagination', async () => {
    const { service, prisma } = makeService('female');
    await service.listSubscriptions(query as never, { sub: 9 } as never);
    const where = prisma.club_locker_subscriptions.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([
      { main_branch_id: { in: [3] } },
      { member: { is_deleted: false, gender: 'female' } },
      { subscription_end_date: { gte: '2026-09-01' } },
      { subscription_start_date: { lte: '2026-09-30' } },
    ]));
  });

  it('rejects attempts to broaden the authenticated audience', async () => {
    const { service } = makeService('male');
    await expect(service.listSubscriptions({ ...query, gender: 'female' } as never, { sub: 9 } as never))
      .rejects.toThrow('لا يمكن تغيير قسم');
  });
});
