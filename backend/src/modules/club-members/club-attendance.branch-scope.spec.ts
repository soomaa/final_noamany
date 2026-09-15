import { ForbiddenException } from '@nestjs/common';
import { ClubAttendanceService } from './club-attendance.service';

function makeService(gender: 'male' | 'female' | null = null) {
  const prisma = {
    club_attendance: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const service = new ClubAttendanceService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { memberGenderFilter: jest.fn().mockReturnValue(gender) } as never,
  );
  return { service, prisma };
}

const listQuery = {
  page: 1,
  pageSize: 20,
  skip: 0,
  take: 20,
};

describe('club attendance operational branch isolation', () => {
  it('groups Tanta main, Up and Down for a user assigned to Tanta main', async () => {
    const { service, prisma } = makeService();
    await service.list(listQuery as never, { sub: 10, level: 2, branch: 2 } as never);

    expect(prisma.club_attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ branch_id: { in: [2, 5, 6] } }] },
      }),
    );
  });

  it.each([5, 6])('keeps Tanta section %i isolated for its own user', async (branchId) => {
    const { service, prisma } = makeService();
    await service.list(listQuery as never, {
      sub: 10,
      level: 2,
      branch: branchId,
    } as never);

    expect(prisma.club_attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ branch_id: { in: [branchId] } }] },
      }),
    );
  });

  it('rejects a foreign attendance branch even if a broader manager fan-out exists', async () => {
    const { service } = makeService();
    await expect(
      service.list(
        { ...listQuery, branch: '3' } as never,
        { sub: 10, level: 3, branch: 2 } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('filters attendance rows by the authenticated member audience', async () => {
    const { service, prisma } = makeService('female');
    await service.list(listQuery as never, { sub: 10, level: 2, branch: 5 } as never);
    expect(prisma.club_attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [
        { branch_id: { in: [5] } },
        { member: { is_deleted: false, gender: 'female' } },
      ] },
    }));
  });

  it('rejects a conflicting requested attendance audience', async () => {
    const { service } = makeService('male');
    await expect(service.list({ ...listQuery, gender: 'female' } as never, {
      sub: 10, level: 2, branch: 2,
    } as never)).rejects.toThrow('لا يمكن تغيير قسم');
  });

  it('fails closed without throwing when statistics resolve to an empty branch scope', async () => {
    const { service, prisma } = makeService('female');
    await service.statistics({}, { sub: 10, level: 2, branch: 0 } as never);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.calls[0][1]).toEqual(expect.objectContaining({
      sql: expect.stringContaining('branch_id = -1'),
    }));
  });

  it('never permits a force/grace check-in for an explicitly blocked member', async () => {
    const members = {
      resolveByIdOrCode: jest.fn().mockResolvedValue({ id: 15, branch_id: 2, gender: 'male' }),
    };
    const entitlement = {
      validate: jest.fn().mockResolvedValue({
        allowed: false,
        reasons: [{ code: 'member_blocked', severity: 'block' }],
        warnings: [],
      }),
    };
    const permissions = { canAny: jest.fn() };
    const service = new ClubAttendanceService(
      {} as never,
      members as never,
      entitlement as never,
      {} as never,
      {} as never,
      {} as never,
      permissions as never,
      { memberGenderFilter: jest.fn().mockReturnValue(null) } as never,
    );

    await expect(service.checkIn(
      { memberId: 15, branchId: 2, force: true, overrideReason: 'موافقة الإدارة' } as never,
      { sub: 8, level: 2, branch: 2 } as never,
    )).rejects.toThrow('العضو محظور ولا يمكن تجاوز الحظر من شاشة الحضور');
    expect(permissions.canAny).not.toHaveBeenCalled();
  });

  it('rejects a direct check-in for a member outside the authenticated audience', async () => {
    const members = {
      resolveByIdOrCode: jest.fn().mockResolvedValue({
        id: 15,
        branch_id: 2,
        gender: 'female',
        is_deleted: false,
      }),
    };
    const entitlement = { validate: jest.fn() };
    const service = new ClubAttendanceService(
      {} as never,
      members as never,
      entitlement as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { memberGenderFilter: jest.fn().mockReturnValue('male') } as never,
    );

    await expect(service.checkIn(
      { memberId: 15, branchId: 2 } as never,
      { sub: 8, level: 2, branch: 2 } as never,
    )).rejects.toThrow('لا تملك صلاحية تسجيل حضور لهذا القسم');
    expect(entitlement.validate).not.toHaveBeenCalled();
  });

  it('rejects check-out by direct attendance id outside the authenticated audience', async () => {
    const prisma = {
      club_attendance: {
        findUnique: jest.fn().mockResolvedValue({
          id: 99,
          branch_id: 2,
          status: 'checked_in',
          member: { gender: 'female', is_deleted: false },
        }),
        update: jest.fn(),
      },
    };
    const service = new ClubAttendanceService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { memberGenderFilter: jest.fn().mockReturnValue('male') } as never,
    );

    await expect(service.checkOut(
      { attendanceId: 99 } as never,
      { sub: 8, level: 2, branch: 2 } as never,
    )).rejects.toThrow('لا تملك صلاحية تسجيل حضور لهذا القسم');
    expect(prisma.club_attendance.update).not.toHaveBeenCalled();
  });
});
