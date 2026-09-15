import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTxnType, MovementDirection, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryStockService } from './inventory-stock.service';
import { toNumber } from './inventory.utils';
import { ListStockDto, StockSettingsDto, StockUpdateDto } from './dto/inventory.dto';

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryStock: InventoryStockService,
  ) {}

  private mapBalance(row: Prisma.inv_stock_balancesGetPayload<{ include: { product: true; warehouse: true } }>) {
    return {
      id: row.id,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      currentStock: toNumber(row.current_stock),
      minStock: toNumber(row.min_stock),
      maxStock: toNumber(row.max_stock),
      reorderPoint: toNumber(row.reorder_point),
      shelfLocation: row.shelf_location,
      lastUpdated: row.last_updated,
      product: row.product,
      warehouse: row.warehouse,
    };
  }

  async list(q: ListStockDto) {
    const and: Prisma.inv_stock_balancesWhereInput[] = [];
    if (q.productId && q.productId !== 'all') and.push({ product_id: Number(q.productId) });
    if (q.warehouseId && q.warehouseId !== 'all') and.push({ warehouse_id: Number(q.warehouseId) });
    if (q.branchId && q.branchId !== 'all') {
      and.push({ warehouse: { branch_id: Number(q.branchId), is_deleted: false } });
    }
    const where = and.length ? { AND: and } : {};

    let rows = await this.prisma.inv_stock_balances.findMany({
      where,
      include: { product: true, warehouse: true },
      orderBy: { id: 'desc' },
      skip: q.skip,
      take: q.take,
    });

    if (q.lowStock) {
      rows = rows.filter((r) => toNumber(r.current_stock) <= toNumber(r.reorder_point));
    }

    const total = await this.prisma.inv_stock_balances.count({ where });
    return paginated(rows.map((r) => this.mapBalance(r)), total, q.page, q.pageSize);
  }

  async byProductWarehouse(productId: number, warehouseId: number) {
    const row = await this.prisma.inv_stock_balances.findUnique({
      where: { product_id_warehouse_id: { product_id: productId, warehouse_id: warehouseId } },
      include: { product: true, warehouse: true },
    });
    if (!row) throw new NotFoundException('رصيد المخزون غير موجود');
    return this.mapBalance(row);
  }

  async updateProductWarehouse(
    productId: number,
    warehouseId: number,
    dto: StockUpdateDto,
    userId?: number,
  ) {
    throw new BadRequestException('تعديل الرصيد المباشر موقوف؛ استخدم حركة مخزنية أو جلسة جرد حتى يُسجل الأثر المحاسبي');
    /* istanbul ignore next -- retained signature for API compatibility */
    const warehouse = await this.prisma.inv_warehouses.findFirst({
      where: { id: warehouseId, is_deleted: false },
    });
    if (!warehouse) throw new NotFoundException('المستودع غير موجود');

    await this.inventoryStock.applyMovement({
      productId,
      warehouseId,
      direction: dto.operation === 'subtract' ? MovementDirection.out : MovementDirection.in,
      quantity: dto.quantity,
      operation: dto.operation,
      txnType: InventoryTxnType.adjustment,
      docType: 'stock_update',
      branchId: warehouse!.branch_id,
      createdBy: userId,
      allowNegative: dto.allowNegative,
    });

    return this.byProductWarehouse(productId, warehouseId);
  }

  async updateSettings(productId: number, warehouseId: number, dto: StockSettingsDto) {
    const row = await this.prisma.inv_stock_balances.findUnique({
      where: { product_id_warehouse_id: { product_id: productId, warehouse_id: warehouseId } },
    });
    if (!row) throw new NotFoundException('رصيد المخزون غير موجود');
    const updated = await this.prisma.inv_stock_balances.update({
      where: { id: row.id },
      data: {
        ...(dto.minStock !== undefined ? { min_stock: dto.minStock } : {}),
        ...(dto.maxStock !== undefined ? { max_stock: dto.maxStock } : {}),
        ...(dto.reorderPoint !== undefined ? { reorder_point: dto.reorderPoint } : {}),
        ...(dto.shelfLocation !== undefined ? { shelf_location: dto.shelfLocation ?? null } : {}),
      },
      include: { product: true, warehouse: true },
    });
    return this.mapBalance(updated);
  }

  async lowStock(warehouseId?: number) {
    const rows = await this.prisma.inv_stock_balances.findMany({
      where: warehouseId ? { warehouse_id: warehouseId } : {},
      include: { product: true, warehouse: true },
    });
    return rows
      .filter((r) => toNumber(r.current_stock) <= toNumber(r.reorder_point))
      .map((r) => this.mapBalance(r));
  }

  async levelsByWarehouse(warehouseId: number) {
    const rows = await this.prisma.inv_stock_balances.findMany({
      where: { warehouse_id: warehouseId },
      include: { product: true, warehouse: true },
      orderBy: { current_stock: 'asc' },
    });
    return rows.map((r) => this.mapBalance(r));
  }
}
