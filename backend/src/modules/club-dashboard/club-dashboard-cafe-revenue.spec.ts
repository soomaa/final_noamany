import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { ClubDashboardService } from './club-dashboard.service';

describe('ClubDashboardService cafe revenue', () => {
  it('includes cafe revenue in the executive dashboard financial summary', async () => {
    const salesAggregate = jest.fn().mockResolvedValue({
      _sum: { collected_amount: new Prisma.Decimal('12850.75') },
    });
    const prisma = {
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_members: { findMany: jest.fn().mockResolvedValue([]) },
      club_attendance: { findMany: jest.fn().mockResolvedValue([]) },
      employees: { count: jest.fn().mockResolvedValue(0) },
      sales_quick_sales: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: salesAggregate,
      },
      sales_bookings: { count: jest.fn().mockResolvedValue(0) },
      $queryRaw: jest.fn().mockResolvedValue([{ total: 0 }]),
    };
    const service = new ClubDashboardService(
      prisma as unknown as PrismaService,
      { resolveListFilter: jest.fn().mockReturnValue([2]) } as unknown as BranchScopeService,
      {} as PermissionEngineService,
    );
    jest.spyOn(service, 'summary').mockResolvedValue({
      totalMembers: { total: 0, active: 0, inactive: 0, newThisMonth: 0 },
      totalRemaining: 0,
      trainers: 0,
      classesToday: 0,
      facilities: 0,
    } as never);
    jest.spyOn(service as any, 'financialLedgerRows').mockResolvedValue([]);

    const result = await service.executive({
      startDate: '2026-08-01',
      endDate: '2026-08-22',
      branchId: '2',
    });

    expect(result.financials).toMatchObject({ cafeRevenue: 12850.75 });
  });

  it('sums completed non-partner cafe collections for the selected period and branches', async () => {
    const aggregate = jest.fn().mockResolvedValue({
      _sum: { collected_amount: new Prisma.Decimal('12850.75') },
    });
    const service = new ClubDashboardService(
      { sales_quick_sales: { aggregate } } as unknown as PrismaService,
      {} as BranchScopeService,
      {} as PermissionEngineService,
    );

    const cafeRevenueForPeriod = (service as unknown as {
      cafeRevenueForPeriod?: (
        start: string,
        end: string,
        branchIds: number[] | null,
      ) => Promise<number>;
    }).cafeRevenueForPeriod;
    expect(cafeRevenueForPeriod).toBeDefined();

    const result = await cafeRevenueForPeriod!.call(
      service,
      '2026-08-01',
      '2026-08-22',
      [2, 4],
    );

    expect(result).toBe(12850.75);
    expect(aggregate).toHaveBeenCalledWith({
      where: {
        sale_date: { gte: '2026-08-01', lte: '2026-08-22' },
        status: 'completed',
        sale_type: { not: 'partner' },
        branch_id: { in: [2, 4] },
      },
      _sum: { collected_amount: true },
    });
  });
});
