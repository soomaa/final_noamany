import { AppManagementService } from './app-management.service';

describe('AppManagementService.createMemberNotification', () => {
  function setup() {
    const prisma = {
      club_members: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      am_member_notifications: {
        create: jest.fn(),
        createMany: jest.fn(),
      },
    };
    const branchScope = {
      allowedBranchIds: jest.fn().mockReturnValue(null),
      isBranchAllowed: jest.fn().mockReturnValue(true),
      resolveListFilter: jest.fn().mockReturnValue(null),
    };
    const service = new AppManagementService(
      prisma as never,
      { get: jest.fn().mockReturnValue('/uploads') } as never,
      {} as never,
      branchScope as never,
      { create: jest.fn() } as never,
    );
    return { service, prisma, branchScope };
  }

  it('broadcast with appUsersOnly targets members who have an app account', async () => {
    const { service, prisma } = setup();
    prisma.club_members.findMany.mockResolvedValue([
      { id: 1, branch_id: 2 },
      { id: 2, branch_id: 2 },
    ]);
    prisma.am_member_notifications.createMany.mockResolvedValue({ count: 2 });

    const result = await service.createMemberNotification({
      title: 'عرض',
      body: 'تجديد',
      broadcast: true,
      appUsersOnly: true,
    });

    expect(prisma.club_members.findMany).toHaveBeenCalledWith({
      where: {
        is_deleted: false,
        is_active: true,
        app_user_id: { not: null },
      },
      select: { id: true, branch_id: true },
    });
    expect(result).toEqual({ sent: 2 });
  });

  it('rejects a broadcast outside the staff member branch scope', async () => {
    const { service, prisma, branchScope } = setup();
    branchScope.allowedBranchIds.mockReturnValue([7]);
    branchScope.isBranchAllowed.mockImplementation((_user: unknown, branchId: number) => branchId === 7);

    await expect(service.createMemberNotification({
      title: 'تنبيه',
      body: 'فرع آخر',
      broadcast: true,
      branchId: 8,
    }, 10, { sub: 10, level: 3, branch: 7 } as never)).rejects.toThrow('فرع آخر');

    expect(prisma.club_members.findMany).not.toHaveBeenCalled();
  });

  it('defaults a scoped broadcast to the actor allowed branches', async () => {
    const { service, prisma, branchScope } = setup();
    branchScope.allowedBranchIds.mockReturnValue([7, 9]);
    prisma.club_members.findMany.mockResolvedValue([]);

    await service.createMemberNotification({
      title: 'تنبيه',
      body: 'الفروع المسموحة',
      broadcast: true,
    }, 10, { sub: 10, level: 3, branch: 7, branchIds: [7, 9] } as never);

    expect(prisma.club_members.findMany).toHaveBeenCalledWith({
      where: {
        is_deleted: false,
        is_active: true,
        branch_id: { in: [7, 9] },
      },
      select: { id: true, branch_id: true },
    });
  });

  it('broadcast without appUsersOnly includes every active member in the branch', async () => {
    const { service, prisma } = setup();
    prisma.club_members.findMany.mockResolvedValue([{ id: 5, branch_id: 3 }]);
    prisma.am_member_notifications.createMany.mockResolvedValue({ count: 1 });

    await service.createMemberNotification({
      title: 'تنبيه',
      body: 'عام',
      broadcast: true,
      appUsersOnly: false,
      branchId: 3,
    });

    expect(prisma.club_members.findMany).toHaveBeenCalledWith({
      where: {
        is_deleted: false,
        is_active: true,
        branch_id: 3,
      },
      select: { id: true, branch_id: true },
    });
  });
});
