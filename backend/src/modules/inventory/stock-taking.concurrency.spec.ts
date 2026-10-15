import { StockTakingService } from './stock-taking.service';

/**
 * Count-line integrity: adding/editing lines is serialized per session (row lock inside a
 * transaction) and a recount is compared against the live balance, so approval never applies
 * the same shortage twice.
 */
describe('StockTakingService count-line integrity', () => {
  function fixture() {
    const items: any[] = [];
    let currentStock = 100;
    let status = 'draft';
    let locked: Promise<void> = Promise.resolve();
    const session = () => ({ id: 1, status, warehouse_id: 1, branch_id: 1, session_number: 'CNT1', items: items.map((i) => ({ ...i })) });
    const tx: any = {
      $queryRaw: jest.fn(async () => []),
      inv_count_sessions: { findUnique: jest.fn(async () => session()), update: jest.fn(async ({ data }: any) => { status = data.status; return {}; }), updateMany: jest.fn(async ({ data }: any) => { status = data.status; return { count: 1 }; }) },
      inv_movements: { findFirst: jest.fn(async () => null) },
      inv_stock_balances: { findUnique: jest.fn(async () => ({ current_stock: currentStock })) },
      inv_count_items: {
        create: jest.fn(async ({ data }: any) => { const row = { ...data, id: items.length + 1 }; items.push(row); return row; }),
        update: jest.fn(async ({ where, data }: any) => Object.assign(items.find((i) => i.id === where.id), data)),
      },
      inv_adjustments: {
        findUnique: jest.fn(async () => ({ id: 1, status: 'pending', adjustment_number: 'ADJ-CNT1', session: session() })),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 1 })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      inv_products: { findMany: jest.fn(async () => [{ id: 1, cost_price: 1 }]) },
    };
    const prisma: any = {
      ...tx,
      // Emulates the row lock: transactions on the session run one after another.
      $transaction: jest.fn((run: any) => {
        const result = locked.then(() => run(tx));
        locked = result.then(() => undefined, () => undefined);
        return result;
      }),
    };
    const stock = { applyMovement: jest.fn(async (dto: any) => { currentStock += (dto.direction === 'out' ? -1 : 1) * dto.quantity; }) };
    const service = new StockTakingService(prisma, stock as never, {} as never, { postInventoryCountAdjustment: jest.fn() } as never);
    return { service, items, tx, stock: () => currentStock, sell: (n: number) => { currentStock -= n; } };
  }

  it('rejects a second line for the same product even when both devices add it at once', async () => {
    const f = fixture();
    const dto = { productId: 1, itemName: 'مياه', countedQuantity: 90, varianceReason: 'عد' };
    const results = await Promise.allSettled([f.service.addCountItem(1, dto), f.service.addCountItem(1, dto)]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(f.items).toHaveLength(1);
    expect(f.tx.$queryRaw).toHaveBeenCalled();
    await f.service.finalizeSession(1, 9);
    await f.service.approveAdjustment(1, 9);
    expect(f.stock()).toBe(90);
  });

  it('compares a recount against the live balance so sales in between are not deducted twice', async () => {
    const f = fixture();
    await f.service.addCountItem(1, { productId: 1, itemName: 'مياه', countedQuantity: 95, varianceReason: 'عد' });
    f.sell(10); // system 90, physical 85
    const updated = await f.service.updateCountItem(1, 1, { productId: 1, itemName: 'مياه', countedQuantity: 85, varianceReason: 'إعادة عد', recount: true });
    expect(updated).toMatchObject({ systemQuantity: 90, countedQuantity: 85, variance: -5 });
    await f.service.finalizeSession(1, 9);
    await f.service.approveAdjustment(1, 9);
    expect(f.stock()).toBe(85);
  });

  it('a typo correction keeps the count-time baseline so sales in between are not credited back', async () => {
    const f = fixture();
    await f.service.addCountItem(1, { productId: 1, itemName: 'مياه', countedQuantity: 95, varianceReason: 'عد' }); // shelf had 94 really
    f.sell(10); // system 90, shelf 84
    const updated = await f.service.updateCountItem(1, 1, { productId: 1, itemName: 'مياه', countedQuantity: 94, varianceReason: 'تصحيح رقم' });
    expect(updated).toMatchObject({ systemQuantity: 100, countedQuantity: 94, variance: -6 });
    await f.service.finalizeSession(1, 9);
    await f.service.approveAdjustment(1, 9);
    expect(f.stock()).toBe(84);
  });

  it('refuses to send or approve a session that already holds a duplicated product line', async () => {
    const f = fixture();
    f.items.push({ id: 1, session_id: 1, product_id: 1, item_name: 'مياه', system_quantity: 100, counted_quantity: 90, variance: -10 });
    f.items.push({ id: 2, session_id: 1, product_id: 1, item_name: 'مياه', system_quantity: 100, counted_quantity: 90, variance: -10 });
    await expect(f.service.finalizeSession(1, 9)).rejects.toThrow('مكرر');
    await expect(f.service.approveAdjustment(1, 9)).rejects.toThrow('مكرر');
    expect(f.stock()).toBe(100);
  });
});
