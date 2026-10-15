// Regression tests for the defects reproduced on October 4.
// Actual services/functions, in-memory persistence, no DB/network. Transactions are
// serialized by the fixture; explicitly gated interleavings are not MySQL load tests.
import { Prisma } from '@prisma/client';
import { InventoryStockService } from './inventory-stock.service';
import { StockTakingService } from './stock-taking.service';
import { OpeningStocksService } from './opening-stocks.service';
import { planCompletedSaleStock } from '../sales/completed-sale-stock-plan.util';
import { CafeWasteService } from '../cafe-waste/cafe-waste.service';
import { ProductBranchesService } from './product-branches.service';

const clone = <T>(x: T): T => structuredClone(x);
function gate() {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  return { ready, release };
}

function fixture(initial = 176) {
  const balances = new Map([[1, initial], [2, 500]]);
  const movements: any[] = [];
  const items: any[] = [];
  const adjustments: any[] = [];
  const openings: any[] = [];
  const sessions = [1, 2].map(id => ({ id, status: 'draft', warehouse_id: 1,
    branch_id: 1, session_number: `CNT${id}`, created_by: 1,
    created_at: new Date(), updated_at: new Date() }));
  const session = (id: number) => {
    const s = sessions.find(s => s.id === id);
    return s ? clone({ ...s, items: items.filter(i => i.session_id === id) }) : null;
  };
  const tx: any = {
    $queryRaw: jest.fn(async () => []),
    inv_products: {
      findUnique: jest.fn(async () => ({ min_stock: 0, max_stock: 1000, reorder_point: 0 })),
      findMany: jest.fn(async () => [{ id: 36, cost_price: 10 }]),
    },
    inv_stock_balances: {
      findUnique: jest.fn(async ({ where }: any) => ({ current_stock: balances.get(where.product_id_warehouse_id.warehouse_id) })),
      upsert: jest.fn(async ({ where }: any) => {
        const id = where.product_id_warehouse_id.warehouse_id;
        return { id, current_stock: new Prisma.Decimal(balances.get(id) ?? 0) };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const value = data.current_stock;
        const next = value.increment !== undefined ? (balances.get(where.id) ?? 0) + Number(value.increment) : Number(value);
        balances.set(where.id, next);
        return { id: where.id, current_stock: new Prisma.Decimal(next) };
      }),
    },
    inv_movements: { findFirst: jest.fn(async ({ where }: any) => clone([...movements].reverse().find(m => m.product_id === where.product_id && m.warehouse_id === where.warehouse_id && m.doc_type === where.doc_type) ?? null)), create: jest.fn(async ({ data }: any) => {
      const row = { ...data, id: movements.length + 1, created_at: new Date(), quantity: Number(data.quantity), unit_cost: Number(data.unit_cost), balance_after: Number(data.balance_after) };
      movements.push(row); return row;
    }) },
    inv_product_branches: { upsert: jest.fn(async () => ({})) },
    inv_count_sessions: {
      delete: jest.fn(async ({ where }: any) => {
        sessions.splice(sessions.findIndex(s => s.id === where.id), 1);
        for (let i = items.length - 1; i >= 0; i--) if (items[i].session_id === where.id) items.splice(i, 1);
        return {};
      }),
      findUnique: jest.fn(async ({ where }: any) => session(where.id)),
      update: jest.fn(async ({ where, data }: any) => {
        Object.assign(sessions.find(s => s.id === where.id)!, data); return session(where.id);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const found = sessions.find(s => s.id === where.id && s.status === where.status);
        if (!found) return { count: 0 };
        Object.assign(found, data); return { count: 1 };
      }),
    },
    inv_count_items: {
      update: jest.fn(async ({ where, data }: any) => Object.assign(items.find(i => i.id === where.id), data)),
      create: jest.fn(async ({ data }: any) => { const row = { id: items.length + 1, created_at: new Date(), ...data }; items.push(row); return clone(row); }),
      delete: jest.fn(async ({ where }: any) => items.splice(items.findIndex(i => i.id === where.id), 1)[0]),
    },
    inv_adjustments: {
      deleteMany: jest.fn(async ({ where }: any) => {
        for (let i = adjustments.length - 1; i >= 0; i--) if (adjustments[i].session_id === where.session_id) adjustments.splice(i, 1);
        return {};
      }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(adjustments.find(a => a.id === where.id), data)),
      findFirst: jest.fn(async ({ where }: any) => clone(adjustments.find(a => a.session_id === where.session_id && (!where.status || a.status === where.status)) ?? null)),
      findUnique: jest.fn(async ({ where }: any) => {
        const row = adjustments.find(a => a.id === where.id);
        return row ? { ...clone(row), session: session(row.session_id) } : null;
      }),
      create: jest.fn(async ({ data }: any) => { const row = { id: adjustments.length + 1, ...data }; adjustments.push(row); return clone(row); }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = adjustments.find(a => a.id === where.id && a.status !== where.status.not);
        if (!row) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      }),
    },
    inv_opening_stocks: { create: jest.fn(async ({ data }: any) => {
      const row = { ...data, id: openings.length + 1 }; openings.push(row); return row;
    }) },
  };
  let tail = Promise.resolve();
  const prisma: any = { ...tx, $transaction: (run: any) => {
    const result = tail.then(async () => {
      const state = clone({ balances, movements, items, adjustments, openings, sessions });
      try { return await run(tx); } catch (error) {
        balances.clear(); state.balances.forEach((value, id) => balances.set(id, value));
        for (const [target, saved] of [[movements, state.movements], [items, state.items], [adjustments, state.adjustments], [openings, state.openings], [sessions, state.sessions]]) target.splice(0, target.length, ...saved);
        throw error;
      }
    });
    tail = result.then(() => undefined, () => undefined); return result;
  } };
  const stock = new InventoryStockService(prisma);
  const ledger = { ensureChart: jest.fn(async () => {}), postInventoryCountAdjustment: jest.fn(async () => {}), postOpeningStock: jest.fn(async () => {}) };
  const counts: StockTakingService = new StockTakingService(prisma, stock, {} as never, ledger as never);
  const add = (sessionId: number, countedQuantity: number) => counts.addCountItem(sessionId, {
    productId: 36, itemName: 'water', countedQuantity, varianceReason: 'physical count',
  });
  const finalize = (sessionId: number) => counts.finalizeSession(sessionId, 1);
  return { tx, prisma, stock, ledger, counts, balances, movements, sessions, items, openings, adjustments, add, finalize };
}

