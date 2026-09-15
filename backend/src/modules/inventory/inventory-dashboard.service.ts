import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { notDeletedFilter, toNumber } from './inventory.utils';
import { DailyStockQueryDto, DashboardSummaryQueryDto } from './dto/inventory.dto';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import type { JwtUser } from '../../common/types/jwt-user';

@Injectable()
export class InventoryDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async summary(q: DashboardSummaryQueryDto, user?: JwtUser) {
    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    const visibleProductFilter: Prisma.inv_productsWhereInput = {
      ...notDeletedFilter(),
      status: 'active',
      inventory_kind: { not: 'manufactured_internal' },
    };
    const balanceWhere: Prisma.inv_stock_balancesWhereInput = {
      product: visibleProductFilter,
      ...(scopedBranches
        ? { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } }
        : {}),
    };

    const [balances, inventoryProducts] = await Promise.all([
      this.prisma.inv_stock_balances.findMany({
        where: balanceWhere,
        include: { product: true, warehouse: true },
      }),
      this.prisma.inv_products.findMany({
        where: {
          ...visibleProductFilter,
          ...(scopedBranches ? {
            OR: [
              { apply_to_all_branches: true },
              { product_branches: { some: { branch_id: { in: scopedBranches } } } },
              { balances: { some: { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } } } },
            ],
          } : {}),
        },
        select: {
          id: true,
          product_code: true,
          name_ar: true,
          size: true,
          unit_of_measure: true,
          reorder_point: true,
          supplier: { select: { name_ar: true } },
        },
      }),
    ]);
    // Balances are intentionally retained for audit after a material is archived. Keep a
    // defensive application-level filter as well so those historical rows can never leak
    // into the current-stock cards, even if a future query accidentally loosens its WHERE.
    const visibleBalances = balances.filter(
      (balance) =>
        balance.product?.is_deleted === false &&
        balance.product.status === 'active' &&
        balance.product.inventory_kind !== 'manufactured_internal',
    );
    const stockByProduct = new Map<number, number>();
    for (const balance of visibleBalances) {
      stockByProduct.set(
        balance.product_id,
        (stockByProduct.get(balance.product_id) ?? 0) + toNumber(balance.current_stock),
      );
    }
    const lowStockItems = inventoryProducts
      .map((product) => ({
        productId: product.id,
        productCode: product.product_code,
        name: product.name_ar,
        size: product.size,
        unit: product.unit_of_measure,
        currentStock: stockByProduct.get(product.id) ?? 0,
        alertQuantity: toNumber(product.reorder_point),
        supplierName: product.supplier?.name_ar ?? null,
      }))
      .filter((product) => product.currentStock <= product.alertQuantity)
      .sort((a, b) => a.currentStock - b.currentStock || a.name.localeCompare(b.name, 'ar'));
    const lowStockCount = lowStockItems.length;
    const totalStockValue = visibleBalances.reduce(
      (sum, b) => sum + toNumber(b.current_stock) * (b.product ? toNumber(b.product.cost_price) : 0),
      0,
    );

    const movementWhere: Prisma.inv_movementsWhereInput = {
      product: visibleProductFilter,
      ...(scopedBranches
        ? {
            OR: [
              { branch_id: { in: scopedBranches } },
              { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } },
            ],
          }
        : {}),
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayWhere: Prisma.inv_movementsWhereInput = {
      AND: [movementWhere, { movement_date: { gte: today, lt: tomorrow } }],
    };
    const [movementCount, movementsByType, productCount, warehouseCount, todayMovements] = await Promise.all([
      this.prisma.inv_movements.count({ where: movementWhere }),
      this.prisma.inv_movements.groupBy({ by: ['txn_type'], where: movementWhere, _count: true }),
      Promise.resolve(inventoryProducts.length),
      this.prisma.inv_warehouses.count({
        where: {
          ...notDeletedFilter(),
          ...(scopedBranches ? { branch_id: { in: scopedBranches } } : {}),
        },
      }),
      this.prisma.inv_movements.groupBy({
        by: ['direction'],
        where: todayWhere,
        _sum: { quantity: true },
        _count: true,
      }),
    ]);

    const topItems = [...visibleBalances]
      .sort((a, b) => toNumber(b.current_stock) - toNumber(a.current_stock))
      .slice(0, 10)
      .map((b) => ({
        productId: b.product_id,
        productName: b.product?.name_ar ?? null,
        productSize: b.product?.size ?? null,
        warehouseId: b.warehouse_id,
        currentStock: toNumber(b.current_stock),
        stockValue: toNumber(b.current_stock) * (b.product ? toNumber(b.product.cost_price) : 0),
      }));

    return {
      branchId: q.branchId ?? null,
      totalProducts: productCount,
      totalWarehouses: warehouseCount,
      totalStockValue,
      lowStockCount,
      lowStockItems,
      movementCount,
      stockedProductCount: inventoryProducts.filter((row) => (stockByProduct.get(row.id) ?? 0) > 0).length,
      zeroStockCount: inventoryProducts.filter((row) => (stockByProduct.get(row.id) ?? 0) <= 0).length,
      todayIncomingMovements: todayMovements.find((row) => row.direction === 'in')?._count ?? 0,
      todayOutgoingMovements: todayMovements.find((row) => row.direction === 'out')?._count ?? 0,
      movementsByType: Object.fromEntries(movementsByType.map((r) => [r.txn_type, r._count])),
      topItems,
    };
  }


  async dailyStock(q: DailyStockQueryDto, user?: JwtUser) {
    const date = q.date ?? new Date().toISOString().slice(0, 10);
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    const warehouseId = q.warehouseId && q.warehouseId !== 'all' ? Number(q.warehouseId) : undefined;
    if (warehouseId && scopedBranches) {
      const allowedWarehouse = await this.prisma.inv_warehouses.findFirst({
        where: { id: warehouseId, branch_id: { in: scopedBranches }, is_deleted: false },
        select: { id: true },
      });
      if (!allowedWarehouse) throw new ForbiddenException('لا تملك صلاحية الوصول إلى هذا المستودع');
    }
    const kinds = q.inventoryKind && q.inventoryKind !== 'all'
      ? [q.inventoryKind]
      : ['raw_material', 'ready_product', 'manufactured_internal'];
    const products = await this.prisma.inv_products.findMany({
      where: {
        ...notDeletedFilter(),
        status: 'active',
        inventory_kind: { in: kinds },
        ...(scopedBranches ? {
          OR: [
            { apply_to_all_branches: true },
            { product_branches: { some: { branch_id: { in: scopedBranches } } } },
            { balances: { some: { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } } } },
          ],
        } : {}),
        ...(q.search?.trim() ? {
          OR: [
            { name_ar: { contains: q.search.trim() } },
            { name_en: { contains: q.search.trim() } },
            { product_code: { contains: q.search.trim() } },
            { size: { contains: q.search.trim() } },
          ],
        } : {}),
      },
      orderBy: { name_ar: 'asc' },
    });
    const productIds = products.map((product) => product.id);
    if (!productIds.length) return { date, rows: [], summary: { byUnit: [], movementCount: 0, stockValue: 0 } };

    const movementScope: Prisma.inv_movementsWhereInput = {
      product_id: { in: productIds },
      ...(warehouseId
        ? { warehouse_id: warehouseId }
        : scopedBranches
          ? { OR: [{ branch_id: { in: scopedBranches } }, { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } }] }
          : {}),
    };
    const balanceScope: Prisma.inv_stock_balancesWhereInput = {
      product_id: { in: productIds },
      ...(warehouseId
        ? { warehouse_id: warehouseId }
        : scopedBranches
          ? { warehouse: { branch_id: { in: scopedBranches }, is_deleted: false } }
          : {}),
    };
    const [openingRows, dayRows, balanceRows] = await Promise.all([
      this.prisma.inv_movements.groupBy({
        by: ['product_id'],
        where: { AND: [movementScope, { movement_date: { lt: start } }] },
        _sum: { quantity: true },
      }),
      this.prisma.inv_movements.groupBy({
        by: ['product_id', 'direction', 'txn_type'],
        where: { AND: [movementScope, { movement_date: { gte: start, lt: end } }] },
        _sum: { quantity: true },
        _count: true,
      }),
      this.prisma.inv_stock_balances.groupBy({
        by: ['product_id'],
        where: balanceScope,
        _sum: { current_stock: true },
      }),
    ]);
    const openingMap = new Map(openingRows.map((row) => [row.product_id, toNumber(row._sum.quantity)]));
    const currentMap = new Map(balanceRows.map((row) => [row.product_id, toNumber(row._sum.current_stock)]));
    const rows = products.map((product) => {
      const day = dayRows.filter((row) => row.product_id === product.id);
      const incoming = day.filter((row) => row.direction === 'in').reduce((sum, row) => sum + Math.abs(toNumber(row._sum.quantity)), 0);
      const outgoing = day.filter((row) => row.direction === 'out').reduce((sum, row) => sum + Math.abs(toNumber(row._sum.quantity)), 0);
      const sold = day.filter((row) => row.direction === 'out' && row.txn_type === 'issue').reduce((sum, row) => sum + Math.abs(toNumber(row._sum.quantity)), 0);
      const opening = openingMap.get(product.id) ?? 0;
      const closing = opening + incoming - outgoing;
      return {
        productId: product.id,
        productCode: product.product_code,
        productName: product.name_ar,
        productSize: product.size,
        inventoryKind: product.inventory_kind,
        unit: product.unit_of_measure,
        imageUrl: product.image_url,
        openingStock: opening,
        incomingToday: incoming,
        outgoingToday: outgoing,
        soldToday: sold,
        closingStock: closing,
        currentStock: currentMap.get(product.id) ?? 0,
        stockValue: (currentMap.get(product.id) ?? 0) * toNumber(product.cost_price),
        movementCount: day.reduce((sum, row) => sum + row._count, 0),
      };
    });
    const totalsByUnit = new Map<string, { unit: string; opening: number; incoming: number; outgoing: number; closing: number; current: number }>();
    for (const row of rows) {
      const total = totalsByUnit.get(row.unit) ?? { unit: row.unit, opening: 0, incoming: 0, outgoing: 0, closing: 0, current: 0 };
      total.opening += row.openingStock;
      total.incoming += row.incomingToday;
      total.outgoing += row.outgoingToday;
      total.closing += row.closingStock;
      total.current += row.currentStock;
      totalsByUnit.set(row.unit, total);
    }
    return {
      date,
      rows,
      summary: {
        byUnit: [...totalsByUnit.values()],
        movementCount: rows.reduce((sum, row) => sum + row.movementCount, 0),
        stockValue: rows.reduce((sum, row) => sum + row.stockValue, 0),
      },
    };
  }
}
