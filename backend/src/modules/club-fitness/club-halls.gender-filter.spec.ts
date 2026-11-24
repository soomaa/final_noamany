import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubHallsService } from './club-halls.service';

/** رجالي/حريمي/الكل filter on room (hall) bookings. */
describe('ClubHallsService listBookings — men/women section filter', () => {
  const men = { sub: 10, level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] } as never;
  const women = { sub: 11, level: 2, branch: 2, man_women_type: 2, member_sections: ['female'] } as never;
  const admin = { sub: 1, level: 1 } as never;
  const q = (gender?: string) => ({ page: 1, pageSize: 20, skip: 0, take: 20, gender }) as never;

  function build() {
    const prisma = {
      club_members: { findMany: jest.fn().mockResolvedValue([{ id: 7 }]) },
      club_hall_bookings: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    const service = new ClubHallsService(prisma as never, new BranchScopeService());
    const memberGender = () => (prisma.club_members.findMany.mock.calls.at(-1)?.[0] as { where: { gender?: string } } | undefined)?.where.gender;
    const sectionClause = { OR: [{ member_id: null }, { member_id: { in: [7] } }] };
    const bookingAnd = () => (prisma.club_hall_bookings.findMany.mock.calls[0][0] as { where: { AND: unknown[] } }).where.AND;
    return { service, prisma, memberGender, sectionClause, bookingAnd };
  }

  it("men's employee is not narrowed by default, filters on a pick and may open women", async () => {
    const { service, prisma, sectionClause, bookingAnd } = build();
    await service.listBookings(q(), men);
    expect(prisma.club_members.findMany.mock.calls.every((c) => !('gender' in (c[0] as { where: object }).where))).toBe(true);
    expect(bookingAnd()).not.toContainEqual(sectionClause);

    const picked = build();
    await picked.service.listBookings(q('male'), men);
    expect(picked.memberGender()).toBe('male');
    expect(picked.bookingAnd()).toContainEqual(picked.sectionClause);

    const other = build();
    await expect(other.service.listBookings(q('female'), men)).resolves.toBeDefined();
    expect(other.memberGender()).toBe('female');
    expect(other.bookingAnd()).toContainEqual(other.sectionClause);
    expect(other.prisma.club_hall_bookings.findMany).toHaveBeenCalledTimes(1);
  });

  it("women's employee filters on a pick and may open men", async () => {
    const { service, memberGender } = build();
    await service.listBookings(q('female'), women);
    expect(memberGender()).toBe('female');

    const other = build();
    await expect(other.service.listBookings(q('male'), women)).resolves.toBeDefined();
    expect(other.memberGender()).toBe('male');
  });

  it('admin filters by the chosen section and is unfiltered otherwise', async () => {
    const { service, memberGender, sectionClause, bookingAnd } = build();
    await service.listBookings(q('female'), admin);
    expect(memberGender()).toBe('female');
    expect(bookingAnd()).toContainEqual(sectionClause);

    const fresh = build();
    await fresh.service.listBookings(q(), admin);
    expect(fresh.prisma.club_members.findMany).not.toHaveBeenCalled();
    expect(fresh.bookingAnd()).toEqual([{ is_deleted: false }]);
  });
});
