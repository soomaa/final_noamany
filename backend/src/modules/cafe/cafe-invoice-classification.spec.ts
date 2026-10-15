import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { assertCafeInvoiceClassification, assertCafeInvoiceProducts } from './cafe-invoice-classification';
import { CreateQuickSaleDto, EditCompletedQuickSaleDto } from '../sales/dto/quick-sales.dto';
import { SellCafeCartDto } from './dto/sell-cafe-cart.dto';
import { SellCafeProductDto } from './dto/sell-cafe-product.dto';
import { QuickSalesService } from '../sales/quick-sales.service';

describe('cafe invoice classification', () => {
  it.each([CreateQuickSaleDto, EditCompletedQuickSaleDto, SellCafeCartDto, SellCafeProductDto])(
    '%p rejects missing, invalid and non-positive header classification through inherited DTO validation', async Dto => {
      for (const values of [{}, { gender: 'other', cafeCategoryId: 0 }, { gender: 'male', cafeCategoryId: 1.2 }]) {
        const errors = await validate(plainToInstance(Dto as typeof CreateQuickSaleDto, values));
        expect(errors.some(error => ['gender', 'cafeCategoryId'].includes(error.property))).toBe(true);
      }
      const errors = await validate(plainToInstance(Dto as typeof CreateQuickSaleDto, { gender: 'female', cafeCategoryId: '7' }));
      expect(errors.filter(error => ['gender', 'cafeCategoryId'].includes(error.property))).toEqual([]);
    },
  );

  it('uses the existing active inventory category and never guesses a classification', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 7 });
    const db = { inv_categories: { findFirst } } as any;
    await assertCafeInvoiceClassification(db, { gender: 'female', cafeCategoryId: 7 });
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 7, is_active: true, is_deleted: false }, select: { id: true } });
    for (const values of [{ gender: undefined, cafeCategoryId: 7 }, { gender: 'male', cafeCategoryId: undefined }]) {
      await expect(assertCafeInvoiceClassification(db, values as any)).rejects.toThrow();
    }
    findFirst.mockResolvedValue(null);
    await expect(assertCafeInvoiceClassification(db, { gender: 'male', cafeCategoryId: 7 })).rejects.toThrow('غير متاحة');
  });

  it('accepts primary or additional categories and rejects mixed or uncategorized products', () => {
    const multi = { name: 'لاتيه', category_id: 1, category_assignments: [{ category_id: 7 }] };
    expect(() => assertCafeInvoiceProducts(7, [multi, { name_ar: 'قهوة', category_id: 7 }])).not.toThrow();
    expect(() => assertCafeInvoiceProducts(1, [multi])).not.toThrow();
    expect(() => assertCafeInvoiceProducts(7, [multi, { name: 'مياه', category_id: 2 }])).toThrow('مياه');
    expect(() => assertCafeInvoiceProducts(7, [{ name: 'غير مصنف', category_id: null }])).toThrow('لا ينتمي');
  });
});

describe('authoritative quick-sale invoice category', () => {
  function setup() {
    const product = { id: 7, name: 'لاتيه', category_id: 1, category_assignments: [{ category_id: 7 }],
      product_type: 'ready', inventory_product_id: 40, sell_price: 50, variants: [], recipes: [],
      inventory_product: { id: 40, cost_price: 10, status: 'active', is_deleted: false, name_ar: 'لاتيه', unit_of_measure: 'piece' } };
    const prisma = {
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_id: 1 }) },
      inv_categories: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
      inv_products: { findMany: jest.fn().mockResolvedValue([]) },
      cafe_products: { findMany: jest.fn().mockResolvedValue([product]), findFirst: jest.fn().mockResolvedValue(product) },
      sales_pos_payment_methods: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const bundleResolver = jest.fn();
    const service = new QuickSalesService(prisma as never, {} as never, {} as never, {} as never, {} as never,
      { getNumericSetting: jest.fn().mockResolvedValue(0), isTaxEnabled: jest.fn().mockResolvedValue(false) } as never,
      { isBranchAllowed: () => true } as never, {} as never, { resolveBundleSale: bundleResolver } as never);
    const dto = { branchId: 1, gender: 'female' as const, cafeCategoryId: 7,
      items: [{ cafeProductId: 7, name: 'لاتيه', quantity: 1 }], paymentMethod: 'cash' };
    return { service: service as any, prisma, product, dto, bundleResolver };
  }

  it('checks real product assignments, including a category shared by multiple lines', async () => {
    const f = setup();
    expect(await f.service.prepareSale({ ...f.dto, items: [...f.dto.items, ...f.dto.items] })).toMatchObject({ totalAmount: 100 });
    f.product.category_assignments = [];
    await expect(f.service.prepareSale(f.dto)).rejects.toThrow('لا ينتمي');
    f.product.category_id = 7;
    await expect(f.service.prepareSale(f.dto)).resolves.toMatchObject({ totalAmount: 50 });
  });

  it('applies the same check to a bundle component, even when the browser omits its choices', async () => {
    const f = setup();
    f.prisma.cafe_products.findMany.mockResolvedValue([]);
    f.product.category_assignments = [];
    f.bundleResolver.mockImplementation(async (db, _line, warehouse, resolver) => {
      await resolver(db, 7, null, 1, warehouse);
      throw new Error('bundle must not reach pricing');
    });
    await expect(f.service.prepareSale({ ...f.dto, items: [{ bundleId: 1, name: 'عرض', quantity: 1 }] }))
      .rejects.toThrow('لا ينتمي');
  });
});
