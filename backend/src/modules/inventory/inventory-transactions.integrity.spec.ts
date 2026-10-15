// Regression coverage for concurrent inventory documents, branch transfers and refund waste.
// Actual services, in-memory persistence and gated interleavings; no production I/O.
import { InventoryTransactionsService } from './inventory-transactions.service';
import { InventoryStockService } from './inventory-stock.service';
import { QuickSalesService } from '../sales/quick-sales.service';
import { BranchScopeGuard } from '../../common/guards/branch-scope.guard';

const clone = <T>(value: T): T => structuredClone(value);
const gate = () => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  return { ready, release };
};
const user = { sub: 9, branch: 1, level: 1 } as never;
const branchUser = { sub: 10, branch: 1, level: 3 } as never;

function transactionFixture(type = 'transfer') {
  let state: any = {
    balances: { 1: 100, 2: 50 }, branches: { 1: 100, 2: 50 }, movements: [],
    warehouses: [{ id: 1, branch_id: 1, status: 'active', is_deleted: false }, { id: 2, branch_id: 2, status: 'active', is_deleted: false }],
    row: { id: 1, reference: 'AUDIT-1', txn_type: type, status: 'draft', txn_date: new Date(),
      branch_id: 1, source_warehouse_id: 1, target_warehouse_id: type === 'transfer' ? 2 : null,
      is_deleted: false, items: [{ id: 10, product_id: 36, item_name: 'water', quantity: 2, price: 10, total: 20 }] },
  };
  const updateRow = async ({ data }: any) => {
    const { items, ...fields } = data;
    Object.assign(state.row, fields);
    if (items) state.row.items = items.create.map((item: any, index: number) => ({ id: 20 + index, ...item }));
    return clone(state.row);
  };
  const db: any = {
    $queryRaw: jest.fn(async () => []), $queryRawUnsafe: jest.fn(async () => []),
    inv_transactions: {
      findFirst: jest.fn(async () => state.row.is_deleted ? null : clone(state.row)),
      create: jest.fn(async ({ data }: any) => {
        state.row = { ...data, id: 1, is_deleted: false, items: data.items.create.map((item: any, index: number) => ({ id: 10 + index, ...item })) };
        return clone(state.row);
      }),
      update: jest.fn(updateRow),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (state.row.is_deleted || where.status !== state.row.status) return { count: 0 };
        Object.assign(state.row, data); return { count: 1 };
      }),
    },
    inv_transaction_items: {
      deleteMany: jest.fn(async () => { state.row.items = []; }),
      update: jest.fn(async ({ where, data }: any) => {
        const item = state.row.items.find((i: any) => i.id === where.id);
        if (!item) throw new Error('missing persisted item');
        Object.assign(item, data); return clone(item);
      }),
    },
    inv_products: {
      findUnique: jest.fn(async () => ({ min_stock: 0, reorder_point: 0, max_stock: 1000 })),
      findMany: jest.fn(async () => [{ id: 36, cost_price: 10 }]),
    },
    inv_stock_balances: {
      upsert: jest.fn(async ({ where }: any) => {
        const id = where.product_id_warehouse_id.warehouse_id;
        return { id, current_stock: state.balances[id] };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        state.balances[where.id] += Number(data.current_stock.increment);
        return { id: where.id, current_stock: state.balances[where.id] };
      }),
    },
    inv_movements: { create: jest.fn(async ({ data }: any) => {
      const row = { ...data, quantity: Number(data.quantity), balance_after: Number(data.balance_after), unit_cost: Number(data.unit_cost) };
      state.movements.push(row); return row;
    }) },
    inv_product_branches: { upsert: jest.fn(async ({ where, update }: any) => {
      state.branches[where.product_id_branch_id.branch_id] += Number(update.stock_quantity.increment); return {};
    }) },
    inv_warehouses: { findMany: jest.fn(async ({ where }: any) => clone(state.warehouses.filter((row: any) => where.id.in.includes(row.id)))) },
    fin_expenses: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
  };
  let queue = Promise.resolve();
  const transact = (run: any) => {
    const result = queue.then(async () => {
      const saved = clone(state);
      try { return await run(db); } catch (error) { state = saved; throw error; }
    });
    queue = result.then(() => undefined, () => undefined); return result;
  };
  db.$transaction = jest.fn(transact);
  const scope = { isBranchAllowed: (u: any, branch: number) => u.level === 1 || branch === 1, allowedBranchIds: (u: any) => u.level === 1 ? null : [1] };
  const stock = new InventoryStockService(db);
  const ledger = { ensureChart: jest.fn(async () => {}), postInventoryConsumption: jest.fn(async () => {}) };
  const service = new InventoryTransactionsService(db, stock, { resolveBranchStockLocation: async () => 1 } as never, ledger as never, scope as never);
  return { db, service, scope, ledger, transact, updateRow, get state() { return state; } };
}

