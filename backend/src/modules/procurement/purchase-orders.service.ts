import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ListPurchaseOrdersDto,
  PurchaseOrderItemDto,
  UpsertPurchaseOrderDto,
} from './dto/procurement-ext.dto';
import {
  PO_TRANSITIONS,
  lineTotal,
  nextDocNumber,
  notDeletedFilter,
  toNumber,
} from './procurement.utils';

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private mapItem(item: Prisma.prc_purchase_order_itemsGetPayload<object>) {
    return {
      id: item.id,
      productId: item.product_id,
      name: item.name,
      quantity: toNumber(item.quantity),
      unit: item.unit,
      price: toNumber(item.price),
      total: toNumber(item.total),
    };
  }

  private map(row: Prisma.prc_purchase_ordersGetPayload<{ include: { items: true } }>) {
    return {
      id: row.id,
      poNumber: row.po_number,
      requisitionId: row.requisition_id,
      supplierId: row.supplier_id,
      expectedDeliveryDate: row.expected_delivery_date,
      paymentTerms: row.payment_terms,
      notes: row.notes,
      status: row.status,
      totalAmount: toNumber(row.total_amount),
      branchId: row.branch_id,
      createdBy: row.created_by,
      items: row.items.map((i) => this.mapItem(i)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private buildItems(items: PurchaseOrderItemDto[]) {
    return items.map((i) => {
      const total = lineTotal(i.quantity, i.price);
      return {
        product_id: i.productId ?? null,
        name: i.name.trim(),
        quantity: i.quantity,
        unit: i.unit ?? null,
        price: i.price,
        total,
      };
    });
  }

  private enforceTransition(from: string, to: string) {
    const allowed = PO_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(`لا يمكن الانتقال من ${from} إلى ${to}`);
    }
  }

  async list(q: ListPurchaseOrdersDto) {
    const and: Prisma.prc_purchase_ordersWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ po_number: { contains: s } }, { notes: { contains: s } }] });
    }
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    if (q.supplierId && q.supplierId !== 'all') and.push({ supplier_id: Number(q.supplierId) });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.prc_purchase_orders.findMany({
        where,
        include: { items: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_purchase_orders.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.prc_purchase_orders.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!row) throw new NotFoundException('أمر الشراء غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertPurchaseOrderDto, userId: number) {
    const builtItems = this.buildItems(dto.items);
    const totalAmount = builtItems.reduce((sum, i) => sum + toNumber(i.total), 0);
    const row = await this.prisma.$transaction(async (tx) => {
      const poNumber =
        dto.poNumber?.trim() || (await nextDocNumber(tx, 'prc_purchase_orders', 'po_number', 'PO'));
      return tx.prc_purchase_orders.create({
        data: {
          po_number: poNumber,
          requisition_id: dto.requisitionId ?? null,
          supplier_id: dto.supplierId,
          expected_delivery_date: dto.expectedDeliveryDate ?? null,
          payment_terms: dto.paymentTerms ?? null,
          notes: dto.notes?.trim() ?? null,
          status: dto.status ?? 'draft',
          total_amount: totalAmount,
          branch_id: dto.branchId ?? null,
          created_by: userId,
          items: { create: builtItems },
        },
        include: { items: true },
      });
    });
    return this.map(row);
  }

  /** Create a draft PO from an approved requisition (idempotent). */
  async createFromRequisition(
    requisitionId: number,
    userId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const existingPo = await tx.prc_purchase_orders.findFirst({
      where: { requisition_id: requisitionId, ...notDeletedFilter() },
    });
    if (existingPo) return existingPo;

    const req = await tx.prc_requisitions.findFirst({
      where: { id: requisitionId, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!req?.items.length) return null;

    let supplierId: number | null = null;
    for (const item of req.items) {
      if (!item.product_id) continue;
      const product = await tx.inv_products.findFirst({
        where: { id: item.product_id },
        select: { supplier_id: true },
      });
      if (product?.supplier_id) {
        supplierId = product.supplier_id;
        break;
      }
    }
    if (!supplierId) {
      const fallback = await tx.inv_suppliers.findFirst({
        where: { is_deleted: false },
        orderBy: { id: 'asc' },
      });
      supplierId = fallback?.id ?? null;
    }
    if (!supplierId) return null;

    const items: PurchaseOrderItemDto[] = req.items.map((i) => ({
      productId: i.product_id ?? undefined,
      name: i.name,
      quantity: toNumber(i.quantity),
      unit: i.unit ?? undefined,
      price: i.estimated_price != null ? toNumber(i.estimated_price) : 0,
    }));

    const builtItems = this.buildItems(items);
    const totalAmount = builtItems.reduce((sum, i) => sum + toNumber(i.total), 0);
    const poNumber = await nextDocNumber(tx, 'prc_purchase_orders', 'po_number', 'PO');
    return tx.prc_purchase_orders.create({
      data: {
        po_number: poNumber,
        requisition_id: requisitionId,
        supplier_id: supplierId,
        expected_delivery_date: req.required_date ?? null,
        notes: `من طلب شراء ${req.request_number}`,
        status: 'draft',
        total_amount: totalAmount,
        branch_id: req.branch_id,
        created_by: userId,
        items: { create: builtItems },
      },
      include: { items: true },
    });
  }

  async update(id: number, dto: Partial<UpsertPurchaseOrderDto>) {
    const existing = await this.prisma.prc_purchase_orders.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException('أمر الشراء غير موجود');
    if (dto.poNumber && dto.poNumber !== existing.po_number) {
      throw new BadRequestException('لا يمكن تغيير رقم أمر الشراء');
    }
    if (dto.status && dto.status !== existing.status) {
      this.enforceTransition(existing.status, dto.status);
    }

    const builtItems = dto.items ? this.buildItems(dto.items) : null;
    const totalAmount = builtItems
      ? builtItems.reduce((sum, i) => sum + toNumber(i.total), 0)
      : toNumber(existing.total_amount);

    const row = await this.prisma.$transaction(async (tx) => {
      if (builtItems) {
        await tx.prc_purchase_order_items.deleteMany({ where: { purchase_order_id: id } });
      }
      return tx.prc_purchase_orders.update({
        where: { id },
        data: {
          ...(dto.requisitionId !== undefined ? { requisition_id: dto.requisitionId ?? null } : {}),
          ...(dto.supplierId != null ? { supplier_id: dto.supplierId } : {}),
          ...(dto.expectedDeliveryDate !== undefined
            ? { expected_delivery_date: dto.expectedDeliveryDate ?? null }
            : {}),
          ...(dto.paymentTerms !== undefined ? { payment_terms: dto.paymentTerms ?? null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          total_amount: totalAmount,
          ...(dto.branchId !== undefined ? { branch_id: dto.branchId ?? null } : {}),
          ...(builtItems ? { items: { create: builtItems } } : {}),
        },
        include: { items: true },
      });
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.prc_purchase_orders.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('أمر الشراء غير موجود');
    if (existing.status !== 'draft') {
      throw new BadRequestException('لا يمكن حذف أمر شراء غير مسودة');
    }
    await this.prisma.prc_purchase_orders.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }
}
