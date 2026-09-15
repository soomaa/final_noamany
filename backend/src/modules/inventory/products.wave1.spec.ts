import { ProductsService } from './products.service';
import { BadRequestException } from '@nestjs/common';

describe('ProductsService supplier links', () => {
  it('links a new raw material to its selected primary supplier', async () => {
    const created = { id: 41, unit_of_measure: 'kg' };
    const tx = {
      inv_products: { create: jest.fn().mockResolvedValue(created) },
      inv_supplier_products: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      inv_products: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new ProductsService(prisma as never, {} as never, {} as never, {} as never, { resolveListFilter: () => null, isBranchAllowed: () => true } as never);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: created.id } as never);

    await service.create({
      productCode: 'RAW-000041',
      nameAr: 'بن',
      nameEn: 'Coffee',
      inventoryKind: 'raw_material',
      supplierId: 9,
      costPrice: 50,
      unitOfMeasure: 'kg',
    }, 1);

    expect(tx.inv_supplier_products.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        supplier_id_product_id: {
          supplier_id: 9,
          product_id: 41,
        },
      },
      create: expect.objectContaining({
        supplier_id: 9,
        product_id: 41,
        purchase_unit: 'kg',
        is_active: true,
      }),
    }));
  });

  it('treats serving and packaging supplies as non-sellable inputs', async () => {
    const created = { id: 42, unit_of_measure: 'piece' };
    const tx = {
      inv_products: { create: jest.fn().mockResolvedValue(created) },
      inv_supplier_products: { upsert: jest.fn() },
    };
    const prisma = {
      inv_products: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new ProductsService(prisma as never, {} as never, {} as never, {} as never, { resolveListFilter: () => null, isBranchAllowed: () => true } as never);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: created.id } as never);

    await service.create({
      productCode: 'SUP-000042',
      nameAr: 'كوب ورقي',
      inventoryKind: 'general',
      inventorySection: 'serving_packaging',
      costPrice: 2,
      unitOfMeasure: 'piece',
    }, 1);

    expect(tx.inv_products.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ selling_price: 0 }),
    }));
  });
});

describe('ProductsService quantity alerts', () => {
  it('includes a zero-stock product with no balance row and excludes stock above its alert', async () => {
    const sugar = {
      id: 39,
      product_code: 'PRD000002',
      name_ar: 'سكر',
      name_en: 'Sugar',
      cost_price: 0,
      selling_price: 0,
      unit_of_measure: 'piece',
      min_stock: 0,
      max_stock: 1000,
      reorder_point: 0,
      inventory_kind: 'raw_material',
      inventory_section: 'preparation_ingredients',
      status: 'active',
      is_deleted: false,
      category: null,
      brand: null,
      manufacturer: null,
      supplier: null,
      unit_template: null,
      packages: [],
    };
    const prisma = {
      inv_products: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 38, reorder_point: 30 },
            { id: 39, reorder_point: 0 },
          ])
          .mockResolvedValueOnce([sugar]),
        count: jest.fn().mockResolvedValue(1),
      },
      inv_stock_balances: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ product_id: 38, _sum: { current_stock: 90 } }])
          .mockResolvedValueOnce([]),
      },
    };
    const service = new ProductsService(prisma as never, {} as never, {} as never, {} as never, { resolveListFilter: () => null, isBranchAllowed: () => true } as never);

    const result = await service.list({
      page: 1,
      pageSize: 20,
      skip: 0,
      take: 20,
      order: 'desc',
      lowStock: true,
      inventoryKind: 'raw_material',
      inventorySection: 'preparation_ingredients',
    } as never);

    expect(result.total).toBe(1);
    expect(result.data).toEqual([
      expect.objectContaining({ id: 39, nameAr: 'سكر', currentStock: 0, reorderPoint: 0 }),
    ]);
    expect(prisma.inv_products.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{ id: { in: [39] } }]),
      }),
    }));
  });
});

describe('ProductsService opening stock branch', () => {
  it('uses the first available branch for an unrestricted user without a linked branch', async () => {
    const prisma = {
      tbl_branches: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ branch_id: 3 }),
      },
    };
    const service = new ProductsService(prisma as never, {} as never, {} as never, {} as never, { resolveListFilter: () => null, isBranchAllowed: () => true } as never);

    const branchId = await (service as unknown as {
      resolveOpeningStockBranchId: (preferred?: number) => Promise<number>;
    }).resolveOpeningStockBranchId();

    expect(branchId).toBe(3);
  });
});

