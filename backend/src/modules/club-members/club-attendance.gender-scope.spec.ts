import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubAttendanceService } from './club-attendance.service';

const womenOnly = { sub: 10, level: 2, branch: 3, man_women_type: 2 } as never;

function makeService(prisma: unknown, members: unknown = {}, entitlement: unknown = {}) {
  return new ClubAttendanceService(
    prisma as never,
    members as never,
    entitlement as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    new BranchScopeService(),
    { siblingBranchIds: async (id: number) => [id] },
  );
}

describe('club attendance men/women section isolation', () => {
  it('checks in a member of the other section (the section is only a screen default)', async () => {
    const prisma = {
      $queryRaw: jest.fn(), $executeRaw: jest.fn().mockResolvedValue(1), $transaction: jest.fn(),
      club_subscriptions: { findUnique: jest.fn(), update: jest.fn() },
      club_classes: { findFirst: jest.fn() },
      club_attendance: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }) => ({ id: 1, ...data })) },
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prisma));
    const validate = jest.fn().mockResolvedValue({ allowed: true, activeSubscription: null });
    const service = new ClubAttendanceService(
      prisma as never,
      { resolveByIdOrCode: jest.fn().mockResolvedValue({ id: 9, branch_id: 3, gender: 'male', member_code: 'M9', name: 'Ali' }) } as never,
      { validate } as never,
      { log: jest.fn() } as never,
      { emit: jest.fn() } as never,
      { dispatch: jest.fn() } as never,
      { canAny: jest.fn().mockResolvedValue(true) } as never,
      new BranchScopeService(),
      { siblingBranchIds: async (id: number) => [id] },
    );
    const result = await service.checkIn({ memberId: 9, attendanceType: 'normal', consumeSession: false } as never, womenOnly);
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({ memberId: 9, branchId: 3 }));
    expect(prisma.club_attendance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ member_id: 9, branch_id: 3 }),
    }));
    expect(result.attendance).toEqual(expect.objectContaining({ attendanceType: 'normal' }));
  });

  it('does not limit the attendance list and statistics to the employee section', async () => {
    const prisma = {
      club_attendance: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = makeService(prisma);
    await service.list({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, womenOnly);
    expect(JSON.stringify(prisma.club_attendance.findMany.mock.calls[0][0].where)).not.toContain('gender');
    await service.statistics({}, womenOnly);
    expect(JSON.stringify(prisma.club_attendance.count.mock.calls[0][0].where)).not.toContain('gender');
  });

  it('limits the attendance list and statistics to a section the employee picks', async () => {
    const prisma = {
      club_attendance: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = makeService(prisma);
    await service.list({ page: 1, pageSize: 20, skip: 0, take: 20, gender: 'male' } as never, womenOnly);
    expect(prisma.club_attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: expect.arrayContaining([{ member: { is: { gender: 'male' } } }]) },
    }));
    await service.statistics({ gender: 'male' } as never, womenOnly);
    expect(prisma.club_attendance.count).toHaveBeenCalledWith({
      where: { AND: expect.arrayContaining([{ member: { is: { gender: 'male' } } }]) },
    });
  });

  it('adds no section filter for a both-sections employee', async () => {
    const prisma = { club_attendance: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    const service = makeService(prisma);
    await service.list({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, { sub: 10, level: 2, branch: 3, man_women_type: 3 } as never);
    expect(prisma.club_attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ branch_id: { in: [3] } }] },
    }));
  });
});
