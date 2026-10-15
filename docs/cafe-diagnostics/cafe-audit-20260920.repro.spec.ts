// Characterization tests: PASS means the documented defect is reproduced,
// not that the application is correct. All persistence is mocked; no DB access.
import { QuickSalesService } from '../../backend/src/modules/sales/quick-sales.service';
import { StockTakingService } from '../../backend/src/modules/inventory/stock-taking.service';
import { StockTakingController } from '../../backend/src/modules/inventory/stock-taking.controller';
import { BranchScopeGuard } from '../../backend/src/common/guards/branch-scope.guard';
import { CafeDashboardService } from '../../backend/src/modules/cafe-dashboard/cafe-dashboard.service';

jest.mock('../../backend/src/modules/finance/cafe-finance.util', () => ({ syncCafeSaleFinance: jest.fn() }));

function fixture() {
  const row: any = { id: 1, sale_number: 'QS-AUDIT', daily_number: 1,
    sale_date: '2000-01-01', branch_id: 1, status: 'completed', sale_type: 'customer',
    inventory_posted: false, warehouse_id: null, cost_total: 5,
    items: [{ inventory_product_id: 44, quantity: 1 }], payments: [], events: [] };
  let next = 1;
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    payroll_cafe_allocations: { findUnique: jest.fn().mockResolvedValue(null) },
    sales_quick_sales: {
      findUnique: jest.fn(async () => row),
      create: jest.fn(async ({ data }) => ({ ...data, id: next++ })),
      update: jest.fn(async ({ data }) => ({ ...row, ...data })),
    },
    sales_pos_payments: { deleteMany: jest.fn() },
    sales_quick_sale_items: { deleteMany: jest.fn() },
    inv_movements: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = { ...tx, $transaction: jest.fn(async (cb) => cb(tx)) };
  const ledger = { ensureChart: jest.fn(), postQuickSale: jest.fn(), postHospitalitySale: jest.fn() };
  const permissions = { canAny: jest.fn().mockResolvedValue(false) };
  const service: any = new QuickSalesService(prisma as never, {} as never, {} as never,
    { findBranchSessionForSale: jest.fn().mockResolvedValue({ id: 7 }), applySaleToSession: jest.fn() } as never,
    ledger as never, { isInventoryTrackingEnabled: jest.fn().mockResolvedValue(false) } as never,
    { isBranchAllowed: () => true } as never, permissions as never, {} as never);
  const prepared = { saleType: 'customer', customerName: 'audit', benefits: null,
    employeeFreeDrinks: 0, billingCycle: 'immediate', hospitalityHostName: 'audit host',
    resolvedItems: [{ name: 'water', itemType: 'cafe', productType: 'ready', productId: 44,
      inventoryProductId: 44, quantity: 1, unitCost: 5, consumption: [] }],
    discountPct: 0, taxPct: 0, pricedItems: [{ unitPrice: 10, freeQuantity: 0 }],
    cogsAmount: 5, lineItems: [{ lineTotal: 10 }], subtotal: 10, discountAmount: 0,
    taxAmount: 0, totalAmount: 10, collectedAmount: 10, paymentMethod: 'cash',
    paymentRows: [], loyaltyPoints: 1 };
  service.prepareSale = jest.fn().mockResolvedValue(prepared);
  service.canApprovePayment = jest.fn().mockResolvedValue(false);
  service.generateSaleIdentity = jest.fn(async () => ({ saleNumber: `QS-${next}`, dailyNumber: next }));
  service.mapSales = jest.fn(async (rows) => rows);
  return { service, tx, row, ledger, permissions, prepared };
}

describe('Cafe audit — reproduced defects, not acceptance tests', () => {
  it('cashier-only ready-product refund fails despite having no inventory to reverse', async () => {
    const f = fixture();
    await expect(f.service.update(1, { status: 'refunded', notes: 'audit refund' }, 9))
      .rejects.toThrow('تعذر مطابقة كمية المنتجات الجاهزة مع حركة البيع الأصلية');
  });

  it('finalizing an ordinary draft as hospitality skips its grant and uses the ordinary sale ledger path', async () => {
    const f = fixture(); f.row.status = 'draft';
    f.service.prepareSale.mockResolvedValue({ ...f.prepared, saleType: 'hospitality', collectedAmount: 0 });
    await f.service.reviseDraft(1, { branchId: 1, saleType: 'hospitality', items: [] }, 9, true);
    expect(f.permissions.canAny).not.toHaveBeenCalled();
    expect(f.ledger.postQuickSale).toHaveBeenCalledWith(expect.objectContaining({ saleType: 'hospitality', totalAmount: 10 }), f.tx);
    expect(f.ledger.postHospitalitySale).not.toHaveBeenCalled();
    const data = f.tx.sales_quick_sales.update.mock.calls[0][0].data;
    expect(data.hospitality_host_name).toBeUndefined();
    expect(data.billing_status).toBe('unbilled');
  });

  it('replaying the same create request persists a second invoice', async () => {
    const f = fixture(); const dto = { branchId: 1, items: [{ cafeProductId: 7, name: 'water', quantity: 1 }] };
    const a = await f.service.create(dto, 9); const b = await f.service.create(dto, 9);
    expect(f.tx.sales_quick_sales.create).toHaveBeenCalledTimes(2);
    expect(a.sale_number).not.toBe(b.sale_number);
  });

  it('ID-based stock-count reads pass the branch guard and return a foreign branch', async () => {
    const guard = new BranchScopeGuard({ allowedBranchIds: () => [1] } as never);
    const req = { user: { sub: 9, branch: 1 }, params: { id: '22' }, query: {}, body: {} };
    expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as never)).toBe(true);
    const prisma = {
      inv_count_sessions: { findUnique: jest.fn().mockResolvedValue({ id: 22, branch_id: 2, warehouse_id: 2, items: [] }) },
      inv_adjustments: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const controller = new StockTakingController(new StockTakingService(prisma as never, {} as never, {} as never, {} as never));
    expect((await controller.findSession(22)).branchId).toBe(2);
  });

  it.each(['hospitality', 'partner'])('dashboard counts unpaid %s value as cash, and hospitality as revenue', async (saleType) => {
    const prisma: any = {
      sales_quick_sales: { findMany: jest.fn().mockResolvedValueOnce([
        { total_amount: 100, cost_total: 30, sale_date: '2026-09-20', payment_method: 'cash', sale_type: saleType, collected_amount: 0 },
      ]).mockResolvedValueOnce([]) },
      sales_quick_sale_items: { findMany: jest.fn().mockResolvedValue([]) },
      cafe_waste_records: { findMany: jest.fn().mockResolvedValue([]) },
      sales_shift_sessions: { findMany: jest.fn().mockResolvedValue([]) },
      inv_stock_balances: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CafeDashboardService(prisma, { resolveListFilter: () => [1] } as never);
    const result = await service.summary({ startDate: '2026-09-20', endDate: '2026-09-20' }, {} as never);
    expect(result.paymentMix).toEqual([{ method: 'cash', amount: 100 }]);
    expect(result.outcomes.netSales).toBe(100);
    expect(result.outcomes.grossProfit).toBe(70);
    expect(prisma.sales_quick_sales.findMany.mock.calls[0][0].where.sale_type).toBeUndefined();
  });
});
