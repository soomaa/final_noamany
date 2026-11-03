import { ClubSearchService } from './club-search.service';

const member = (id: number, memberCode: string, name: string, phone: string | null = null) => ({
  id, member_code: memberCode, name, phone, card_number: null, branch_id: 2, is_active: true,
});

function service(exact: unknown[], candidates: unknown[]) {
  const findMany = jest.fn()
    .mockResolvedValueOnce(exact)
    .mockResolvedValueOnce(candidates)
    .mockResolvedValue([]);
  const prisma = { club_members: { findMany }, club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) }, club_attendance: { findMany: jest.fn().mockResolvedValue([]) } };
  return { search: new ClubSearchService(prisma as never, {} as never), findMany };
}

describe('ClubSearchService.universalSearch', () => {
  it('ranks the exact code first, then codes starting with the query, before name and phone matches', async () => {
    const { search } = service([member(3, 'A12', 'Sara')], [
      member(1, 'B900', 'A12 Ahmed'),
      member(2, 'A120', 'Mona'),
      member(4, 'C77', 'Omar', '01000A12'),
    ]);
    const hits = await search.universalSearch('A12');
    expect(hits.map((h) => h.memberCode)).toEqual(['A12', 'A120', 'B900', 'C77']);
    expect(hits[0].matchType).toBe('code');
  });

  it('keeps an exact code match even when it is not among the recent candidates', async () => {
    const recent = Array.from({ length: 30 }, (_, i) => member(100 + i, `X${i}`, `A12 name ${i}`));
    const { search } = service([member(7, 'A12', 'Old member')], recent);
    const hits = await search.universalSearch('A12');
    expect(hits[0]).toMatchObject({ id: 7, memberCode: 'A12' });
    expect(hits).toHaveLength(10);
  });
});
