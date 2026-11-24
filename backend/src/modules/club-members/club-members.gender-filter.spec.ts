import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubMembersService } from './club-members.service';

/** رجالي/حريمي/الكل filter on the members list: the staff section is only the screen default, anyone may choose. */
describe('ClubMembersService list — men/women section filter', () => {
  const men = { sub: 10, level: 2, branch: 2, emp_code: null, man_women_type: 1, member_sections: ['male'] } as never;
  const women = { sub: 11, level: 2, branch: 2, emp_code: null, man_women_type: 2, member_sections: ['female'] } as never;
  const admin = { sub: 1, level: 1, branch: 0, emp_code: null, man_women_type: 0 } as never;

  function build() {
    const prisma = {
      club_members: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new ClubMembersService(
      prisma as never,
      { log: jest.fn() } as never,
      new BranchScopeService(),
      {} as never,
      {} as never,
    );
    const genderClauses = () => {
      const where = prisma.club_members.findMany.mock.calls[0][0].where as { AND: Array<Record<string, unknown>> };
      return where.AND.filter((c) => 'gender' in c).map((c) => c.gender);
    };
    return { service, prisma, genderClauses };
  }

  const q = (gender?: string) => ({ page: 1, pageSize: 20, skip: 0, take: 20, gender }) as never;

  it("shows a men's employee both sections by default, men on a pick, and lets them open women", async () => {
    const { service, genderClauses } = build();
    await service.list(q(), men);
    expect(genderClauses()).toEqual([]);

    const picked = build();
    await picked.service.list(q('male'), men);
    expect(picked.genderClauses()).toEqual(['male']);

    const other = build();
    await expect(other.service.list(q('female'), men)).resolves.toBeDefined();
    expect(other.genderClauses()).toEqual(['female']);
  });

  it("shows a women's employee everyone on 'all' and lets them open men", async () => {
    const { service, genderClauses } = build();
    await service.list(q('all'), women);
    expect(genderClauses()).toEqual([]);

    const picked = build();
    await picked.service.list(q('female'), women);
    expect(picked.genderClauses()).toEqual(['female']);

    const other = build();
    await expect(other.service.list(q('male'), women)).resolves.toBeDefined();
    expect(other.genderClauses()).toEqual(['male']);
  });

  it('lets an admin see both sections by default and switch freely', async () => {
    const all = build();
    await all.service.list(q(), admin);
    expect(all.genderClauses()).toEqual([]);

    const female = build();
    await female.service.list(q('female'), admin);
    expect(female.genderClauses()).toEqual(['female']);
  });
});
