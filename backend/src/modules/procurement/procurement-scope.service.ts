import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JwtUser } from '../../common/types/jwt-user';
import { InventoryLocationService } from '../inventory/inventory-location.service';
import { notDeletedFilter } from './procurement.utils';

const DEFAULT_MESSAGE = 'لا تملك صلاحية الوصول لمستندات مشتريات هذا الفرع';

/**
 * Branch ownership checks shared by procurement documents. A document belongs to its
 * branch_id; legacy rows saved without a branch fall back to their warehouse's branch, then
 * to the linked purchase order's branch. A document with no resolvable branch stays admin-only.
 */
@Injectable()
export class ProcurementScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly location: InventoryLocationService,
  ) {}

  /** Branch ids for list filters (`null` ⇒ unrestricted). */
  listBranches(user: JwtUser | undefined | null, requested?: number | string | null) {
    return this.branchScope.resolveListFilter(user, requested ?? null);
  }

  /** Branch a new document defaults to when the client sends none: the user's own branch (admins: none). */
  defaultBranch(user: JwtUser | undefined | null): number | null {
    const allowed = this.branchScope.allowedBranchIds(user);
    return allowed === null ? null : allowed[0] ?? null;
  }

  assertBranch(user: JwtUser | undefined | null, branchId: number | null | undefined, message = DEFAULT_MESSAGE) {
    this.branchScope.assertBranchAllowed(user, branchId, message);
  }

  /** Resolve the effective branch of a document row and assert the caller may access it. */
  async assertDocument(
    user: JwtUser | undefined | null,
    row: { branch_id: number | null; warehouse_id?: number | null; purchase_order_id?: number | null },
    tx?: Prisma.TransactionClient,
    message = DEFAULT_MESSAGE,
  ) {
    if (this.branchScope.allowedBranchIds(user) === null) return;
    let branchId = row.branch_id;
    const db = tx ?? this.prisma;
    if (branchId == null && row.warehouse_id != null) {
      const warehouse = await db.inv_warehouses.findFirst({ where: { id: row.warehouse_id }, select: { branch_id: true } });
      branchId = warehouse?.branch_id ?? null;
    }
    if (branchId == null && row.purchase_order_id != null) {
      const po = await db.prc_purchase_orders.findFirst({
        where: { id: row.purchase_order_id },
        select: { branch_id: true, warehouse_id: true },
      });
      if (po) return this.assertDocument(user, { branch_id: po.branch_id, warehouse_id: po.warehouse_id }, tx, message);
    }
    this.branchScope.assertBranchAllowed(user, branchId, message);
  }

  /** Load a non-deleted purchase order and assert the caller may access it. */
  async loadPurchaseOrder(user: JwtUser | undefined | null, id: number, tx?: Prisma.TransactionClient) {
    const po = await (tx ?? this.prisma).prc_purchase_orders.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!po) throw new NotFoundException('أمر الشراء غير موجود');
    await this.assertDocument(user, po, tx, 'أمر الشراء خارج الفروع المسموح بها');
    return po;
  }

  /** Load a non-deleted goods receipt and assert the caller may access it. */
  async loadGoodsReceipt(user: JwtUser | undefined | null, id: number, tx?: Prisma.TransactionClient) {
    const grn = await (tx ?? this.prisma).prc_goods_receipts.findFirst({ where: { id, ...notDeletedFilter() } });
    if (!grn) throw new NotFoundException('إذن الاستلام غير موجود');
    await this.assertDocument(user, grn, tx, 'إذن الاستلام خارج الفروع المسموح بها');
    return grn;
  }

  /** Validate an explicit warehouse (active, in scope, and in `branchId` when given). */
  resolveWarehouse(user: JwtUser, warehouseId: number, branchId?: number | null, tx?: Prisma.TransactionClient) {
    return this.location.resolveSelection(user, warehouseId, branchId ?? undefined, tx);
  }
}
