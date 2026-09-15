import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CafeProductsService } from './cafe-products.service';

describe('CafeProductsService', () => {
  let service: CafeProductsService;
  let stockMock: { applyMovement: jest.Mock };
  let locationMock: { resolveBranchStockLocation: jest.Mock };
  let ledgerMock: { postQuickSale: jest.Mock };
  let posSettingsMock: { isTaxEnabled: jest.Mock; getTaxRate: jest.Mock; isInventoryTrackingEnabled: jest.Mock };
  let prismaMock: Record<string, unknown>;

  beforeEach(() => {
    stockMock = { applyMovement: jest.fn().mockResolvedValue({}) };
    locationMock = { resolveBranchStockLocation: jest.fn().mockResolvedValue(5) };
    ledgerMock = { postQuickSale: jest.fn().mockResolvedValue(undefined) };
    posSettingsMock = {
      isTaxEnabled: jest.fn().mockResolvedValue(true),
      getTaxRate: jest.fn().mockResolvedValue(15),
      isInventoryTrackingEnabled: jest.fn().mockResolvedValue(true),
    };

    const tx = {
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_id: 1 }) },
      inv_warehouses: {
        findFirst: jest.fn().mockResolvedValue({ id: 5, branch_id: 1, status: 'active' }),
      },
      inv_stock_balances: {
        findUnique: jest.fn().mockResolvedValue({ current_stock: 1000 }),
      },
      sales_quick_sales: {
        create: jest.fn().mockResolvedValue({
          id: 99,
          sale_number: 'CF-2026-000001',
          items: [],
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ maxNum: 0 }]),
    };

    prismaMock = {
      cafe_products: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      cafe_product_recipes: { count: jest.fn().mockResolvedValue(0) },
      cafe_variant_recipes: { count: jest.fn().mockResolvedValue(0) },
      sales_quick_sale_items: { count: jest.fn().mockResolvedValue(0) },
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_id: 1 }) },
      inv_products: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };

    service = new CafeProductsService(
      prismaMock as never,
      stockMock as never,
      locationMock as never,
      ledgerMock as never,
      posSettingsMock as never,
      { resolveListFilter: () => null } as never,
    );
  });

  describe('opening stock branch', () => {
    it('accepts an explicit stock branch for an unrestricted cafe user', async () => {
      const branchId = await (service as unknown as {
        resolveOpeningStockBranchId: (preferred?: number, userBranch?: number) => Promise<number>;
      }).resolveOpeningStockBranchId(1, 0);

      expect(branchId).toBe(1);
      expect((prismaMock.tbl_branches as { findUnique: jest.Mock }).findUnique).toHaveBeenCalledWith({
        where: { branch_id: 1 },
        select: { branch_id: true },
      });
    });
  });

  it('filters feedback to linked authoritative members for a scoped audience and excludes unlinked rows', async () => {
    const feedbackRows = [
      { id: 1, rating: 5, comment: 'رجال', feedback_date: new Date(), item: { id: 1, item_type: 'cafe', cafe_product_id: 1, product_id: null, cafe_variant_id: null, variant_name: null, name: 'ماء' }, invoice: { id: 1, daily_number: 1, sale_number: 'A', sale_date: '2026-01-01', customer_member_id: 10 } },
      { id: 2, rating: 1, comment: 'سيدات', feedback_date: new Date(), item: { id: 2, item_type: 'cafe', cafe_product_id: 1, product_id: null, cafe_variant_id: null, variant_name: null, name: 'ماء' }, invoice: { id: 2, daily_number: 2, sale_number: 'B', sale_date: '2026-01-01', customer_member_id: 11 } },
      { id: 3, rating: 1, comment: 'نقدي', feedback_date: new Date(), item: { id: 3, item_type: 'cafe', cafe_product_id: 1, product_id: null, cafe_variant_id: null, name: 'ماء' }, invoice: { id: 3, daily_number: 3, sale_number: 'C', sale_date: '2026-01-01', customer_member_id: null } },
    ];
    (prismaMock as any).sales_invoice_item_feedback = { findMany: jest.fn().mockResolvedValue(feedbackRows) };
    (prismaMock as any).club_members = { findMany: jest.fn().mockResolvedValue([{ id: 10 }]) };
    const scoped = new CafeProductsService(prismaMock as never, stockMock as never, locationMock as never, ledgerMock as never, posSettingsMock as never, { resolveListFilter: () => null, memberGenderFilter: () => 'male' } as never);
    await expect(scoped.itemFeedbackReport(undefined, undefined, undefined, { sub: 1 } as any)).resolves.toMatchObject({ totalRatings: 1, recent: [expect.objectContaining({ invoiceId: 1 })] });
  });

  it('rejects a feedback audience that conflicts with the authenticated audience', async () => {
    const scoped = new CafeProductsService(prismaMock as never, stockMock as never, locationMock as never, ledgerMock as never, posSettingsMock as never, { resolveListFilter: () => null, memberGenderFilter: () => 'male' } as never);
    await expect(scoped.itemFeedbackReport(undefined, undefined, undefined, { sub: 1 } as any, 'female')).rejects.toThrow('لا يمكن تغيير قسم');
  });

  it('rejects an invalid feedback audience before querying Prisma', async () => {
    await expect(service.itemFeedbackReport(undefined, undefined, undefined, { sub: 1 } as any, 'bogus' as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect((prismaMock as any).sales_invoice_item_feedback).toBeUndefined();
  });

  describe('create', () => {
    it('rejects a new saleable product until Protein or Bar is selected explicitly', async () => {
      await expect(service.create({
        name: 'مياه',
        productType: 'ready',
        sellPrice: 15,
      }, { sub: 1, branch: 1 } as never)).rejects.toThrow('Protein أو Bar');

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('rejects sell price below recipe cost', async () => {
      (prismaMock.inv_products as { findMany: jest.Mock }).findMany.mockResolvedValue([
        { id: 1, cost_price: 10, unit_of_measure: 'kg' },
      ]);

      await expect(
        service.create({
          name: 'Latte',
          sellPrice: 5,
          businessClassification: 'bar',
          recipes: [{ ingredientId: 1, quantity: 1, unit: 'kg' as const }],
        }, { sub: 1, branch: 1 } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a ready cafe product inside the ready-products inventory section', async () => {
      const tx = {
        inv_products: {
          create: jest.fn().mockResolvedValue({ id: 41 }),
        },
      };

      const id = await (service as unknown as {
        ensureStockInventoryProduct: (
          client: typeof tx,
          dto: Record<string, unknown>,
          productCode: string,
          inventoryKind: string,
          calculatedCost: number,
        ) => Promise<number>;
      }).ensureStockInventoryProduct(
        tx,
        { name: 'مياه', sellPrice: 15, initialCost: 10, readyUnit: 'piece', readyMinStock: 5 },
        'CP-000009',
        'ready_product',
        0,
      );

      expect(id).toBe(41);
      expect(tx.inv_products.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          inventory_kind: 'ready_product',
          inventory_section: 'ready_products',
        }),
      }));
    });

    it('accepts a portion of a ready-stock product as a recipe addition', async () => {
      (prismaMock.inv_products as { findMany: jest.Mock }).findMany.mockResolvedValue([
        {
          id: 31,
          name_ar: 'جرانولا',
          cost_price: 120,
          unit_of_measure: 'kg',
          inventory_kind: 'ready_product',
          inventory_section: 'ready_products',
          is_deleted: false,
          status: 'active',
        },
      ]);

      const cost = await (service as unknown as {
        estimateRecipeCost: (recipes: Array<{ ingredientId: number; quantity: number; unit: 'g' }>) => Promise<number>;
      }).estimateRecipeCost([{ ingredientId: 31, quantity: 30, unit: 'g' }]);

      expect(cost).toBe(3.6);
      expect((prismaMock.inv_products as { findMany: jest.Mock }).findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { inventory_kind: 'ready_product', inventory_section: 'ready_products' },
              ]),
            }),
          ]),
        }),
      }));
    });
  });

  describe('price list', () => {
    it('updates a prepared product price without revalidating legacy ingredient kinds', async () => {
      const tx = {
        cafe_products: { update: jest.fn().mockResolvedValue({}) },
        cafe_product_variants: { update: jest.fn().mockResolvedValue({}) },
        inv_products: { update: jest.fn().mockResolvedValue({}) },
      };
      (prismaMock.cafe_products as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
        id: 7,
        product_type: 'prepared',
        inventory_product_id: null,
        inventory_product: null,
        variants: [{ id: 11, is_default: true, is_active: true }],
      });
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (callback: (client: typeof tx) => unknown) => callback(tx),
      );
      jest.spyOn(service, 'findOne').mockResolvedValue({ cost: 20 } as never);

      await service.updatePrice(7, 45);

      expect(tx.cafe_products.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { sell_price: 45 },
      });
      expect(tx.cafe_product_variants.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: { sell_price: 45 },
      });
      expect((prismaMock.inv_products as { findMany: jest.Mock }).findMany).not.toHaveBeenCalled();
    });
  });

  describe('sellCart dryRun', () => {
    it('returns preview without writing', async () => {
      (prismaMock.cafe_products as { findMany: jest.Mock }).findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Latte',
          product_code: 'CP-000001',
          sell_price: 25,
          is_active: true,
          product_type: 'prepared',
          inventory_product: null,
          variants: [],
          recipes: [
            {
              ingredient_id: 1,
              quantity: 200,
              unit: 'ml',
              ingredient: { id: 1, name_ar: 'حليب', unit_of_measure: 'ml', cost_price: 0.01 },
            },
          ],
        },
      ]);

      const result = await service.sellCart(
        { branchId: 1, items: [{ productId: 1, quantity: 2 }] },
        1,
        true,
      );

      expect(result).toMatchObject({ dryRun: true });
      expect(stockMock.applyMovement).not.toHaveBeenCalled();
    });

    it('uses the selected variant price and recipe', async () => {
      posSettingsMock.isTaxEnabled.mockResolvedValue(false);
      (prismaMock.cafe_products as { findMany: jest.Mock }).findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Espresso',
          product_code: 'CP-000002',
          sell_price: 20,
          is_active: true,
          product_type: 'prepared',
          inventory_product: null,
          recipes: [],
          variants: [{
            id: 7,
            name: 'Double',
            sell_price: 35,
            is_active: true,
            is_default: false,
            recipes: [{
              ingredient_id: 1,
              quantity: 20,
              unit: 'g',
              ingredient: { id: 1, name_ar: 'بن', unit_of_measure: 'g', cost_price: 0.2 },
            }],
          }],
        },
      ]);

      const result = await service.sellCart(
        { branchId: 1, items: [{ productId: 1, variantId: 7, quantity: 2 }] },
        1,
        true,
      );

      expect(result).toMatchObject({
        preview: {
          subtotal: 70,
          consumption: [expect.objectContaining({ ingredientId: 1, needed: 40 })],
        },
      });
    });
  });

  describe('findOne', () => {
    it('throws when missing', async () => {
      (prismaMock.cafe_products as { findUnique: jest.Mock }).findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('archive and permanent deletion', () => {
    it('moves a product between active and archive and syncs its inventory status', async () => {
      const tx = {
        cafe_products: { update: jest.fn().mockResolvedValue({}) },
        inv_products: { update: jest.fn().mockResolvedValue({}) },
      };
      (prismaMock.cafe_products as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
        id: 12,
        inventory_product_id: 44,
        is_active: true,
      });
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (callback: (client: typeof tx) => unknown) => callback(tx),
      );

      await service.updateStatus(12, false);

      expect(tx.cafe_products.update).toHaveBeenCalledWith({
        where: { id: 12 },
        data: { is_active: false },
      });
      expect(tx.inv_products.update).toHaveBeenCalledWith({
        where: { id: 44 },
        data: { status: 'inactive' },
      });
    });

    it('refuses permanent deletion when sales history exists', async () => {
      (prismaMock.cafe_products as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
        id: 12,
        name: 'Latte',
        inventory_product_id: null,
        is_active: false,
      });
      (prismaMock.sales_quick_sale_items as { count: jest.Mock }).count.mockResolvedValue(1);

      await expect(service.remove(12)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('permanently deletes an archived unsold product', async () => {
      const tx = {
        cafe_products: { delete: jest.fn().mockResolvedValue({}) },
        inv_products: { update: jest.fn().mockResolvedValue({}) },
      };
      (prismaMock.cafe_products as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
        id: 12,
        name: 'Test product',
        inventory_product_id: 44,
        is_active: false,
      });
      (prismaMock.$transaction as jest.Mock).mockImplementation(
        async (callback: (client: typeof tx) => unknown) => callback(tx),
      );

      await service.remove(12);

      expect(tx.cafe_products.delete).toHaveBeenCalledWith({ where: { id: 12 } });
      expect(tx.inv_products.update).toHaveBeenCalledWith({
        where: { id: 44 },
        data: { status: 'inactive', is_deleted: true },
      });
    });
  });
});
