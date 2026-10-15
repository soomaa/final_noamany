import { ClubSearchService } from './club-search.service';

function makeService() {
  const prisma = {
    club_members: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    club_subscriptions: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    club_attendance: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new ClubSearchService(prisma as never, {} as never);
  return { service, prisma };
}

describe('reception member gender filter', () => {
  it('treats a scanned full membership code as the exact top match', async () => {
    const { service, prisma } = makeService();
    prisma.club_members.findMany.mockResolvedValue([
      {
        id: 1352,
        member_code: 'B001352',
        name: 'فادي كمال عرفه',
        phone: '01210370392',
        card_number: null,
        branch_id: 2,
        gender: 'male',
        is_active: true,
      },
    ]);

    const hits = await service.universalSearch('B001352', [2]);

    expect(hits).toEqual([
      expect.objectContaining({
        id: 1352,
        memberCode: 'B001352',
        branchId: 2,
        matchType: 'code',
        score: 1000,
      }),
    ]);
  });

  it('intersects universal member search with branch and gender', async () => {
    const { service, prisma } = makeService();

    await service.universalSearch('منى', [2], 10, 'female');

    expect(prisma.club_members.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { is_deleted: false },
            { branch_id: { in: [2] } },
            { gender: 'female' },
          ]),
        },
      }),
    );
  });

  it('filters recent check-ins through the current member gender', async () => {
    const { service, prisma } = makeService();

    await service.recentCheckIns(20, [2], 'male');

    expect(prisma.club_attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          member: { is_deleted: false, gender: 'male' },
          branch_id: { in: [2] },
        },
        include: { member: { select: { gender: true } } },
      }),
    );
  });
});
