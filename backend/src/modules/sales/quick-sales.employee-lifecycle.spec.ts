import { QuickSalesService } from './quick-sales.service';
import { syncCafeSaleFinance } from '../finance/cafe-finance.util';
import { localDateString } from './sales.utils';

jest.mock('../finance/cafe-finance.util', () => ({ syncCafeSaleFinance: jest.fn() }));
beforeEach(() => jest.clearAllMocks());

function setup(status = 'draft') {
  const date = localDateString();
  const existing = {
    id: 81, sale_number: 'QS-81', daily_number: 81, sale_date: date,
    branch_id: 1, shift_session_id: 7, status, sale_type: 'employee', employee_id: 12,
    employee_benefit_date: date, employee_free_drinks: 1, customer_name: 'كريم أحمد',
    inventory_posted: false, warehouse_id: null, subtotal: 50, total_amount: 0,
    collected_amount: 0, discount_amount: 50, tax_amount: 0, cost_total: 10,
    payment_method: 'cash', items: [{ quantity: 1, free_quantity: 1, inventory_product_id: null }], payments: [],
  };
  const item = { itemType: 'cafe', productType: 'prepared', productId: null,
    cafeProductId: 7, cafeVariantId: null, variantName: null, inventoryProductId: null,
    name: 'لاتيه', productCode: 'CP-7', itemNote: null, unitPrice: 50, unitCost: 10, quantity: 1, consumption: [] };
  const prepared = { saleType: 'employee', customerName: existing.customer_name,
    benefits: { date, enabled: true, limit: 1, remaining: 1 }, employeeFreeDrinks: 1,
    billingCycle: 'immediate', resolvedItems: [item], discountPct: 20, taxPct: 0,
    pricedItems: [{ unitPrice: 50, quantity: 1, freeQuantity: 1 }], cogsAmount: 10,
    lineItems: [{ lineTotal: 50 }], subtotal: 50, discountAmount: 50, taxAmount: 0,
    totalAmount: 0, paymentMethod: 'cash', collectedAmount: 0, paymentRows: [], loyaltyPoints: 0 };
  const tx = {
      payroll_cafe_allocations: { findUnique: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    sales_quick_sales: {
      findUnique: jest.fn().mockResolvedValue(existing),
      aggregate: jest.fn().mockResolvedValue({ _sum: { employee_free_drinks: 0 } }),
      update: jest.fn(async ({ data }) => ({ ...existing, ...data })),
      create: jest.fn(async ({ data }) => ({ id: 81, ...data })),
    },
    sales_pos_payments: { deleteMany: jest.fn() },
    sales_quick_sale_items: { deleteMany: jest.fn() },
    inv_movements: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma = {
    sales_quick_sales: { findUnique: jest.fn().mockResolvedValue(existing) },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const sessions = { findBranchSessionForSale: jest.fn().mockResolvedValue({ id: 9, session_date: date }),
    applySaleToSession: jest.fn(), applySaleReversalToSession: jest.fn() };
  const ledger = { ensureChart: jest.fn(), postQuickSale: jest.fn(), postQuickSaleRefund: jest.fn() };
  const service = new QuickSalesService(prisma as never, {} as never, {} as never, sessions as never,
    ledger as never, { isInventoryTrackingEnabled: jest.fn().mockResolvedValue(false) } as never,
    { isBranchAllowed: () => true } as never, { canAny: jest.fn().mockResolvedValue(true) } as never);
  const internals = service as any;
  jest.spyOn(internals, 'prepareSale').mockResolvedValue(prepared);
  jest.spyOn(internals, 'releaseDraftReservation').mockResolvedValue(undefined);
  jest.spyOn(internals, 'generateSaleIdentity').mockResolvedValue({ saleNumber: 'QS-81', dailyNumber: 81 });
  jest.spyOn(internals, 'mapSales').mockImplementation(async (rows) => rows);
  const dto = { branchId: 1, saleType: 'employee' as const, employeeId: 12, expectedEmployeeFreeDrinks: 1,
    items: [{ cafeProductId: 7, name: 'لاتيه', quantity: 1 }] };
  return { service, internals, tx, dto, existing, prepared, sessions, ledger };
}

describe('employee allowance through saved invoice lifecycle', () => {
  it('persists the free item and daily reservation when holding an order', async () => {
    const { service, tx, dto } = setup();
    await service.create({ ...dto, onHold: true }, 2);
    const data = tx.sales_quick_sales.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ employee_benefit_date: localDateString(), employee_free_drinks: 1, status: 'draft' });
    expect(data.items.create[0]).toMatchObject({ free_quantity: 1 });
    expect(Number(data.discount_amount)).toBe(50);
    expect(Number(data.total_amount)).toBe(0);
    expect(tx.sales_quick_sales.aggregate).toHaveBeenCalled();
    expect(syncCafeSaleFinance).not.toHaveBeenCalled();
  });

  it('keeps an edited draft on its original shift board with the saved free quantity', async () => {
    const { service, tx, dto } = setup();
    await service.reviseDraft(81, dto, 2, false);
    const data = tx.sales_quick_sales.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ shift_session_id: 7, employee_free_drinks: 1, status: 'draft' });
    expect(data.items.create[0]).toMatchObject({ free_quantity: 1 });
    expect(syncCafeSaleFinance).not.toHaveBeenCalled();
  });

  it('finalizes a fully free invoice as settled on the collecting shift', async () => {
    const { service, tx, dto } = setup();
    await service.reviseDraft(81, dto, 2, true);
    const data = tx.sales_quick_sales.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ employee_free_drinks: 1, shift_session_id: 9,
      status: 'completed', billing_status: 'settled' });
    expect(Number(data.total_amount)).toBe(0);
    expect(data.items.create[0]).toMatchObject({ free_quantity: 1 });
    expect(syncCafeSaleFinance).toHaveBeenCalledWith(tx, expect.objectContaining({ status: 'completed', employee_free_drinks: 1 }));
  });

  it('rejects finalization after another terminal has already completed the draft', async () => {
    const { service, tx, dto } = setup();
    tx.sales_quick_sales.findUnique.mockResolvedValue({ status: 'completed' } as never);
    await expect(service.reviseDraft(81, dto, 2, true)).rejects.toThrow('لم تعد مسودة');
    expect(tx.sales_quick_sale_items.deleteMany).not.toHaveBeenCalled();
    expect(syncCafeSaleFinance).not.toHaveBeenCalled();
  });

  it('refunds only the stored paid amount and leaves the consumed free allowance intact', async () => {
    const { service, tx, sessions, existing } = setup('completed');
    await service.update(81, { status: 'refunded', notes: 'تم الاسترداد بناء على طلب الموظف' }, 2);
    expect(sessions.applySaleReversalToSession).toHaveBeenCalledWith(tx, 9,
      expect.objectContaining({ totalAmount: 0, collectedAmount: 0, discountAmount: 50 }));
    const data = tx.sales_quick_sales.update.mock.calls[0][0].data;
    expect(data.status).toBe('refunded');
    expect(data).not.toHaveProperty('employee_free_drinks');
    expect(syncCafeSaleFinance).toHaveBeenCalledWith(tx, existing, { date: localDateString(), createdBy: 2 });
  });
});

