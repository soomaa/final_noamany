import { QuickSalesService } from './quick-sales.service';
import { syncCafeSaleFinance } from '../finance/cafe-finance.util';
jest.mock('../finance/cafe-finance.util', () => ({ syncCafeSaleFinance: jest.fn() }));
beforeEach(() => jest.clearAllMocks());

describe('QuickSalesService inventory operating mode', () => {
  const preparedSale = {
    saleType: 'customer',
    customerName: 'اسم العميل المحفوظ',
    employeeFreeDrinks: 0,
    benefits: null,
    billingCycle: 'immediate',
    resolvedItems: [{
      itemType: 'cafe',
      productType: 'ready',
      productId: 44,
      cafeProductId: 3,
      cafeVariantId: null,
      variantName: null,
      inventoryProductId: 44,
      name: 'مياه',
      productCode: 'CP-000003',
      itemNote: null,
      unitPrice: 15,
      unitCost: 10,
      quantity: 2,
      consumption: [{
        productId: 44,
        quantity: 2,
        unitCost: 10,
        ingredientName: 'مياه',
        unit: 'piece',
      }],
    }],
    discountPct: 0,
    taxPct: 0,
    pricedItems: [{ unitPrice: 15, quantity: 2 }],
    cogsAmount: 20,
    lineItems: [{ lineTotal: 30 }],
    subtotal: 30,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 30,
    paymentMethod: 'cash',
    collectedAmount: 30,
    paymentRows: [{ method: 'cash', amount: 30 }],
    loyaltyPoints: 3,
  };

  function buildService(inventoryTrackingEnabled: boolean) {
    const tx = {
      sales_quick_sales: { create: jest.fn(async ({ data }) => ({ id: 90, ...data })) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const stock = { applyMovement: jest.fn().mockResolvedValue({}) };
    const sessions = {
      findBranchSessionForSale: jest.fn().mockResolvedValue({ id: 7 }),
      applySaleToSession: jest.fn().mockResolvedValue(undefined),
    };
    const ledger = {
      ensureChart: jest.fn().mockResolvedValue(undefined),
      postQuickSale: jest.fn().mockResolvedValue(undefined),
    };
    const posSettings = {
      isInventoryTrackingEnabled: jest.fn().mockResolvedValue(inventoryTrackingEnabled),
    };
    const service = new QuickSalesService(
      prisma as never,
      stock as never,
      { resolveBranchStockLocation: jest.fn().mockResolvedValue(5) } as never,
      sessions as never,
      ledger as never,
      posSettings as never,
      { isBranchAllowed: () => true } as never,
      { canAny: jest.fn().mockResolvedValue(true) } as never,
     {} as never);
    const internals = service as unknown as {
      prepareSale: (...args: unknown[]) => Promise<unknown>;
      generateSaleIdentity: (...args: unknown[]) => Promise<{ saleNumber: string; dailyNumber: number }>;
      map: (row: unknown) => unknown;
      resolveWarehouse: (...args: unknown[]) => Promise<number>;
      assertStockAvailability: (...args: unknown[]) => Promise<void>;
    };
    jest.spyOn(internals, 'prepareSale').mockResolvedValue(preparedSale);
    jest.spyOn(internals, 'generateSaleIdentity').mockResolvedValue({
      saleNumber: 'QS-000090',
      dailyNumber: 90,
    });
    jest.spyOn(internals, 'map').mockImplementation((row: unknown) => row);
    return { service, internals, tx, stock, ledger };
  }

  it('records revenue and item cost but creates no inventory effect in cashier-only mode', async () => {
    const { service, tx, stock, ledger } = buildService(false);

    await service.create({
      branchId: 1, gender: 'female' as const, cafeCategoryId: 1,
      items: [{ cafeProductId: 3, name: 'مياه', quantity: 2 }],
    }, 12);

    const data = tx.sales_quick_sales.create.mock.calls[0][0].data;
    expect(data.customer_name).toBe(preparedSale.customerName);
    expect(syncCafeSaleFinance).toHaveBeenCalledWith(tx, expect.objectContaining({ sale_number: 'QS-000090', total_amount: expect.anything() }));
    expect(data.inventory_posted).toBe(false);
    expect(data.warehouse_id).toBeNull();
    expect(Number(data.cost_total)).toBe(20);
    expect(stock.applyMovement).not.toHaveBeenCalled();
    expect(ledger.postQuickSale).toHaveBeenCalledWith(
      expect.objectContaining({ totalAmount: 30, cogsAmount: 0 }),
      tx,
    );
  });

  it('checks and deducts the same sale when cashier and inventory mode is enabled', async () => {
    const { service, internals, tx, stock, ledger } = buildService(true);
    jest.spyOn(internals, 'resolveWarehouse').mockResolvedValue(5);
    const stockCheck = jest.spyOn(internals, 'assertStockAvailability').mockResolvedValue(undefined);

    await service.create({
      branchId: 1, gender: 'female' as const, cafeCategoryId: 1,
      items: [{ cafeProductId: 3, name: 'مياه', quantity: 2 }],
    }, 12);

    const data = tx.sales_quick_sales.create.mock.calls[0][0].data;
    expect(data.inventory_posted).toBe(true);
    expect(data.warehouse_id).toBe(5);
    expect(stockCheck).toHaveBeenCalled();
    expect(stock.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 44, warehouseId: 5, quantity: 2 }),
      tx,
    );
    expect(ledger.postQuickSale).toHaveBeenCalledWith(
      expect.objectContaining({ cogsAmount: 20 }),
      tx,
    );
  });

  it.each(['employee', 'partner'] as const)('uses the same inventory deduction path for %s account sales', async (saleType) => {
    const { service, internals, tx, stock } = buildService(true);
    jest.spyOn(internals, 'prepareSale').mockResolvedValue({
      ...preparedSale,
      saleType,
      billingCycle: 'daily',
      collectedAmount: 0,
      paymentRows: [],
    });
    jest.spyOn(internals, 'resolveWarehouse').mockResolvedValue(5);
    jest.spyOn(internals, 'assertStockAvailability').mockResolvedValue(undefined);

    await service.create({
      branchId: 1, gender: 'female' as const, cafeCategoryId: 1,
      saleType,
      employeeId: saleType === 'employee' ? 21 : undefined,
      partnerId: saleType === 'partner' ? 31 : undefined,
      billingCycle: 'daily',
      items: [{ cafeProductId: 3, name: 'مياه', quantity: 2 }],
    }, 12);

    const data = tx.sales_quick_sales.create.mock.calls[0][0].data;
    expect(data.inventory_posted).toBe(true);
    expect(stock.applyMovement).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 44, warehouseId: 5, quantity: 2 }),
      tx,
    );
  });

  it('links a held invoice to the active shift so the drafts board can find it', async () => {
    const { service, internals, tx } = buildService(true);
    jest.spyOn(internals, 'resolveWarehouse').mockResolvedValue(5);
    jest.spyOn(internals, 'assertStockAvailability').mockResolvedValue(undefined);

    await service.create({
      branchId: 1, gender: 'female' as const, cafeCategoryId: 1,
      onHold: true,
      items: [{ cafeProductId: 3, name: 'مياه', quantity: 2 }],
    }, 12);

    const data = tx.sales_quick_sales.create.mock.calls[0][0].data;
    expect(syncCafeSaleFinance).not.toHaveBeenCalled();
    expect(data.status).toBe('draft');
    expect(data.shift_session_id).toBe(7);
  });
});
