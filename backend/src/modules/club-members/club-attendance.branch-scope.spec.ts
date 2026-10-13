import { ForbiddenException } from '@nestjs/common';
import { ClubAttendanceService } from './club-attendance.service';

function makeService() {
  const prisma = {
    club_attendance: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
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

  it.each([[3, 8], [8, 3], [4, 3], [3, 4]])('permits check-in from group branch %i to sibling branch %i', async (operatorBranchId, attendanceBranchId) => {
    const siblings = operatorBranchId === 4 || attendanceBranchId === 4 ? [3, 4] : [3, 8];
    const branchGroups = { siblingBranchIds: jest.fn(async () => siblings) };
    const service = new ClubAttendanceService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      branchGroups as never,
    );

    await expect((service as any).canOperateAttendanceBranch(
      { sub: 10, level: 2, branch: operatorBranchId },
      attendanceBranchId,
    )).resolves.toBe(true);
    expect(branchGroups.siblingBranchIds).toHaveBeenCalledWith(operatorBranchId);
  });

  it('does not permit a branch outside the operator group', async () => {
    const branchGroups = { siblingBranchIds: jest.fn(async () => [3, 8]) };
    const service = new ClubAttendanceService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      branchGroups as never,
    );

    await expect((service as any).canOperateAttendanceBranch(
      { sub: 10, level: 2, branch: 3 },
      9,
    )).resolves.toBe(false);
  });

  it('accepts a valid reciprocal group when the operator lookup has no sibling', async () => {
    const branchGroups = { siblingBranchIds: jest.fn(async (id: number) => id === 3 ? [3] : [3, 8]) };
    const service = new ClubAttendanceService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, branchGroups as never);
    await expect((service as any).canOperateAttendanceBranch({ sub: 10, level: 2, branch: 3 }, 8)).resolves.toBe(true);
  });

  it('keeps Galaa and East Bank visits in their shared group without admitting a foreign member branch', async () => {
    const branchGroups = { siblingBranchIds: jest.fn(async (id: number) => [3, 4].includes(id) ? [3, 4] : [id]) };
    const service = new ClubAttendanceService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, branchGroups as never);
    await expect((service as any).compatibleAttendanceBranches(4, 3)).resolves.toEqual([3, 4]);
    await expect((service as any).compatibleAttendanceBranches(4, 9)).resolves.toEqual([4]);
  });

  it('accepts a valid Tanta Down subscription for a Tanta main member without a configured group', async () => {
    const branchGroups = { siblingBranchIds: jest.fn(async (id: number) => [id]) };
    const service = new ClubAttendanceService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, branchGroups as never);

    await expect((service as any).compatibleAttendanceBranches(2, 2)).resolves.toEqual([2, 5, 6]);
    await expect((service as any).compatibleAttendanceBranches(5, 2)).resolves.toEqual([2, 5, 6]);
    await expect((service as any).compatibleAttendanceBranches(5, 9)).resolves.toEqual([5]);
  });

  it('passes the Tanta identity branches to entitlement validation at check-in', async () => {
    const validate = jest.fn().mockResolvedValue({ allowed: false, reasons: [], warnings: [] });
    const service = new ClubAttendanceService(
      {} as never,
      { resolveByIdOrCode: jest.fn().mockResolvedValue({ id: 10, branch_id: 2 }) } as never,
      { validate } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { siblingBranchIds: jest.fn(async (id: number) => [id]) } as never,
    );

    await expect(service.checkIn(
      { memberId: 10, branchId: 2 } as never,
      { sub: 8, level: 2, branch: 2 } as never,
    )).rejects.toThrow('لا يمكن تسجيل الدخول');
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({
      memberId: 10,
      branchId: 2,
      branchIds: [2, 5, 6],
    }));
  });

  it('rejects a foreign member at the reception lookup before reading their subscriptions', async () => {
    const prisma = { club_members: { findFirst: jest.fn().mockResolvedValue({ id: 15, branch_id: 9 }) } };
    const branchGroups = { siblingBranchIds: jest.fn(async (id: number) => [3, 4].includes(id) ? [3, 4] : [id]) };
    const service = new ClubAttendanceService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, branchGroups as never);
    await expect(service.memberOverview('123', { sub: 10, level: 2, branch: 4 } as never)).rejects.toBeInstanceOf(ForbiddenException);
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

    await expect(service.checkIn(
      { memberId: 15, branchId: 2, force: true, overrideReason: 'موافقة الإدارة' } as never,
      { sub: 8, level: 2, branch: 2 } as never,
    )).rejects.toThrow('العضو محظور ولا يمكن تجاوز الحظر من شاشة الحضور');
    expect(permissions.canAny).not.toHaveBeenCalled();
  });
});
