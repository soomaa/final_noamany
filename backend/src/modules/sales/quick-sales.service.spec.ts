import { QuickSalesService } from './quick-sales.service';

const preparedSale = {
  saleType: 'customer',
  billingCycle: 'immediate',
  resolvedItems: [],
  discountPct: 0,
  taxPct: 0,
  pricedItems: [],
  cogsAmount: 0,
  lineItems: [],
  subtotal: 0,
  discountAmount: 0,
  taxAmount: 0,
  totalAmount: 0,
  paymentMethod: 'cash',
  collectedAmount: 0,
  paymentRows: [],
  loyaltyPoints: 0,
};

function createSubject(employee: { id: number } | null = { id: 41 }) {
  const tx = {
    sales_quick_sales: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    employees: { findFirst: jest.fn().mockResolvedValue(employee) },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const service = new QuickSalesService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { canAny: jest.fn().mockResolvedValue(true) } as never,
  );

  Object.assign(service as object, {
    prepareSale: jest.fn().mockResolvedValue(preparedSale),
    resolveWarehouse: jest.fn().mockResolvedValue(1),
    assertStockAvailability: jest.fn().mockResolvedValue(undefined),
    generateSaleIdentity: jest.fn().mockResolvedValue({ saleNumber: 'QS-1', dailyNumber: 1 }),
    map: jest.fn(() => ({})),
  });

  return { service, prisma, tx };
}

describe('QuickSalesService target salesperson', () => {
  it('stores the explicitly selected target employee on the sale header', async () => {
    const { service, tx } = createSubject();

    await service.create({
      branchId: 2,
      gender: 'male',
      cafeCategoryId: 7,
      items: [],
      onHold: true,
      targetEmployeeId: 41,
    } as any, 7);

    expect(tx.sales_quick_sales.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ target_employee_id: 41 }),
    }));
  });

  it('rejects an unknown target employee instead of silently saving the sale', async () => {
    const { service } = createSubject(null);

    await expect(service.create({
      branchId: 2,
      gender: 'male',
      cafeCategoryId: 7,
      items: [],
      onHold: true,
      targetEmployeeId: 99,
    } as any, 7)).rejects.toThrow('مندوب التارجت');
  });
});
