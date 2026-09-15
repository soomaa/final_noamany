import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CafeWasteService } from './cafe-waste.service';

const rawCoffee = {
  id: 1,
  product_code: 'RAW-1',
  name_ar: 'بن',
  name_en: null,
  image_url: null,
  inventory_kind: 'raw_material',
  inventory_section: 'preparation_ingredients',
  unit_of_measure: 'g',
  cost_price: 0.05,
  is_packaged: true,
  status: 'active',
  is_deleted: false,
  packages: [{ id: 11, package_base_quantity: 1000, package_size: 1, package_unit: 'kg', is_active: true }],
};

function buildService(overrides: Record<string, unknown> = {}, dependencyOverrides: Record<string, any> = {}) {
  const prisma = {
    inv_products: {
      findFirst: jest.fn().mockResolvedValue(rawCoffee),
      findMany: jest.fn().mockResolvedValue([]),
    },
    cafe_products: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    inv_stock_balances: {
      findMany: jest.fn().mockResolvedValue([{ product_id: 1, current_stock: 600 }]),
    },
    cafe_waste_records: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    ...overrides,
  };
  const location = { resolveBranchStockLocation: jest.fn().mockResolvedValue(9) };
  const branchScope = dependencyOverrides.branchScope ?? {
    isBranchAllowed: jest.fn().mockReturnValue(true),
    resolveListFilter: jest.fn().mockReturnValue([2]),
  };
  const stock = dependencyOverrides.stock ?? { applyTransaction: jest.fn().mockResolvedValue(undefined) };
  const moduleLedger = dependencyOverrides.moduleLedger ?? {
    ensureChart: jest.fn().mockResolvedValue(undefined),
    postInventoryConsumption: jest.fn().mockResolvedValue(undefined),
  };
  const ledger = dependencyOverrides.ledger ?? { reverseEntry: jest.fn().mockResolvedValue(undefined) };
  const service = new CafeWasteService(
    prisma as never,
    stock as never,
    location as never,
    moduleLedger as never,
    ledger as never,
    branchScope as never,
  );
  return { service, prisma, location, branchScope, stock, moduleLedger, ledger };
}