describe('Inventory transaction integrity', () => {
  it('approval re-reads the edited quantity after acquiring the document lock', async () => {
    const f = transactionFixture(); const reached = gate(); const release = gate();
    f.db.$transaction.mockImplementationOnce(async (run: any) => {
      reached.release(); await release.ready; return f.transact(run);
    });
    const approving = f.service.approve(1, user); await reached.ready;
    await f.service.update(1, { items: [{ productId: 36, itemName: 'water', quantity: 10 }] }, user);
    release.release(); await approving;
    expect(f.state.row.status).toBe('approved');
    expect(f.state.row.items[0].quantity).toBe(10);
    expect(f.state.movements.map((m: any) => m.quantity)).toEqual([-10, 10]);
    expect(f.state.balances).toEqual({ 1: 90, 2: 60 });
  });

  it('an editor queued behind approval cannot overwrite the approved document', async () => {
    const f = transactionFixture(); const reached = gate(); const release = gate();
    f.db.$transaction.mockImplementationOnce(async (run: any) => {
      reached.release(); await release.ready; return f.transact(run);
    });
    const editing = f.service.update(1, { items: [{ productId: 36, itemName: 'water', quantity: 10 }] }, user);
    const rejected = expect(editing).rejects.toThrow('المسودة');
    await reached.ready; await f.service.approve(1, user); release.release(); await rejected;
    expect(f.state.row.status).toBe('approved');
    expect(f.state.row.items[0].quantity).toBe(2);
    expect(f.state.movements.map((m: any) => m.quantity)).toEqual([-2, 2]);
  });

  it.each(['reject', 'remove'] as const)('%s queued behind approval cannot hide the posted movement', async action => {
    const f = transactionFixture(); const reached = gate(); const release = gate();
    f.db.$transaction.mockImplementationOnce(async (run: any) => {
      reached.release(); await release.ready; return f.transact(run);
    });
    const pending = action === 'reject' ? f.service.reject(1, { reason: 'incorrect document' }, user) : f.service.remove(1, user);
    const rejected = expect(pending).rejects.toThrow('المسودة');
    await reached.ready; await f.service.approve(1, user); release.release(); await rejected;
    expect(f.state.row.status).toBe('approved');
    expect(f.state.row.is_deleted).toBe(false);
    expect(f.state.balances).toEqual({ 1: 98, 2: 52 });
    expect(f.state.movements).toHaveLength(2);
  });

  it('authorized cross-branch transfers keep each branch balance and movement in sync', async () => {
    const f = transactionFixture(); await f.service.approve(1, user);
    expect(f.state.balances).toEqual({ 1: 98, 2: 52 });
    expect(f.state.branches).toEqual({ 1: 98, 2: 52 });
    expect(f.state.movements.map((m: any) => m.branch_id)).toEqual([1, 2]);
  });

  it('validates warehouse ownership even when the explicit branch id passes the global guard', async () => {
    const f = transactionFixture('issue');
    const body = { reference: 'FOREIGN-WAREHOUSE', txnType: 'issue', txnDate: '2026-10-04', branchId: 1, sourceWarehouseId: 2,
      items: [{ productId: 36, itemName: 'water', quantity: 11, price: 10 }] };
    const guard = new BranchScopeGuard(f.scope as never);
    expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ user: branchUser, body, query: {} }) }) } as never)).toBe(true);
    await expect(f.service.create(body, branchUser)).rejects.toThrow('فرع الحركة');
    expect(f.state.balances).toEqual({ 1: 100, 2: 50 });
    expect(f.state.branches).toEqual({ 1: 100, 2: 50 });
    expect(f.state.movements).toHaveLength(0);
  });

  it.each(['reject', 'remove'] as const)('an approval queued behind %s cannot post stock', async action => {
    const f = transactionFixture(); const reached = gate(); const release = gate();
    f.db.$transaction.mockImplementationOnce(async (run: any) => { reached.release(); await release.ready; return f.transact(run); });
    const approving = f.service.approve(1, user);
    const rejected = expect(approving).rejects.toThrow();
    await reached.ready;
    if (action === 'reject') await f.service.reject(1, { reason: 'cancelled request' }, user);
    else await f.service.remove(1, user);
    release.release(); await rejected;
    expect(f.state.movements).toHaveLength(0);
    expect(f.state.balances).toEqual({ 1: 100, 2: 50 });
  });

  it('two concurrent approvals post the transfer only once', async () => {
    const f = transactionFixture();
    const results = await Promise.allSettled([f.service.approve(1, user), f.service.approve(1, user)]);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(f.state.movements).toHaveLength(2);
    expect(f.state.branches).toEqual({ 1: 98, 2: 52 });
    expect(f.db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'ReadCommitted' }));
    expect(f.db.$queryRaw.mock.calls.some((args: any[]) => args[0].sql.includes('inv_transactions') && args[0].sql.includes('FOR UPDATE'))).toBe(true);
  });

  it('a same-branch transfer preserves that branch total', async () => {
    const f = transactionFixture(); f.state.warehouses[1].branch_id = 1; f.state.branches = { 1: 150 };
    await f.service.approve(1, branchUser);
    expect(f.state.balances).toEqual({ 1: 98, 2: 52 });
    expect(f.state.branches).toEqual({ 1: 150 });
    expect(f.state.movements.map((m: any) => m.branch_id)).toEqual([1, 1]);
  });

  it.each(['create', 'update', 'approve'] as const)('%s denies a transfer to a branch outside the user scope', async action => {
    const f = transactionFixture();
    const operation = action === 'create' ? f.service.create({ reference: 'X', txnType: 'transfer', txnDate: '2026-10-04', branchId: 1,
      sourceWarehouseId: 1, targetWarehouseId: 2, items: [{ productId: 36, itemName: 'water', quantity: 2 }] }, branchUser)
      : action === 'update' ? f.service.update(1, { notes: 'updated' }, branchUser) : f.service.approve(1, branchUser);
    await expect(operation).rejects.toThrow('صلاحية');
    expect(f.state.movements).toHaveLength(0);
    expect(f.state.row.status).toBe('draft');
  });

  it.each(['missing', 'inactive', 'deleted'])('refuses a %s warehouse even for an admin', async problem => {
    const f = transactionFixture();
    if (problem === 'missing') f.state.warehouses.pop();
    if (problem === 'inactive') f.state.warehouses[1].status = 'inactive';
    if (problem === 'deleted') f.state.warehouses[1].is_deleted = true;
    await expect(f.service.approve(1, user)).rejects.toThrow('غير موجود أو غير نشط');
    expect(f.state.movements).toHaveLength(0);
  });

  it('validates the warehouse after waiting for approval, including legacy invalid drafts', async () => {
    const f = transactionFixture('issue'); f.state.row.source_warehouse_id = 2;
    await expect(f.service.approve(1, user)).rejects.toThrow('فرع الحركة');
    expect(f.state.movements).toHaveLength(0);
    await expect(f.service.update(1, { sourceWarehouseId: 2 }, user)).rejects.toThrow('فرع الحركة');
  });

  it('rolls the document, warehouse and branch balances back on a ledger failure', async () => {
    const f = transactionFixture('issue');
    f.ledger.postInventoryConsumption.mockRejectedValueOnce(new Error('ledger unavailable'));
    await expect(f.service.approve(1, branchUser)).rejects.toThrow('ledger unavailable');
    expect(f.state.row.status).toBe('draft');
    expect(f.state.balances).toEqual({ 1: 100, 2: 50 });
    expect(f.state.branches).toEqual({ 1: 100, 2: 50 });
    expect(f.state.movements).toHaveLength(0);
  });

  it.each([0, -2, 0.0000001])('rejects a persisted invalid quantity %s before posting', async quantity => {
    const f = transactionFixture('issue'); f.state.row.items[0].quantity = quantity;
    await expect(f.service.approve(1, user)).rejects.toThrow('كميات أكبر');
    expect(f.state.movements).toHaveLength(0);
  });

  it.each([0.0075, 0.0004, 0.000001])('refund waste preserves %s kg at six decimal places', async quantity => {
    const cost = Math.round(quantity * 1000 * 100) / 100;
    let row: any = { id: 1, sale_number: 'COFFEE-1', branch_id: 1, warehouse_id: 1, inventory_posted: true,
      status: 'completed', sale_type: 'customer', cost_total: cost, subtotal: 20, total_amount: 20,
      collected_amount: 20, discount_amount: 0, tax_amount: 0, payment_method: 'cash',
      items: [{ id: 1, product_id: 99, inventory_product_id: null, cafe_product_id: 58, item_type: 'cafe', name: 'coffee', quantity: 1, unit_price: 20, line_total: 20, unit_cost: cost, line_cost: cost }], payments: [{ method: 'cash', amount: 20 }], events: [], sale_date: '2026-10-04' };
    const wasteCreate = jest.fn(async (_args: any) => ({}));
    const db: any = {
      $queryRaw: jest.fn(async () => []), $queryRawUnsafe: jest.fn(async () => []),
      payroll_cafe_allocations: { findUnique: async () => null },
      sales_quick_sales: { findUnique: async () => clone(row), update: async ({ data }: any) => {
        const { events, ...rest } = data; row = { ...row, ...rest, events: [events.create] }; return clone(row);
      } },
      inv_movements: { findMany: async () => [{ product_id: 99, warehouse_id: 1, direction: 'out', quantity: -quantity,
        unit_cost: 1000, product: { product_code: 'COFFEE', name_ar: 'coffee', unit_of_measure: 'kg' } }] },
      inv_transactions: { create: wasteCreate },
      fin_expenses: { findFirst: async () => null, create: async () => ({}), upsert: async () => ({}) },
      fin_revenues: { findFirst: async () => null, upsert: async () => ({}) },
    };
    db.$transaction = async (run: any) => run(db);
    const stock = { applyMovement: jest.fn() };
    const service = new QuickSalesService(db, stock as never, {} as never,
      { findBranchSessionForSale: async () => ({ id: 1 }), applySaleReversalToSession: async () => {} } as never,
      { postQuickSaleRefund: async () => {} } as never, {} as never, { isBranchAllowed: () => true } as never, {} as never, {} as never);
    await service.update(1, { status: 'refunded', notes: 'prepared order returned' }, 9, false, user);
    const waste = wasteCreate.mock.calls[0][0].data;
    expect(waste.items.create[0]).toMatchObject({ quantity, total: cost });
    expect(waste.total_amount).toBe(cost);
    expect(stock.applyMovement).not.toHaveBeenCalled(); // consumed at sale time, classified as waste now
  });
});
