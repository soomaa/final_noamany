import { ForbiddenException, Injectable } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { cairoDateString, cairoMidnightUtc } from '../../common/utils/cairo-date';
import { ShiftSessionsService } from './shift-sessions.service';

/**
 * "متابعة المخزون" strip on the POS: for a few chosen stock items, what the system held when the
 * open shift started, what the shift sold / returned / changed otherwise, and the balance now —
 * so the cashier can compare the shelf with the system at any moment (and at every handover).
 */
export const STOCK_WATCH_SETTING = 'stock_watch_product_ids';
export const STOCK_WATCH_MAX = 6;
const SALE_DOCS = ['cafe_sale', 'sale'];
// Everything a POS order does to stock, netted: a held order (draft) reserves stock when it is served,
// confirming it releases the reservation and posts the sale, editing an invoice adjusts it.
// So a draft counts as sold once, whichever shift confirms it.
const ORDER_FLOW_DOCS = new Set([...SALE_DOCS, 'cafe_draft', 'cafe_draft_adjustment', 'cafe_sale_edit']);
// Stock coming back from an order stays visible on its own line (a cancelled invoice or draft, a refund).
const RETURN_DOCS = new Set(['sale_cancel', 'sale_return', 'cafe_draft_cancel']);
const LABELS: Record<string, string> = {
  cafe_sale: 'بيع', sale: 'بيع', sale_cancel: 'إلغاء فاتورة', sale_return: 'استرداد', cafe_draft: 'حجز مسودة',
  cafe_draft_adjustment: 'تأكيد أو تعديل مسودة', cafe_draft_cancel: 'إلغاء مسودة', cafe_sale_edit: 'تعديل فاتورة',
  stock_taking: 'جرد', supplier_invoice: 'مشتريات', goods_receipt: 'استلام مشتريات', quick_purchase_order: 'مشتريات',
  supplier_invoice_correction: 'تصحيح فاتورة شراء', purchase_return: 'مرتجع شراء', opening_stock: 'رصيد افتتاحي',
  inventory_transaction: 'صرف أو هالك', cafe_manufacturing: 'تصنيع',
};

export interface StockWatchItem {
  productId: number;
  name: string;
  code: string;
  unit: string;
  balanceNow: number;
  balanceAtShiftStart: number;
  soldThisShift: number;
  returnedThisShift: number;
  otherThisShift: number;
  recent: Array<{ at: Date; label: string; quantity: number; ref: string | null }>;
}

const round = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

@Injectable()
export class PosStockWatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: ShiftSessionsService,
    private readonly branchScope: BranchScopeService,
  ) {}

  /** Configured items for the branch (falls back to the global setting), in the chosen order. */
  async configuredIds(branchId: number): Promise<number[]> {
    for (const branch of [branchId, null]) {
      const row = await this.prisma.sales_pos_settings.findFirst({
        where: { category: 'general', setting_key: STOCK_WATCH_SETTING, branch_id: branch, is_active: true },
        select: { setting_value: true },
      });
      if (!row) continue;
      try {
        const parsed = JSON.parse(row.setting_value);
        if (Array.isArray(parsed)) return [...new Set(parsed.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, STOCK_WATCH_MAX);
      } catch { /* a malformed value behaves like "not configured" */ }
      return [];
    }
    return [];
  }

  /** Nothing configured: the items the POS sold most often in the last 7 days. */
  private async busiestIds(warehouseId: number): Promise<number[]> {
    const rows = await this.prisma.inv_movements.groupBy({
      by: ['product_id'],
      // movement_date is indexed and always written with created_at (both default to now()).
      where: { warehouse_id: warehouseId, doc_type: { in: SALE_DOCS }, movement_date: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      _count: { product_id: true },
      orderBy: { _count: { product_id: 'desc' } },
      take: 4,
    });
    return rows.map((r) => r.product_id);
  }

  async watch(branchId: number, user?: JwtUser) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    const warehouse = await this.prisma.inv_warehouses.findFirst({ where: { branch_id: branchId, is_deleted: false }, orderBy: { id: 'asc' }, select: { id: true } });
    const session = await this.sessions.findBranchSessionForSale(this.prisma as never, branchId);
    const since = session?.start_time ?? cairoMidnightUtc(cairoDateString());
    const configured = await this.configuredIds(branchId);
    const shift = session
      ? { id: session.id, startedAt: session.start_time, shiftId: session.shift_id }
      : null;
    if (!warehouse) return { configured: configured.length > 0, since, shift, items: [] as StockWatchItem[] };
    const ids = configured.length ? configured : await this.busiestIds(warehouse.id);
    if (!ids.length) return { configured: configured.length > 0, since, shift, items: [] as StockWatchItem[] };

    const [products, balances, movements] = await Promise.all([
      this.prisma.inv_products.findMany({ where: { id: { in: ids }, is_deleted: false }, select: { id: true, name_ar: true, product_code: true, unit_of_measure: true } }),
      this.prisma.inv_stock_balances.findMany({ where: { product_id: { in: ids }, warehouse_id: warehouse.id }, select: { product_id: true, current_stock: true } }),
      this.prisma.inv_movements.findMany({
        where: { product_id: { in: ids }, warehouse_id: warehouse.id, movement_date: { gte: since } },
        select: { product_id: true, movement_date: true, quantity: true, doc_type: true, doc_ref: true },
        orderBy: [{ movement_date: 'desc' }, { id: 'desc' }],
      }),
    ]);

    const items: StockWatchItem[] = [];
    for (const id of ids) {
      const product = products.find((p) => p.id === id);
      if (!product) continue;
      const now = Number(balances.find((b) => b.product_id === id)?.current_stock ?? 0);
      const mine = movements.filter((m) => m.product_id === id);
      let net = 0; let orderFlow = 0; let returned = 0;
      for (const m of mine) {
        const q = Number(m.quantity); net += q;
        if (ORDER_FLOW_DOCS.has(m.doc_type ?? '')) orderFlow += q;
        else if (RETURN_DOCS.has(m.doc_type ?? '') && q > 0) returned += q;
      }
      // Net order flow is normally outgoing; if this shift only released stock (e.g. confirmed a smaller
      // draft from the previous shift) that surplus is shown as returned, never as negative sales.
      const sold = Math.max(0, -orderFlow);
      returned += Math.max(0, orderFlow);
      items.push({
        productId: id,
        name: product.name_ar,
        code: product.product_code,
        unit: product.unit_of_measure,
        balanceNow: round(now),
        balanceAtShiftStart: round(now - net),
        soldThisShift: round(sold),
        returnedThisShift: round(returned),
        otherThisShift: round(net + sold - returned),
        recent: mine.slice(0, 5).map((m) => ({ at: m.movement_date, label: LABELS[m.doc_type ?? ''] ?? (m.doc_type ?? 'حركة'), quantity: round(Number(m.quantity)), ref: m.doc_ref })),
      });
    }
    return { configured: configured.length > 0, since, shift, items };
  }
}
