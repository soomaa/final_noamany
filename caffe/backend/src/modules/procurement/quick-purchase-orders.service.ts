import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryTxnType, MovementDirection, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryStockService } from '../inventory/inventory-stock.service';
import {
  ChangeQuickPurchaseOrderStatusDto,
  ListQuickPurchaseOrdersDto,
  QuickPurchaseOrderStatisticsDto,
  UpsertQuickPurchaseOrderDto,
} from './dto/procurement.dto';
import {
  generateQpoNumber,
  notDeletedFilter,
  toNumber,
} from './procurement.utils';

@Injectable()
export class QuickPurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
  ) {}

  private map(row: Prisma.prc_quick_purchase_ordersGetPayload<object>) {
    return {
      id: row.id,
      orderNumber: row.order_number,
      supplierId: row.supplier_id,
      productId: row.product_id,
      productName: row.product_name,
      quantity: toNumber(row.quantity),
      unitPrice: toNumber(row.unit_price),
      totalAmount: toNumber(row.total_amount),
      warehouseId: row.warehouse_id,
      branchId: row.branch_id,
      status: row.status,
      notes: row.notes,
      stockPosted: row.stock_posted,
      postedAt: row.posted_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListQuickPurchaseOrdersDto) {
    const and: Prisma.prc_quick_purchase_ordersWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { order_number: { contains: s } },
          { product_name: { contains: s } },
          { notes: { contains: s } },
        ],
      });
    }
    if (q.supplierId && q.supplierId !== 'all') and.push({ supplier_id: Number(q.supplierId) });
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    if (q.dateFrom || q.dateTo) {
      and.push({
        created_at: {
          ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}),
          ...(q.dateTo ? { lte: new Date(q.dateTo) } : {}),
        },
      });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.prc_quick_purchase_orders.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_quick_purchase_orders.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async statistics(q: QuickPurchaseOrderStatisticsDto) {
    const and: Prisma.prc_quick_purchase_ordersWhereInput[] = [notDeletedFilter()];
    if (q.supplierId && q.supplierId !== 'all') and.push({ supplier_id: Number(q.supplierId) });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    if (q.startDate || q.endDate) {
      and.push({
        created_at: {
          ...(q.startDate ? { gte: new Date(q.startDate) } : {}),
          ...(q.endDate ? { lte: new Date(q.endDate) } : {}),
        },
      });
    }
    const where = { AND: and };
    const [totalOrders, aggregate, byStatus] = await Promise.all([
      this.prisma.prc_quick_purchase_orders.count({ where }),
      this.prisma.prc_quick_purchase_orders.aggregate({
        where,
        _sum: { total_amount: true },
      }),
      this.prisma.prc_quick_purchase_orders.groupBy({
        by: ['status'],
        where,
        _count: true,
        _sum: { total_amount: true },
      }),
    ]);
    return {
      totalOrders,
      totalAmount: toNumber(aggregate._sum.total_amount),
      ordersByStatus: byStatus.map((r) => ({
        status: r.status,
        count: r._count,
        totalAmount: toNumber(r._sum.total_amount),
      })),
    };
  }

  async findOne(id: number) {
    const row = await this.prisma.prc_quick_purchase_orders.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!row) throw new NotFoundException('أمر الشراء السريع غير موجود');
    return this.map(row);
  }

  private computeTotal(quantity: number, unitPrice: number) {
    return Math.round(quantity * unitPrice * 100) / 100;
  }

  async create(dto: UpsertQuickPurchaseOrderDto, userId: number) {
    const totalAmount = this.computeTotal(dto.quantity, dto.unitPrice);
    const row = await this.prisma.$transaction(async (tx) => {
      const orderNumber = dto.orderNumber?.trim() || (await generateQpoNumber(tx));
      return tx.prc_quick_purchase_orders.create({
        data: {
          order_number: orderNumber,
          supplier_id: dto.supplierId,
          product_id: dto.productId,
          product_name: dto.productName.trim(),
          quantity: dto.quantity,
          unit_price: dto.unitPrice,
          total_amount: totalAmount,
          warehouse_id: dto.warehouseId,
          branch_id: dto.branchId,
          status: dto.status ?? 'مسودة',
          notes: dto.notes?.trim() ?? null,
          created_by: userId,
        },
      });
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertQuickPurchaseOrderDto>) {
    const existing = await this.prisma.prc_quick_purchase_orders.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('أمر الشراء السريع غير موجود');
    if (existing.status !== 'مسودة') {
      throw new BadRequestException('لا يمكن تعديل أمر الشراء إلا في حالة المسودة');
    }

    const quantity = dto.quantity ?? toNumber(existing.quantity);
    const unitPrice = dto.unitPrice ?? toNumber(existing.unit_price);
    const totalAmount = this.computeTotal(quantity, unitPrice);

    const row = await this.prisma.prc_quick_purchase_orders.update({
      where: { id },
      data: {
        ...(dto.supplierId != null ? { supplier_id: dto.supplierId } : {}),
        ...(dto.productId != null ? { product_id: dto.productId } : {}),
        ...(dto.productName != null ? { product_name: dto.productName.trim() } : {}),
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.unitPrice !== undefined ? { unit_price: dto.unitPrice } : {}),
        total_amount: totalAmount,
        ...(dto.warehouseId != null ? { warehouse_id: dto.warehouseId } : {}),
        ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.prc_quick_purchase_orders.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('أمر الشراء السريع غير موجود');
    if (existing.status === 'مؤكد') {
      throw new BadRequestException('لا يمكن حذف أمر شراء مؤكد — قم بإلغاء التأكيد أولاً');
    }
    await this.prisma.prc_quick_purchase_orders.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }

  async changeStatus(id: number, dto: ChangeQuickPurchaseOrderStatusDto, userId: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.prc_quick_purchase_orders.findFirst({
        where: { id, ...notDeletedFilter() },
      });
      if (!order) throw new NotFoundException('أمر الشراء السريع غير موجود');

      const oldStatus = order.status;
      const newStatus = dto.status;
      if (oldStatus === newStatus) {
        return order;
      }

      if (oldStatus !== 'مؤكد' && newStatus === 'مؤكد') {
        // Guarded claim: conditional updateMany inside the tx so two concurrent confirms can't
        // both apply the stock movement — the loser sees count === 0.
        const claimed = await tx.prc_quick_purchase_orders.updateMany({
          where: { id, ...notDeletedFilter(), stock_posted: false },
          data: {
            status: newStatus,
            stock_posted: true,
            posted_at: new Date(),
          },
        });
        if (claimed.count === 0) {
          throw new BadRequestException('تم ترحيل المخزون مسبقاً');
        }
        await this.stock.applyMovement(
          {
            productId: order.product_id,
            warehouseId: order.warehouse_id,
            direction: MovementDirection.in,
            quantity: order.quantity,
            txnType: InventoryTxnType.receipt,
            unitCost: order.unit_price,
            docType: 'quick_purchase_order',
            docRef: order.order_number,
            branchId: order.branch_id,
            createdBy: userId,
          },
          tx,
        );
        return tx.prc_quick_purchase_orders.findFirstOrThrow({ where: { id } });
      }

      if (oldStatus === 'مؤكد' && newStatus !== 'مؤكد') {
        // Guarded claim: reverse the stock only if it is still posted (race-safe against a
        // concurrent un-confirm of the same order).
        const claimed = await tx.prc_quick_purchase_orders.updateMany({
          where: { id, ...notDeletedFilter(), stock_posted: true },
          data: {
            status: newStatus,
            stock_posted: false,
            posted_at: null,
          },
        });
        if (claimed.count === 0) {
          // Nothing was posted (or another request already reversed it) — just move the status.
          return tx.prc_quick_purchase_orders.update({
            where: { id },
            data: { status: newStatus, stock_posted: false, posted_at: null },
          });
        }
        await this.stock.applyMovement(
          {
            productId: order.product_id,
            warehouseId: order.warehouse_id,
            direction: MovementDirection.out,
            quantity: order.quantity,
            txnType: InventoryTxnType.receipt,
            unitCost: order.unit_price,
            docType: 'quick_purchase_order',
            docRef: order.order_number,
            branchId: order.branch_id,
            createdBy: userId,
          },
          tx,
        );
        return tx.prc_quick_purchase_orders.findFirstOrThrow({ where: { id } });
      }

      return tx.prc_quick_purchase_orders.update({
        where: { id },
        data: { status: newStatus },
      });
    });

    return this.map(result);
  }
}
