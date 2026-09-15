import { CafeDashboardService } from './cafe-dashboard.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';

function fixture() {
  const prisma = {
    sales_quick_sales: { findMany: jest.fn().mockResolvedValueOnce([
      { total_amount: 100.25, cost_total: 30, sale_date: '2026-09-07', payment_method: 'cash' },
      { total_amount: 50.5, cost_total: 20, sale_date: '2026-09-07', payment_method: 'card' },
    ]).mockResolvedValueOnce([{ total_amount: 100 }]) },
    sales_quick_sale_items: { findMany: jest.fn().mockResolvedValue([
      { name: 'لاتيه', quantity: 2, line_total: 100.25, line_cost: 30 },
      { name: 'لاتيه', quantity: 1, line_total: 50.5, line_cost: 20 },
    ]) },
    cafe_waste_records: { findMany: jest.fn().mockResolvedValue([{ source_name: 'حليب', quantity: 1, total_cost: 10.25, reason_name: 'تالف' }]) },
    sales_shift_sessions: { findMany: jest.fn().mockResolvedValue([
      { id: 8, status: 'open', session_date: '2026-09-07' },
      { id: 7, status: 'closed', session_date: '2026-09-07', cash_difference: -5, expected_closing_balance: 100, closing_balance: 95 },
    ]) },
    inv_stock_balances: { findMany: jest.fn().mockResolvedValue([
      { current_stock: 2, reorder_point: 3, product: { id: 1, name_ar: 'حليب' } },
      { current_stock: 10, reorder_point: 3, product: { id: 2, name_ar: 'بن' } },
    ]) },
  };
  const branches = new BranchScopeService();
  return { prisma, service: new CafeDashboardService(prisma as any, branches) };
}

it('retains exact saved monetary values, product aggregation, payment totals and operational signals', async () => {
  const { service, prisma } = fixture();
  const result = await service.summary({ startDate: '2026-09-07', endDate: '2026-09-07', branchId: 'all' }, { level: 2, branch: 3 } as JwtUser);
  expect(result.period).toEqual({ startDate: '2026-09-07', endDate: '2026-09-07', previousStartDate: '2026-09-06', previousEndDate: '2026-09-06' });
  expect(result.outcomes).toMatchObject({ netSales: 150.75, orders: 2, averageTicket: 75.375, grossProfit: 90.5 });
  expect(result.outcomes.salesChange).toBeCloseTo(50.75);
  expect(result.trend).toEqual([{ date: '2026-09-07', sales: 150.75, orders: 2 }]);
  expect(result.topProducts).toEqual([{ name: 'لاتيه', quantity: 3, revenue: 150.75, cost: 50 }]);
  expect(result.paymentMix).toEqual([{ method: 'cash', amount: 100.25 }, { method: 'card', amount: 50.5 }]);
  expect(result.operations).toMatchObject({ openShift: { id: 8, sessionDate: '2026-09-07' }, cashVariance: -5, wasteCost: 10.25, lowStockCount: 1 });
  expect(result.attention.shiftVariance).toEqual([{ id: 7, date: '2026-09-07', variance: -5 }]);
  expect(prisma.sales_quick_sales.findMany.mock.calls[0][0].where.branch_id).toEqual({ in: [3] });
  expect(prisma.sales_quick_sale_items.findMany.mock.calls[0][0].where.sale.is.branch_id).toEqual({ in: [3] });
  expect(prisma.cafe_waste_records.findMany.mock.calls[0][0].where.branch_id).toEqual({ in: [3] });
  expect(prisma.inv_stock_balances.findMany.mock.calls[0][0].where.warehouse.branch_id).toEqual({ in: [3] });
});

it('restricts out-of-scope branch requests and leaves unassigned users with an empty scope', async () => {
  for (const [branch, expected] of [[3, [3]], [0, []]] as const) {
    const { service, prisma } = fixture();
    await service.summary({ startDate: '2026-09-07', endDate: '2026-09-07', branchId: '999' }, { level: 2, branch } as JwtUser);
    expect(prisma.sales_quick_sales.findMany.mock.calls[0][0].where.branch_id).toEqual({ in: expected });
    expect(prisma.sales_shift_sessions.findMany.mock.calls[0][0].where.branch_id).toEqual({ in: expected });
  }
});

it('returns finite zero outcomes when a period has no activity', async () => {
  const { service, prisma } = fixture();
  for (const model of Object.values(prisma)) model.findMany.mockReset().mockResolvedValue([]);
  const result = await service.summary({ startDate: '2026-09-01', endDate: '2026-09-07' }, { level: 1 } as JwtUser);
  expect(result.outcomes).toEqual({ netSales: 0, orders: 0, averageTicket: 0, grossProfit: 0, grossMargin: 0, salesChange: null });
  expect(result.operations.openShift).toBeNull();
  expect(result.attention).toEqual({ lowStock: [], highWaste: [], shiftVariance: [] });
});
