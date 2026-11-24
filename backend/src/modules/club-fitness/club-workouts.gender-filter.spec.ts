import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubWorkoutsService } from './club-workouts.service';

/** رجالي/حريمي/الكل filter on workout programs / progress / assessments. */
describe('ClubWorkoutsService lists — men/women section filter', () => {
  const men = { sub: 10, level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] } as never;
  const women = { sub: 11, level: 2, branch: 2, man_women_type: 2, member_sections: ['female'] } as never;
  const admin = { sub: 1, level: 1 } as never;
  const q = (gender?: string) => ({ page: 1, pageSize: 20, skip: 0, take: 20, gender }) as never;

  function build() {
    const list = () => ({ findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) });
    const prisma = {
      club_members: { findMany: jest.fn().mockResolvedValue([{ id: 7 }]) },
      club_workout_programs: list(),
      club_member_progress: list(),
      club_physical_assessments: list(),
    };
    const service = new ClubWorkoutsService(prisma as never, new BranchScopeService());
    const memberWhere = () => (prisma.club_members.findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> } | undefined)?.where;
    return { service, prisma, memberWhere };
  }

  const lists = [
    ['listPrograms', 'club_workout_programs'],
    ['listProgress', 'club_member_progress'],
    ['listAssessments', 'club_physical_assessments'],
  ] as const;

  const noSectionFilter = (prisma: ReturnType<typeof build>['prisma']) =>
    prisma.club_members.findMany.mock.calls.every((c) => !('gender' in (c[0] as { where: object }).where));

  it.each(lists)("%s: men's employee is not narrowed by default, filters on a pick and may open women", async (method, table) => {
    const { service, prisma } = build();
    await service[method](q(), men);
    // Only the branch's members (no section) narrow the rows.
    expect(noSectionFilter(prisma)).toBe(true);

    const picked = build();
    await picked.service[method](q('male'), men);
    expect(picked.memberWhere()).toMatchObject({ gender: 'male' });
    expect(JSON.stringify(picked.prisma[table].findMany.mock.calls[0][0].where)).toContain('{"in":[7]}');

    const other = build();
    await expect(other.service[method](q('female'), men)).resolves.toBeDefined();
    expect(other.memberWhere()).toMatchObject({ gender: 'female' });
    expect(other.prisma[table].findMany).toHaveBeenCalledTimes(1);
  });

  it.each(lists)("%s: women's employee is not narrowed by default and may open men", async (method) => {
    const { service, prisma } = build();
    await service[method](q(), women);
    expect(noSectionFilter(prisma)).toBe(true);

    const picked = build();
    await picked.service[method](q('female'), women);
    expect(picked.memberWhere()).toMatchObject({ gender: 'female' });

    const other = build();
    await expect(other.service[method](q('male'), women)).resolves.toBeDefined();
    expect(other.memberWhere()).toMatchObject({ gender: 'male' });
  });

  it.each(lists)('%s: admin filters by the chosen section and is unfiltered otherwise', async (method, table) => {
    const { service, prisma, memberWhere } = build();
    await service[method](q('female'), admin);
    expect(memberWhere()).toEqual({ is_deleted: false, gender: 'female' });
    expect(JSON.stringify(prisma[table].findMany.mock.calls[0][0].where)).toContain('{"in":[7]}');

    const fresh = build();
    await fresh.service[method](q('all'), admin);
    expect(fresh.prisma.club_members.findMany).not.toHaveBeenCalled();
    expect(fresh.prisma[table].findMany.mock.calls[0][0].where).toEqual({});
  });
});
