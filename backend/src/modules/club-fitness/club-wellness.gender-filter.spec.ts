import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubWellnessService } from './club-wellness.service';

/** رجالي/حريمي/الكل filter on the InBody / SPA lists: the staff section is only the screen default, anyone may choose. */
describe('ClubWellnessService lists — men/women section filter', () => {
  const men = { sub: 10, level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] } as never;
  const women = { sub: 11, level: 2, branch: 2, man_women_type: 2, member_sections: ['female'] } as never;
  const admin = { sub: 1, level: 1 } as never;
  const q = (gender?: string) => ({ page: 1, pageSize: 20, skip: 0, take: 20, gender }) as never;

  function build() {
    const list = () => ({ findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) });
    const prisma = {
      club_members: { findMany: jest.fn().mockResolvedValue([{ id: 7 }]) },
      club_inbody_measurements: list(),
      club_inbody_invoices: list(),
      club_spa_bookings: list(),
      club_spa_invoices: list(),
      club_spa_attendance: list(),
    };
    const service = new ClubWellnessService(
      prisma as never,
      {} as never,
      { siblingBranchIds: jest.fn(async (id: number) => [id]) },
      new BranchScopeService(),
    );
    const memberGender = () => (prisma.club_members.findMany.mock.calls.at(-1)?.[0] as { where: { gender?: string } } | undefined)?.where.gender;
    return { service, prisma, memberGender };
  }

  const lists = [
    ['listInbodyMeasurements', 'club_inbody_measurements'],
    ['listInbodyInvoices', 'club_inbody_invoices'],
    ['listSpaBookings', 'club_spa_bookings'],
    ['listSpaInvoices', 'club_spa_invoices'],
    ['listSpaAttendance', 'club_spa_attendance'],
  ] as const;

  const noSectionFilter = (prisma: ReturnType<typeof build>['prisma']) =>
    prisma.club_members.findMany.mock.calls.every((c) => !('gender' in (c[0] as { where: object }).where));

  it.each(lists)("%s: men's employee is not narrowed by default, filters on a pick and may open women", async (method, table) => {
    const { service, prisma } = build();
    await service[method](q(), men);
    expect(noSectionFilter(prisma)).toBe(true);

    const picked = build();
    await picked.service[method](q('male'), men);
    expect(picked.memberGender()).toBe('male');
    expect(JSON.stringify(picked.prisma[table].findMany.mock.calls[0][0].where)).toContain('{"in":[7]}');

    const other = build();
    await expect(other.service[method](q('female'), men)).resolves.toBeDefined();
    expect(other.memberGender()).toBe('female');
    expect(other.prisma[table].findMany).toHaveBeenCalledTimes(1);
  });

  it.each(lists)("%s: women's employee sees everyone on 'all' and may open men", async (method) => {
    const { service, prisma } = build();
    await service[method](q('all'), women);
    expect(noSectionFilter(prisma)).toBe(true);

    const picked = build();
    await picked.service[method](q('female'), women);
    expect(picked.memberGender()).toBe('female');

    const other = build();
    await expect(other.service[method](q('male'), women)).resolves.toBeDefined();
    expect(other.memberGender()).toBe('male');
  });

  it.each(lists)('%s: admin filters by the chosen section and is unfiltered otherwise', async (method, table) => {
    const { service, prisma, memberGender } = build();
    await service[method](q('female'), admin);
    expect(memberGender()).toBe('female');
    expect(JSON.stringify(prisma[table].findMany.mock.calls[0][0].where)).toContain('{"in":[7]}');

    const fresh = build();
    await fresh.service[method](q(), admin);
    // No section filter for an admin. (InBody rows still narrow to non-deleted members' ids, as before.)
    expect(fresh.prisma.club_members.findMany.mock.calls.every((c) => !('gender' in (c[0] as { where: object }).where))).toBe(true);
    if (table !== 'club_inbody_measurements') {
      expect(JSON.stringify(fresh.prisma[table].findMany.mock.calls[0][0].where)).not.toContain('{"in":[7]}');
    }
  });
});
