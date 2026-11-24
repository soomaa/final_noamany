import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JwtUser } from '../../common/types/jwt-user';
import { notDeletedFilter } from './inventory.utils';

/**
 * Resolves flat, branch-scoped warehouses selected in operational forms.
 * Legacy requests without a warehouse can still use the branch's default location.
 */
@Injectable()
export class InventoryLocationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Explicit operational locations are flat; branch ownership enforces access. */
  async resolveSelection(user: JwtUser, warehouseId: number, branchId?: number, tx?: Prisma.TransactionClient) {
    const location = await (tx ?? this.prisma).inv_warehouses.findFirst({
      where: { id: warehouseId, status: 'active', ...notDeletedFilter() },
    });
    if (!location) throw new BadRequestException('المخزن غير موجود أو غير نشط');
    if (!new BranchScopeService().isBranchAllowed(user, location.branch_id)) throw new ForbiddenException('المخزن خارج الفروع المسموح بها');
    if (branchId && location.branch_id !== branchId) throw new BadRequestException('المخزن لا يتبع الفرع المحدد');
    return { warehouseId: location.id, branchId: location.branch_id };
  }

  /**
   * Resolve the receiving side of an inter-branch transfer. The source is validated
   * against the caller's scope separately; the target only has to exist and be active,
   * so stock can be sent to any branch's warehouse/bar.
   */
  async resolveTransferTarget(warehouseId: number, tx?: Prisma.TransactionClient) {
    const location = await (tx ?? this.prisma).inv_warehouses.findFirst({
      where: { id: warehouseId, status: 'active', ...notDeletedFilter() },
    });
    if (!location) throw new BadRequestException('مخزن الوجهة غير موجود أو غير نشط');
    return { warehouseId: location.id, branchId: location.branch_id };
  }

  /** Throw 403 unless an existing warehouse belongs to an allowed branch (404/400 if missing). */
  async assertWarehouseInScope(user: JwtUser, warehouseId: number, tx?: Prisma.TransactionClient) {
    const location = await (tx ?? this.prisma).inv_warehouses.findFirst({
      where: { id: warehouseId, ...notDeletedFilter() },
      select: { id: true, branch_id: true },
    });
    if (!location) throw new BadRequestException('المخزن غير موجود');
    if (!new BranchScopeService().isBranchAllowed(user, location.branch_id)) throw new ForbiddenException('المخزن خارج الفروع المسموح بها');
    return { warehouseId: location.id, branchId: location.branch_id };
  }

  /** Warehouse ids the user may see; `null` ⇒ unrestricted. */
  async scopedWarehouseIds(user: JwtUser | undefined | null): Promise<number[] | null> {
    const allowed = new BranchScopeService().allowedBranchIds(user);
    if (allowed === null) return null;
    if (!allowed.length) return [];
    const rows = await this.prisma.inv_warehouses.findMany({ where: { branch_id: { in: allowed } }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  requireUserBranch(user: JwtUser): number {
    const branchId = Number(user.branch);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new BadRequestException('حساب المستخدم غير مرتبط بفرع');
    }
    return branchId;
  }

  /** Accept an explicit branch only when it falls within the user's branch scope. */
  requireAllowedBranch(user: JwtUser, branchId: number): number {
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new BadRequestException('اختر فرعًا صحيحًا');
    }
    if (!new BranchScopeService().isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('الفرع خارج الفروع المسموح بها');
    }
    return branchId;
  }

  /**
   * The branch's default stock location, used whenever a request names no warehouse: café sales,
   * drawings, purchases, opening stock and stock counts. It is the branch's sale warehouse (its bar)
   * set in POS settings (category `stock`, key `sale_warehouse_id`); a branch without a valid
   * setting falls back to its first active warehouse.
   */
  async resolveBranchStockLocation(
    branchId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = tx ?? this.prisma;
    const configured = await this.configuredSaleWarehouse(db, branchId);
    if (configured) return configured;
    const location = await db.inv_warehouses.findFirst({
      where: { branch_id: branchId, status: 'active', ...notDeletedFilter() },
      orderBy: [{ type: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (location) return location.id;

    // Keep requests without an explicit warehouse compatible: create a default
    // location if the branch has not configured any stock location yet.
    const internalCode = `Noamany-STOCK-${branchId}`;
    const internal = await db.inv_warehouses.upsert({
      where: { warehouse_code: internalCode },
      create: {
        warehouse_code: internalCode,
        name_ar: 'مخزون الفرع',
        name_en: 'Branch inventory',
        type: 'main',
        storage_capacity: 1,
        branch_id: branchId,
        status: 'active',
      },
      update: { branch_id: branchId, status: 'active', is_deleted: false },
      select: { id: true },
    });
    return internal.id;
  }

  /**
   * Every branch whose bar is set in POS settings, with the store that feeds it (null when the
   * branch has no valid store setting). Used by the صرف للبار form, which picks only the bar.
   */
  async barRoutes(): Promise<BarRoute[]> {
    const settings = await this.prisma.sales_pos_settings.findMany({
      where: {
        category: SALE_WAREHOUSE_SETTING.category,
        setting_key: { in: [SALE_WAREHOUSE_SETTING.key, STORE_WAREHOUSE_SETTING.key] },
        branch_id: { not: null },
        is_active: true,
      },
      select: { branch_id: true, setting_key: true, setting_value: true },
    });
    const byBranch = new Map<number, { bar?: number; store?: number }>();
    for (const row of settings) {
      const id = Number(row.setting_value?.replace(/"/g, ''));
      if (!Number.isInteger(id) || id <= 0 || row.branch_id == null) continue;
      const entry = byBranch.get(row.branch_id) ?? {};
      if (row.setting_key === SALE_WAREHOUSE_SETTING.key) entry.bar = id;
      else entry.store = id;
      byBranch.set(row.branch_id, entry);
    }
    const ids = [...byBranch.values()].flatMap((e) => [e.bar, e.store]).filter((id): id is number => !!id);
    const warehouses = ids.length
      ? await this.prisma.inv_warehouses.findMany({
          where: { id: { in: ids }, status: 'active', ...notDeletedFilter() },
          select: { id: true, name_ar: true, branch_id: true },
        })
      : [];
    const byId = new Map(warehouses.map((w) => [w.id, w]));
    const routes: BarRoute[] = [];
    for (const [branchId, entry] of byBranch) {
      const bar = entry.bar ? byId.get(entry.bar) : undefined;
      // Same rule as configuredSaleWarehouse: the bar must be the branch's own warehouse.
      if (!bar || bar.branch_id !== branchId) continue;
      const store = entry.store && entry.store !== bar.id ? byId.get(entry.store) : undefined;
      routes.push({
        branchId,
        barWarehouseId: bar.id,
        barName: bar.name_ar,
        storeWarehouseId: store?.id ?? null,
        storeName: store?.name_ar ?? null,
        storeBranchId: store?.branch_id ?? null,
      });
    }
    return routes.sort((a, b) => a.branchId - b.branchId);
  }

  /** The branch's `sale_warehouse_id` POS setting, when it names an active warehouse of that branch. */
  private async configuredSaleWarehouse(db: Prisma.TransactionClient | PrismaService, branchId: number): Promise<number | null> {
    const setting = await db.sales_pos_settings.findFirst({
      where: { category: SALE_WAREHOUSE_SETTING.category, setting_key: SALE_WAREHOUSE_SETTING.key, branch_id: branchId, is_active: true },
      select: { setting_value: true },
    });
    const warehouseId = Number(setting?.setting_value?.replace(/"/g, ''));
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) return null;
    const location = await db.inv_warehouses.findFirst({
      where: { id: warehouseId, branch_id: branchId, status: 'active', ...notDeletedFilter() },
      select: { id: true },
    });
    return location?.id ?? null;
  }
}

/** Where each branch's sale warehouse (its bar) is stored in sales_pos_settings. */
export const SALE_WAREHOUSE_SETTING = { category: 'stock', key: 'sale_warehouse_id' } as const;

/**
 * Where each branch's supply store is stored in sales_pos_settings: the warehouse a صرف order to
 * that branch's bar comes out of. It may belong to another branch (طنطا up and طنطا down are fed
 * by the Tanta store).
 */
export const STORE_WAREHOUSE_SETTING = { category: 'stock', key: 'store_warehouse_id' } as const;

/** One branch's issue route: its bar (sale warehouse) and the store that feeds it. */
export interface BarRoute {
  branchId: number;
  barWarehouseId: number;
  barName: string;
  storeWarehouseId: number | null;
  storeName: string | null;
  storeBranchId: number | null;
}
