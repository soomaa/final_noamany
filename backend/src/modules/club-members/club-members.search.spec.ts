import { ClubMembersService } from './club-members.service';

describe('member list search normalization and scope', () => {
  it.each([
    ['b٠٠٠٠٩٠', 'B000090', 'B000090'],
    ['+٢٠ ١٠١٢٣٤٥٦٧٨', '+20 1012345678', '01012345678'],
    ['  منى   محمد  ', 'منى محمد', 'منى محمد'],
  ])('normalizes %s for both page and count without widening the branch', async (input, normalized, phone) => {
    const prisma = { club_members: {
      findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0),
    } };
    const service = new ClubMembersService(prisma as never, {} as never,
      { resolveListFilter: () => [2] } as never, {} as never);
    await service.list({ search: input, page: 1, pageSize: 25, take: 25, skip: 0 } as never);
    const where = prisma.club_members.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([
      { is_deleted: false }, { branch_id: { in: [2] } },
      { OR: expect.arrayContaining([
        { name: { contains: normalized } }, { member_code: { contains: normalized } },
        { phone: { contains: phone } },
      ]) },
    ]));
    expect(prisma.club_members.count).toHaveBeenCalledWith({ where });
  });
});
