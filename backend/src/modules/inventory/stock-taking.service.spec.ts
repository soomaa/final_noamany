import { countedBalance, StockTakingService } from './stock-taking.service';

describe('stock-count numbering', () => {
  it('opens another count when MySQL returns the previous number as bigint', async () => {
    let created: Record<string, unknown> | null = null;
    const prisma: Record<string, unknown> = {
      $queryRaw: jest.fn().mockResolvedValue([{ maxNum: 1n }]),
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
      inv_count_sessions: {
        create: jest.fn(async ({ data }) => (created = { id: 2, ...data, status: 'draft', created_at: new Date(), updated_at: new Date() })),
        findUnique: jest.fn(async () => ({ ...created, items: [] })),
      },
      inv_adjustments: { findFirst: jest.fn().mockResolvedValue(null) },
      inv_warehouses: { findMany: jest.fn().mockResolvedValue([]) },
      inv_categories: { findMany: jest.fn().mockResolvedValue([]) },
      users: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const location = { resolveSelection: jest.fn().mockResolvedValue({ branchId: 4, warehouseId: 10 }) };
    const service = new StockTakingService(prisma as never, {} as never, location as never, {} as never);
    const session = await service.createSession({ warehouseId: 10 }, { sub: 1, level: 1, branch: 4 } as never);
    expect(session.sessionNumber).toBe('CNT000002');
    expect(session.warehouseId).toBe(10);
  });
});

describe('stock-count reports for reception', () => {
  const receptionist = { sub: 10, level: 2, branch: 3, job_title: 'موظف استقبال', man_women_type: 1 };
  const listService = () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const none = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = { inv_count_sessions: { findMany, count: jest.fn().mockResolvedValue(0) }, inv_warehouses: none, inv_categories: none, users: none };
    return { findMany, service: new StockTakingService(prisma as never, {} as never, {} as never, {} as never) };
  };

  it('limits reception employees to today\'s reports', async () => {
    const { findMany, service } = listService();
    await service.listSessions({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, receptionist as never);
    expect(JSON.stringify(findMany.mock.calls[0][0].where)).toContain('created_at');
  });

  it('filters the report by Cairo calendar days, end date inclusive', async () => {
    const { findMany, service } = listService();
    await service.listSessions({ page: 1, pageSize: 20, skip: 0, take: 20, dateFrom: '2026-10-01', dateTo: '2026-10-22' } as never, { ...receptionist, job_title: 'مدير' } as never);
    const and = findMany.mock.calls[0][0].where.AND as Array<{ created_at?: { gte?: Date; lt?: Date } }>;
    expect(and.find((c) => c.created_at?.gte)?.created_at?.gte?.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(and.find((c) => c.created_at?.lt)?.created_at?.lt?.toISOString()).toBe('2026-10-22T21:00:00.000Z');
  });

  it('shows managers every report', async () => {
    const { findMany, service } = listService();
    await service.listSessions({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, { ...receptionist, job_title: 'مشرف استقبال' } as never);
    expect(JSON.stringify(findMany.mock.calls[0][0].where ?? {})).not.toContain('created_at');
  });
});

describe('stock-count approval while the café sells', () => {
  const approvalService = (items: Array<{ product_id: number; system_quantity: number; counted_quantity: number }>, currentStock: Record<number, number>) => {
    const applyMovement = jest.fn().mockResolvedValue({});
    const postInventoryCountAdjustment = jest.fn().mockResolvedValue(undefined);
    const tx = {
      inv_adjustments: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      inv_products: { findMany: jest.fn().mockResolvedValue(items.map((i) => ({ id: i.product_id, cost_price: 10 }))) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      inv_stock_balances: {
        findUnique: jest.fn(async ({ where }) => {
          const qty = currentStock[where.product_id_warehouse_id.product_id];
          return qty == null ? null : { current_stock: qty };
        }),
      },
      inv_count_sessions: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      inv_adjustments: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          status: 'pending',
          adjustment_number: 'ADJ-CNT000009',
          session: {
            id: 9,
            warehouse_id: 1004,
            branch_id: 2,
            items: items.map((i, idx) => ({ id: idx + 1, item_name: `item ${i.product_id}`, item_code: null, variance: i.counted_quantity - i.system_quantity, ...i })),
          },
        }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const service = new StockTakingService(prisma as never, { applyMovement } as never, {} as never, { postInventoryCountAdjustment } as never);
    return { service, applyMovement, postInventoryCountAdjustment };
  };

  it('keeps sales made after the count: sets counted + movements since, instead of failing', async () => {
    // Counted 8 of 10 (2 missing); 3 were sold before approval, so the shelf now holds 5.
    const { service, applyMovement, postInventoryCountAdjustment } = approvalService(
      [{ product_id: 1, system_quantity: 10, counted_quantity: 8 }],
      { 1: 7 },
    );
    await expect(service.approveAdjustment(7, 1)).resolves.toEqual({ success: true, adjustmentId: 7 });
    expect(applyMovement).toHaveBeenCalledWith(expect.objectContaining({ productId: 1, warehouseId: 1004, operation: 'set', quantity: 5 }), expect.anything());
    expect(postInventoryCountAdjustment).toHaveBeenCalledWith(expect.objectContaining({ gainAmount: 0, lossAmount: 20 }), expect.anything());
  });

  it('counts in an item the warehouse never held and skips unchanged lines', async () => {
    const { service, applyMovement, postInventoryCountAdjustment } = approvalService(
      [
        { product_id: 2, system_quantity: 0, counted_quantity: 4 },
        { product_id: 3, system_quantity: 6, counted_quantity: 6 },
      ],
      { 3: 5 },
    );
    await service.approveAdjustment(7, 1);
    expect(applyMovement).toHaveBeenCalledTimes(1);
    expect(applyMovement).toHaveBeenCalledWith(expect.objectContaining({ productId: 2, quantity: 4 }), expect.anything());
    expect(postInventoryCountAdjustment).toHaveBeenCalledWith(expect.objectContaining({ gainAmount: 40, lossAmount: 0 }), expect.anything());
  });

  it('never sets a negative balance and books only the stock actually removed', async () => {
    // Counted 1 of 5, then 3 were sold: the shelf is empty, not −2.
    const { service, applyMovement, postInventoryCountAdjustment } = approvalService(
      [{ product_id: 4, system_quantity: 5, counted_quantity: 1 }],
      { 4: 2 },
    );
    await service.approveAdjustment(7, 1);
    expect(applyMovement).toHaveBeenCalledWith(expect.objectContaining({ productId: 4, quantity: 0 }), expect.anything());
    expect(postInventoryCountAdjustment).toHaveBeenCalledWith(expect.objectContaining({ lossAmount: 20 }), expect.anything());
  });
});

describe('countedBalance', () => {
  it('adds the movement since the count to the counted quantity', () => {
    expect(countedBalance(8, 10, 7)).toBe(5);
    expect(countedBalance(8, 10, 12)).toBe(10);
    expect(countedBalance(3, 3, 3)).toBe(3);
    expect(countedBalance(0.3, 0.1, 0.2)).toBe(0.4);
    expect(countedBalance(1, 5, 2)).toBe(0);
  });
});
