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
      { resolveListFilter: () => null, memberGenderFilter: () => null } as never,
    );
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
        ledgerMock as never, posSettingsMock as never, { resolveListFilter: scope, memberGenderFilter: () => null } as never);

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
      customer_member_id: null,
      customer_name: 'عميل نقدي',
      items: [],
      feedback: null,
      payments: [],
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

    it('fails closed across current sales, settlements, prior-period growth and operational totals for a gender audience', async () => {
      const femaleSale = sale({ id: 10, customer_member_id: 10, collected_amount: 80, total_amount: 80, subtotal: 80 });
      const maleSale = sale({ id: 20, customer_member_id: 20, collected_amount: 120, total_amount: 120, subtotal: 120 });
      const previousFemale = sale({ id: 30, customer_member_id: 10, collected_amount: 25, tax_amount: 5 });
      const previousMale = sale({ id: 40, customer_member_id: 20, collected_amount: 90, tax_amount: 10 });
      const salesFindMany = jest.fn()
        .mockResolvedValueOnce([femaleSale, maleSale])
        .mockResolvedValueOnce([previousFemale, previousMale]);
      const statements = [
        { items: [
          { sale: { total_amount: 40, tax_amount: 0, customer_member_id: 10 } },
          { sale: { total_amount: 70, tax_amount: 0, customer_member_id: 20 } },
          { sale: { total_amount: 30, tax_amount: 0, customer_member_id: null } },
        ] },
      ];
      const purchaseAggregate = jest.fn().mockResolvedValue({ _sum: { total_amount: 900, remaining_amount: 400 } });
      const inventoryFindMany = jest.fn().mockResolvedValue([
        { id: 1, name_ar: 'سري', reorder_point: 10, balances: [{ current_stock: 1 }], expiry_date: new Date('2026-09-20') },
      ]);
      const transactionFindMany = jest.fn().mockResolvedValue([
        { id: 8, reference: 'SECRET', txn_date: new Date('2026-09-01'), total_amount: 50, reason: null, items: [] },
      ]);
      Object.assign(prismaMock, {
        sales_quick_sales: { findMany: salesFindMany },
        inv_transactions: { findMany: transactionFindMany },
        cafe_waste_records: { findMany: jest.fn().mockResolvedValue([{ status: 'active', total_cost: 40, transaction: { id: 9, reference: 'WASTE-9', txn_date: new Date('2026-09-01'), total_amount: 40, reason: null, items: [] } }]) },
        prc_supplier_invoices: { aggregate: purchaseAggregate },
        users: { findMany: jest.fn().mockResolvedValue([]) },
        sales_billing_statements: { findMany: jest.fn().mockResolvedValue(statements) },
        club_members: {
          findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: number[] }; gender: string } }) =>
            Promise.resolve(where.gender === 'female' && where.id.in.includes(10) ? [{ id: 10 }] : [])),
        },
      });
      (prismaMock.cafe_products as { findMany: jest.Mock }).findMany.mockResolvedValue([{ id: 99, name: 'SECRET', sell_price: 100 }]);
      (prismaMock as { inv_products: { findMany: jest.Mock } }).inv_products.findMany = inventoryFindMany;
      const genderService = new CafeProductsService(
        prismaMock as never,
        stockMock as never,
        locationMock as never,
        ledgerMock as never,
        posSettingsMock as never,
        { resolveListFilter: () => [3], memberGenderFilter: () => 'female' } as never,
      );

      const result = await genderService.reports(
        '2026-09-01',
        '2026-09-01',
        '3',
        { sub: 1, branch: 3, man_women_type: 2 } as never,
        undefined,
        undefined,
        'female',
      );

      expect(result.totalOrders).toBe(1);
      expect(result.netRevenue).toBe(120);
      expect(result.settledAccountsRevenue).toBe(40);
      expect(result.previousRevenue).toBe(60);
      expect(result.totalPurchases).toBe(0);
      expect(result.supplierDebt).toBe(0);
      expect(result.wasteCost).toBe(0);
      expect(result.inventory.lowStock).toEqual([]);
      expect(result.inventory.nearExpiration).toEqual([]);
      expect(result.products.neverSold).toEqual([]);
      expect(result.sectionBreakdown.managementWithdrawals).toEqual([]);
      expect(purchaseAggregate).not.toHaveBeenCalled();
      expect(inventoryFindMany).not.toHaveBeenCalled();
      expect(transactionFindMany).not.toHaveBeenCalled();
    });

    it('allocates actual collected value across immutable Protein and Bar lines without paying free or refunded lines', async () => {
      const completed = sale({
        id: 51,
        subtotal: 300,
        total_amount: 180,
        collected_amount: 180,
        discount_amount: 120,
        items: [
          { cafe_product_id: 1, name: 'Protein', business_classification: 'protein', quantity: 1, free_quantity: 0, unit_price: 100, line_total: 100, line_cost: 20 },
          { cafe_product_id: 2, name: 'Bar', business_classification: 'bar', quantity: 2, free_quantity: 1, unit_price: 50, line_total: 100, line_cost: 15 },
          { cafe_product_id: 3, name: 'صنف عادي', business_classification: null, quantity: 1, free_quantity: 0, unit_price: 100, line_total: 100, line_cost: 30 },
        ],
      });
      const refunded = sale({
        id: 52,
        status: 'refunded',
        collected_amount: 70,
        items: [
          { cafe_product_id: 4, name: 'Protein refunded', business_classification: 'protein', quantity: 1, free_quantity: 0, unit_price: 70, line_total: 70, line_cost: 10 },
        ],
      });

      const { result } = await runReport([completed, refunded]);

      expect(result.sectionBreakdown.protein).toMatchObject({ billed: 100, collected: 72, cost: 20, profit: 52 });
      expect(result.sectionBreakdown.bar).toMatchObject({ billed: 100, collected: 36, cost: 15, profit: 21 });
      expect(result.sectionBreakdown.protein.collected + result.sectionBreakdown.bar.collected).toBe(108);
      expect(result.totalRefunds).toBe(70);
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

    it('keeps costing and completes a zero-stock ready sale without inventory movement in cashier-only mode', async () => {
      posSettingsMock.isInventoryTrackingEnabled.mockResolvedValue(false);
      posSettingsMock.isTaxEnabled.mockResolvedValue(false);
      (prismaMock.cafe_products as { findMany: jest.Mock }).findMany.mockResolvedValue([
        {
          id: 3,
          name: 'مياه',
          product_code: 'CP-000003',
          sell_price: 15,
          is_active: true,
          product_type: 'ready',
          inventory_product_id: 44,
          inventory_product: {
            id: 44,
            name_ar: 'مياه',
            unit_of_measure: 'piece',
            cost_price: 10,
          },
          variants: [],
          recipes: [],
        },
      ]);

      const result = await service.sellCart(
        { branchId: 1, items: [{ productId: 3, quantity: 2 }] },
        1,
        false,
      );

      expect(result).toMatchObject({ totalAmount: 30 });
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
