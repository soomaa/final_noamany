import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryTxnType, MovementDirection, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { convertToBaseUnit, type RecipeUnit } from '../../common/utils/units';
import { InventoryStockService } from '../inventory/inventory-stock.service';
import { InventoryLocationService } from '../inventory/inventory-location.service';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { LedgerService } from '../accounting/ledger.service';
import { ListSupplierInvoicesDto, SupplierInvoiceItemDto, UpsertSupplierInvoiceDto } from './dto/procurement-ext.dto';
import { INITIAL_PURCHASE_PAYMENT_NOTE, lineTotal, nextDocNumber, notDeletedFilter, toNumber } from './procurement.utils';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';

@Injectable()
export class SupplierInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
    private readonly location: InventoryLocationService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly ledger: LedgerService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private requireUserBranch(user: JwtUser, requested?: number | null): number {
    const branchId = Number(requested ?? (user.branch > 0 ? user.branch : 0));
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new BadRequestException('اختر الفرع الذي ستُضاف إليه فاتورة الشراء');
    }
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new BadRequestException('لا تملك صلاحية تسجيل مشتريات لهذا الفرع');
    }
    return branchId;
  }

  private mapItem(item: Prisma.prc_supplier_invoice_itemsGetPayload<object>) {
    return {
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: toNumber(item.quantity),
      unit: item.unit,
      baseQuantity: item.base_quantity != null ? toNumber(item.base_quantity) : null,
      unitPrice: toNumber(item.unit_price),
      totalAmount: toNumber(item.total_amount),
    };
  }

  private map(row: Prisma.prc_supplier_invoicesGetPayload<{ include: { items: true } }>) {
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      supplierInvoiceNumber: row.supplier_invoice_number,
      attachmentUrl: row.attachment_url,
      supplierId: row.supplier_id,
      branchId: row.branch_id,
      warehouseId: row.warehouse_id,
      isOpeningBalance: row.is_opening_balance,
      returnedAmount: toNumber(row.returned_amount),
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      subtotal: toNumber(row.subtotal),
      taxAmount: toNumber(row.tax_amount),
      discountAmount: toNumber(row.discount_amount),
      totalAmount: toNumber(row.total_amount),
      paidAmount: toNumber(row.paid_amount),
      remainingAmount: toNumber(row.remaining_amount),
      currency: row.currency,
      status: row.status,
      stockApplied: row.stock_applied,
      stockedAt: row.stocked_at,
      notes: row.notes,
      items: row.items.map((i) => this.mapItem(i)),
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private resolveUnitPrice(item: SupplierInvoiceItemDto) {
    if (item.unitPrice != null) return Number(item.unitPrice);
    if (item.lineTotal != null && item.quantity > 0) {
      return Math.round((Number(item.lineTotal) / Number(item.quantity)) * 10000) / 10000;
    }
    throw new BadRequestException('أدخل تكلفة الدفعة لكل خامة');
  }

  private resolveLineTotal(item: SupplierInvoiceItemDto) {
    if (item.lineTotal != null) return Math.round(Number(item.lineTotal) * 100) / 100;
    return lineTotal(item.quantity, this.resolveUnitPrice(item));
  }

  private computeTotals(
    items: UpsertSupplierInvoiceDto['items'],
    dto: Partial<UpsertSupplierInvoiceDto>,
  ) {
    const subtotal =
      items?.reduce((sum, item) => sum + this.resolveLineTotal(item), 0) ??
      dto.subtotal ??
      0;
    const taxAmount = dto.taxAmount ?? 0;
    const discountAmount = dto.discountAmount ?? 0;
    const totalAmount = Math.round((subtotal + taxAmount - discountAmount) * 100) / 100;
    const paidAmount = dto.paidAmount ?? 0;
    const remainingAmount = Math.round((totalAmount - paidAmount) * 100) / 100;
    return { subtotal, taxAmount, discountAmount, totalAmount, paidAmount, remainingAmount };
  }

  private async assertExternalInvoiceNumberAvailable(
    supplierId: number,
    value?: string | null,
    excludeInvoiceId?: number,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const supplierInvoiceNumber = value?.trim();
    if (!supplierInvoiceNumber) return;
    const duplicate = await db.prc_supplier_invoices.findFirst({
      where: {
        supplier_id: supplierId,
        supplier_invoice_number: supplierInvoiceNumber,
        ...notDeletedFilter(),
        ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('رقم فاتورة المورد مسجل من قبل لهذا المورد');
    }
  }

  async list(q: ListSupplierInvoicesDto, user: JwtUser) {
    const and: Prisma.prc_supplier_invoicesWhereInput[] = [notDeletedFilter()];
    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    if (scopedBranches) and.push({ branch_id: { in: scopedBranches } });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ invoice_number: { contains: s } });
    }
    if (q.supplierId && q.supplierId !== 'all') and.push({ supplier_id: Number(q.supplierId) });
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.prc_supplier_invoices.findMany({
        where,
        include: { items: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_supplier_invoices.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number, user: JwtUser) {
    const row = await this.prisma.prc_supplier_invoices.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!row || !row.branch_id || !this.branchScope.isBranchAllowed(user, row.branch_id)) {
      throw new NotFoundException('فاتورة المورد غير موجودة');
    }
    return this.map(row);
  }

  async createOpening(input: {supplierId:number;branchId:number;amount:number;date:string}, user: JwtUser) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new BadRequestException('أدخل مبلغ المديونية الافتتاحية');
    const branchId = this.requireUserBranch(user, input.branchId);
    const supplier = await this.prisma.inv_suppliers.findFirst({where:{id:input.supplierId,is_deleted:false,is_active:true}});
    if (!supplier) throw new BadRequestException('المورد غير موجود');
    await this.moduleLedger.ensureChart();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM inv_suppliers WHERE id = ${input.supplierId} FOR UPDATE`;
      const existing = await tx.prc_supplier_invoices.findFirst({where:{supplier_id:input.supplierId,branch_id:branchId,is_opening_balance:true,is_deleted:false}});
      if (existing) throw new BadRequestException('تم تسجيل مديونية افتتاحية لهذا المورد والفرع مسبقًا');
      const reference = `OPEN-${input.supplierId}-${branchId}`;
      const row = await tx.prc_supplier_invoices.create({data:{invoice_number:reference,supplier_id:input.supplierId,branch_id:branchId,
        invoice_date:input.date,total_amount:input.amount,remaining_amount:input.amount,is_opening_balance:true,status:'رصيد افتتاحي',created_by:user.sub},include:{items:true}});
      await this.moduleLedger.postSupplierOpening({reference,branchId,date:input.date,amount:input.amount,createdBy:user.sub},tx);
      return this.map(row);
    });
  }

  async statement(supplierId: number, branchId: number, user: JwtUser) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) throw new BadRequestException('الفرع خارج الصلاحيات');
    const invoices = await this.prisma.prc_supplier_invoices.findMany({where:{supplier_id:supplierId,branch_id:branchId,is_deleted:false},include:{payments:{where:{is_deleted:false,status:'مدفوع'}}}});
    const returns = await this.prisma.prc_purchase_returns.findMany({where:{supplier_invoice_id:{in:invoices.map((i) => i.id)},stock_posted:true,is_deleted:false}});
    const events = invoices.flatMap((i) => [
      {date:i.invoice_date ?? i.created_at.toISOString().slice(0,10),createdAt:i.created_at.getTime(),reference:i.invoice_number,type:i.is_opening_balance?'رصيد افتتاحي':'مشتريات',debit:toNumber(i.total_amount),credit:0},
      ...i.payments.map((p) => ({date:p.payment_date ?? p.created_at.toISOString().slice(0,10),createdAt:p.created_at.getTime(),reference:p.payment_number,type:toNumber(p.payment_amount)<0?'استرداد من المورد':'سداد',debit:0,credit:toNumber(p.payment_amount)})),
    ]);
    events.push(...returns.map((r) => ({date:r.return_date ?? r.created_at.toISOString().slice(0,10),createdAt:r.created_at.getTime(),reference:r.return_number,type:'مرتجع شراء',debit:0,credit:toNumber(r.total_amount)})));
    events.sort((a,b) => a.date.localeCompare(b.date) || a.createdAt-b.createdAt || a.reference.localeCompare(b.reference));
    let balance=0;
    const rows=events.map((e) => ({...e,balance:balance=Math.round((balance+e.debit-e.credit)*100)/100}));
    return {supplierId,branchId,balance,rows};
  }

  /** Pass `outerTx` to post the invoice inside a caller's transaction (e.g. re-posting an edited purchase order). */
  async create(dto: UpsertSupplierInvoiceDto, user: JwtUser, outerTx?: Prisma.TransactionClient) {
    const db = outerTx ?? this.prisma;
    const userId = user.sub;
    const branchId = this.requireUserBranch(user, dto.branchId);
    const warehouseId = dto.warehouseId
      ? (await this.location.resolveSelection(user, dto.warehouseId, branchId, outerTx)).warehouseId
      : await this.location.resolveBranchStockLocation(branchId, outerTx);
    if (!dto.items?.length) throw new BadRequestException('أضف خامة واحدة على الأقل');
    const supplier = await db.inv_suppliers.findFirst({
      where: { id: dto.supplierId, is_deleted: false, is_active: true },
    });
    if (!supplier) throw new BadRequestException('المورد غير موجود أو غير نشط');
    await this.assertExternalInvoiceNumberAvailable(dto.supplierId, dto.supplierInvoiceNumber, undefined, db);
    const pricedItems = dto.items.map((item) => ({
      ...item,
      unitPrice: this.resolveUnitPrice(item),
      lineTotal: this.resolveLineTotal(item),
    }));
    const productIds = [...new Set(pricedItems.map((item) => item.productId).filter((id): id is number => !!id))];
    if (productIds.length !== pricedItems.length) throw new BadRequestException('اختر خامة مخزنية لكل بند');
    const links = await db.inv_supplier_products.findMany({
      where: { supplier_id: dto.supplierId, product_id: { in: productIds }, is_active: true },
    });
    if (links.length !== productIds.length) {
      throw new BadRequestException('تحتوي الفاتورة على خامة غير مربوطة بهذا المورد');
    }
    const products = await db.inv_products.findMany({
      where: { id: { in: productIds }, is_deleted: false },
    });
    if (products.length !== productIds.length) throw new BadRequestException('إحدى الخامات غير موجودة');
    const productMap = new Map(products.map((product) => [product.id, product]));
    const normalizedItems = pricedItems.map((item) => {
      const product = productMap.get(item.productId!)!;
      const unit = item.unit?.trim() || product.unit_of_measure;
      const baseQuantity = unit.toLowerCase() === product.unit_of_measure.toLowerCase()
        ? item.quantity
        : convertToBaseUnit(item.quantity, unit as RecipeUnit, product.unit_of_measure);
      if (baseQuantity == null) {
        throw new BadRequestException(`وحدة شراء ${product.name_ar} غير متوافقة مع وحدة المخزون`);
      }
      return { ...item, product, unit, baseQuantity };
    });
    const totals = this.computeTotals(pricedItems, dto);
    if (totals.remainingAmount < 0) throw new BadRequestException('المدفوع أكبر من إجمالي الفاتورة');

    const post = async (tx: Prisma.TransactionClient) => {
      const invoiceNumber =
        dto.invoiceNumber?.trim() ||
        (await nextDocNumber(tx, 'prc_supplier_invoices', 'invoice_number', 'SINV'));
      const created = await tx.prc_supplier_invoices.create({
        data: {
          invoice_number: invoiceNumber,
          supplier_invoice_number: dto.supplierInvoiceNumber?.trim() || null,
          attachment_url: dto.attachmentUrl?.trim() || null,
          supplier_id: dto.supplierId,
          branch_id: branchId,
          warehouse_id: warehouseId,
          invoice_date: dto.invoiceDate ?? null,
          due_date: dto.dueDate ?? null,
          subtotal: totals.subtotal,
          tax_amount: totals.taxAmount,
          discount_amount: totals.discountAmount,
          total_amount: totals.totalAmount,
          paid_amount: totals.paidAmount,
          remaining_amount: totals.remainingAmount,
          currency: dto.currency ?? 'EGP',
          status: totals.remainingAmount === 0 ? 'مدفوعة' : 'مستلمة',
          stock_applied: true,
          stocked_at: new Date(),
          notes: dto.notes?.trim() ?? null,
          created_by: userId,
          items: normalizedItems.length
            ? {
                create: normalizedItems.map((i) => ({
                  product_id: i.productId ?? null,
                  product_name: i.productName ?? i.product.name_ar,
                  quantity: i.quantity,
                  unit: i.unit,
                  base_quantity: i.baseQuantity,
                  unit_price: i.unitPrice,
                  total_amount: i.lineTotal,
                })),
              }
            : undefined,
        },
        include: { items: true },
      });

      for (const item of normalizedItems) {
        const totalStock = await tx.inv_stock_balances.aggregate({
          where: { product_id: item.productId },
          _sum: { current_stock: true },
        });
        const oldQuantity = toNumber(totalStock._sum.current_stock);
        const oldCost = toNumber(item.product.cost_price);
        const receivedCostPerBase = item.lineTotal / item.baseQuantity;
        const weightedCost = oldQuantity + item.baseQuantity > 0
          ? ((oldQuantity * oldCost) + (item.baseQuantity * receivedCostPerBase)) / (oldQuantity + item.baseQuantity)
          : receivedCostPerBase;
        const nextCost = item.costUpdateMode === 'keep'
          ? oldCost
          : item.costUpdateMode === 'replace'
            ? receivedCostPerBase
            : weightedCost;
        await tx.inv_products.update({
          where: { id: item.productId! },
          data: { cost_price: Math.round(nextCost * 10000) / 10000 },
        });
        await tx.inv_supplier_products.update({
          where: { supplier_id_product_id: { supplier_id: dto.supplierId, product_id: item.productId! } },
          data: { purchase_unit: item.unit, last_unit_cost: item.unitPrice },
        });
        await this.stock.applyMovement({
          productId: item.productId!,
          warehouseId,
          direction: MovementDirection.in,
          quantity: item.baseQuantity,
          unitCost: receivedCostPerBase,
          txnType: InventoryTxnType.receipt,
          docType: 'supplier_invoice',
          docRef: invoiceNumber,
          branchId,
          createdBy: userId,
        }, tx);
      }

      // Receipt raises inventory and supplier liability. The paid part then settles AP/cash.
      await this.moduleLedger.postPurchaseInvoiceApproved({
        invoiceNumber,
        branchId,
        invoiceDate: dto.invoiceDate ?? new Date().toISOString().slice(0, 10),
        amount: totals.totalAmount,
        hasGrn: false,
        createdBy: userId,
      }, tx);

      if (totals.paidAmount > 0) {
        const paymentNumber = await nextDocNumber(tx, 'prc_supplier_payments', 'payment_number', 'PAY');
        await tx.prc_supplier_payments.create({
          data: {
            payment_number: paymentNumber,
            supplier_id: dto.supplierId,
            invoice_id: created.id,
            branch_id: branchId,
            payment_date: dto.invoiceDate ?? new Date().toISOString().slice(0, 10),
            payment_amount: totals.paidAmount,
            original_amount: totals.totalAmount,
            remaining_amount: totals.remainingAmount,
            currency: dto.currency ?? 'EGP',
            payment_method: dto.initialPaymentMethod?.trim() || 'cash',
            status: 'مدفوع',
            // Marks cash paid at purchase time: the daily closing reports it under المشتريات, not حساب موردين.
            notes: INITIAL_PURCHASE_PAYMENT_NOTE,
            created_by: userId,
          },
        });
        await this.moduleLedger.postSupplierPayment({
          paymentNumber,
          branchId,
          paymentDate: dto.invoiceDate ?? new Date().toISOString().slice(0, 10),
          amount: totals.paidAmount,
          paymentMethod: dto.initialPaymentMethod?.trim() || 'cash',
          createdBy: userId,
        }, tx);
      }
      return created;
    };
    const row = outerTx ? await post(outerTx) : await this.prisma.$transaction(post, { maxWait: 10000, timeout: 20000 });
    return this.map(row);
  }

  /**
   * Fully undoes a posted supplier invoice inside `tx`: takes the received quantity back out of
   * stock, restores the weighted cost, reverses the purchase and payment journal entries and
   * voids the invoice and its payments (so they leave the supplier balance and daily closing).
   */
  async voidPosted(invoiceId: number, userId: number, reason: string, tx: Prisma.TransactionClient, expectedPaid?: number) {
    const invoice = await tx.prc_supplier_invoices.findFirst({
      where: { id: invoiceId, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!invoice) throw new NotFoundException('فاتورة المورد غير موجودة');
    if (invoice.is_opening_balance || toNumber(invoice.returned_amount) > 0) {
      throw new BadRequestException('الفاتورة عليها مرتجعات؛ لا يمكن تعديلها أو حذفها');
    }
    const payments = await tx.prc_supplier_payments.findMany({ where: { invoice_id: invoice.id, is_deleted: false } });
    const paidSoFar = payments.reduce((s, p) => s + toNumber(p.payment_amount), 0);
    if (expectedPaid != null && Math.abs(paidSoFar - expectedPaid) > 0.001) {
      throw new BadRequestException('اتسجل سداد لاحق على الفاتورة دي من شاشة سداد الموردين؛ الغيه الأول قبل التعديل أو الحذف');
    }

    if (invoice.stock_applied && invoice.warehouse_id) {
      const productIds = [...new Set(invoice.items.map((i) => i.product_id).filter((id): id is number => !!id))];
      const products = new Map((await tx.inv_products.findMany({ where: { id: { in: productIds } } })).map((p) => [p.id, p]));
      const byProduct = new Map<number, { quantity: number; value: number }>();
      for (const item of invoice.items) {
        if (!item.product_id) continue;
        const current = byProduct.get(item.product_id) ?? { quantity: 0, value: 0 };
        current.quantity += item.base_quantity != null ? toNumber(item.base_quantity) : toNumber(item.quantity);
        current.value += toNumber(item.total_amount);
        byProduct.set(item.product_id, current);
      }
      for (const [productId, old] of byProduct) {
        const product = products.get(productId);
        const balance = await tx.inv_stock_balances.findUnique({
          where: { product_id_warehouse_id: { product_id: productId, warehouse_id: invoice.warehouse_id } },
        });
        if (toNumber(balance?.current_stock) + 0.0001 < old.quantity) {
          throw new BadRequestException(`لا يمكن التعديل أو الحذف لأن جزءًا من كمية ${product?.name_ar ?? productId} اتصرف أو اتباع من المخزن`);
        }
        const aggregate = await tx.inv_stock_balances.aggregate({ where: { product_id: productId }, _sum: { current_stock: true } });
        const totalQuantity = toNumber(aggregate._sum.current_stock);
        const remainingQuantity = totalQuantity - old.quantity;
        const remainingValue = totalQuantity * toNumber(product?.cost_price) - old.value;
        const cost = remainingQuantity > 0 ? Math.max(0, remainingValue / remainingQuantity) : toNumber(product?.cost_price);
        await this.stock.applyMovement({
          productId,
          warehouseId: invoice.warehouse_id,
          direction: MovementDirection.out,
          quantity: old.quantity,
          unitCost: old.quantity > 0 ? old.value / old.quantity : 0,
          txnType: InventoryTxnType.adjustment,
          docType: 'supplier_invoice_void',
          docRef: invoice.invoice_number,
          branchId: invoice.branch_id ?? undefined,
          createdBy: userId,
        }, tx);
        await tx.inv_products.update({ where: { id: productId }, data: { cost_price: Math.round(cost * 10000) / 10000 } });
      }
    }

    const entries = await tx.acc_journal_entries.findMany({
      where: {
        source_module: 'procurement',
        status: 'posted',
        OR: [
          { source_doc_type: { in: ['purchase_invoice', 'purchase_invoice_correction'] }, source_doc_id: invoice.invoice_number },
          { source_doc_type: { in: ['purchase_invoice', 'purchase_invoice_correction'] }, source_doc_id: { startsWith: `${invoice.invoice_number}:v` } },
          ...(payments.length ? [{ source_doc_type: { in: ['supplier_payment', 'supplier_refund'] }, source_doc_id: { in: payments.map((p) => p.payment_number) } }] : []),
        ],
      },
      orderBy: { id: 'desc' },
    });
    for (const entry of entries) await this.ledger.reverseEntry(entry.id, reason, userId, tx);

    if (payments.length) {
      await tx.prc_supplier_payments.updateMany({ where: { id: { in: payments.map((p) => p.id) } }, data: { is_deleted: true } });
    }
    await tx.prc_supplier_invoices.update({ where: { id: invoice.id }, data: { is_deleted: true } });
    return { invoiceNumber: invoice.invoice_number, paidAmount: payments.reduce((s, p) => s + toNumber(p.payment_amount), 0) };
  }

  private async correctPostedInvoice(
    existing: Prisma.prc_supplier_invoicesGetPayload<{ include: { items: true } }>,
    dto: Partial<UpsertSupplierInvoiceDto>,
    userId: number,
  ) {
    if (!existing.warehouse_id || !existing.branch_id) {
      throw new BadRequestException('لا يمكن تصحيح فاتورة قديمة بدون فرع ومستودع');
    }
    const paidAmount = toNumber(existing.paid_amount);
    if (dto.paidAmount != null && Math.abs(dto.paidAmount - paidAmount) > 0.001) {
      throw new BadRequestException('الدفعات المرحّلة لا تُعدّل من الفاتورة؛ عدّل بيانات الشراء فقط واستخدم صفحة سداد المورد للدفعات');
    }
    if (dto.supplierId != null && dto.supplierId !== existing.supplier_id) {
      throw new BadRequestException('لا يمكن تغيير مورد فاتورة مرحّلة؛ أنشئ فاتورة جديدة للمورد الصحيح');
    }

    const supplierId = dto.supplierId ?? existing.supplier_id;
    const branchId = dto.branchId ?? existing.branch_id;
    const warehouseId = dto.warehouseId ?? existing.warehouse_id;
    const items = dto.items ?? existing.items.map((item) => ({
      productId: item.product_id ?? undefined,
      productName: item.product_name ?? undefined,
      quantity: toNumber(item.quantity),
      unit: item.unit ?? undefined,
      unitPrice: toNumber(item.unit_price),
      lineTotal: toNumber(item.total_amount),
    }));
    if (!items.length) throw new BadRequestException('أضف خامة واحدة على الأقل');

    const supplier = await this.prisma.inv_suppliers.findFirst({
      where: { id: supplierId, is_deleted: false, is_active: true },
    });
    if (!supplier) throw new BadRequestException('المورد غير موجود أو غير نشط');
    const warehouse = await this.prisma.inv_warehouses.findFirst({
      where: { id: warehouseId, branch_id: branchId, is_deleted: false, status: 'active' },
    });
    if (!warehouse) throw new BadRequestException('المستودع لا يتبع الفرع أو غير نشط');

    const pricedItems = items.map((item) => ({
      ...item,
      unitPrice: this.resolveUnitPrice(item),
      lineTotal: this.resolveLineTotal(item),
    }));
    const newProductIds = [...new Set(pricedItems.map((item) => item.productId).filter((value): value is number => !!value))];
    if (newProductIds.length !== pricedItems.length) throw new BadRequestException('اختر خامة مخزنية لكل بند ولا تكرر الخامة');
    const links = await this.prisma.inv_supplier_products.findMany({
      where: { supplier_id: supplierId, product_id: { in: newProductIds }, is_active: true },
    });
    if (links.length !== newProductIds.length) throw new BadRequestException('تحتوي الفاتورة على خامة غير مربوطة بهذا المورد');

    const oldProductIds = [...new Set(existing.items.map((item) => item.product_id).filter((value): value is number => !!value))];
    const allProductIds = [...new Set([...oldProductIds, ...newProductIds])];
    const products = await this.prisma.inv_products.findMany({ where: { id: { in: allProductIds }, is_deleted: false } });
    if (products.length !== allProductIds.length) throw new BadRequestException('إحدى الخامات غير موجودة');
    const productMap = new Map(products.map((product) => [product.id, product]));
    const normalizedItems = pricedItems.map((item) => {
      const product = productMap.get(item.productId!)!;
      const unit = item.unit?.trim() || product.unit_of_measure;
      const baseQuantity = unit.toLowerCase() === product.unit_of_measure.toLowerCase()
        ? item.quantity
        : convertToBaseUnit(item.quantity, unit as RecipeUnit, product.unit_of_measure);
      if (baseQuantity == null) throw new BadRequestException(`وحدة شراء ${product.name_ar} غير متوافقة مع وحدة المخزون`);
      return { ...item, product, unit, baseQuantity };
    });
    const totals = this.computeTotals(pricedItems, {
      ...dto,
      taxAmount: dto.taxAmount ?? toNumber(existing.tax_amount),
      discountAmount: dto.discountAmount ?? toNumber(existing.discount_amount),
      paidAmount,
    });
    if (totals.remainingAmount < 0) throw new BadRequestException('إجمالي الفاتورة الجديد أقل من الدفعات المسجلة عليها');

    const oldRows = existing.items.map((item) => {
      if (!item.product_id) throw new BadRequestException('فاتورة الشراء القديمة تحتوي بندًا غير مخزني ولا يمكن تصحيحها تلقائيًا');
      const product = productMap.get(item.product_id)!;
      const unit = item.unit?.trim() || product.unit_of_measure;
      const baseQuantity = item.base_quantity != null
        ? toNumber(item.base_quantity)
        : unit.toLowerCase() === product.unit_of_measure.toLowerCase()
          ? toNumber(item.quantity)
          : convertToBaseUnit(toNumber(item.quantity), unit as RecipeUnit, product.unit_of_measure);
      if (baseQuantity == null) throw new BadRequestException(`تعذر تحويل وحدة ${product.name_ar} في الفاتورة القديمة`);
      return { item, product, baseQuantity };
    });
    const oldByProduct = new Map<number, { quantity: number; value: number }>();
    for (const row of oldRows) {
      const current = oldByProduct.get(row.product.id) ?? { quantity: 0, value: 0 };
      current.quantity += row.baseQuantity;
      current.value += toNumber(row.item.total_amount);
      oldByProduct.set(row.product.id, current);
    }

    for (const [productId, old] of oldByProduct) {
      const balance = await this.prisma.inv_stock_balances.findUnique({
        where: { product_id_warehouse_id: { product_id: productId, warehouse_id: existing.warehouse_id } },
      });
      if (toNumber(balance?.current_stock) + 0.0001 < old.quantity) {
        const name = productMap.get(productId)?.name_ar ?? String(productId);
        throw new BadRequestException(`لا يمكن تصحيح الفاتورة لأن كمية ${name} المستلمة تم استهلاكها؛ استخدم مرتجع/تسوية موثقة`);
      }
    }

    const correctionRef = `${existing.invoice_number}:v${Date.now()}`;
    const row = await this.prisma.$transaction(async (tx) => {
      const costsAfterRemoval = new Map<number, number>();
      for (const [productId, old] of oldByProduct) {
        const aggregate = await tx.inv_stock_balances.aggregate({
          where: { product_id: productId },
          _sum: { current_stock: true },
        });
        const currentQuantity = toNumber(aggregate._sum.current_stock);
        const currentCost = toNumber(productMap.get(productId)?.cost_price);
        const remainingQuantity = currentQuantity - old.quantity;
        const remainingValue = (currentQuantity * currentCost) - old.value;
        costsAfterRemoval.set(productId, remainingQuantity > 0 ? Math.max(0, remainingValue / remainingQuantity) : 0);
      }
      for (const old of oldRows) {
        await this.stock.applyMovement({
          productId: old.product.id,
          warehouseId: existing.warehouse_id!,
          direction: MovementDirection.out,
          quantity: old.baseQuantity,
          unitCost: toNumber(old.item.total_amount) / old.baseQuantity,
          txnType: InventoryTxnType.adjustment,
          docType: 'supplier_invoice_correction',
          docRef: correctionRef,
          branchId: existing.branch_id!,
          createdBy: userId,
        }, tx);
      }
      for (const [productId, cost] of costsAfterRemoval) {
        await tx.inv_products.update({ where: { id: productId }, data: { cost_price: Math.round(cost * 10000) / 10000 } });
        const product = productMap.get(productId);
        if (product) product.cost_price = new Prisma.Decimal(cost);
      }

      const activeEntry = await tx.acc_journal_entries.findFirst({
        where: {
          source_module: 'procurement',
          source_doc_type: { in: ['purchase_invoice', 'purchase_invoice_correction'] },
          status: 'posted',
          OR: [
            { source_doc_id: existing.invoice_number },
            { source_doc_id: { startsWith: `${existing.invoice_number}:v` } },
          ],
        },
        orderBy: { id: 'desc' },
      });
      if (activeEntry) await this.ledger.reverseEntry(activeEntry.id, `تصحيح فاتورة المورد ${existing.invoice_number}`, userId, tx);

      await tx.prc_supplier_invoice_items.deleteMany({ where: { invoice_id: existing.id } });
      const updated = await tx.prc_supplier_invoices.update({
        where: { id: existing.id },
        data: {
          supplier_id: supplierId,
          branch_id: branchId,
          warehouse_id: warehouseId,
          ...(dto.supplierInvoiceNumber !== undefined ? { supplier_invoice_number: dto.supplierInvoiceNumber?.trim() || null } : {}),
          ...(dto.attachmentUrl !== undefined ? { attachment_url: dto.attachmentUrl?.trim() || null } : {}),
          ...(dto.invoiceDate !== undefined ? { invoice_date: dto.invoiceDate ?? null } : {}),
          ...(dto.dueDate !== undefined ? { due_date: dto.dueDate ?? null } : {}),
          subtotal: totals.subtotal,
          tax_amount: totals.taxAmount,
          discount_amount: totals.discountAmount,
          total_amount: totals.totalAmount,
          paid_amount: paidAmount,
          remaining_amount: totals.remainingAmount,
          status: totals.remainingAmount === 0 ? 'مدفوعة' : 'مستلمة',
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          notes: dto.notes !== undefined ? dto.notes?.trim() || null : existing.notes,
          items: { create: normalizedItems.map((item) => ({
            product_id: item.productId!,
            product_name: item.productName ?? item.product.name_ar,
            quantity: item.quantity,
            unit: item.unit,
            base_quantity: item.baseQuantity,
            unit_price: item.unitPrice,
            total_amount: item.lineTotal,
          })) },
        },
        include: { items: true },
      });

      for (const item of normalizedItems) {
        const aggregate = await tx.inv_stock_balances.aggregate({
          where: { product_id: item.productId },
          _sum: { current_stock: true },
        });
        const oldQuantity = toNumber(aggregate._sum.current_stock);
        const oldCost = toNumber(item.product.cost_price);
        const receivedCostPerBase = item.lineTotal / item.baseQuantity;
        const weightedCost = oldQuantity + item.baseQuantity > 0
          ? ((oldQuantity * oldCost) + item.lineTotal) / (oldQuantity + item.baseQuantity)
          : receivedCostPerBase;
        const nextCost = item.costUpdateMode === 'keep'
          ? oldCost
          : item.costUpdateMode === 'replace'
            ? receivedCostPerBase
            : weightedCost;
        await tx.inv_products.update({ where: { id: item.productId! }, data: { cost_price: Math.round(nextCost * 10000) / 10000 } });
        item.product.cost_price = new Prisma.Decimal(nextCost);
        await tx.inv_supplier_products.update({
          where: { supplier_id_product_id: { supplier_id: supplierId, product_id: item.productId! } },
          data: { purchase_unit: item.unit, last_unit_cost: item.unitPrice },
        });
        await this.stock.applyMovement({
          productId: item.productId!, warehouseId, direction: MovementDirection.in,
          quantity: item.baseQuantity, unitCost: receivedCostPerBase,
          txnType: InventoryTxnType.receipt, docType: 'supplier_invoice_correction',
          docRef: correctionRef, branchId, createdBy: userId,
        }, tx);
      }

      await this.moduleLedger.postPurchaseInvoiceApproved({
        invoiceNumber: existing.invoice_number,
        branchId,
        invoiceDate: updated.invoice_date ?? new Date().toISOString().slice(0, 10),
        amount: totals.totalAmount,
        hasGrn: false,
        createdBy: userId,
        sourceDocType: 'purchase_invoice_correction',
        sourceDocId: correctionRef,
        description: `تصحيح فاتورة شراء ${existing.invoice_number}`,
      }, tx);
      await tx.business_audit_log.create({
        data: {
          entity_type: 'supplier_invoice', entity_id: String(existing.id), action: 'correct',
          actor_user_id: userId, branch_id: branchId,
          before_json: JSON.parse(JSON.stringify(this.map(existing))) as Prisma.InputJsonValue,
          after_json: JSON.parse(JSON.stringify(this.map(updated))) as Prisma.InputJsonValue,
          reason: 'تصحيح فاتورة شراء مرحّلة مع عكس وإعادة تطبيق أثر المخزون والقيد المالي',
        },
      });
      return updated;
    }, { maxWait: 10000, timeout: 30000 });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertSupplierInvoiceDto>, user: JwtUser) {
    const userId = user.sub;
    const existing = await this.prisma.prc_supplier_invoices.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!existing || !existing.branch_id || !this.branchScope.isBranchAllowed(user, existing.branch_id)) {
      throw new NotFoundException('فاتورة المورد غير موجودة');
    }
    await this.assertExternalInvoiceNumberAvailable(
      dto.supplierId ?? existing.supplier_id,
      dto.supplierInvoiceNumber,
      existing.id,
    );
    const userBranchId = existing.branch_id;
    if (existing.is_opening_balance || toNumber(existing.returned_amount) > 0) throw new BadRequestException('لا يمكن تصحيح رصيد افتتاحي أو فاتورة لها مرتجعات');
    if (existing.stock_applied) {
      return this.correctPostedInvoice(
        existing,
        {
          ...dto,
          branchId: existing.branch_id ?? undefined,
          warehouseId: existing.warehouse_id ?? undefined,
        },
        userId,
      );
    }

    const warehouseId = existing.warehouse_id ?? await this.location.resolveBranchStockLocation(userBranchId);
    const items = dto.items ?? existing.items.map((i) => ({
      productId: i.product_id ?? undefined,
      productName: i.product_name ?? undefined,
      quantity: toNumber(i.quantity),
      unit: i.unit ?? undefined,
      unitPrice: toNumber(i.unit_price),
    }));
    const pricedItems = items.map((item) => ({
      ...item,
      unitPrice: this.resolveUnitPrice(item),
      lineTotal: this.resolveLineTotal(item),
    }));
    const totals = this.computeTotals(pricedItems, {
      ...dto,
      subtotal: dto.subtotal ?? toNumber(existing.subtotal),
      taxAmount: dto.taxAmount ?? toNumber(existing.tax_amount),
      discountAmount: dto.discountAmount ?? toNumber(existing.discount_amount),
      paidAmount: dto.paidAmount ?? toNumber(existing.paid_amount),
    });

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.prc_supplier_invoice_items.deleteMany({ where: { invoice_id: id } });
      }
      return tx.prc_supplier_invoices.update({
        where: { id },
        data: {
          ...(dto.supplierId != null ? { supplier_id: dto.supplierId } : {}),
          branch_id: userBranchId,
          warehouse_id: warehouseId,
          ...(dto.supplierInvoiceNumber !== undefined ? { supplier_invoice_number: dto.supplierInvoiceNumber?.trim() || null } : {}),
          ...(dto.attachmentUrl !== undefined ? { attachment_url: dto.attachmentUrl?.trim() || null } : {}),
          ...(dto.invoiceDate !== undefined ? { invoice_date: dto.invoiceDate ?? null } : {}),
          ...(dto.dueDate !== undefined ? { due_date: dto.dueDate ?? null } : {}),
          subtotal: totals.subtotal,
          tax_amount: totals.taxAmount,
          discount_amount: totals.discountAmount,
          total_amount: totals.totalAmount,
          paid_amount: totals.paidAmount,
          remaining_amount: totals.remainingAmount,
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
          ...(dto.items
            ? {
                items: {
                  create: pricedItems.map((i) => ({
                    product_id: i.productId ?? null,
                    product_name: i.productName ?? null,
                    quantity: i.quantity,
                    unit: i.unit ?? null,
                    unit_price: i.unitPrice,
                    total_amount: i.lineTotal,
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

  async remove(id: number, user: JwtUser) {
    const invoice = await this.prisma.prc_supplier_invoices.findFirst({
      where: { id, is_deleted: false },
    });
    if (!invoice || !invoice.branch_id || !this.branchScope.isBranchAllowed(user, invoice.branch_id)) {
      throw new NotFoundException('فاتورة المورد غير موجودة');
    }
    if (invoice.stock_applied) {
      throw new BadRequestException('لا يمكن حذف فاتورة تم ترحيلها للمخزون؛ استخدم مرتجع شراء');
    }
    if (invoice.is_opening_balance || toNumber(invoice.returned_amount) > 0) throw new BadRequestException('المستند مُرحّل ولا يمكن حذفه');
    await this.prisma.prc_supplier_invoices.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }
}