describe('ProductsService packaged raw materials', () => {
  it('stores multiple package sizes under one base-unit material', async () => {
    const created = { id: 77, product_code: 'SYRUP-001', name_ar: 'فانيليا' };
    const tx = {
      inv_products: { create: jest.fn().mockResolvedValue(created) },
      inv_supplier_products: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      inv_products: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new ProductsService(
      prisma as never,
      { applyMovement: jest.fn() } as never,
      {} as never,
      { ensureChart: jest.fn() } as never,
      { resolveListFilter: () => null, isBranchAllowed: () => true } as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: created.id } as never);

    await service.create({
      productCode: 'SYRUP-001',
      nameAr: 'فانيليا',
      inventoryKind: 'raw_material',
      supplierId: 9,
      isPackaged: true,
      packages: [
        { packageSize: 700, packageUnit: 'ml', packagePrice: 170 },
        { packageSize: 1.25, packageUnit: 'L', packagePrice: 210 },
      ],
    }, 1);

    expect(tx.inv_products.create).toHaveBeenCalledTimes(1);
    expect(tx.inv_products.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        is_packaged: true,
        unit_of_measure: 'ml',
        cost_price: 0.242857,
        packages: {
          create: [
            expect.objectContaining({ package_base_quantity: 700, package_price: 170, is_default: true }),
            expect.objectContaining({ package_base_quantity: 1250, package_price: 210, is_default: false }),
          ],
        },
      }),
    }));
    expect(tx.inv_supplier_products.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ product_id: 77, purchase_unit: 'package' }),
    }));
  });
});

describe('ProductsService opening stock total cost', () => {
  it('derives the base-unit cost from the total cost of the opening quantity', async () => {
    const created = { id: 77, unit_of_measure: 'L', inventory_kind: 'raw_material', inventory_section: 'preparation_ingredients' };
    const tx = {
      inv_products: { create: jest.fn().mockResolvedValue(created) },
      inv_supplier_products: { upsert: jest.fn() },
      inv_opening_stocks: { create: jest.fn().mockResolvedValue({ id: 18, opening_stock_date: new Date('2026-07-31') }) },
    };
    const prisma = {
      inv_products: { findFirst: jest.fn().mockResolvedValue(null) },
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_id: 1 }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const stock = { applyMovement: jest.fn().mockResolvedValue({}) };
    const location = { resolveBranchStockLocation: jest.fn().mockResolvedValue(5) };
    const ledger = {
      ensureChart: jest.fn().mockResolvedValue(undefined),
      postOpeningStock: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ProductsService(
      prisma as never,
      stock as never,
      location as never,
      ledger as never,
      { resolveListFilter: () => null, isBranchAllowed: () => true } as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: created.id } as never);

    await service.create({
      productCode: 'RAW-000077',
      nameAr: 'سيرب فانيليا',
      inventoryKind: 'raw_material',
      inventorySection: 'preparation_ingredients',
      unitOfMeasure: 'L',
      initialStock: 0.7,
      initialTotalCost: 480,
      openingBranchId: 1,
    }, 1);

    expect(tx.inv_products.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cost_price: 480 / 0.7 }),
    }));
    expect(tx.inv_opening_stocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quantity: 0.7, unit_cost: 480 / 0.7, total_cost: 480 }),
    }));
    expect(ledger.postOpeningStock).toHaveBeenCalledWith(expect.objectContaining({ amount: 480 }), tx);
  });
});

describe('ProductsService base-unit corrections', () => {
  const existing = {
    unit_of_measure: 'kg',
    inventory_kind: 'raw_material',
    inventory_section: 'preparation_ingredients',
  };

  function buildService(counts: { movements?: number; balances?: number; recipes?: number; variants?: number }) {
    const prisma = {
      inv_movements: { count: jest.fn().mockResolvedValue(counts.movements ?? 0) },
      inv_stock_balances: { count: jest.fn().mockResolvedValue(counts.balances ?? 0) },
      cafe_product_recipes: { count: jest.fn().mockResolvedValue(counts.recipes ?? 0) },
      cafe_variant_recipes: { count: jest.fn().mockResolvedValue(counts.variants ?? 0) },
    };
    return {
      prisma,
      service: new ProductsService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        { resolveListFilter: () => null, isBranchAllowed: () => true } as never,
      ),
    };
  }

  it('allows correcting an unused material from kg to L', async () => {
    const { service } = buildService({});

    await expect((service as unknown as {
      assertMasterDataChangeAllowed: (
        productId: number,
        current: typeof existing,
        dto: { unitOfMeasure: string },
      ) => Promise<void>;
    }).assertMasterDataChangeAllowed(12, existing, { unitOfMeasure: 'L' })).resolves.toBeUndefined();
  });

  it('blocks changing the base unit when stock activity exists', async () => {
    const { service } = buildService({ movements: 1 });

    await expect((service as unknown as {
      assertMasterDataChangeAllowed: (
        productId: number,
        current: typeof existing,
        dto: { unitOfMeasure: string },
      ) => Promise<void>;
    }).assertMasterDataChangeAllowed(12, existing, { unitOfMeasure: 'L' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks changing the base unit when a non-zero balance exists', async () => {
    const { prisma, service } = buildService({ balances: 1 });

    await expect((service as unknown as {
      assertMasterDataChangeAllowed: (
        productId: number,
        current: typeof existing,
        dto: { unitOfMeasure: string },
      ) => Promise<void>;
    }).assertMasterDataChangeAllowed(12, existing, { unitOfMeasure: 'L' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.inv_stock_balances.count).toHaveBeenCalledWith({
      where: {
        product_id: 12,
        current_stock: { not: 0 },
      },
    });
  });
});

