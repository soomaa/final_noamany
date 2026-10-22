import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { SupplierInvoicesService } from './supplier-invoices.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly supplierInvoices: SupplierInvoicesService,
  ) {}

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

  private async supplierNames(ids: number[]) {
    const suppliers = await this.prisma.inv_suppliers.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name_ar: true },
    });
    return new Map(suppliers.map((s) => [s.id, s.name_ar]));
  }

  private map(
    row: Prisma.prc_purchase_ordersGetPayload<{ include: { items: true } }>,
    supplierName?: string | null,
    invoice?: { invoice_number: string; invoice_date: string | null; supplier_invoice_number: string | null } | null,
  ) {
    return {
      id: row.id,
      poNumber: row.po_number,
      requisitionId: row.requisition_id,
      supplierId: row.supplier_id,
      supplierName: supplierName ?? null,
      expectedDeliveryDate: row.expected_delivery_date,
      paymentTerms: row.payment_terms,
      paymentMethod: row.payment_method,
      notes: row.notes,
      status: row.status,
      totalAmount: toNumber(row.total_amount),
      subtotalAmount: toNumber(row.subtotal_amount),
      discountAmount: toNumber(row.discount_amount),
      paidAmount: toNumber(row.paid_amount),
      remainingAmount: toNumber(row.remaining_amount),
      supplierInvoiceId: row.supplier_invoice_id,
      supplierInvoiceCode: invoice?.invoice_number ?? null,
      invoiceDate: invoice?.invoice_date ?? null,
      supplierInvoiceNumber: invoice?.supplier_invoice_number ?? null,
      invoicePrintDate: row.invoice_print_date,
      categoryId: row.category_id,
      warehouseId: row.warehouse_id,
      branchId: row.branch_id,
      createdBy: row.created_by,
      items: row.items.map((i) => this.mapItem(i)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private buildItems(items: PurchaseOrderItemDto[]) {
    return items.map((i) => {
      const total = i.lineTotal != null ? Math.round(i.lineTotal * 100) / 100 : lineTotal(i.quantity, i.price);
      return {
        product_id: i.productId ?? null,
        name: i.name.trim(),
        quantity: i.quantity,
        unit: i.unit ?? null,
        price: i.lineTotal != null ? Math.round((total / i.quantity) * 100) / 100 : i.price,
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
    const names = await this.supplierNames(rows.map((r) => r.supplier_id));
    return paginated(rows.map((r) => this.map(r, names.get(r.supplier_id))), total, q.page, q.pageSize);
  }

  async nextNumbers() {
    const [poNumber, invoiceNumber] = await Promise.all([
      nextDocNumber(this.prisma, 'prc_purchase_orders', 'po_number', 'PO'),
      nextDocNumber(this.prisma, 'prc_supplier_invoices', 'invoice_number', 'SINV'),
    ]);
    return { poNumber, invoiceNumber };
  }

  async findOne(id: number) {
    const row = await this.prisma.prc_purchase_orders.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!row) throw new NotFoundException('أمر الشراء غير موجود');
    const names = await this.supplierNames([row.supplier_id]);
    const invoice = row.supplier_invoice_id
      ? await this.prisma.prc_supplier_invoices.findUnique({
          where: { id: row.supplier_invoice_id },
          select: { invoice_number: true, invoice_date: true, supplier_invoice_number: true },
        })
      : null;
    return this.map(row, names.get(row.supplier_id), invoice);
  }

  /** Validates the chosen category and links products to the supplier so the invoice can post. */
  private async prepareDirectPurchaseProducts(dto: UpsertPurchaseOrderDto) {
    const productIds = [...new Set(dto.items.map((i) => i.productId).filter((id): id is number => !!id))];
    if (productIds.length !== dto.items.length) {
      throw new BadRequestException('اختر صنفًا لكل بند ولا تكرر الصنف');
    }
    const products = await this.prisma.inv_products.findMany({
      where: { id: { in: productIds }, is_deleted: false },
      select: { id: true, name_ar: true, category_id: true },
    });
    if (products.length !== productIds.length) throw new BadRequestException('أحد الأصناف غير موجود');
    if (dto.categoryId) {
      const outside = products.find((p) => p.category_id !== dto.categoryId);
      if (outside) throw new BadRequestException(`الصنف ${outside.name_ar} لا يتبع التصنيف المختار`);
    }
    for (const productId of productIds) {
      await this.prisma.inv_supplier_products.upsert({
        where: { supplier_id_product_id: { supplier_id: dto.supplierId, product_id: productId } },
        create: { supplier_id: dto.supplierId, product_id: productId },
        update: { is_active: true },
      });
    }
  }

  private async applySalePrices(items: PurchaseOrderItemDto[]) {
    for (const item of items) {
      if (!item.productId || item.salePrice == null) continue;
      await this.prisma.inv_products.update({
        where: { id: item.productId },
        data: { selling_price: item.salePrice },
      });
      // Ready products sold at the POS carry their own price on the linked cafe product.
      await this.prisma.cafe_products.updateMany({
        where: { inventory_product_id: item.productId },
        data: { sell_price: item.salePrice },
      });
    }
  }

  private directPurchaseTotals(dto: UpsertPurchaseOrderDto) {
    if (!dto.items?.length) throw new BadRequestException('أضف بندًا واحدًا على الأقل');
    if (dto.paymentMethod && !['cash', 'credit'].includes(dto.paymentMethod)) {
      throw new BadRequestException('طريقة الدفع يجب أن تكون نقدي أو آجل');
    }
    const builtItems = this.buildItems(dto.items);
    const subtotalAmount = Math.round(builtItems.reduce((sum, i) => sum + toNumber(i.total), 0) * 100) / 100;
    const discountAmount = Number(dto.discountAmount ?? 0);
    const totalAmount = Math.round((subtotalAmount - discountAmount) * 100) / 100;
    const paidAmount = Number(dto.paidAmount ?? 0);
    if (discountAmount > subtotalAmount) throw new BadRequestException('قيمة الخصم أكبر من قيمة الفاتورة');
    if (paidAmount > totalAmount) throw new BadRequestException('المدفوع أكبر من قيمة الفاتورة بعد الخصم');
    const remainingAmount = Math.round((totalAmount - paidAmount) * 100) / 100;
    const paymentMethod = dto.paymentMethod ?? (remainingAmount > 0 ? 'credit' : 'cash');
    return { builtItems, subtotalAmount, discountAmount, totalAmount, paidAmount, remainingAmount, paymentMethod };
  }

  /** Posts the supplier invoice (stock + journal + initial cash payment) for a direct purchase. */
  private postSupplierInvoice(
    dto: UpsertPurchaseOrderDto,
    totals: ReturnType<PurchaseOrdersService['directPurchaseTotals']>,
    poNumber: string,
    user: JwtUser,
    tx: Prisma.TransactionClient,
  ) {
    return this.supplierInvoices.create({
      supplierId: dto.supplierId,
      branchId: dto.branchId,
      warehouseId: dto.warehouseId,
      invoiceDate: dto.invoiceDate,
      supplierInvoiceNumber: dto.supplierInvoiceNumber,
      discountAmount: totals.discountAmount,
      paidAmount: totals.paidAmount,
      // Whatever is paid now leaves the branch cash box; the rest stays owed to the supplier.
      initialPaymentMethod: 'cash',
      notes: [dto.notes?.trim(), `أمر شراء ${poNumber}`].filter(Boolean).join(' · '),
      items: dto.items.map((item, idx) => ({
        productId: item.productId,
        productName: item.name,
        quantity: item.quantity,
        unit: item.unit,
        lineTotal: toNumber(totals.builtItems[idx].total),
      })),
    }, user, tx);
  }

  private directPurchaseData(dto: UpsertPurchaseOrderDto, totals: ReturnType<PurchaseOrdersService['directPurchaseTotals']>) {
    return {
      supplier_id: dto.supplierId,
      expected_delivery_date: dto.expectedDeliveryDate ?? dto.invoiceDate ?? null,
      payment_terms: dto.paymentTerms ?? (totals.paymentMethod === 'credit' ? 'آجل' : 'نقدي'),
      payment_method: totals.paymentMethod,
      notes: dto.notes?.trim() || null,
      total_amount: totals.totalAmount,
      subtotal_amount: totals.subtotalAmount,
      discount_amount: totals.discountAmount,
      paid_amount: totals.paidAmount,
      remaining_amount: totals.remainingAmount,
      invoice_print_date: dto.invoicePrintDate || null,
      category_id: dto.categoryId ?? null,
      branch_id: dto.branchId ?? null,
    };
  }

  async create(dto: UpsertPurchaseOrderDto, user: JwtUser) {
    const totals = this.directPurchaseTotals(dto);
    await this.prepareDirectPurchaseProducts(dto);
    const { row, supplierInvoice } = await this.prisma.$transaction(async (tx) => {
      const poNumber =
        dto.poNumber?.trim() || (await nextDocNumber(tx, 'prc_purchase_orders', 'po_number', 'PO'));
      const invoice = await this.postSupplierInvoice(dto, totals, poNumber, user, tx);
      const created = await tx.prc_purchase_orders.create({
        data: {
          ...this.directPurchaseData(dto, totals),
          po_number: poNumber,
          requisition_id: dto.requisitionId ?? null,
          status: dto.status ?? 'completed',
          supplier_invoice_id: invoice.id,
          warehouse_id: invoice.warehouseId,
          created_by: user.sub,
          items: { create: totals.builtItems },
        },
        include: { items: true },
      });
      return { row: created, supplierInvoice: invoice };
    }, { maxWait: 10000, timeout: 60000 });
    await this.applySalePrices(dto.items);
    const names = await this.supplierNames([row.supplier_id]);
    return this.map(row, names.get(row.supplier_id), {
      invoice_number: supplierInvoice.invoiceNumber,
      invoice_date: supplierInvoice.invoiceDate,
      supplier_invoice_number: supplierInvoice.supplierInvoiceNumber,
    });
  }

  /** Edit a posted direct purchase: void the old invoice/payment/stock and post the new version atomically. */
  private async repost(existing: { id: number; po_number: string; supplier_invoice_id: number; paid_amount: Prisma.Decimal }, dto: UpsertPurchaseOrderDto, user: JwtUser) {
    const totals = this.directPurchaseTotals(dto);
    await this.prepareDirectPurchaseProducts(dto);
    await this.prisma.$transaction(async (tx) => {
      await this.supplierInvoices.voidPosted(
        existing.supplier_invoice_id, user.sub, `تعديل أمر شراء ${existing.po_number}`, tx, toNumber(existing.paid_amount),
      );
      const invoice = await this.postSupplierInvoice(dto, totals, existing.po_number, user, tx);
      await tx.prc_purchase_order_items.deleteMany({ where: { purchase_order_id: existing.id } });
      await tx.prc_purchase_orders.update({
        where: { id: existing.id },
        data: {
          ...this.directPurchaseData(dto, totals),
          supplier_invoice_id: invoice.id,
          warehouse_id: invoice.warehouseId,
          items: { create: totals.builtItems },
        },
      });
    }, { maxWait: 10000, timeout: 60000 });
    await this.applySalePrices(dto.items);
    return this.findOne(existing.id);
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

  async update(id: number, dto: Partial<UpsertPurchaseOrderDto>, user: JwtUser) {
    const existing = await this.prisma.prc_purchase_orders.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException('أمر الشراء غير موجود');
    if (dto.poNumber && dto.poNumber !== existing.po_number) {
      throw new BadRequestException('لا يمكن تغيير رقم أمر الشراء');
    }
    if (existing.supplier_invoice_id) {
      if (!dto.supplierId || !dto.items?.length) throw new BadRequestException('أرسلي بيانات أمر الشراء كاملة للتعديل');
      return this.repost(
        { id: existing.id, po_number: existing.po_number, supplier_invoice_id: existing.supplier_invoice_id, paid_amount: existing.paid_amount },
        dto as UpsertPurchaseOrderDto,
        user,
      );
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
          ...(dto.warehouseId !== undefined ? { warehouse_id: dto.warehouseId ?? null } : {}),
          ...(dto.categoryId !== undefined ? { category_id: dto.categoryId ?? null } : {}),
          ...(dto.invoicePrintDate !== undefined ? { invoice_print_date: dto.invoicePrintDate || null } : {}),
          ...(builtItems ? { items: { create: builtItems } } : {}),
        },
        include: { items: true },
      });
    });
    return this.map(row);
  }

  async remove(id: number, user: JwtUser) {
    const existing = await this.prisma.prc_purchase_orders.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('أمر الشراء غير موجود');
    if (existing.supplier_invoice_id) {
      await this.prisma.$transaction(async (tx) => {
        await this.supplierInvoices.voidPosted(
          existing.supplier_invoice_id!, user.sub, `حذف أمر شراء ${existing.po_number}`, tx, toNumber(existing.paid_amount),
        );
        await tx.prc_purchase_orders.update({ where: { id }, data: { is_deleted: true, status: 'cancelled' } });
      }, { maxWait: 10000, timeout: 60000 });
      return { success: true };
    }
    if (existing.status !== 'draft') {
      throw new BadRequestException('لا يمكن حذف أمر شراء غير مسودة');
    }
    const receipts = await this.prisma.prc_goods_receipts.count({
      where: { purchase_order_id: id, ...notDeletedFilter() },
    });
    if (receipts > 0) {
      throw new BadRequestException('لا يمكن حذف أمر شراء له إيصالات استلام؛ احذف الإيصالات أولًا');
    }
    await this.prisma.prc_purchase_orders.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }
}
