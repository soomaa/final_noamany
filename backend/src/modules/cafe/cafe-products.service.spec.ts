import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CafeProductsService, combineCafeWasteReport } from './cafe-products.service';

describe('combineCafeWasteReport', () => {
  it('separates automatic and active manual waste while excluding reversed records', () => {
    const automatic = [{ id: 1, total_amount: 12, txn_date: new Date('2026-08-20'), items: [] }];
    const manual = [
      { status: 'active', total_cost: 25, transaction: { id: 2, total_amount: 25, txn_date: new Date('2026-08-21'), items: [] } },
      { status: 'reversed', total_cost: 40, transaction: { id: 3, total_amount: 40, txn_date: new Date('2026-08-21'), items: [] } },
    ];

    const result = combineCafeWasteReport(automatic as never, manual as never);

    expect(result.automaticCost).toBe(12);
    expect(result.manualCost).toBe(25);
    expect(result.totalCost).toBe(37);
    expect(result.transactions.map((row) => row.id)).toEqual([2, 1]);
  });
});

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
        aggregate: jest.fn().mockResolvedValue({ _max: { daily_number: 0 } }),
        create: jest.fn().mockResolvedValue({
          id: 99,
          sale_number: 'CF-2026-000001',
          items: [],
        }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ maxNum: 0 }]),
    };

    prismaMock = {
      inv_categories: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
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
     {} as never);
  });

  describe('reports', () => {
    it('loads saved split payments under the same branch and operating-date filter as the report', async () => {
      const invoice = {
        id: 1, status: 'completed', payment_method: 'mixed', total_amount: 100, collected_amount: 100,
        subtotal: 100, discount_amount: 0, tax_amount: 0, cost_total: 20,
        sale_type: 'customer', billing_cycle: 'immediate', business_date: '2026-09-07', sale_date: '2026-09-08', sale_time: '01:00:00',
        cashier_id: null, shift_session_id: null, customer_phone: null, items: [], feedback: null,
        payments: [{ method: 'cash', amount: 30 }, { method: 'card', amount: 70 }],
      };
      const salesFindMany = jest.fn().mockResolvedValueOnce([invoice, { ...invoice, id: 2, status: 'refunded' }]).mockResolvedValue([]);
      Object.assign(prismaMock, {
        sales_quick_sales: { findMany: salesFindMany },
        inv_transactions: { findMany: jest.fn().mockResolvedValue([]) },
        cafe_waste_records: { findMany: jest.fn().mockResolvedValue([]) },
        prc_supplier_invoices: { aggregate: jest.fn().mockResolvedValue({ _sum: {} }) },
        users: { findMany: jest.fn().mockResolvedValue([]) },
        sales_billing_statements: { findMany: jest.fn().mockResolvedValue([]) },
      });
      (prismaMock.cafe_products as { findMany: jest.Mock }).findMany.mockResolvedValue([]);
      const scope = jest.fn().mockReturnValue([2]);
      const scopedService = new CafeProductsService(prismaMock as never, stockMock as never, locationMock as never,
        ledgerMock as never, posSettingsMock as never, { resolveListFilter: scope } as never, {} as never);

      const report = await scopedService.reports('2026-09-07', '2026-09-07', '2', { sub: 1, branch: 2 } as never, '99');

      expect(scope).toHaveBeenCalledWith(expect.objectContaining({ branch: 2 }), '2');
      expect(salesFindMany).toHaveBeenNthCalledWith(1, {
        where: { branch_id: { in: [2] }, OR: [
          { business_date: { gte: '2026-09-07', lte: '2026-09-07' } },
          { business_date: null, sale_date: { gte: '2026-09-07', lte: '2026-09-07' } },
        ] }, include: { items: true, feedback: true, payments: true },
      });
      expect(report.paymentSummary).toMatchObject({ total: 100, collected: 100, outstanding: 0,
        payments: [{ method: 'cash', amount: 30 }, { method: 'card', amount: 70 }] });
      expect(report.products.soldTotals.orders).toBe(0);
    });

    it('uses Cairo-midnight exclusive boundaries for automatic and manual waste', async () => {
      const automaticFindMany = jest.fn().mockResolvedValue([]);
      const manualFindMany = jest.fn().mockResolvedValue([]);
      Object.assign(prismaMock, {
        sales_quick_sales: { findMany: jest.fn().mockResolvedValue([]) },
        inv_transactions: { findMany: automaticFindMany },
        cafe_waste_records: { findMany: manualFindMany },
        prc_supplier_invoices: { aggregate: jest.fn().mockResolvedValue({ _sum: {} }) },
        users: { findMany: jest.fn().mockResolvedValue([]) },
        sales_billing_statements: { findMany: jest.fn().mockResolvedValue([]) },
      });
      (prismaMock.cafe_products as { findMany: jest.Mock }).findMany.mockResolvedValue([]);
      (prismaMock.inv_products as { findMany: jest.Mock }).findMany.mockResolvedValue([]);

      await service.reports('2026-08-21', '2026-08-21', undefined, { sub: 1, branch: 1 } as never);

      const expectedStart = new Date('2026-08-20T21:00:00.000Z');
      const expectedEnd = new Date('2026-08-21T21:00:00.000Z');
      expect(automaticFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ txn_date: { gte: expectedStart, lt: expectedEnd } }),
      }));
      expect(manualFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ created_at: { gte: expectedStart, lt: expectedEnd } }),
      }));
    });

    const sale = (over: Record<string, unknown> = {}) => ({
      id: 1,
      status: 'completed',
      sale_type: 'customer',
      billing_status: 'not_applicable',
      sale_date: '2026-09-01',
      business_date: '2026-09-01',
      sale_time: '13:00:00',
      subtotal: 100,
      collected_amount: 100,
      total_amount: 100,
      cost_total: 40,
      discount_amount: 0,
      tax_amount: 0,
      cashier_id: null,
      customer_phone: null,
      customer_name: 'عميل نقدي',
      items: [],
      feedback: null,
      ...over,
    });

    let statementFindMany: jest.Mock;

    const runReport = async (sales: unknown[], statements: unknown[] = []) => {
      const salesFindMany = jest.fn().mockResolvedValue(sales);
      statementFindMany = jest.fn().mockResolvedValue(statements);
      Object.assign(prismaMock, {
        sales_quick_sales: { findMany: salesFindMany },
        inv_transactions: { findMany: jest.fn().mockResolvedValue([]) },
        cafe_waste_records: { findMany: jest.fn().mockResolvedValue([]) },
        prc_supplier_invoices: { aggregate: jest.fn().mockResolvedValue({ _sum: {} }) },
        users: { findMany: jest.fn().mockResolvedValue([]) },
        sales_billing_statements: { findMany: statementFindMany },
      });
      (prismaMock.cafe_products as { findMany: jest.Mock }).findMany.mockResolvedValue([]);
      (prismaMock.inv_products as { findMany: jest.Mock }).findMany.mockResolvedValue([]);
      const result = await service.reports('2026-09-01', '2026-09-01', undefined, { sub: 1, branch: 1 } as never);
      return { result, salesFindMany };
    };

    it('scopes the period to the operating day, falling back to sale_date for legacy rows', async () => {
      const { salesFindMany } = await runReport([]);
      const range = { gte: '2026-09-01', lte: '2026-09-01' };

      expect(salesFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ business_date: range }, { business_date: null, sale_date: range }],
        }),
      }));
    });

    it('counts partner orders as sales but not as revenue until their statement settles', async () => {
      const { result } = await runReport([
        sale(),
        sale({ id: 2, sale_type: 'partner', billing_status: 'unbilled', collected_amount: 0, cost_total: 30 }),
      ]);

      expect(result.totalOrders).toBe(2);
      expect(result.totalSales).toBe(200);
      expect(result.netRevenue).toBe(100);
      expect(result.uncollectedAccountsValue).toBe(100);
      // Materials for the partner order are still consumed, so they still hit cost.
      expect(result.materialsCost).toBe(70);
    });

    it('recognises a settled account statement as revenue on the settlement date', async () => {
      const { result } = await runReport(
        [sale()],
        [{ items: [{ sale: { total_amount: 140, tax_amount: 0 } }] }],
      );

      expect(result.settledAccountsRevenue).toBe(140);
      expect(result.netRevenue).toBe(240);
    });

    it('dates a settlement by the collecting shift, so a 02:00 collection is not pushed to the next day', async () => {
      await runReport([]);

      expect(statementFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          status: 'settled',
          OR: [
            { session: { session_date: { gte: '2026-09-01', lte: '2026-09-01' } } },
            expect.objectContaining({ shift_session_id: null }),
          ],
        }),
      }));
    });

    it.each([
      [1, 1, 50, 0, 100],
      [1, 1, 70, 0, 80],
      [2, 1, 80, 40, 80],
      [1, 0, 30, 40, 80],
    ])('attributes free tea correctly with quantity=%s, free=%s and discount=%s', async (quantity, freeQuantity, discount, teaRevenue, paidRevenue) => {
      const subtotal = quantity * 50 + 100;
      const { result } = await runReport([sale({
        sale_type: 'employee', subtotal, discount_amount: discount,
        total_amount: subtotal - discount, collected_amount: subtotal - discount,
        items: [
          { cafe_product_id: 1, name: 'شاي', quantity, free_quantity: freeQuantity,
            unit_price: 50, line_total: quantity * 50, line_cost: quantity * 10 },
          { cafe_product_id: 2, name: 'صنف مدفوع', quantity: 1, free_quantity: 0,
            unit_price: 100, line_total: 100, line_cost: 30 },
        ],
      })]);
      expect(result.products.soldSummary).toEqual(expect.arrayContaining([
        expect.objectContaining({ productId: 1, quantity, revenue: teaRevenue, cost: quantity * 10, profit: teaRevenue - quantity * 10 }),
        expect.objectContaining({ productId: 2, revenue: paidRevenue, cost: 30, profit: paidRevenue - 30 }),
      ]));
      expect(result.products.soldTotals.revenue).toBe(subtotal - discount);
      expect(result.products.soldTotals.cost).toBe(quantity * 10 + 30);
      expect(result.netRevenue).toBe(subtotal - discount);
    });

    it('preserves the invoice total when an ordinary discount creates fractional cents', async () => {
      const { result } = await runReport([sale({ subtotal: 3, discount_amount: 1, total_amount: 2, collected_amount: 2,
        items: [1, 2, 3].map((id) => ({ cafe_product_id: id, name: `صنف ${id}`, quantity: 1, unit_price: 1, line_total: 1, line_cost: 0 })),
      })]);
      expect(result.products.soldTotals.revenue).toBe(2);
      expect(result.products.soldSummary.map((row) => row.revenue)).toEqual([0.67, 0.66, 0.67]);
    });

    it('keeps fully free product revenue at zero while retaining consumption cost', async () => {
      const { result } = await runReport([sale({ subtotal: 50, discount_amount: 50, total_amount: 0, collected_amount: 0,
        items: [{ cafe_product_id: 1, name: 'شاي', quantity: 1, free_quantity: 1, unit_price: 50, line_total: 50, line_cost: 10 }],
      })]);
      expect(result.products.soldSummary).toEqual([expect.objectContaining({ productId: 1, revenue: 0, cost: 10, profit: -10 })]);
      expect(result.products.soldTotals.revenue).toBe(0);
    });

    it('averages order value over sales, not over cash collected', async () => {
      const { result } = await runReport([
        sale({ subtotal: 100, discount_amount: 20, collected_amount: 80, total_amount: 80 }),
        sale({ id: 2, sale_type: 'employee', billing_status: 'unbilled', collected_amount: 0 }),
      ]);

      expect(result.totalSales).toBe(200);
      expect(result.averageOrderValue).toBe(100);
    });
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

  describe('create', () => {
    it('rejects sell price below recipe cost', async () => {
      (prismaMock.inv_products as { findMany: jest.Mock }).findMany.mockResolvedValue([
        { id: 1, cost_price: 10, unit_of_measure: 'kg' },
      ]);

      await expect(
        service.create({
          name: 'Latte',
          sellPrice: 5,
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
            { inventory_kind: 'ready_product', inventory_section: 'ready_products' },
          ]),
          is_deleted: false,
          status: 'active',
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

  describe('findOne recipe details', () => {
    it('returns enough ingredient metadata to render saved recipes outside picker pagination', async () => {
      (prismaMock.cafe_products as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
        id: 7,
        product_code: 'CP-000007',
        name: 'لاتيه',
        category_id: null,
        product_type: 'prepared',
        inventory_product_id: null,
        sell_price: 45,
        image_url: null,
        is_active: true,
        created_at: new Date('2026-09-01'),
        updated_at: new Date('2026-09-10'),
        category: null,
        category_assignments: [],
        inventory_product: null,
        recipes: [{
          id: 91,
          ingredient_id: 17,
          quantity: 120,
          unit: 'ml',
          sort_order: 0,
          ingredient: {
            id: 17,
            name_ar: 'لبن كامل الدسم',
            name_en: 'Full-fat milk',
            size: '1 لتر',
            unit_of_measure: 'L',
            cost_price: 58,
            inventory_section: 'preparation_ingredients',
            inventory_kind: 'raw_material',
          },
        }],
        variants: [],
      });

      const result = await service.findOne(7);

      expect(result.recipes[0]).toMatchObject({
        ingredientId: 17,
        ingredientName: 'لبن كامل الدسم',
        ingredientNameEn: 'Full-fat milk',
        ingredientSize: '1 لتر',
        ingredientBaseUnit: 'L',
        ingredientCostPrice: 58,
        ingredientInventorySection: 'preparation_ingredients',
        ingredientInventoryKind: 'raw_material',
      });
    });
  });

  describe('sellCart dryRun', () => {
    it('rejects mismatched, unclassified and missing-header carts before any preview or inventory write', async () => {
      const product: any = { id: 1, name: 'Latte', category_id: 1, product_code: 'CP1', sell_price: 25,
        is_active: true, product_type: 'prepared', inventory_product: null, variants: [], recipes: [{
          ingredient_id: 1, quantity: 1, unit: 'ml',
          ingredient: { id: 1, name_ar: 'حليب', unit_of_measure: 'ml', cost_price: 1, is_deleted: false, status: 'active' },
        }] };
      (prismaMock.cafe_products as any).findMany.mockResolvedValue([product]);
      const dto = { branchId: 1, gender: 'male' as const, cafeCategoryId: 2, items: [{ productId: 1, quantity: 1 }] };
      await expect(service.sellCart(dto, 1, true)).rejects.toThrow('لا ينتمي');
      product.category_id = null;
      await expect(service.sellCart(dto, 1)).rejects.toThrow('لا ينتمي');
      product.category_id = 2;
      await expect(service.sellCart({ ...dto, gender: undefined } as any, 1)).rejects.toThrow('جنس العميل');
      expect(stockMock.applyMovement).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
    it('forwards the same classification through the single-product sale endpoint', async () => {
      const sellCart = jest.spyOn(service, 'sellCart').mockResolvedValue({} as never);
      await service.sell(1, { branchId: 1, quantity: 2, gender: 'female', cafeCategoryId: 7 }, 9, true);
      expect(sellCart).toHaveBeenCalledWith(expect.objectContaining({ gender: 'female', cafeCategoryId: 7 }), 9, true);
    });
    it('returns preview without writing', async () => {
      (prismaMock.cafe_products as { findMany: jest.Mock }).findMany.mockResolvedValue([
        {
          id: 1,
          name: 'Latte',
          category_id: 1, product_code: 'CP-000001',
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
              ingredient: { id: 1, name_ar: 'حليب', unit_of_measure: 'ml', cost_price: 0.01, is_deleted: false, status: 'active' },
            },
          ],
        },
      ]);

      const result = await service.sellCart(
        { branchId: 1, gender: 'female', cafeCategoryId: 1, items: [{ productId: 1, quantity: 2 }] },
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
          category_id: 1, product_code: 'CP-000002',
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
              ingredient: { id: 1, name_ar: 'بن', unit_of_measure: 'g', cost_price: 0.2, is_deleted: false, status: 'active' },
            }],
          }],
        },
      ]);

      const result = await service.sellCart(
        { branchId: 1, gender: 'female', cafeCategoryId: 1, items: [{ productId: 1, variantId: 7, quantity: 2 }] },
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

    it('keeps costing and completes a zero-stock ready sale without inventory movement in cashier-only mode', async () => {
      posSettingsMock.isInventoryTrackingEnabled.mockResolvedValue(false);
      posSettingsMock.isTaxEnabled.mockResolvedValue(false);
      (prismaMock.cafe_products as { findMany: jest.Mock }).findMany.mockResolvedValue([
        {
          id: 3,
          name: 'مياه',
          category_id: 1, product_code: 'CP-000003',
          sell_price: 15,
          is_active: true,
          product_type: 'ready',
          inventory_product_id: 44,
          inventory_product: {
            id: 44,
            name_ar: 'مياه',
            unit_of_measure: 'piece',
            cost_price: 10,
            is_deleted: false,
            status: 'active',
          },
          variants: [],
          recipes: [],
        },
      ]);

      const result = await service.sellCart(
        { branchId: 1, gender: 'female', cafeCategoryId: 1, items: [{ productId: 3, quantity: 2 }] },
        1,
        false,
      );

      expect(result).toMatchObject({ totalAmount: 30, gender: 'female', cafeCategoryId: 1 });
      expect(stockMock.applyMovement).not.toHaveBeenCalled();
      expect(locationMock.resolveBranchStockLocation).not.toHaveBeenCalled();
      expect(ledgerMock.postQuickSale).toHaveBeenCalledWith(
        expect.objectContaining({ cogsAmount: 0 }),
        expect.anything(),
      );
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
