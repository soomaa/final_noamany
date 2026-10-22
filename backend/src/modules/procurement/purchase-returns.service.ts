import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryTxnType, MovementDirection, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { isDryRun, previewResponse } from '../../common/preview';
import { PrismaService } from '../../common/prisma/prisma.service';
import { roundMoney } from '../accounting/accounting.utils';
import type { JwtUser } from '../../common/types/jwt-user';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { LedgerService } from '../accounting/ledger.service';
import { InventoryStockService } from '../inventory/inventory-stock.service';
import {
  ChangePurchaseReturnStatusDto,
  ListPurchaseReturnsDto,
  PurchaseReturnItemDto,
  UpsertPurchaseReturnDto,
} from './dto/procurement.dto';
import {
  generatePurchaseReturnNumber,
  isStockPostingReturnStatus,
  notDeletedFilter,
  toNumber,
} from './procurement.utils';

@Injectable()
export class PurchaseReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: InventoryStockService,
    private readonly ledger: LedgerService,
  ) {}

  private mapItem(item: Prisma.prc_purchase_return_itemsGetPayload<object>) {
    return {
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unit_price),
      total: toNumber(item.total),
    };
  }

  private map(row: Prisma.prc_purchase_returnsGetPayload<{ include: { items: true } }>) {
    return {
      id: row.id,
      returnNumber: row.return_number,
      supplierId: row.supplier_id,
      supplierInvoiceId: row.supplier_invoice_id,
      warehouseId: row.warehouse_id,
      branchId: row.branch_id,
      status: row.status,
      totalAmount: toNumber(row.total_amount),
      notes: row.notes,
      stockPosted: row.stock_posted,
      postedAt: row.posted_at,
      returnDate: row.return_date ?? row.created_at.toISOString().slice(0, 10),
      createdBy: row.created_by,
      items: row.items.map((i) => this.mapItem(i)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private lineTotal(item: PurchaseReturnItemDto) {
    // Always compute server-side (qty × unitPrice); never trust the client-provided item.total.
    const unitPrice = item.unitPrice ?? 0;
    return Math.round(item.quantity * unitPrice * 100) / 100;
  }

  private async postStockOut(
    ret: Prisma.prc_purchase_returnsGetPayload<{ include: { items: true } }>,
    userId: number,
    tx: Prisma.TransactionClient,
  ) {
    for (const item of ret.items) {
      if (toNumber(item.quantity) <= 0) continue;
      await this.stock.applyMovement(
        {
          productId: item.product_id,
          warehouseId: ret.warehouse_id,
          direction: MovementDirection.out,
          quantity: item.quantity,
          txnType: InventoryTxnType.purchase_return,
          unitCost: item.unit_price,
          docType: 'purchase_return',
          docRef: ret.return_number,
          branchId: ret.branch_id,
          createdBy: userId,
        },
        tx,
      );
    }
  }

  private async postStockIn(
    ret: Prisma.prc_purchase_returnsGetPayload<{ include: { items: true } }>,
    userId: number,
    tx: Prisma.TransactionClient,
  ) {
    for (const item of ret.items) {
      if (toNumber(item.quantity) <= 0) continue;
      await this.stock.applyMovement(
        {
          productId: item.product_id,
          warehouseId: ret.warehouse_id,
          direction: MovementDirection.in,
          quantity: item.quantity,
          txnType: InventoryTxnType.purchase_return,
          unitCost: item.unit_price,
          docType: 'purchase_return',
          docRef: ret.return_number,
          branchId: ret.branch_id,
          createdBy: userId,
        },
        tx,
      );
    }
  }

  /** Return value from the item lines (qty × unitPrice), server-side. */
  private returnValue(
    ret: Prisma.prc_purchase_returnsGetPayload<{ include: { items: true } }>,
  ): number {
    if (ret.supplier_invoice_id) return toNumber(ret.total_amount);
    let total = 0;
    for (const item of ret.items) {
      const qty = toNumber(item.quantity);
      if (qty <= 0) continue;
      total += qty * toNumber(item.unit_price);
    }
    return roundMoney(total);
  }

  /**
   * GL for a confirmed purchase return — the mirror of the GRN inventory entry
   * (postGrnInventory: debit inventory / credit grn_clearing). On return we
   * remove goods from stock, so: credit inventory / debit grn_clearing.
   * Idempotent per return number.
   */
  private async postReturnLedger(
    ret: Prisma.prc_purchase_returnsGetPayload<{ include: { items: true } }>,
    userId: number,
    tx: Prisma.TransactionClient,
  ) {
    const amount = this.returnValue(ret);
    if (amount <= 0) return;
    await this.ledger.postEntry(
      {
        sourceModule: 'procurement',
        sourceDocType: 'purchase_return',
        sourceDocId: ret.return_number,
        branchId: ret.branch_id,
        date: ret.created_at.toISOString().slice(0, 10),
        description: `مرتجع مشتريات ${ret.return_number}`,
        lines: [
          { accountCode: ret.supplier_invoice_id ? 'accounts_payable' : 'grn_clearing', debit: amount, credit: 0 },
          { accountCode: 'inventory', debit: 0, credit: amount },
        ],
        createdBy: userId,
        entryPrefix: 'A',
      },
      tx,
    );
  }

  /** Reverse the return GL entry (mirror of postReturnLedger). */
  private async reverseReturnLedger(
    ret: Prisma.prc_purchase_returnsGetPayload<{ include: { items: true } }>,
    userId: number,
    tx: Prisma.TransactionClient,
  ) {
    const entry = await tx.acc_journal_entries.findFirst({
      where: {
        source_module: 'procurement',
        source_doc_type: 'purchase_return',
        source_doc_id: ret.return_number,
        status: 'posted',
      },
      orderBy: { id: 'desc' },
    });
    if (entry) {
      await this.ledger.reverseEntry(
        entry.id,
        `عكس مرتجع المشتريات ${ret.return_number}`,
        userId,
        tx,
      );
    }
  }

  async list(q: ListPurchaseReturnsDto) {
    const and: Prisma.prc_purchase_returnsWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ return_number: { contains: s } }, { notes: { contains: s } }],
      });
    }
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    if (q.supplierId && q.supplierId !== 'all') and.push({ supplier_id: Number(q.supplierId) });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.prc_purchase_returns.findMany({
        where,
        include: { items: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_purchase_returns.count({ where }),
    ]);
    return paginated(await this.withNames(rows), total, q.page, q.pageSize);
  }

  /** Adds the source invoice number and the creating employee's name for display. */
  private async withNames(rows: Prisma.prc_purchase_returnsGetPayload<{ include: { items: true } }>[]) {
    const invoiceIds = [...new Set(rows.map((r) => r.supplier_invoice_id).filter((v): v is number => v != null))];
    const userIds = [...new Set(rows.map((r) => r.created_by).filter((v): v is number => v != null))];
    const [invoices, users] = await Promise.all([
      this.prisma.prc_supplier_invoices.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, invoice_number: true } }),
      this.prisma.users.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, name: true, username: true } }),
    ]);
    const invoiceNumbers = new Map(invoices.map((i) => [i.id, i.invoice_number]));
    const userNames = new Map(users.map((u) => [u.user_id, u.name || u.username]));
    return rows.map((r) => ({
      ...this.map(r),
      supplierInvoiceNumber: r.supplier_invoice_id ? invoiceNumbers.get(r.supplier_invoice_id) ?? null : null,
      createdByName: r.created_by ? userNames.get(r.created_by) ?? null : null,
    }));
  }

  async findOne(id: number) {
    const row = await this.prisma.prc_purchase_returns.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!row) throw new NotFoundException('مرتجع المشتريات غير موجود');
    return (await this.withNames([row]))[0];
  }

  async create(dto: UpsertPurchaseReturnDto, userId: number, user?: JwtUser) {
    if (user && !new BranchScopeService().isBranchAllowed(user, dto.branchId)) throw new BadRequestException('الفرع خارج صلاحيات المستخدم');
    if (dto.status && dto.status !== 'مسودة') throw new BadRequestException('يبدأ المرتجع كمسودة ثم يتم اعتماده');
    if (!dto.items?.length) throw new BadRequestException('يجب إضافة بند واحد على الأقل');
    if (dto.supplierInvoiceId) dto = await this.resolveInvoiceItems(dto);
    const totalAmount = dto.items.reduce((s, i) => s + (dto.supplierInvoiceId ? i.total! : this.lineTotal(i)), 0);

    const row = await this.prisma.$transaction(async (tx) => {
      const returnNumber = dto.returnNumber?.trim() || (await generatePurchaseReturnNumber(tx));
      return tx.prc_purchase_returns.create({
        data: {
          return_number: returnNumber,
          supplier_id: dto.supplierId,
          supplier_invoice_id: dto.supplierInvoiceId ?? null,
          warehouse_id: dto.warehouseId,
          branch_id: dto.branchId,
          status: dto.status ?? 'مسودة',
          total_amount: totalAmount,
          notes: dto.notes?.trim() ?? null,
          created_by: userId,
          items: {
            create: dto.items.map((i) => ({
              product_id: i.productId,
              product_name: i.productName.trim(),
              quantity: i.quantity,
              unit_price: i.unitPrice ?? 0,
              total: dto.supplierInvoiceId ? i.total! : this.lineTotal(i),
            })),
          },
        },
        include: { items: true },
      });
    });

    return this.map(row);
  }

  private async resolveInvoiceItems(dto: UpsertPurchaseReturnDto) {
    const invoice = await this.prisma.prc_supplier_invoices.findFirst({ where: { id: dto.supplierInvoiceId, is_deleted: false }, include: { items: true } });
    if (!invoice || invoice.is_opening_balance || invoice.supplier_id !== dto.supplierId || invoice.branch_id !== dto.branchId || invoice.warehouse_id !== dto.warehouseId) throw new BadRequestException('بيانات المرتجع لا تطابق فاتورة الشراء الأصلية');
    const quantityByProduct = new Map<number, { quantity: number; amount: number; name: string }>();
    for (const item of invoice.items) if (item.product_id) {
      const row = quantityByProduct.get(item.product_id) ?? { quantity: 0, amount: 0, name: item.product_name ?? '' };
      row.quantity += toNumber(item.base_quantity ?? item.quantity);
      row.amount += toNumber(item.total_amount);
      quantityByProduct.set(item.product_id, row);
    }
    const seen = new Set<number>();
    return { ...dto, items: dto.items.map((item) => {
      const original = quantityByProduct.get(item.productId);
      if (!original || seen.has(item.productId) || item.quantity <= 0 || item.quantity > original.quantity) throw new BadRequestException('كمية المرتجع أو الصنف غير مطابق لفاتورة الشراء');
      seen.add(item.productId);
      const unitValue=original.amount / original.quantity * (toNumber(invoice.subtotal) > 0 ? toNumber(invoice.total_amount) / toNumber(invoice.subtotal) : 1);
      return { ...item, productName: original.name, unitPrice: roundMoney(unitValue), total:roundMoney(item.quantity*unitValue) };
    }) };
  }

  private async syncSourceInvoice(ret: Prisma.prc_purchase_returnsGetPayload<{include:{items:true}}>, tx: Prisma.TransactionClient) {
    if (!ret.supplier_invoice_id) return;
    // Serialize returns and settlements against the same original invoice.
    await tx.$queryRaw`SELECT id FROM prc_supplier_invoices WHERE id = ${ret.supplier_invoice_id} FOR UPDATE`;
    const invoice = await tx.prc_supplier_invoices.findUniqueOrThrow({ where: {id: ret.supplier_invoice_id}, include: {items:true} });
    if (invoice.supplier_id !== ret.supplier_id || invoice.branch_id !== ret.branch_id || invoice.warehouse_id !== ret.warehouse_id) throw new BadRequestException('تغيرت بيانات فاتورة الشراء؛ أعد إنشاء المرتجع');
    for (const item of ret.items) {
      const originals=invoice.items.filter((i)=>i.product_id===item.product_id);
      const qty=originals.reduce((sum,i)=>sum+toNumber(i.base_quantity??i.quantity),0);
      const amount=originals.reduce((sum,i)=>sum+toNumber(i.total_amount),0);
      const expected=qty>0?roundMoney(toNumber(item.quantity)*amount/qty*(toNumber(invoice.subtotal)>0?toNumber(invoice.total_amount)/toNumber(invoice.subtotal):1)):0;
      if (qty<=0 || Math.abs(expected-toNumber(item.total))>0.01) throw new BadRequestException('تغيرت أسعار فاتورة الشراء؛ أعد إنشاء المرتجع');
    }
    const returns = await tx.prc_purchase_returns.findMany({ where: {supplier_invoice_id: invoice.id, stock_posted:true, is_deleted:false}, include:{items:true} });
    const quantities = new Map<number,number>();
    for (const row of returns) for (const item of row.items) quantities.set(item.product_id, (quantities.get(item.product_id) ?? 0) + toNumber(item.quantity));
    for (const [productId, qty] of quantities) {
      const bought = invoice.items.filter((i) => i.product_id === productId).reduce((sum,i) => sum + toNumber(i.base_quantity ?? i.quantity),0);
      if (qty > bought + 0.000001) throw new BadRequestException('إجمالي المرتجع يتجاوز الكمية المشتراة');
    }
    const returned = roundMoney(returns.reduce((sum,row) => sum + toNumber(row.total_amount),0));
    if (returned > toNumber(invoice.total_amount) + 0.01) throw new BadRequestException('قيمة المرتجع تتجاوز الفاتورة');
    await tx.prc_supplier_invoices.update({where:{id:invoice.id},data:{returned_amount:returned,remaining_amount:roundMoney(toNumber(invoice.total_amount)-toNumber(invoice.paid_amount)-returned)}});
  }

  async update(id: number, dto: Partial<UpsertPurchaseReturnDto>) {
    const existing = await this.prisma.prc_purchase_returns.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('مرتجع المشتريات غير موجود');
    if (existing.status !== 'مسودة') {
      throw new BadRequestException('لا يمكن تعديل المرتجع إلا في حالة المسودة');
    }
    if (dto.items && !dto.items.length) {
      throw new BadRequestException('يجب إضافة بند واحد على الأقل');
    }
    if (existing.supplier_invoice_id) {
      // Linked returns keep their invoice/supplier/location; items are re-priced from the invoice.
      dto = {
        ...dto,
        supplierInvoiceId: existing.supplier_invoice_id,
        supplierId: existing.supplier_id,
        warehouseId: existing.warehouse_id,
        branchId: existing.branch_id,
      };
      if (dto.items) dto = await this.resolveInvoiceItems(dto as UpsertPurchaseReturnDto);
    }
    const linked = !!existing.supplier_invoice_id;
    const itemTotal = (i: PurchaseReturnItemDto) => (linked ? i.total! : this.lineTotal(i));

    const totalAmount = dto.items
      ? dto.items.reduce((s, i) => s + itemTotal(i), 0)
      : undefined;

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.prc_purchase_return_items.deleteMany({ where: { purchase_return_id: id } });
      }
      return tx.prc_purchase_returns.update({
        where: { id },
        data: {
          ...(dto.supplierId != null ? { supplier_id: dto.supplierId } : {}),
          ...(dto.warehouseId != null ? { warehouse_id: dto.warehouseId } : {}),
          ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
          ...(totalAmount !== undefined ? { total_amount: totalAmount } : {}),
          ...(dto.items
            ? {
                items: {
                  create: dto.items.map((i) => ({
                    product_id: i.productId,
                    product_name: i.productName.trim(),
                    quantity: i.quantity,
                    unit_price: i.unitPrice ?? 0,
                    total: itemTotal(i),
                  })),
                },
              }
            : {}),
        },
        include: { items: true },
      });
    });

    return (await this.withNames([row]))[0];
  }

  async remove(id: number) {
    const existing = await this.prisma.prc_purchase_returns.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('مرتجع المشتريات غير موجود');
    if (existing.status !== 'مسودة') {
      throw new BadRequestException('لا يمكن حذف المرتجع إلا في حالة المسودة');
    }
    await this.prisma.prc_purchase_returns.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }

  async changeStatus(id: number, dto: ChangePurchaseReturnStatusDto, userId: number, dryRun = false, user?: JwtUser) {
    const retPreview = await this.prisma.prc_purchase_returns.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { items: true },
    });
    if (!retPreview) throw new NotFoundException('مرتجع المشتريات غير موجود');
    if (user && !new BranchScopeService().isBranchAllowed(user,retPreview.branch_id)) throw new BadRequestException('المرتجع خارج صلاحيات المستخدم');

    const wouldPost =
      !retPreview.stock_posted &&
      isStockPostingReturnStatus(dto.status) &&
      !isStockPostingReturnStatus(retPreview.status);

    if (isDryRun(dryRun) && wouldPost) {
      const previewRows = retPreview.items
        .filter((i) => toNumber(i.quantity) > 0)
        .map((i) => ({
          label: i.product_name,
          before: '—',
          after: `-${toNumber(i.quantity)}`,
        }));
      return previewResponse(
        {
          returnId: id,
          returnNumber: retPreview.return_number,
          totalAmount: this.returnValue(retPreview),
        },
        {
          rows: previewRows,
          warning: 'سيتم خصم المخزون وإنشاء قيد محاسبي فور الاعتماد',
        },
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const ret = await tx.prc_purchase_returns.findFirst({
        where: { id, ...notDeletedFilter() },
        include: { items: true },
      });
      if (!ret) throw new NotFoundException('مرتجع المشتريات غير موجود');

      const oldStatus = ret.status;
      const newStatus = dto.status;
      if (oldStatus === newStatus) return ret;

      const wasPosted = ret.stock_posted;
      const shouldPost =
        !wasPosted && isStockPostingReturnStatus(newStatus);
      const shouldReverse =
        wasPosted &&
        isStockPostingReturnStatus(oldStatus) &&
        !isStockPostingReturnStatus(newStatus);

      if (shouldPost) {
        // Guarded claim: conditional updateMany inside the tx so two concurrent posts can't
        // both apply the stock movements — the loser sees count === 0.
        const claimed = await tx.prc_purchase_returns.updateMany({
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
        await this.postStockOut(ret, userId, tx);
        await this.syncSourceInvoice(ret, tx);
        // Mirror GL of the goods receipt: credit inventory / debit grn_clearing.
        await this.postReturnLedger(ret, userId, tx);
        return tx.prc_purchase_returns.findFirstOrThrow({
          where: { id },
          include: { items: true },
        });
      }

      if (shouldReverse) {
        // Guarded claim: only reverse if the stock is still posted (race-safe against a
        // concurrent reverse of the same return).
        const claimed = await tx.prc_purchase_returns.updateMany({
          where: { id, ...notDeletedFilter(), stock_posted: true },
          data: {
            status: newStatus,
            stock_posted: false,
            posted_at: null,
          },
        });
        if (claimed.count === 0) {
          throw new BadRequestException('لم يتم ترحيل المخزون لهذا المرتجع');
        }
        await this.postStockIn(ret, userId, tx);
        await this.syncSourceInvoice(ret, tx);
        // Reverse the return GL entry (mirror of postReturnLedger).
        await this.reverseReturnLedger(ret, userId, tx);
        return tx.prc_purchase_returns.findFirstOrThrow({
          where: { id },
          include: { items: true },
        });
      }

      return tx.prc_purchase_returns.update({
        where: { id },
        data: { status: newStatus },
        include: { items: true },
      });
    });

    return this.map(result);
  }
}
