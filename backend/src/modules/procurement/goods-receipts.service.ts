import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryTxnType, MovementDirection, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { isDryRun, previewResponse } from '../../common/preview';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InventoryStockService } from '../inventory/inventory-stock.service';
import { LedgerService } from '../accounting/ledger.service';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import {
  ChangeGoodsReceiptStatusDto,
  ListGoodsReceiptsDto,
  UpsertGoodsReceiptDto,
} from './dto/procurement-ext.dto';
import {
  GRN_STOCK_POSTING_STATUSES,
  getProcurementSettings,
  nextDocNumber,
  notDeletedFilter,
  toNumber,
} from './procurement.utils';

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly ledger: LedgerService,
  ) {}

  private mapItem(item: Prisma.prc_goods_receipt_itemsGetPayload<object>) {
    return {
      id: item.id,
      productId: item.product_id,
      name: item.name,
      orderedQty: toNumber(item.ordered_qty),
      receivedQty: toNumber(item.received_qty),
      unit: item.unit,
      rejected: item.rejected,
    };
  }

  private map(row: Prisma.prc_goods_receiptsGetPayload<{ include: { items: true } }>) {
    return {
      id: row.id,
      grnNumber: row.grn_number,
      purchaseOrderId: row.purchase_order_id,
      warehouseId: row.warehouse_id,
      receiverName: row.receiver_name,
      receiptDate: row.receipt_date,
      notes: row.notes,
      status: row.status,
      stockPosted: row.stock_posted,
      postedAt: row.posted_at,
      branchId: row.branch_id,
      createdBy: row.created_by,
      items: row.items.map((i) => this.mapItem(i)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListGoodsReceiptsDto) {
    const and: Prisma.prc_goods_receiptsWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ grn_number: { contains: s } }, { receiver_name: { contains: s } }],
      });
    }
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    if (q.purchaseOrderId && q.purchaseOrderId !== 'all') {
      and.push({ purchase_order_id: Number(q.purchaseOrderId) });
    }
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.prc_goods_receipts.findMany({
        where,
        include: { items: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_goods_receipts.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.prc_goods_receipts.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!row) throw new NotFoundException('إذن الاستلام غير موجود');
    return this.map(row);
  }

  private itemKey(productId: number | null | undefined, name: string) {
    return productId ? `p:${productId}` : `n:${name.trim().toLowerCase()}`;
  }

  private async validateReceiptQuantities(
    purchaseOrderId: number,
    items: UpsertGoodsReceiptDto['items'],
    excludeGrnId?: number,
  ) {
    const po = await this.prisma.prc_purchase_orders.findFirst({
      where: { id: purchaseOrderId, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!po) throw new NotFoundException('أمر الشراء غير موجود');

    const priorGrns = await this.prisma.prc_goods_receipts.findMany({
      where: {
        purchase_order_id: purchaseOrderId,
        ...notDeletedFilter(),
        ...(excludeGrnId ? { id: { not: excludeGrnId } } : {}),
      },
      include: { items: true },
    });

    const receivedByKey = new Map<string, number>();
    for (const grn of priorGrns) {
      for (const item of grn.items) {
        if (item.rejected) continue;
        const key = this.itemKey(item.product_id, item.name);
        receivedByKey.set(key, (receivedByKey.get(key) ?? 0) + toNumber(item.received_qty));
      }
    }

    for (const item of items) {
      if (item.receivedQty > item.orderedQty) {
        throw new BadRequestException(`الكمية المستلمة للبند "${item.name}" تتجاوز المطلوب`);
      }
      const key = this.itemKey(item.productId, item.name);
      const poItem = po.items.find(
        (p) =>
          (item.productId != null && p.product_id === item.productId) ||
          p.name.toLowerCase() === item.name.trim().toLowerCase(),
      );
      if (!poItem) {
        throw new BadRequestException(`البند "${item.name}" غير موجود في أمر الشراء`);
      }
      const ordered = toNumber(poItem.quantity);
      const prior = receivedByKey.get(key) ?? 0;
      const remaining = Math.round((ordered - prior) * 1000) / 1000;
      if (item.receivedQty > remaining) {
        throw new BadRequestException(
          `الكمية المستلمة للبند "${item.name}" تتجاوز المتبقي من أمر الشراء (${remaining})`,
        );
      }
    }
  }

  async create(dto: UpsertGoodsReceiptDto, userId: number) {
    const po = await this.prisma.prc_purchase_orders.findFirst({
      where: { id: dto.purchaseOrderId, ...notDeletedFilter() },
    });
    if (!po) throw new NotFoundException('أمر الشراء غير موجود');
    await this.validateReceiptQuantities(dto.purchaseOrderId, dto.items);

    const row = await this.prisma.$transaction(async (tx) => {
      const grnNumber =
        dto.grnNumber?.trim() ||
        (await nextDocNumber(tx, 'prc_goods_receipts', 'grn_number', 'GRN'));
      return tx.prc_goods_receipts.create({
        data: {
          grn_number: grnNumber,
          purchase_order_id: dto.purchaseOrderId,
          warehouse_id: dto.warehouseId ?? null,
          receiver_name: dto.receiverName.trim(),
          receipt_date: dto.receiptDate ?? null,
          notes: dto.notes?.trim() ?? null,
          status: dto.status ?? 'draft',
          branch_id: dto.branchId ?? po.branch_id,
          created_by: userId,
          items: {
            create: dto.items.map((i) => ({
              product_id: i.productId ?? null,
              name: i.name.trim(),
              ordered_qty: i.orderedQty,
              received_qty: i.receivedQty,
              unit: i.unit ?? null,
              rejected: i.rejected ?? false,
            })),
          },
        },
        include: { items: true },
      });
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertGoodsReceiptDto>) {
    const existing = await this.prisma.prc_goods_receipts.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('إذن الاستلام غير موجود');
    if (existing.stock_posted) {
      throw new BadRequestException('لا يمكن تعديل إذن استلام مرحّل للمخزون');
    }

    const purchaseOrderId = dto.purchaseOrderId ?? existing.purchase_order_id;
    if (dto.items) {
      await this.validateReceiptQuantities(purchaseOrderId, dto.items, id);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.prc_goods_receipt_items.deleteMany({ where: { goods_receipt_id: id } });
      }
      return tx.prc_goods_receipts.update({
        where: { id },
        data: {
          ...(dto.warehouseId !== undefined ? { warehouse_id: dto.warehouseId ?? null } : {}),
          ...(dto.receiverName != null ? { receiver_name: dto.receiverName.trim() } : {}),
          ...(dto.receiptDate !== undefined ? { receipt_date: dto.receiptDate ?? null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.branchId !== undefined ? { branch_id: dto.branchId ?? null } : {}),
          ...(dto.items
            ? {
                items: {
                  create: dto.items.map((i) => ({
                    product_id: i.productId ?? null,
                    name: i.name.trim(),
                    ordered_qty: i.orderedQty,
                    received_qty: i.receivedQty,
                    unit: i.unit ?? null,
                    rejected: i.rejected ?? false,
                  })),
                },
              }
            : {}),
        },
        include: { items: true },
      });
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.prc_goods_receipts.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('إذن الاستلام غير موجود');
    if (existing.stock_posted) {
      throw new BadRequestException('لا يمكن حذف إذن استلام مرحّل للمخزون');
    }
    await this.prisma.prc_goods_receipts.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }

  private computeGrnValue(
    grn: Prisma.prc_goods_receiptsGetPayload<{ include: { items: true } }>,
    po: Prisma.prc_purchase_ordersGetPayload<{ include: { items: true } }>,
  ): number {
    const priceByProduct = new Map<number, Prisma.Decimal>();
    const priceByName = new Map<string, Prisma.Decimal>();
    for (const poi of po.items) {
      if (poi.product_id) priceByProduct.set(poi.product_id, poi.price);
      priceByName.set(poi.name.toLowerCase(), poi.price);
    }
    let total = 0;
    for (const item of grn.items) {
      if (item.rejected || toNumber(item.received_qty) <= 0) continue;
      const unitCost =
        (item.product_id ? priceByProduct.get(item.product_id) : undefined) ??
        priceByName.get(item.name.toLowerCase()) ??
        new Prisma.Decimal(0);
      total += toNumber(item.received_qty) * toNumber(unitCost);
    }
    return Math.round(total * 100) / 100;
  }

  private async postStock(
    grn: Prisma.prc_goods_receiptsGetPayload<{ include: { items: true } }>,
    po: Prisma.prc_purchase_ordersGetPayload<{ include: { items: true } }>,
    userId: number,
    tx: Prisma.TransactionClient,
  ) {
    if (!grn.warehouse_id) {
      throw new BadRequestException('يجب تحديد المستودع قبل ترحيل المخزون');
    }
    const priceByProduct = new Map<number, Prisma.Decimal>();
    const priceByName = new Map<string, Prisma.Decimal>();
    for (const poi of po.items) {
      if (poi.product_id) priceByProduct.set(poi.product_id, poi.price);
      priceByName.set(poi.name.toLowerCase(), poi.price);
    }

    for (const item of grn.items) {
      if (item.rejected || toNumber(item.received_qty) <= 0) continue;
      if (!item.product_id) {
        throw new BadRequestException(`البند "${item.name}" يحتاج معرف منتج لترحيل المخزون`);
      }
      const unitCost =
        priceByProduct.get(item.product_id) ??
        priceByName.get(item.name.toLowerCase()) ??
        new Prisma.Decimal(0);

      await this.stock.applyMovement(
        {
          productId: item.product_id,
          warehouseId: grn.warehouse_id,
          direction: MovementDirection.in,
          quantity: item.received_qty,
          txnType: InventoryTxnType.receipt,
          unitCost,
          docType: 'goods_receipt',
          docRef: grn.grn_number,
          branchId: grn.branch_id ?? po.branch_id ?? undefined,
          createdBy: userId,
        },
        tx,
      );
    }
  }

  private async reverseStock(
    grn: Prisma.prc_goods_receiptsGetPayload<{ include: { items: true } }>,
    po: Prisma.prc_purchase_ordersGetPayload<{ include: { items: true } }>,
    userId: number,
    tx: Prisma.TransactionClient,
  ) {
    if (!grn.warehouse_id) {
      throw new BadRequestException('يجب تحديد المستودع قبل عكس ترحيل المخزون');
    }
    const priceByProduct = new Map<number, Prisma.Decimal>();
    const priceByName = new Map<string, Prisma.Decimal>();
    for (const poi of po.items) {
      if (poi.product_id) priceByProduct.set(poi.product_id, poi.price);
      priceByName.set(poi.name.toLowerCase(), poi.price);
    }

    for (const item of grn.items) {
      if (item.rejected || toNumber(item.received_qty) <= 0) continue;
      if (!item.product_id) {
        throw new BadRequestException(`البند "${item.name}" يحتاج معرف منتج لعكس ترحيل المخزون`);
      }
      const unitCost =
        priceByProduct.get(item.product_id) ??
        priceByName.get(item.name.toLowerCase()) ??
        new Prisma.Decimal(0);

      await this.stock.applyMovement(
        {
          productId: item.product_id,
          warehouseId: grn.warehouse_id,
          direction: MovementDirection.out,
          quantity: item.received_qty,
          txnType: InventoryTxnType.receipt,
          unitCost,
          docType: 'goods_receipt',
          docRef: grn.grn_number,
          branchId: grn.branch_id ?? po.branch_id ?? undefined,
          createdBy: userId,
        },
        tx,
      );
    }
  }

  async changeStatus(id: number, dto: ChangeGoodsReceiptStatusDto, userId: number, dryRun = false) {
    const grnPreview = await this.prisma.prc_goods_receipts.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!grnPreview) throw new NotFoundException('إذن الاستلام غير موجود');

    const oldStatusPreview = grnPreview.status;
    const newStatusPreview = dto.status;
    const wouldPost =
      GRN_STOCK_POSTING_STATUSES.includes(newStatusPreview) &&
      !GRN_STOCK_POSTING_STATUSES.includes(oldStatusPreview);

    if (isDryRun(dryRun) && wouldPost) {
      const po = await this.prisma.prc_purchase_orders.findFirst({
        where: { id: grnPreview.purchase_order_id, ...notDeletedFilter() },
        include: { items: true },
      });
      const totalValue = po ? this.computeGrnValue(grnPreview, po) : 0;
      const previewRows = grnPreview.items
        .filter((i) => !i.rejected && toNumber(i.received_qty) > 0)
        .map((i) => ({
          label: i.name,
          before: '—',
          after: `${toNumber(i.received_qty)}`,
        }));
      return previewResponse(
        { grnId: id, grnNumber: grnPreview.grn_number, totalValue, status: newStatusPreview },
        {
          rows: previewRows,
          warning: 'سيتم ترحيل المخزون وإنشاء قيد محاسبي فور التأكيد',
        },
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const grn = await tx.prc_goods_receipts.findFirst({
        where: { id, ...notDeletedFilter() },
        include: { items: true },
      });
      if (!grn) throw new NotFoundException('إذن الاستلام غير موجود');

      const oldStatus = grn.status;
      const newStatus = dto.status;
      if (oldStatus === newStatus) return grn;

      const shouldPost =
        GRN_STOCK_POSTING_STATUSES.includes(newStatus) &&
        !GRN_STOCK_POSTING_STATUSES.includes(oldStatus);
      const shouldReverse =
        grn.stock_posted &&
        GRN_STOCK_POSTING_STATUSES.includes(oldStatus) &&
        !GRN_STOCK_POSTING_STATUSES.includes(newStatus);

      if (shouldPost) {
        const settings = await getProcurementSettings(tx);
        // Guarded claim: conditional updateMany inside the tx so two concurrent posts can't
        // both apply the stock movements — the loser sees count === 0.
        const claimed = await tx.prc_goods_receipts.updateMany({
          where: { id, ...notDeletedFilter(), stock_posted: false },
          data: {
            status: newStatus,
            stock_posted: settings.enable_inventory_integration,
            posted_at: settings.enable_inventory_integration ? new Date() : null,
          },
        });
        if (claimed.count === 0) {
          throw new BadRequestException('تم ترحيل المخزون مسبقاً');
        }
        if (settings.enable_inventory_integration) {
          const po = await tx.prc_purchase_orders.findFirst({
            where: { id: grn.purchase_order_id, ...notDeletedFilter() },
            include: { items: true },
          });
          if (!po) throw new NotFoundException('أمر الشراء غير موجود');
          await this.postStock(grn, po, userId, tx);
          const totalValue = this.computeGrnValue(grn, po);
          await this.moduleLedger.postGrnInventory(
            {
              grnNumber: grn.grn_number,
              branchId: grn.branch_id ?? po.branch_id ?? undefined,
              receiptDate: grn.receipt_date ?? new Date().toISOString().slice(0, 10),
              totalValue,
              createdBy: userId,
            },
            tx,
          );
        }
        return tx.prc_goods_receipts.findFirstOrThrow({
          where: { id },
          include: { items: true },
        });
      }

      if (shouldReverse) {
        // Guarded claim: only reverse if the stock is still posted (race-safe against a
        // concurrent reverse of the same GRN).
        const claimed = await tx.prc_goods_receipts.updateMany({
          where: { id, ...notDeletedFilter(), stock_posted: true },
          data: {
            status: newStatus,
            stock_posted: false,
            posted_at: null,
          },
        });
        if (claimed.count === 0) {
          throw new BadRequestException('لم يتم ترحيل المخزون لهذا الإذن');
        }
        const po = await tx.prc_purchase_orders.findFirst({
          where: { id: grn.purchase_order_id, ...notDeletedFilter() },
          include: { items: true },
        });
        if (!po) throw new NotFoundException('أمر الشراء غير موجود');
        await this.reverseStock(grn, po, userId, tx);

        // Reverse the GRN inventory journal entry (mirror of postGrnInventory). A GRN whose
        // computed value was 0 never posted an entry, so a missing entry is fine to skip.
        const entry = await tx.acc_journal_entries.findFirst({
          where: {
            source_module: 'procurement',
            source_doc_type: 'goods_receipt',
            source_doc_id: grn.grn_number,
            status: 'posted',
          },
          orderBy: { id: 'desc' },
        });
        if (entry) {
          await this.ledger.reverseEntry(
            entry.id,
            `عكس ترحيل إذن الاستلام ${grn.grn_number}`,
            userId,
            tx,
          );
        }
        return tx.prc_goods_receipts.findFirstOrThrow({
          where: { id },
          include: { items: true },
        });
      }

      return tx.prc_goods_receipts.update({
        where: { id },
        data: { status: newStatus },
        include: { items: true },
      });
    });

    return this.map(result);
  }
}
