import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { assertUnique } from '../../common/validators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import {
  ListPurchaseInvoicesDto,
  UpsertPurchaseInvoiceDto,
} from './dto/procurement-ext.dto';
import {
  getProcurementSettings,
  lineTotal,
  nextDocNumber,
  notDeletedFilter,
  toNumber,
} from './procurement.utils';

@Injectable()
export class PurchaseInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleLedger: ModuleLedgerService,
  ) {}

  private mapItem(item: Prisma.prc_purchase_invoice_itemsGetPayload<object>) {
    return {
      id: item.id,
      name: item.name,
      quantity: toNumber(item.quantity),
      price: toNumber(item.price),
      total: toNumber(item.total),
      poQuantity: item.po_quantity != null ? toNumber(item.po_quantity) : null,
      grnQuantity: item.grn_quantity != null ? toNumber(item.grn_quantity) : null,
      variance: item.variance != null ? toNumber(item.variance) : null,
    };
  }

  private map(
    row: Prisma.prc_purchase_invoicesGetPayload<{
      include: { items: true; payment_schedules: true };
    }>,
  ) {
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      supplierId: row.supplier_id,
      purchaseOrderId: row.purchase_order_id,
      goodsReceiptId: row.goods_receipt_id,
      dueDate: row.due_date,
      status: row.status,
      matchingStatus: row.matching_status,
      notes: row.notes,
      invoiceAmount: toNumber(row.invoice_amount),
      attachments: row.attachments,
      branchId: row.branch_id,
      items: row.items.map((i) => this.mapItem(i)),
      paymentSchedules: row.payment_schedules.map((s) => ({
        id: s.id,
        scheduledDate: s.scheduled_date,
        amount: toNumber(s.amount),
        paymentMethod: s.payment_method,
        status: s.status,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private buildItems(items: UpsertPurchaseInvoiceDto['items']) {
    return items.map((i) => {
      const total = lineTotal(i.quantity, i.price);
      return {
        name: i.name.trim(),
        quantity: i.quantity,
        price: i.price,
        total,
        po_quantity: i.poQuantity ?? null,
        grn_quantity: i.grnQuantity ?? null,
        variance:
          i.poQuantity != null && i.grnQuantity != null
            ? Math.abs(i.quantity - i.grnQuantity)
            : null,
      };
    });
  }

  private async enrichItemsFromLinks(
    dto: UpsertPurchaseInvoiceDto,
  ): Promise<UpsertPurchaseInvoiceDto['items']> {
    if (!dto.purchaseOrderId && !dto.goodsReceiptId) return dto.items;

    const po = dto.purchaseOrderId
      ? await this.prisma.prc_purchase_orders.findFirst({
          where: { id: dto.purchaseOrderId, ...notDeletedFilter() },
          include: { items: true },
        })
      : null;
    if (dto.purchaseOrderId && !po) throw new NotFoundException('أمر الشراء غير موجود');
    if (po && po.supplier_id !== dto.supplierId) {
      throw new BadRequestException('المورد لا يطابق أمر الشراء');
    }

    const grn = dto.goodsReceiptId
      ? await this.prisma.prc_goods_receipts.findFirst({
          where: { id: dto.goodsReceiptId, ...notDeletedFilter() },
          include: { items: true },
        })
      : null;
    if (dto.goodsReceiptId && !grn) throw new NotFoundException('إذن الاستلام غير موجود');
    if (grn && dto.purchaseOrderId && grn.purchase_order_id !== dto.purchaseOrderId) {
      throw new BadRequestException('إذن الاستلام لا يطابق أمر الشراء');
    }
    if (grn && po && grn.purchase_order_id !== po.id) {
      throw new BadRequestException('إذن الاستلام لا يطابق أمر الشراء');
    }

    const poQtyByKey = new Map<string, number>();
    for (const item of po?.items ?? []) {
      const key = item.product_id ? `p:${item.product_id}` : `n:${item.name.toLowerCase()}`;
      poQtyByKey.set(key, toNumber(item.quantity));
    }

    const grnQtyByKey = new Map<string, number>();
    for (const item of grn?.items ?? []) {
      if (item.rejected) continue;
      const key = item.product_id ? `p:${item.product_id}` : `n:${item.name.toLowerCase()}`;
      grnQtyByKey.set(key, (grnQtyByKey.get(key) ?? 0) + toNumber(item.received_qty));
    }

    return dto.items.map((item) => {
      const key = item.name.trim().toLowerCase();
      const poQuantity = item.poQuantity ?? poQtyByKey.get(`n:${key}`);
      const grnQuantity = item.grnQuantity ?? grnQtyByKey.get(`n:${key}`);
      return { ...item, poQuantity, grnQuantity };
    });
  }

  async list(q: ListPurchaseInvoicesDto) {
    const and: Prisma.prc_purchase_invoicesWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ invoice_number: { contains: s } }, { notes: { contains: s } }] });
    }
    if (q.supplierId && q.supplierId !== 'all') and.push({ supplier_id: Number(q.supplierId) });
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    if (q.matchingStatus && q.matchingStatus !== 'all') {
      and.push({ matching_status: q.matchingStatus });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.prc_purchase_invoices.findMany({
        where,
        include: { items: true, payment_schedules: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_purchase_invoices.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.prc_purchase_invoices.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true, payment_schedules: true },
    });
    if (!row) throw new NotFoundException('فاتورة الشراء غير موجودة');
    return this.map(row);
  }

  async create(dto: UpsertPurchaseInvoiceDto) {
    if (dto.status === 'معتمد') {
      throw new BadRequestException('يجب إنشاء الفاتورة ثم مطابقتها قبل الاعتماد');
    }
    if (dto.invoiceNumber?.trim()) {
      const num = dto.invoiceNumber.trim();
      await assertUnique(
        () =>
          this.prisma.prc_purchase_invoices.findFirst({
            where: { invoice_number: num, ...notDeletedFilter() },
          }),
        'رقم فاتورة المورد مستخدم بالفعل',
      );
    }

    const enrichedItems = await this.enrichItemsFromLinks(dto);
    const builtItems = this.buildItems(enrichedItems);
    const invoiceAmount = builtItems.reduce((sum, i) => sum + toNumber(i.total), 0);
    const row = await this.prisma.$transaction(async (tx) => {
      const invoiceNumber =
        dto.invoiceNumber?.trim() ||
        (await nextDocNumber(tx, 'prc_purchase_invoices', 'invoice_number', 'PINV'));
      return tx.prc_purchase_invoices.create({
        data: {
          invoice_number: invoiceNumber,
          invoice_date: dto.invoiceDate ?? null,
          supplier_id: dto.supplierId,
          purchase_order_id: dto.purchaseOrderId ?? null,
          goods_receipt_id: dto.goodsReceiptId ?? null,
          due_date: dto.dueDate ?? null,
          status: dto.status ?? 'بانتظار مطابقة',
          matching_status: dto.matchingStatus ?? 'تحت المراجعة',
          notes: dto.notes?.trim() ?? null,
          invoice_amount: invoiceAmount,
          branch_id: dto.branchId ?? null,
          items: { create: builtItems },
          payment_schedules: dto.paymentSchedules?.length
            ? {
                create: dto.paymentSchedules.map((s) => ({
                  scheduled_date: s.scheduledDate ?? null,
                  amount: s.amount,
                  payment_method: s.paymentMethod ?? null,
                  status: s.status ?? 'مجدول',
                })),
              }
            : undefined,
        },
        include: { items: true, payment_schedules: true },
      });
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertPurchaseInvoiceDto>) {
    const existing = await this.prisma.prc_purchase_invoices.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('فاتورة الشراء غير موجودة');
    if (existing.status === 'معتمد' && Object.keys(dto).some((key) => key !== 'notes')) {
      throw new BadRequestException('لا يمكن تعديل فاتورة شراء مرحّلة محاسبيًا');
    }
    if (dto.invoiceNumber && dto.invoiceNumber !== existing.invoice_number) {
      throw new BadRequestException('لا يمكن تغيير رقم الفاتورة');
    }
    if (
      dto.status === 'معتمد' &&
      (dto.goodsReceiptId ?? existing.goods_receipt_id) != null &&
      existing.matching_status !== 'مطابق'
    ) {
      throw new BadRequestException('يجب مطابقة فاتورة الشراء مع إذن الاستلام قبل الاعتماد');
    }

    const builtItems = dto.items ? this.buildItems(dto.items) : null;
    const invoiceAmount = builtItems
      ? builtItems.reduce((sum, i) => sum + toNumber(i.total), 0)
      : toNumber(existing.invoice_amount);

    const row = await this.prisma.$transaction(async (tx) => {
      if (builtItems) {
        await tx.prc_purchase_invoice_items.deleteMany({ where: { purchase_invoice_id: id } });
      }
      if (dto.paymentSchedules) {
        await tx.prc_supplier_payment_schedules.deleteMany({
          where: { purchase_invoice_id: id },
        });
      }
      const updated = await tx.prc_purchase_invoices.update({
        where: { id },
        data: {
          ...(dto.invoiceDate !== undefined ? { invoice_date: dto.invoiceDate ?? null } : {}),
          ...(dto.supplierId != null ? { supplier_id: dto.supplierId } : {}),
          ...(dto.purchaseOrderId !== undefined
            ? { purchase_order_id: dto.purchaseOrderId ?? null }
            : {}),
          ...(dto.goodsReceiptId !== undefined
            ? { goods_receipt_id: dto.goodsReceiptId ?? null }
            : {}),
          ...(dto.dueDate !== undefined ? { due_date: dto.dueDate ?? null } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.matchingStatus !== undefined ? { matching_status: dto.matchingStatus } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
          invoice_amount: invoiceAmount,
          ...(dto.branchId !== undefined ? { branch_id: dto.branchId ?? null } : {}),
          ...(builtItems ? { items: { create: builtItems } } : {}),
          ...(dto.paymentSchedules
            ? {
                payment_schedules: {
                  create: dto.paymentSchedules.map((s) => ({
                    scheduled_date: s.scheduledDate ?? null,
                    amount: s.amount,
                    payment_method: s.paymentMethod ?? null,
                    status: s.status ?? 'مجدول',
                  })),
                },
              }
            : {}),
        },
        include: { items: true, payment_schedules: true },
      });

      if (dto.status === 'معتمد' && existing.status !== 'معتمد') {
        await this.moduleLedger.postPurchaseInvoiceApproved(
          {
            invoiceNumber: updated.invoice_number,
            branchId: updated.branch_id ?? undefined,
            invoiceDate: updated.invoice_date ?? new Date().toISOString().slice(0, 10),
            amount: toNumber(updated.invoice_amount),
            hasGrn: updated.goods_receipt_id != null,
          },
          tx,
        );
      }

      return updated;
    });

    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.prc_purchase_invoices.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('فاتورة الشراء غير موجودة');
    if (existing.status === 'معتمد') {
      throw new BadRequestException('لا يمكن حذف فاتورة شراء مرحّلة محاسبيًا');
    }
    await this.prisma.prc_purchase_invoices.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }

  async match(id: number) {
    const invoice = await this.prisma.prc_purchase_invoices.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!invoice) throw new NotFoundException('فاتورة الشراء غير موجودة');

    const settings = await getProcurementSettings(this.prisma);
    const tolerance = toNumber(settings.match_tolerance_percent);

    let hasMismatch = false;
    const updatedItems = invoice.items.map((item) => {
      const grnQty = item.grn_quantity != null ? toNumber(item.grn_quantity) : null;
      const qty = toNumber(item.quantity);
      const price = toNumber(item.price);
      if (grnQty == null) {
        hasMismatch = true;
        return { id: item.id, variance: null };
      }
      const qtyVariance = Math.abs(qty - grnQty);
      const varianceAmount = qtyVariance * price;
      if (varianceAmount > tolerance) hasMismatch = true;
      return { id: item.id, variance: qtyVariance };
    });

    await this.prisma.$transaction(
      updatedItems.map((u) =>
        this.prisma.prc_purchase_invoice_items.update({
          where: { id: u.id },
          data: { variance: u.variance },
        }),
      ),
    );

    const row = await this.prisma.prc_purchase_invoices.update({
      where: { id },
      data: hasMismatch
        ? { matching_status: 'غير مطابق', status: 'تحت المراجعة' }
        : { matching_status: 'مطابق', status: 'بانتظار الموافقة' },
      include: { items: true, payment_schedules: true },
    });
    return this.map(row);
  }
}
