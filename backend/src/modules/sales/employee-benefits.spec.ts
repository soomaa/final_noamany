import { allocateFreeDrinks, computeSaleTotals } from './sales.utils';
import { localDateString } from './sales.utils';
import { QuickSalesService } from './quick-sales.service';

describe('daily employee drinks', () => {
  it('allocates only whole eligible drinks in order and never exceeds the remaining allowance', () => {
    expect(allocateFreeDrinks([
      { quantity: 2, eligible: false },
      { quantity: 3, eligible: true },
      { quantity: 1, eligible: true },
    ], 1)).toEqual([0, 1, 0]);
    expect(allocateFreeDrinks([{ quantity: 0.5, eligible: true }], 1)).toEqual([0]);
  });
  it('discounts only paid drinks and taxes the net amount', () => {
    const totals = computeSaleTotals([{ unitPrice: 50, quantity: 3, freeQuantity: 1 }], 20, 10);
    expect(totals).toMatchObject({ subtotal: 150, discountAmount: 70, taxAmount: 8, totalAmount: 88 });
  });
  it('charges normally when exhausted and keeps fully free orders at zero', () => {
    expect(computeSaleTotals([{ unitPrice: 50, quantity: 1, freeQuantity: 0 }], 0, 10).totalAmount).toBe(55);
    expect(computeSaleTotals([{ unitPrice: 50, quantity: 1, freeQuantity: 1 }], 20, 10).totalAmount).toBe(0);
  });
});

describe('employee allowance persistence', () => {
  function setup(used = 0) {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { employee_free_drinks: used } });
    const prisma = { sales_quick_sales: { aggregate }, cafe_products: { findMany: jest.fn().mockResolvedValue([{ id: 7 }]) } };
    const service = new QuickSalesService(prisma as never, {} as never, {} as never, {} as never, {} as never, {
      getCategory: jest.fn().mockResolvedValue([
        { key: 'employee_free_drinks_enabled', value: true },
        { key: 'employee_free_drinks_daily', value: 1 },
        { key: 'employee_free_drink_categories', value: [3] },
      ]),
    } as never, { isBranchAllowed: (_user: unknown, branch: number) => branch === 1 } as never, {} as never);
    return { aggregate, prisma, service };
  }
  it('counts the Cairo calendar day across shifts and branches, including reserved drafts', async () => {
    const { service, aggregate } = setup(1);
    expect(await service.employeeBenefits(12, 1)).toMatchObject({ remaining: 0, used: 1, eligibleProductIds: [7] });
    expect(aggregate).toHaveBeenCalledWith({ where: { employee_id: 12, employee_benefit_date: localDateString(), status: { in: ['completed', 'draft', 'refunded'] } }, _sum: { employee_free_drinks: true } });
    await expect(service.employeeBenefits(12, 2)).rejects.toThrow('الفرع');
  });
  it('excludes the draft being edited so its allowance is not counted twice', async () => {
    const { service, aggregate } = setup();
    await service.employeeBenefits(12, 1, undefined, 81);
    expect(aggregate.mock.calls[0][0].where.id).toEqual({ not: 81 });
  });
  it('rejects stale allowance after another terminal uses it, before recording a sale', async () => {
    const { service } = setup();
    const benefits = await service.employeeBenefits(12, 1);
    const lock = jest.fn().mockResolvedValue([{ id: 12 }]);
    const aggregate = jest.fn().mockImplementation(async () => {
      expect(lock).toHaveBeenCalledTimes(1);
      return { _sum: { employee_free_drinks: 1 } };
    });
    await expect((service as any).verifyEmployeeAllowance({ $queryRaw: lock, sales_quick_sales: { aggregate } }, 12, benefits, 1)).rejects.toThrow('تغير رصيد');
  });
  it('rejects a snapshot from yesterday even when the count is available', async () => {
    const { service, prisma } = setup();
    const benefits = { ...await service.employeeBenefits(12, 1), date: '2000-01-01' };
    await expect((service as any).verifyEmployeeAllowance({ ...prisma, $queryRaw: jest.fn() }, 12, benefits, 1)).rejects.toThrow('تغير رصيد');
  });
});

describe('authoritative employee pricing', () => {
  it.each([
    [true, true, 0, 3, 1, 80],
    [true, false, 0, 3, 1, 100],
    [false, true, 0, 3, 0, 120],
    [false, false, 0, 3, 0, 150],
    [true, true, 1, 3, 0, 120],
    [true, true, 0, 1, 1, 0],
  ])('combines enabled benefits %s/%s with used=%s and quantity=%s', async (free, discount, used, quantity, expectedFree, total) => {
    const product = { id: 7, name: 'لاتيه', product_code: 'CP-7', category_id: 3, product_type: 'ready', business_classification: 'bar', inventory_product_id: 40, sell_price: 50, variants: [], recipes: [], inventory_product: { id: 40, cost_price: 10, status: 'active', is_deleted: false, name_ar: 'لاتيه', unit_of_measure: 'piece' } };
    const prisma = {
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_id: 1 }) },
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 12, employee: "كريم أحمد" }) },
      inv_products: { findMany: jest.fn().mockResolvedValue([]) },
      cafe_products: { findMany: jest.fn().mockResolvedValue([product]) },
      sales_quick_sales: { aggregate: jest.fn().mockResolvedValue({ _sum: { employee_free_drinks: used } }) },
      sales_pos_payment_methods: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new QuickSalesService(prisma as never, {} as never, {} as never, {} as never, {} as never, {
      getCategory: jest.fn().mockResolvedValue([
        { key: 'employee_free_drinks_enabled', value: free }, { key: 'employee_free_drinks_daily', value: 1 },
        { key: 'employee_free_drink_categories', value: [3] }, { key: 'employee_discount_enabled', value: discount },
      ]), getNumericSetting: jest.fn().mockResolvedValue(20), isTaxEnabled: jest.fn().mockResolvedValue(false),
    } as never, { isBranchAllowed: () => true } as never, {} as never);
    const result = await (service as any).prepareSale({ branchId: 1, saleType: 'employee', employeeId: 12, customerName: 'عميل نقدي', billingCycle: 'immediate', discountPercentage: 20,
      expectedEmployeeFreeDrinks: expectedFree, items: [{ cafeProductId: 7, name: 'لاتيه', quantity }], paymentMethod: 'cash' });
    expect(result.customerName).toBe("كريم أحمد");
    expect(result.totalAmount).toBe(total);
    expect(result.employeeFreeDrinks).toBe(expectedFree);
    expect(result.cogsAmount).toBe(quantity * 10);
    if (total === 0) expect(result.paymentRows).toEqual([]);
  });
});
