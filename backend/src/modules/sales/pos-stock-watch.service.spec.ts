import { Prisma } from '@prisma/client';
import { PosStockWatchService } from './pos-stock-watch.service';

const D = (v: number) => new Prisma.Decimal(v);
function fixture(opts: { setting?: string | null; sessionStart?: Date | null; allowed?: boolean } = {}) {
  const shiftStart = opts.sessionStart === undefined ? new Date('2026-09-28T04:20:00Z') : opts.sessionStart;
  const prisma: any = {
    sales_pos_settings: { findFirst: jest.fn(async ({ where }: any) => (where.branch_id === 1 && opts.setting !== null ? { setting_value: opts.setting ?? '[36, 38]' } : null)) },
    inv_warehouses: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    inv_movements: {
      groupBy: jest.fn().mockResolvedValue([{ product_id: 38, _count: { product_id: 40 } }, { product_id: 36, _count: { product_id: 30 } }]),
      findMany: jest.fn().mockResolvedValue([
        { product_id: 36, movement_date: new Date('2026-09-28T09:00:00Z'), quantity: D(-5), doc_type: 'stock_taking', doc_ref: 'ADJ-1' },
        { product_id: 36, movement_date: new Date('2026-09-28T08:00:00Z'), quantity: D(-1), doc_type: 'cafe_draft', doc_ref: 'QS-4' },
        { product_id: 36, movement_date: new Date('2026-09-28T07:30:00Z'), quantity: D(1), doc_type: 'sale_cancel', doc_ref: 'QS-2' },
        { product_id: 36, movement_date: new Date('2026-09-28T07:00:00Z'), quantity: D(-2), doc_type: 'cafe_sale', doc_ref: 'QS-2' },
        { product_id: 36, movement_date: new Date('2026-09-28T06:00:00Z'), quantity: D(-3), doc_type: 'cafe_sale', doc_ref: 'QS-1' },
        { product_id: 38, movement_date: new Date('2026-09-28T06:30:00Z'), quantity: D(-4), doc_type: 'cafe_sale', doc_ref: 'QS-3' },
      ]),
    },
    inv_products: { findMany: jest.fn().mockResolvedValue([
      { id: 36, name_ar: 'مياه كبيرة', product_code: 'PRD000001', unit_of_measure: 'piece' },
      { id: 38, name_ar: 'مياه صغيرة', product_code: 'PRD000002', unit_of_measure: 'piece' },
    ]) },
    inv_stock_balances: { findMany: jest.fn().mockResolvedValue([{ product_id: 36, current_stock: D(100) }, { product_id: 38, current_stock: D(50) }]) },
  };
  const sessions = { findBranchSessionForSale: jest.fn().mockResolvedValue(shiftStart ? { id: 92, shift_id: 1, start_time: shiftStart } : null) };
  const scope = { isBranchAllowed: jest.fn().mockReturnValue(opts.allowed ?? true) };
  return { prisma, service: new PosStockWatchService(prisma, sessions as never, scope as never) };
}

describe('PosStockWatchService', () => {
  it('shows what the shift started with, sold, returned and changed otherwise, per chosen item', async () => {
    const { service, prisma } = fixture();
    const res = await service.watch(1);
    expect(res.configured).toBe(true);
    expect(res.shift).toMatchObject({ id: 92 });
    expect(prisma.inv_movements.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ movement_date: { gte: new Date('2026-09-28T04:20:00Z') } }) }));
    const large = res.items[0];
    // now 100; this shift: sold 5 + 1 held order (draft) served, cancel returned 1, count removed 5 → started with 110
    expect(large).toMatchObject({ productId: 36, balanceNow: 100, balanceAtShiftStart: 110, soldThisShift: 6, returnedThisShift: 1, otherThisShift: -5 });
    expect(large.recent.map((r) => r.label)).toEqual(['جرد', 'حجز مسودة', 'إلغاء فاتورة', 'بيع', 'بيع']);
    expect(res.items[1]).toMatchObject({ productId: 38, balanceNow: 50, balanceAtShiftStart: 54, soldThisShift: 4, returnedThisShift: 0, otherThisShift: 0 });
  });

  it('counts a held order once, whichever shift confirms or cancels it', async () => {
    const { service, prisma } = fixture();
    prisma.inv_movements.findMany.mockResolvedValue([
      // draft QS-9 from the previous shift confirmed now: reservation released (+2), sale posted (-2)
      { product_id: 36, movement_date: new Date('2026-09-28T08:00:01Z'), quantity: D(-2), doc_type: 'cafe_sale', doc_ref: 'QS-9' },
      { product_id: 36, movement_date: new Date('2026-09-28T08:00:00Z'), quantity: D(2), doc_type: 'cafe_draft_adjustment', doc_ref: 'QS-9' },
      // draft QS-8 from the previous shift cancelled now: its stock comes back
      { product_id: 38, movement_date: new Date('2026-09-28T07:00:00Z'), quantity: D(3), doc_type: 'cafe_draft_cancel', doc_ref: 'QS-8' },
      // draft QS-7 held 3, confirmed with 2 → 1 back on the shelf
      { product_id: 38, movement_date: new Date('2026-09-28T06:00:01Z'), quantity: D(-2), doc_type: 'cafe_sale', doc_ref: 'QS-7' },
      { product_id: 38, movement_date: new Date('2026-09-28T06:00:00Z'), quantity: D(3), doc_type: 'cafe_draft_adjustment', doc_ref: 'QS-7' },
    ]);
    const res = await service.watch(1);
    expect(res.items[0]).toMatchObject({ productId: 36, soldThisShift: 0, returnedThisShift: 0, otherThisShift: 0, balanceAtShiftStart: 100 });
    expect(res.items[1]).toMatchObject({ productId: 38, soldThisShift: 0, returnedThisShift: 4, otherThisShift: 0, balanceAtShiftStart: 46 });
  });

  it('falls back to the busiest items of the last 7 days when nothing is configured', async () => {
    const { service, prisma } = fixture({ setting: null });
    const res = await service.watch(1);
    expect(res.configured).toBe(false);
    expect(prisma.inv_movements.groupBy).toHaveBeenCalled();
    expect(res.items.map((i) => i.productId)).toEqual([38, 36]);
  });

  it('refuses a branch outside the user scope', async () => {
    const { service } = fixture({ allowed: false });
    await expect(service.watch(1, { sub: 5 } as never)).rejects.toThrow('صلاحية');
  });
});