describe('CafeWasteService preview', () => {
  const user = { sub: 7, branch: 2 } as never;

  it('converts a compatible raw-material quantity to its base unit', async () => {
    const { service } = buildService();

    const result = await service.preview({
      sourceKind: 'inventory',
      sourceId: 1,
      branchId: 2,
      quantity: 0.5,
      unit: 'kg',
    }, user);

    expect(result.components).toEqual([expect.objectContaining({
      productId: 1,
      quantity: 500,
      unit: 'g',
      currentStock: 600,
      afterStock: 100,
      shortage: false,
      cost: 25,
    })]);
    expect(result.totalCost).toBe(25);
  });

  it('converts a selected package into its configured base quantity', async () => {
    const { service } = buildService();

    const result = await service.preview({
      sourceKind: 'inventory',
      sourceId: 1,
      branchId: 2,
      quantity: 2,
      unit: 'package',
      packageId: 11,
    }, user);

    expect(result.components[0]).toEqual(expect.objectContaining({ quantity: 2000, unit: 'g', afterStock: -1400, shortage: true }));
    expect(result.hasShortage).toBe(true);
  });

  it('rejects a unit from an incompatible measurement family', async () => {
    const { service } = buildService();

    await expect(service.preview({
      sourceKind: 'inventory',
      sourceId: 1,
      branchId: 2,
      quantity: 2,
      unit: 'ml',
    }, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an internal cafe product as a direct waste source', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const { service } = buildService({
      cafe_products: {
        findFirst,
        findMany: jest.fn(),
      },
    });

    await expect(service.preview({
      sourceKind: 'cafe_product',
      sourceId: 99,
      branchId: 2,
      quantity: 1,
      unit: 'piece',
    }, user)).rejects.toThrow('منتج الكافيه غير موجود');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ product_type: { not: 'internal' } }),
    }));
  });

  it('rejects general inventory that does not belong to the cafe domain', async () => {
    const { service } = buildService({
      inv_products: {
        findFirst: jest.fn().mockResolvedValue({
          ...rawCoffee,
          inventory_kind: 'general',
          inventory_section: 'gym_operations',
        }),
        findMany: jest.fn(),
      },
    });

    await expect(service.preview({
      sourceKind: 'inventory',
      sourceId: 1,
      branchId: 2,
      quantity: 1,
      unit: 'piece',
    }, user)).rejects.toThrow('لا يتبع مخزون الكافيه');
  });

  it('preserves sub-cent base-unit cost precision', async () => {
    const { service } = buildService({
      inv_products: {
        findFirst: jest.fn().mockResolvedValue({ ...rawCoffee, cost_price: 0.004 }),
        findMany: jest.fn(),
      },
      inv_stock_balances: {
        findMany: jest.fn().mockResolvedValue([{ product_id: 1, current_stock: 2000 }]),
      },
    });

    const result = await service.preview({
      sourceKind: 'inventory',
      sourceId: 1,
      branchId: 2,
      quantity: 1,
      unit: 'kg',
    }, user);

    expect(result.components[0]).toEqual(expect.objectContaining({ unitCost: 0.004, cost: 4 }));
    expect(result.totalCost).toBe(4);
  });

  it('allocates sub-cent component totals so line totals reconcile to the header', async () => {
    const first = { ...rawCoffee, id: 1, cost_price: 0.004, packages: [] };
    const second = { ...rawCoffee, id: 2, name_ar: 'لبن', cost_price: 0.004, packages: [] };
    const prepared = {
      id: 10, name: 'مشروب', product_type: 'prepared', image_url: null,
      inventory_product_id: null, inventory_product: null, variants: [],
      recipes: [
        { quantity: 1, unit: 'g', ingredient: first },
        { quantity: 1, unit: 'g', ingredient: second },
      ],
    };
    const { service } = buildService({
      cafe_products: { findFirst: jest.fn().mockResolvedValue(prepared), findMany: jest.fn() },
      inv_stock_balances: { findMany: jest.fn().mockResolvedValue([
        { product_id: 1, current_stock: 10 }, { product_id: 2, current_stock: 10 },
      ]) },
    });

    const result = await service.preview({
      sourceKind: 'cafe_product', sourceId: 10, branchId: 2, quantity: 1, unit: 'piece',
    }, user);

    expect(result.totalCost).toBe(0.01);
    expect(result.components.reduce((sum, item) => sum + item.cost, 0)).toBe(result.totalCost);
    expect(result.components.map((item) => item.unitCost)).toEqual([0.004, 0.004]);
  });

  it('uses the selected variant recipe and recursively merges manufactured ingredients', async () => {
    const directRaw = { ...rawCoffee, packages: [] };
    const manufactured = {
      ...rawCoffee,
      id: 2,
      name_ar: 'خلطة بن',
      inventory_kind: 'manufactured_internal',
      cost_price: 0,
      packages: [],
    };
    const prepared = {
      id: 10,
      name: 'لاتيه',
      product_type: 'prepared',
      image_url: null,
      inventory_product_id: 10,
      inventory_product: null,
      recipes: [],
      variants: [{
        id: 20,
        name: 'كبير',
        is_active: true,
        recipes: [
          { quantity: 50, unit: 'g', ingredient: manufactured },
          { quantity: 10, unit: 'g', ingredient: directRaw },
        ],
      }],
    };
    const prisma = {
      inv_products: { findFirst: jest.fn(), findMany: jest.fn() },
      cafe_products: {
        findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
          if (where.id === 10) return prepared;
          if (where.inventory_product_id === 2) {
            return {
              id: 12,
              name: 'خلطة بن',
              product_type: 'internal',
              recipes: [{ quantity: 2, unit: 'g', ingredient: directRaw }],
              variants: [],
            };
          }
          return null;
        }),
        findMany: jest.fn(),
      },
      inv_stock_balances: { findMany: jest.fn().mockResolvedValue([{ product_id: 1, current_stock: 1000 }]) },
    };
    const { service } = buildService(prisma);

    const result = await service.preview({
      sourceKind: 'cafe_product',
      sourceId: 10,
      variantId: 20,
      branchId: 2,
      quantity: 2,
      unit: 'piece',
    }, user);

    expect(result.source.name).toBe('لاتيه — كبير');
    expect(result.components).toEqual([expect.objectContaining({
      productId: 1,
      quantity: 220,
      unit: 'g',
      cost: 11,
    })]);
  });
});

