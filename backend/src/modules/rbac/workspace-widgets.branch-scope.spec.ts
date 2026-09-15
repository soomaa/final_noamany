import { WorkspaceWidgetsService } from './workspace-widgets.service';

function makeService() {
  const prisma = {
    club_members: { count: jest.fn().mockResolvedValue(4) },
    club_subscriptions: { count: jest.fn().mockResolvedValue(3) },
    club_attendance: { count: jest.fn().mockResolvedValue(2) },
  };
  const workspace = {
    getWorkspace: jest.fn().mockResolvedValue({ widgets: ['club_kpis'] }),
  };
  const service = new WorkspaceWidgetsService(
    prisma as never,
    workspace as never,
    {} as never,
  );
  return { service, prisma };
}

describe('workspace widget branch isolation', () => {
  it('ignores a foreign requested branch and uses the receptionist login branch', async () => {
    const { service, prisma } = makeService();

    await service.getWidgets({ sub: 20, level: 2, branch: 2 } as never, 9);

    expect(prisma.club_members.count).toHaveBeenCalledWith({
      where: { is_deleted: false, branch_id: { in: [2] } },
    });
    expect(prisma.club_subscriptions.count).toHaveBeenCalledWith({
      where: { branch_id: { in: [2] } },
    });
    expect(prisma.club_attendance.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ branch_id: { in: [2] } }),
    });
  });

  it('honours the branch selected by a system admin', async () => {
    const { service, prisma } = makeService();

    await service.getWidgets({ sub: 1, level: 1, branch: 0 } as never, 7);

    expect(prisma.club_members.count).toHaveBeenCalledWith({
      where: { is_deleted: false, branch_id: { in: [7] } },
    });
  });

  it('returns the current user daily net after subtracting their expenses', async () => {
    const prisma = {
      club_receipts: {
        findMany: jest.fn().mockResolvedValue([{ amount: 1000 }, { amount: 250 }]),
      },
      fin_expenses: {
        findMany: jest.fn().mockResolvedValue([{ total_amount: 300 }]),
      },
      users: {
        findUnique: jest.fn().mockResolvedValue({ name: 'موظف الاستقبال', username: 'reception' }),
      },
    };
    const workspace = {
      getWorkspace: jest.fn().mockResolvedValue({ widgets: ['treasury_today'] }),
    };
    const permissions = {
      getEffective: jest.fn().mockResolvedValue({ superAdmin: false }),
    };
    const service = new WorkspaceWidgetsService(
      prisma as never,
      workspace as never,
      permissions as never,
    );

    const result = await service.getWidgets({ sub: 20, level: 2, branch: 2 } as never);

    expect(prisma.club_receipts.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ created_by: 20, branch_id: { in: [2] } }),
    }));
    expect(prisma.fin_expenses.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        created_by: 20,
        branch_id: { in: [2] },
        is_deleted: false,
      }),
    }));
    expect(result.data.treasury_today).toEqual(expect.objectContaining({
      incomeTotal: 1250,
      expensesTotal: 300,
      netTotal: 950,
      total: 950,
      receiptCount: 2,
      expenseCount: 1,
      userScoped: true,
    }));
  });
});
