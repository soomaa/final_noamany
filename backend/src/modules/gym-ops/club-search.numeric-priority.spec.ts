import { ClubSearchService } from './club-search.service';

function member(row: {
  id: number;
  member_code: string;
  name: string;
  phone?: string | null;
  card_number?: string | null;
}) {
  return {
    phone: row.phone ?? null,
    card_number: row.card_number ?? null,
    branch_id: 1,
    is_active: true,
    ...row,
  };
}

describe('ClubSearchService numeric code priority', () => {
  it('puts the exact code and its shortest prefix ahead of incidental phone matches', async () => {
    const prisma = {
      club_members: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            member({ id: 7, member_code: '7', name: 'العضو 7' }),
            member({ id: 70, member_code: '70', name: 'العضو 70' }),
          ])
          .mockResolvedValueOnce([
            member({
              id: 2927,
              member_code: '2927',
              name: 'هالة',
              phone: '0102929715',
            }),
          ])
          .mockResolvedValue([]),
      },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_attendance: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ClubSearchService(prisma as never, {} as never);

    const hits = await service.universalSearch('7');

    expect(hits.map((hit) => hit.memberCode)).toEqual(['7', '70', '2927']);
  });

  it('normalizes Arabic digits before querying and selecting the top match', async () => {
    const exact = member({ id: 7, member_code: '7', name: 'العضو 7' });
    const prisma = {
      club_members: {
        findMany: jest.fn().mockResolvedValueOnce([exact]).mockResolvedValue([]),
      },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_attendance: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const entitlement = {
      validate: jest.fn().mockResolvedValue({ allowed: true }),
    };
    const service = new ClubSearchService(prisma as never, entitlement as never);

    const result = await service.searchWithEntitlement('٧');

    expect(result.topMatch?.memberCode).toBe('7');
    expect(prisma.club_members.findMany).toHaveBeenNthCalledWith(1,
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([{ member_code: '7' }, { member_code: { startsWith: '7' } }]),
            }),
          ]),
        }),
      }),
    );
  });
});