describe('CafeWasteService mutations', () => {
  const user = { sub: 7, branch: 2 } as never;

  it('requires explicit consent before a waste record can make stock negative', async () => {
    const transaction = jest.fn();
    const { service } = buildService({ $transaction: transaction });

    await expect(service.create({
      requestId: '15a31b6f-51f4-4a1f-89cb-84507d632bd3',
      sourceKind: 'inventory',
      sourceId: 1,
      branchId: 2,
      quantity: 1,
      unit: 'kg',
      reasonId: 3,
      allowNegative: false,
    }, user)).rejects.toThrow('أكبر من الرصيد المتاح');

    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not reverse an already reversed waste record', async () => {
    const prisma = {
      cafe_waste_records: {
        findFirst: jest.fn().mockResolvedValue({ id: 4, branch_id: 2, status: 'reversed' }),
      },
    };
    const { service } = buildService(prisma);

    await expect(service.reverse(4, { reason: 'إدخال مكرر' }, user)).rejects.toThrow('تم عكس حركة الهالك مسبقًا');
  });

  it('does not return an idempotent record from another branch', async () => {
    const requestId = '15a31b6f-51f4-4a1f-89cb-84507d632bd3';
    const { service, branchScope } = buildService({
      cafe_waste_records: {
        findUnique: jest.fn().mockResolvedValue({
          id: 44,
          request_id: requestId,
          branch_id: 3,
          source_kind: 'inventory',
          inventory_product_id: 1,
          cafe_product_id: null,
          cafe_variant_id: null,
          quantity: 500,
          unit: 'g',
          transaction: { items: [] },
        }),
      },
    });
    branchScope.isBranchAllowed.mockImplementation((_user: unknown, branchId: number) => branchId === 2);

    await expect(service.create({
      requestId,
      sourceKind: 'inventory',
      sourceId: 1,
      branchId: 2,
      quantity: 500,
      unit: 'g',
      reasonId: 3,
    }, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('validates the recalculated transactional preview before mutation', () => {
    const { service } = buildService();

    expect(() => (service as any).validatePreviewForCreate({
      hasShortage: false,
      totalCost: 0,
      components: [{ unitCost: 0 }],
    }, true)).toThrow('تكلفة صحيحة');
  });

  it('rejects a whitespace-only reason defensively in the service', async () => {
    const { service } = buildService();

    await expect(service.createReason({ name: '   ' }, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts and reactivates a global reason atomically', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 12, name: 'تلف عبوة', is_active: true });
    const { service } = buildService({ cafe_waste_reasons: { upsert } });

    const result = await service.createReason({ name: ' تلف عبوة ' }, user);

    expect(result).toEqual({ id: 12, name: 'تلف عبوة', isActive: true });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { name: 'تلف عبوة' },
      update: { is_active: true },
    }));
  });

  it('returns an exact same-branch idempotent retry without another transaction', async () => {
    const requestId = '15a31b6f-51f4-4a1f-89cb-84507d632bd3';
    const runTransaction = jest.fn();
    const existing = {
      id: 44, request_id: requestId, branch_id: 2, warehouse_id: 9,
      source_kind: 'inventory', inventory_product_id: 1, cafe_product_id: null,
      cafe_variant_id: null, package_id: null, quantity: 100, unit: 'g',
      source_name: 'بن', reason_id: 3, reason_name: 'تلف', notes: null,
      allow_negative: false, total_cost: 5, status: 'active',
      transaction: { items: [] },
    };
    const { service } = buildService({
      cafe_waste_records: { findUnique: jest.fn().mockResolvedValue(existing) },
      $transaction: runTransaction,
    });

    const result = await service.create({
      requestId, sourceKind: 'inventory', sourceId: 1, branchId: 2,
      quantity: 100, unit: 'g', reasonId: 3,
    }, user);

    expect(result.id).toBe(44);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['reason', { reasonId: 4 }],
    ['notes', { reasonId: 3, notes: 'ملاحظة مختلفة' }],
    ['negative-stock consent', { reasonId: 3, allowNegative: true }],
  ])('rejects an idempotency retry with changed %s', async (_label, changed) => {
    const requestId = '15a31b6f-51f4-4a1f-89cb-84507d632bd3';
    const existing = {
      id: 44, request_id: requestId, branch_id: 2, warehouse_id: 9,
      source_kind: 'inventory', inventory_product_id: 1, cafe_product_id: null,
      cafe_variant_id: null, package_id: null, quantity: 100, unit: 'g',
      source_name: 'بن', reason_id: 3, reason_name: 'تلف', notes: null,
      allow_negative: false, total_cost: 5, status: 'active', transaction: { items: [] },
    };
    const { service } = buildService({
      cafe_waste_records: { findUnique: jest.fn().mockResolvedValue(existing) },
    });

    const payload = {
      requestId, sourceKind: 'inventory', sourceId: 1, branchId: 2,
      quantity: 100, unit: 'g', reasonId: 3,
    } as any;
    Object.assign(payload, changed);
    await expect(service.create(payload, user)).rejects.toThrow('عملية هالك مختلفة');
  });

  it('creates the damage transaction, stock movement, accounting and audit record atomically', async () => {
    const reason = { id: 3, name: 'تلف', is_active: true };
    const transaction = {
      id: 80,
      items: [{ product_id: 1, item_name: 'بن', quantity: 100, unit: 'g', price: 0.05, total: 5 }],
    };
    const createdRecord = {
      id: 90,
      reference: 'WASTE-X',
      request_id: '15a31b6f-51f4-4a1f-89cb-84507d632bd3',
      branch_id: 2,
      warehouse_id: 9,
      source_kind: 'inventory',
      inventory_product_id: 1,
      cafe_product_id: null,
      cafe_variant_id: null,
      package_id: null,
      quantity: 100,
      unit: 'g',
      reason_id: 3,
      reason_name: 'تلف',
      source_name: 'بن',
      total_cost: 5,
      status: 'active',
      allow_negative: false,
      created_by: 7,
      shift_session_id: 31,
      transaction,
    };
    const tx = {
      inv_products: { findFirst: jest.fn().mockResolvedValue(rawCoffee) },
      cafe_products: { findFirst: jest.fn() },
      inv_stock_balances: { findMany: jest.fn().mockResolvedValue([{ product_id: 1, current_stock: 600 }]) },
      cafe_waste_reasons: { findFirst: jest.fn().mockResolvedValue(reason) },
      sales_shift_sessions: {
        findFirst: jest.fn().mockResolvedValue({ id: 31, branch_id: 2, status: 'open' }),
      },
      inv_transactions: { create: jest.fn().mockResolvedValue(transaction) },
      cafe_waste_records: { create: jest.fn().mockResolvedValue(createdRecord) },
      fin_expenses: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };
    const runTransaction = jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
    const { service, stock, moduleLedger } = buildService({ $transaction: runTransaction });

    const result = await service.create({
      requestId: createdRecord.request_id,
      sourceKind: 'inventory', sourceId: 1, branchId: 2, quantity: 100, unit: 'g', reasonId: 3,
      shiftSessionId: 31,
    }, user);

    expect(result.id).toBe(90);
    expect(tx.inv_transactions.create).toHaveBeenCalledTimes(1);
    expect(stock.applyTransaction).toHaveBeenCalledTimes(1);
    expect(moduleLedger.postInventoryConsumption).toHaveBeenCalledTimes(1);
    expect(tx.fin_expenses.create).toHaveBeenCalledTimes(1);
    expect(tx.cafe_waste_records.create).toHaveBeenCalledTimes(1);
    expect(tx.cafe_waste_records.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        shift_session_id: 31,
        component_snapshot: [expect.objectContaining({ productId: 1, unitCost: 0.05, cost: 5 })],
      }),
    }));
    expect(result.shiftSessionId).toBe(31);
  });

  it('rejects a shift-linked waste record unless that session is still open in the same branch', async () => {
    const invCreate = jest.fn();
    const tx = {
      sales_shift_sessions: { findFirst: jest.fn().mockResolvedValue(null) },
      inv_products: { findFirst: jest.fn().mockResolvedValue(rawCoffee) },
      cafe_products: { findFirst: jest.fn() },
      inv_stock_balances: { findMany: jest.fn().mockResolvedValue([{ product_id: 1, current_stock: 600 }]) },
      inv_transactions: { create: invCreate },
    };
    const runTransaction = jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
    const { service } = buildService({ $transaction: runTransaction });

    await expect(service.create({
      requestId: '25a31b6f-51f4-4a1f-89cb-84507d632bd3',
      sourceKind: 'inventory', sourceId: 1, branchId: 2, quantity: 100, unit: 'g', reasonId: 3,
      shiftSessionId: 31,
    }, user)).rejects.toThrow('الشيفت غير مفتوح');

    expect(tx.sales_shift_sessions.findFirst).toHaveBeenCalledWith({
      where: { id: 31, branch_id: 2, status: 'open' },
      select: { id: true },
    });
    expect(invCreate).not.toHaveBeenCalled();
  });

  it('stops before mutation when the transactional recalculation loses its valid cost', async () => {
    const tx = {
      inv_products: { findFirst: jest.fn().mockResolvedValue({ ...rawCoffee, cost_price: 0 }) },
      cafe_products: { findFirst: jest.fn() },
      inv_stock_balances: { findMany: jest.fn().mockResolvedValue([{ product_id: 1, current_stock: 600 }]) },
      inv_transactions: { create: jest.fn() },
    };
    const runTransaction = jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx));
    const { service } = buildService({ $transaction: runTransaction });

    await expect(service.create({
      requestId: '15a31b6f-51f4-4a1f-89cb-84507d632bd3',
      sourceKind: 'inventory', sourceId: 1, branchId: 2, quantity: 100, unit: 'g', reasonId: 3,
    }, user)).rejects.toThrow('تكلفة صحيحة');
    expect(tx.inv_transactions.create).not.toHaveBeenCalled();
  });

  it('restores stock only while reversing an authoritative posted journal in the same transaction', async () => {
    const original = {
      id: 4, branch_id: 2, warehouse_id: 9, status: 'active', reference: 'WASTE-1',
      transaction_id: 80, total_cost: 4,
      component_snapshot: [{ productId: 1, name: 'بن', quantity: 1000, unit: 'g', unitCost: 0.004, cost: 4 }],
      transaction: { items: [{ product_id: 1, item_name: 'بن', quantity: 1000, unit: 'g', price: 0, total: 4 }] },
    };
    const updated = { ...original, status: 'reversed', transaction: original.transaction };
    const tx = {
      cafe_waste_records: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(updated),
      },
      inv_transactions: { create: jest.fn().mockResolvedValue({ id: 81, items: original.transaction.items }) },
      acc_journal_entries: { findFirst: jest.fn().mockResolvedValue({ id: 70, status: 'posted', reversed_by_id: null }) },
      fin_expenses: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    };
    const prisma = {
      cafe_waste_records: {
        findFirst: jest.fn().mockResolvedValue(original),
        findUnique: jest.fn().mockResolvedValue(updated),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const { service, stock, ledger } = buildService(prisma);

    await service.reverse(4, { reason: 'إدخال مكرر' }, user);

    expect(ledger.reverseEntry).toHaveBeenCalledWith(70, 'إدخال مكرر', 7, tx);
    expect(stock.applyTransaction).toHaveBeenCalledWith(expect.objectContaining({
      txnType: 'receipt',
      lines: [expect.objectContaining({ productId: 1, quantity: 1000, unitCost: 0.004 })],
    }), tx);
    expect(tx.cafe_waste_records.update).toHaveBeenCalledWith(expect.objectContaining({ data: { reversal_transaction_id: 81 } }));
  });

  it('aborts reversal when the authoritative journal is missing', async () => {
    const original = {
      id: 4, branch_id: 2, warehouse_id: 9, status: 'active', reference: 'WASTE-1',
      transaction_id: 80, total_cost: 5,
      transaction: { items: [{ product_id: 1, item_name: 'بن', quantity: 100, unit: 'g', price: 0.05, total: 5 }] },
    };
    const finalUpdate = jest.fn();
    const tx = {
      cafe_waste_records: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: finalUpdate },
      inv_transactions: { create: jest.fn().mockResolvedValue({ id: 81, items: original.transaction.items }) },
      acc_journal_entries: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      cafe_waste_records: { findFirst: jest.fn().mockResolvedValue(original) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const { service } = buildService(prisma);

    await expect(service.reverse(4, { reason: 'إدخال مكرر' }, user)).rejects.toThrow('القيد المحاسبي الأصلي غير موجود');
    expect(finalUpdate).not.toHaveBeenCalled();
  });

  it('forces analytics to exclude reversed records at the database query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = buildService({
      cafe_waste_records: { findMany },
      users: { findMany: jest.fn() },
    });

    const result = await service.analytics({ branchId: '2' }, user);

    expect(result.recordCount).toBe(0);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'active' }),
    }));
  });

  it('limits the shift handover waste list to the exact session', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const { service } = buildService({
      cafe_waste_records: { findMany, count },
      users: { findMany: jest.fn() },
    });

    const result = await service.listRecords({
      branchId: '2', shiftSessionId: 31, page: 1, pageSize: 20, skip: 0, take: 20,
    } as never, user);

    expect(result.total).toBe(0);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ shift_session_id: 31 }),
    }));
    expect(count).toHaveBeenCalledWith({ where: expect.objectContaining({ shift_session_id: 31 }) });
  });

  it('uses Cairo calendar boundaries and groups after-midnight records on the Cairo day', async () => {
    const createdAt = new Date('2026-08-20T22:30:00.000Z');
    const row = {
      id: 1, branch_id: 2, reason_id: 3, reason_name: 'تلف', source_kind: 'inventory',
      inventory_product_id: 1, cafe_product_id: null, source_name: 'بن', created_by: 7,
      total_cost: 5, created_at: createdAt, transaction: { items: [] },
    };
    const { service } = buildService({
      cafe_waste_records: { findMany: jest.fn().mockResolvedValue([row]) },
      users: { findMany: jest.fn().mockResolvedValue([{ user_id: 7, name: 'أحمد', username: 'ahmed' }]) },
    });

    const where = (service as any).recordWhere({ branchId: '2', dateFrom: '2026-08-21', dateTo: '2026-08-21' }, user);
    const result = await service.analytics({ branchId: '2' }, user);

    expect(where.created_at.gte.toISOString()).toBe('2026-08-20T21:00:00.000Z');
    expect(where.created_at.lt.toISOString()).toBe('2026-08-21T21:00:00.000Z');
    expect(result.byDay).toEqual([expect.objectContaining({ key: '2026-08-21', cost: 5 })]);
  });
});

