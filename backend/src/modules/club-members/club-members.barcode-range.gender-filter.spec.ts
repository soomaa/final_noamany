import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubMembersService } from './club-members.service';

/** رجالي/حريمي/الكل filter on the barcode print-range lookup. */
describe('ClubMembersService barcodeRange — men/women section filter', () => {
  const men = { sub: 10, level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] } as never;
  const women = { sub: 11, level: 2, branch: 2, man_women_type: 2, member_sections: ['female'] } as never;
  const admin = { sub: 1, level: 1 } as never;

  function build() {
    const prisma = { club_members: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new ClubMembersService(prisma as never, { log: jest.fn() } as never, new BranchScopeService(), {} as never, {} as never);
    const where = () => (prisma.club_members.findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> }).where;
    return { service, prisma, where };
  }

  it("men's employee gets everyone by default, men on a pick, and may open women", async () => {
    const { service, prisma, where } = build();
    await service.barcodeRange('A1', 'A9', men);
    expect(where()).not.toHaveProperty('gender');
    await service.barcodeRange('A1', 'A9', men, 'male');
    expect(where()).toMatchObject({ gender: 'male' });
    await expect(service.barcodeRange('A1', 'A9', men, 'female')).resolves.toBeDefined();
    expect(where()).toMatchObject({ gender: 'female' });
    expect(prisma.club_members.findMany).toHaveBeenCalledTimes(3);
  });

  it("women's employee gets everyone on 'all' and may open men", async () => {
    const { service, where } = build();
    await service.barcodeRange('A1', 'A9', women, 'all');
    expect(where()).not.toHaveProperty('gender');
    await expect(service.barcodeRange('A1', 'A9', women, 'male')).resolves.toBeDefined();
    expect(where()).toMatchObject({ gender: 'male' });
  });

  it('admin filters by the chosen section and is unfiltered otherwise', async () => {
    const { service, where } = build();
    await service.barcodeRange('A1', 'A9', admin, 'female');
    expect(where()).toMatchObject({ gender: 'female' });
    await service.barcodeRange('A1', 'A9', admin);
    expect(where()).not.toHaveProperty('gender');
  });
});
