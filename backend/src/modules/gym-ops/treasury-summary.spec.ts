import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubDashboardService } from '../club-dashboard/club-dashboard.service';
import { ExportService } from '../../common/export/export.service';
import { UnifiedTreasuryService } from './unified-treasury.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';

describe('large treasury periods', () => {
  it('calculates club all-time totals with grouped queries and no detail scans', async () => {
    const prisma = {
      club_receipt_payments: {
        groupBy: jest.fn().mockResolvedValue([
          { method: 'cash', _sum: { amount: 100 }, _count: { _all: 2 } },
        ]),
        findMany: jest.fn(),
      },
      club_receipts: {
        groupBy: jest.fn().mockResolvedValue([
          { payment_method: 'card', _sum: { amount: 50 }, _count: { _all: 1 } },
        ]),
        findMany: jest.fn(),
      },
      club_subscriptions: {
        groupBy: jest.fn().mockResolvedValue([
          { payment_method: 'visa', _sum: { paid_amount: 200 }, _count: { _all: 1 } },
        ]),
        findMany: jest.fn(),
      },
      club_locker_subscriptions: {
        groupBy: jest.fn().mockResolvedValue([
          { payment_method: 'cash', _sum: { paid_amount: 30 }, _count: { _all: 1 } },
        ]),
        findMany: jest.fn(),
      },
      club_spa_invoices: {
        groupBy: jest.fn().mockResolvedValue([
          { payment_method: 'wallet', _sum: { total_amount: 40 }, _count: { _all: 1 } },
        ]),
        findMany: jest.fn(),
      },
      club_inbody_invoices: {
        groupBy: jest.fn().mockResolvedValue([
          { payment_method: 'bank', _sum: { total_amount: 20 }, _count: { _all: 1 } },
        ]),
        findMany: jest.fn(),
      },
    };
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([2]),
      memberGenderFilter: jest.fn().mockReturnValue(null),
    };
    const permissions = { isSuperAdmin: jest.fn().mockResolvedValue(false) };
    const service = new ClubDashboardService(
      prisma as unknown as PrismaService,
      branchScope as unknown as BranchScopeService,
      permissions as unknown as PermissionEngineService,
    );

    const result = await service.treasury(
      undefined,
      { sub: 9, level: 2, branch: 2 } as never,
    );

    expect(result).toMatchObject({
      summaryOnly: true,
      total: 440,
      entries: [],
      byMethod: {
        cash: 130,
        card: 50,
        visa: 200,
        wallet: 40,
        bank: 20,
      },
    });
    expect(prisma.club_receipts.findMany).not.toHaveBeenCalled();
    expect(prisma.club_subscriptions.findMany).not.toHaveBeenCalled();
    expect(prisma.club_locker_subscriptions.findMany).not.toHaveBeenCalled();
    expect(prisma.club_spa_invoices.findMany).not.toHaveBeenCalled();
    expect(prisma.club_inbody_invoices.findMany).not.toHaveBeenCalled();
    expect(prisma.club_receipts.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          created_by: 9,
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                {
                  subscription_id: { not: null },
                  subscription: { is: { branch_id: { in: [2] } } },
                },
                {
                  subscription_id: null,
                  locker_subscription_id: null,
                  member_id: null,
                  branch_id: { in: [2] },
                },
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('calculates unified all-time totals without loading sales, revenues, or expenses', async () => {
    const prisma = {
      sales_quick_sales: {
        groupBy: jest.fn().mockResolvedValue([
          { payment_method: 'cash', _sum: { total_amount: 50 }, _count: { _all: 1 } },
        ]),
        findMany: jest.fn(),
      },
      fin_revenues: {
        groupBy: jest.fn().mockResolvedValue([
          { payment_method: 'نقدي', _sum: { net_amount: 25 }, _count: { _all: 1 } },
        ]),
        findMany: jest.fn(),
      },
      fin_expenses: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { total_amount: 10 } }),
        findMany: jest.fn(),
      },
    };
    const clubDashboard = {
      treasury: jest.fn().mockResolvedValue({
        byMethodSummary: { cash: { count: 2, total: 100 } },
        bySource: { receipt: { count: 2, total: 100 } },
      }),
    };
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue(null),
    };
    const service = new UnifiedTreasuryService(
      prisma as unknown as PrismaService,
      clubDashboard as unknown as ClubDashboardService,
      {} as ExportService,
      branchScope as unknown as BranchScopeService,
    );

    const result = await service.daily({});

    expect(result).toMatchObject({
      summaryOnly: true,
      grandTotal: 175,
      grandCount: 4,
      totalExpenses: 10,
      netCash: 165,
      entries: [],
      byMethod: { cash: { count: 4, total: 175 } },
    });
    expect(prisma.sales_quick_sales.findMany).not.toHaveBeenCalled();
    expect(prisma.fin_revenues.findMany).not.toHaveBeenCalled();
    expect(prisma.fin_expenses.findMany).not.toHaveBeenCalled();
  });
});
