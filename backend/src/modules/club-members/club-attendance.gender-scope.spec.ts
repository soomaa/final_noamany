import { ForbiddenException } from '@nestjs/common';
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
  it('rejects checking in a member of the other section', async () => {
    const validate = jest.fn();
    const service = makeService({}, { resolveByIdOrCode: jest.fn().mockResolvedValue({ id: 9, branch_id: 3, gender: 'male' }) }, { validate });
    await expect(service.checkIn({ memberId: 9 } as never, womenOnly)).rejects.toBeInstanceOf(ForbiddenException);
    expect(validate).not.toHaveBeenCalled();
  });

  it('limits the attendance list and statistics to the employee section', async () => {
    const prisma = {
      club_attendance: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = makeService(prisma);
    await service.list({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, womenOnly);
    expect(prisma.club_attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: expect.arrayContaining([{ member: { is: { gender: 'female' } } }]) },
    }));
    await service.statistics({}, womenOnly);
    expect(prisma.club_attendance.count).toHaveBeenCalledWith({
      where: { AND: expect.arrayContaining([{ member: { is: { gender: 'female' } } }]) },
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
