import { ForbiddenException } from '@nestjs/common';
import { ClubAttendanceService } from './club-attendance.service';

function makeService() {
  const prisma = {
    club_attendance: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      // No recent visit, so the duplicate-press guard never short-circuits these cases.
      findFirst: jest.fn().mockResolvedValue(null),
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
    {} as never,
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
  it('locks a non-admin attendance list to the login branch', async () => {
    const { service, prisma } = makeService();
    await service.list(listQuery as never, { sub: 10, level: 2, branch: 2 } as never);

    expect(prisma.club_attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ branch_id: { in: [2] } }] },
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

  it('never permits a force/grace check-in for an explicitly blocked member', async () => {
    const members = {
      resolveByIdOrCode: jest.fn().mockResolvedValue({ id: 15, branch_id: 2 }),
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
      {} as never,
    );

    jest.spyOn(service, 'reportEntryAlert').mockResolvedValue(undefined);
    await expect(service.checkIn(
      { memberId: 15, branchId: 2, force: true, overrideReason: 'موافقة الإدارة' } as never,
      { sub: 8, level: 2, branch: 2 } as never,
    )).rejects.toThrow('العضو محظور ولا يمكن تجاوز الحظر من شاشة الحضور');
    expect(permissions.canAny).not.toHaveBeenCalled();
  });

  it('rejects expired entry even with a force request', async () => {
    const members = {
      resolveByIdOrCode: jest.fn().mockResolvedValue({ id: 15, branch_id: 2 }),
    };
    const entitlement = {
      validate: jest.fn().mockResolvedValue({
        allowed: false,
        allowGraceSessions: false,
        reasons: [{ code: 'no_active_subscription', severity: 'block', messageAr: 'لا يوجد اشتراك نشط' }],
        warnings: [],
      }),
    };
    const permissions = { canAny: jest.fn() };
    const audit = { log: jest.fn() };
    const service = new ClubAttendanceService(
      {} as never,
      members as never,
      entitlement as never,
      audit as never,
      {} as never,
      {} as never,
      permissions as never,
      {} as never,
    );

    jest.spyOn(service, 'reportEntryAlert').mockResolvedValue(undefined);
    await expect(service.checkIn(
      { memberId: 15, branchId: 2, force: true, overrideReason: 'موافقة الإدارة' } as never,
      { sub: 8, level: 2, branch: 2 } as never,
    )).rejects.toThrow('لا يوجد اشتراك نشط');
    expect(permissions.canAny).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});
