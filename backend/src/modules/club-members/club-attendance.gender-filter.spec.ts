import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubAttendanceService } from './club-attendance.service';

/** رجالي/حريمي/الكل filter on the attendance list: the staff section is only the screen default, anyone may choose. */
describe('ClubAttendanceService list — men/women section filter', () => {
  const men = { sub: 10, level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] } as never;
  const admin = { sub: 1, level: 1 } as never;
  const q = (gender?: string) => ({ page: 1, pageSize: 20, skip: 0, take: 20, gender }) as never;

  function build() {
    const prisma = {
      club_attendance: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = new ClubAttendanceService(
      prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      new BranchScopeService(),
      { siblingBranchIds: async (id: number) => [id] },
    );
    const and = () => (prisma.club_attendance.findMany.mock.calls.at(-1)?.[0] as { where: { AND?: unknown[] } }).where.AND ?? [];
    return { service, prisma, and };
  }

  it("men's employee sees everyone by default, men on a pick, and may open women", async () => {
    const { service, prisma, and } = build();
    await service.list(q(), men);
    expect(JSON.stringify(and())).not.toContain('gender');
    await service.list(q('male'), men);
    expect(and()).toContainEqual({ member: { is: { gender: 'male' } } });
    await expect(service.list(q('female'), men)).resolves.toBeDefined();
    expect(and()).toContainEqual({ member: { is: { gender: 'female' } } });
    expect(prisma.club_attendance.findMany).toHaveBeenCalledTimes(3);
  });

  it('admin filters by the chosen section and is unfiltered otherwise', async () => {
    const { service, and } = build();
    await service.list(q('female'), admin);
    expect(and()).toContainEqual({ member: { is: { gender: 'female' } } });
    await service.list(q('all'), admin);
    expect(JSON.stringify(and())).not.toContain('gender');
  });
});