describe('October 4: inventory regression protection', () => {
  it.each([
    { initial: 176, counted: 165, actual: 154 },
    { initial: 154, counted: 165, actual: 176 },
  ])('rejects an overlapping count after the first corrects $initial to $counted', async ({ initial, counted }) => {
    const f = fixture(initial);
    await f.add(1, counted);
    await f.add(2, counted); // no sale or physical change between the counts
    const a = await f.finalize(1); const b = await f.finalize(2);
    await f.counts.approveAdjustment(a.adjustmentId, 1);
    expect(f.balances.get(1)).toBe(counted);
    await expect(f.counts.approveAdjustment(b.adjustmentId, 1)).rejects.toThrow('جرد آخر');
    expect(f.balances.get(1)).toBe(counted);
    expect(f.movements.map(m => m.quantity)).toEqual([counted - initial]);
    expect(f.adjustments[1].status).toBe('pending');
  });

  it('rejects relocating a count and corrects only the original warehouse', async () => {
    const f = fixture();
    await f.add(1, 165); // baseline 176 in warehouse 1
    await expect(f.counts.updateSession(1, { warehouseId: 2 })).rejects.toThrow('تغيير');
    const a = await f.finalize(1);
    await f.counts.approveAdjustment(a.adjustmentId, 1);
    expect(f.balances.get(1)).toBe(165);
    expect(f.balances.get(2)).toBe(500);
    expect(f.movements[0]).toMatchObject({ warehouse_id: 1, quantity: -11 });
  });

  it('serializes deletion with finalization: deleting the last item first prevents approval', async () => {
    const f = fixture();
    const line = await f.add(1, 165);
    const reachedDelete = gate(); const releaseDelete = gate();
    f.tx.inv_count_items.delete.mockImplementationOnce(async ({ where }: any) => {
      reachedDelete.release(); await releaseDelete.ready;
      return f.items.splice(f.items.findIndex(i => i.id === where.id), 1)[0];
    });
    const removing = f.counts.removeCountItem(1, line.id);
    await reachedDelete.ready;
    const finalizing = f.finalize(1);
    const rejected = expect(finalizing).rejects.toThrow('صنف واحد');
    releaseDelete.release(); await removing; await rejected;
    expect(f.sessions[0].status).toBe('draft');
    expect(f.movements).toHaveLength(0);
  });

  it('a deletion queued after finalization cannot erase the approved count evidence', async () => {
    const f = fixture();
    const line = await f.add(1, 165);
    const finalizing = f.finalize(1);
    const deleting = expect(f.counts.removeCountItem(1, line.id)).rejects.toThrow('إرسال');
    const a = await finalizing; await deleting;
    await f.counts.approveAdjustment(a.adjustmentId, 1);
    await expect(f.counts.removeCountItem(1, line.id)).rejects.toThrow('إرسال');
    expect(f.items).toHaveLength(1);
    expect(f.balances.get(1)).toBe(165);
  });

  it('concurrent opening additions preserve both documents and all 200 units', async () => {
    const f = fixture(0);
    let chartReaders = 0; const bothRead = gate();
    f.ledger.ensureChart.mockImplementation(async () => {
      if (++chartReaders === 2) bothRead.release();
      await bothRead.ready;
    });
    const opening = new OpeningStocksService(f.prisma, f.stock, {
      requireUserBranch: () => 1, resolveBranchStockLocation: async () => 1,
    } as never, f.ledger as never, {} as never);
    const dto = { productId: 36, itemCode: 'WATER', quantity: 100, unitCost: 10 };
    await Promise.all([opening.create(dto, { sub: 1 } as never), opening.create(dto, { sub: 2 } as never)]);
    expect(f.openings.reduce((n, row) => n + row.quantity, 0)).toBe(200);
    expect(f.ledger.postOpeningStock.mock.calls).toHaveLength(2);
    expect(f.balances.get(1)).toBe(200);
    expect(f.movements.map(m => m.quantity)).toEqual([100, 100]);
  });

  it('requires explicit recount after reopening a stale session, then reuses its adjustment', async () => {
    const f = fixture();
    await f.add(1, 165); await f.add(2, 165);
    const a = await f.finalize(1); const b = await f.finalize(2);
    await f.counts.approveAdjustment(a.adjustmentId, 1);
    await f.counts.reopenSession(2);
    await f.counts.updateCountItem(2, 2, { itemName: 'water', countedQuantity: 164, varianceReason: 'typo' });
    await expect(f.finalize(2)).rejects.toThrow('جرد آخر');
    await f.counts.updateCountItem(2, 2, { itemName: 'water', countedQuantity: 164, varianceReason: 'recount', recount: true });
    expect(f.items[1]).toMatchObject({ system_quantity: 165, variance: -1, baseline_count_movement_id: 1 });
    expect((await f.finalize(2)).adjustmentId).toBe(b.adjustmentId);
    await f.counts.approveAdjustment(b.adjustmentId, 1);
    expect(f.balances.get(1)).toBe(164);
    await expect(f.counts.reopenSession(2)).rejects.toThrow('ينتظر الاعتماد');
    expect(f.adjustments).toHaveLength(2);
  });

  it('serializes simultaneous approvals from separate sessions', async () => {
    const f = fixture();
    await f.add(1, 165); await f.add(2, 165);
    const a = await f.finalize(1); const b = await f.finalize(2);
    const results = await Promise.allSettled([f.counts.approveAdjustment(a.adjustmentId, 1), f.counts.approveAdjustment(b.adjustmentId, 1)]);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(f.balances.get(1)).toBe(165);
    expect(f.movements).toHaveLength(1);
  });

  it('rejects a legacy count when another count occurred since the item was captured', async () => {
    const f = fixture();
    await f.add(1, 165); await f.add(2, 165);
    f.items[1].baseline_count_movement_id = null;
    f.items[1].created_at = new Date('2026-10-01T00:00:00Z');
    const a = await f.finalize(1); const b = await f.finalize(2);
    await f.counts.approveAdjustment(a.adjustmentId, 1);
    await expect(f.counts.approveAdjustment(b.adjustmentId, 1)).rejects.toThrow('جرد آخر');
  });

  it('accepts a legacy count with no intervening count movement', async () => {
    const f = fixture();
    await f.add(1, 165); f.items[0].baseline_count_movement_id = null;
    const a = await f.finalize(1);
    await f.counts.approveAdjustment(a.adjustmentId, 1);
    expect(f.balances.get(1)).toBe(165);
  });

  it('can delete an unapproved reopened session without leaving an orphan adjustment', async () => {
    const f = fixture(); await f.add(1, 165); await f.finalize(1);
    await f.counts.reopenSession(1); await f.counts.removeSession(1);
    expect(f.sessions.map(s => s.id)).toEqual([2]);
    expect(f.adjustments).toHaveLength(0);
    expect(f.items).toHaveLength(0);
    expect(f.movements).toHaveLength(0);
  });

  it('rolls approval and movements back if intervening sales leave insufficient stock', async () => {
    const f = fixture(); await f.add(1, 165); const a = await f.finalize(1);
    f.balances.set(1, 5);
    await expect(f.counts.approveAdjustment(a.adjustmentId, 1)).rejects.toThrow('غير كافية');
    expect(f.balances.get(1)).toBe(5);
    expect(f.adjustments[0].status).toBe('pending');
    expect(f.sessions[0].status).toBe('awaiting_approval');
    expect(f.movements).toHaveLength(0);
    expect(f.ledger.postInventoryCountAdjustment).not.toHaveBeenCalled();
  });

  it.each([0, -100])('rejects invalid opening quantity %s even with a supplied positive total cost', async quantity => {
    const f = fixture(0);
    const opening = new OpeningStocksService(f.prisma, f.stock, {} as never, f.ledger as never, {} as never);
    await expect(opening.create({ productId: 36, itemCode: 'WATER', quantity, unitCost: 10, totalCost: 100 }, { sub: 1 } as never)).rejects.toThrow('أكبر من صفر');
    expect(f.openings).toHaveLength(0); expect(f.movements).toHaveLength(0);
  });

  it('opening stock offsets an existing negative balance instead of erasing it', async () => {
    const f = fixture(-5);
    const opening = new OpeningStocksService(f.prisma, f.stock, {
      requireUserBranch: () => 1, resolveBranchStockLocation: async () => 1,
    } as never, f.ledger as never, {} as never);
    await opening.create({ productId: 36, itemCode: 'WATER', quantity: 10, unitCost: 10 }, { sub: 1 } as never);
    expect(f.balances.get(1)).toBe(5); expect(f.movements[0].quantity).toBe(10);
  });

  const coffee = (quantity: number) => ({ cafeProductId: 58, cafeVariantId: null, productId: 58,
    quantity, unitCost: 7.5, consumption: [{ productId: 99, quantity: quantity * 0.0075, unitCost: 1000 }] });
  const coffeePlan = (oldQuantity: number, nextQuantity: number) => planCompletedSaleStock({
    originalItems: [{ cafe_product_id: 58, cafe_variant_id: null, product_id: 58, quantity: oldQuantity, unit_cost: 7.5 }],
    resolvedItems: [coffee(nextQuantity)], reconstructedOriginalItems: [coffee(oldQuantity)],
    history: [{ product_id: 99, warehouse_id: 1, quantity: oldQuantity * 0.0075, unit_cost: 1000 }], warehouseId: 1,
  });

  it('allows increasing a 7.5 g recipe with exact six-decimal history', () => {
    expect(coffeePlan(1, 2).desiredConsumption[0].quantity).toBe(0.015);
  });

  it('reducing two coffees to one retains exactly the original 7.5 g', () => {
    const result = coffeePlan(2, 1);
    expect(result.desiredConsumption).toHaveLength(1);
    expect(result.desiredConsumption[0].quantity).toBe(0.0075);
    expect(result.perLineUnitCosts).toEqual([7.5]);
  });

  function wasteService() {
    const product = { id: 99, product_code: 'COFFEE', name_ar: 'بن', inventory_kind: 'raw_material',
      inventory_section: 'preparation_ingredients', unit_of_measure: 'kg', cost_price: 1000,
      status: 'active', is_deleted: false, packages: [] };
    return new CafeWasteService({
      inv_products: { findFirst: async () => product },
      inv_stock_balances: { findMany: async () => [{ product_id: 99, current_stock: 1 }] },
    } as never, {} as never, { resolveBranchStockLocation: async () => 1 } as never,
    {} as never, {} as never, { isBranchAllowed: () => true } as never);
  }

  it('waste preview preserves a requested 7.5 g consumption and cost', async () => {
    const result = await wasteService().preview({ sourceKind: 'inventory', sourceId: 99,
      branchId: 1, quantity: 7.5, unit: 'g' }, { sub: 1 } as never);
    expect(result.components[0].quantity).toBe(0.0075);
    expect(result.components[0].cost).toBe(7.5);
    expect(result.components[0].afterStock).toBe(0.9925);
  });

  it('waste accepts a valid 0.4 g as 0.0004 kg', async () => {
    await expect(wasteService().preview({ sourceKind: 'inventory', sourceId: 99,
      branchId: 1, quantity: 0.4, unit: 'g' }, { sub: 1 } as never)).resolves.toMatchObject({ components: [expect.objectContaining({ quantity: 0.0004, afterStock: 0.9996 })] });
  });

  it.each(['create', 'update', 'updateStock', 'remove'] as const)('rejects %s bypassing warehouse movements', async (method) => {
    const branch = { id: 1, product_id: 36, branch_id: 1, stock_quantity: 176, reorder_point: 0, product: {} };
    const warehouse = { current_stock: 176 };
    const movementCreate = jest.fn();
    const warehouseUpdate = jest.fn();
    const prisma = {
      inv_product_branches: {
        findUnique: async () => clone(branch),
        update: async ({ data }: any) => { Object.assign(branch, data); return clone(branch); },
      },
      inv_stock_balances: { update: warehouseUpdate, findUnique: async () => warehouse },
      inv_movements: { create: movementCreate },
    };
    const service = new ProductBranchesService(prisma as never, { isBranchAllowed: () => true } as never);
    const action = method === 'create' ? service.create({ productId: 36, branchId: 1, stockQuantity: 165 })
      : method === 'remove' ? service.remove(1) : service[method](1, { stockQuantity: 165 });
    await expect(action).rejects.toThrow('المخزون');
    expect(branch.stock_quantity).toBe(176);
    expect(warehouse.current_stock).toBe(176);
    expect(movementCreate).not.toHaveBeenCalled();
    expect(warehouseUpdate).not.toHaveBeenCalled();
  });
});
