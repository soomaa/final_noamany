import { QuickSalesService } from './quick-sales.service';

describe('QuickSalesService invoice discount override', () => {
  it('accepts an invoice-level POS discount without an operating-policy approval gate', async () => {
    const prisma = {
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_id: 1 }) },
      inv_products: {
        findMany: jest.fn().mockResolvedValue([{
          id: 44,
          name_ar: 'مياه',
          product_code: 'INV-44',
          selling_price: 100,
          cost_price: 40,
          unit_of_measure: 'piece',
          status: 'active',
          is_deleted: false,
        }]),
      },
      cafe_products: { findMany: jest.fn().mockResolvedValue([]) },
      sales_pos_payment_methods: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new QuickSalesService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        getNumericSetting: jest.fn().mockResolvedValue(0),
        isTaxEnabled: jest.fn().mockResolvedValue(false),
        getTaxRate: jest.fn().mockResolvedValue(0),
      } as never,
      { isBranchAllowed: () => true } as never,
      { canAny: jest.fn().mockResolvedValue(false) } as never,
    );

    const prepared = await (service as unknown as {
      prepareSale: (...args: unknown[]) => Promise<{ discountPct: number; totalAmount: number }>;
    }).prepareSale({
      branchId: 1,
      discountPercentage: 25,
      paymentMethod: 'cash',
      items: [{ productId: 44, name: 'مياه', quantity: 1 }],
    }, undefined, false);

    expect(prepared.discountPct).toBe(25);
    expect(prepared.totalAmount).toBe(75);
  });
});


