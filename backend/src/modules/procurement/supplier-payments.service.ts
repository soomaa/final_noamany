import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { assertOverpayCap } from '../../common/validators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { ListSupplierPaymentsDto, SettleSupplierDebtDto, UpsertSupplierPaymentDto } from './dto/procurement-ext.dto';
import { nextDocNumber, notDeletedFilter, toNumber } from './procurement.utils';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import type { JwtUser } from '../../common/types/jwt-user';

@Injectable()
export class SupplierPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private async syncInvoiceBalance(tx: Prisma.TransactionClient, invoiceId?: number | null) {
    if (!invoiceId) return;
    const invoice = await tx.prc_supplier_invoices.findFirst({
      where: { id: invoiceId, is_deleted: false },
    });
    if (!invoice) return;
    const aggregate = await tx.prc_supplier_payments.aggregate({
      where: { invoice_id: invoiceId, is_deleted: false, status: 'مدفوع' },
      _sum: { payment_amount: true },
    });
    const paid = Math.round(toNumber(aggregate._sum.payment_amount) * 100) / 100;
    const remaining = Math.round((toNumber(invoice.total_amount) - toNumber(invoice.returned_amount) - paid) * 100) / 100;
    await tx.prc_supplier_invoices.update({
      where: { id: invoiceId },
      data: {
        paid_amount: paid,
        remaining_amount: remaining,
        status: remaining === 0 ? 'مدفوعة' : invoice.stock_applied ? 'مستلمة' : invoice.status,
      },
    });
  }

  private map(row: Prisma.prc_supplier_paymentsGetPayload<object>) {
    return {
      id: row.id,
      paymentNumber: row.payment_number,
      supplierId: row.supplier_id,
      invoiceId: row.invoice_id,
      branchId: row.branch_id,
      paymentDate: row.payment_date,
      paymentAmount: toNumber(row.payment_amount),
      originalAmount: toNumber(row.original_amount),
      remainingAmount: toNumber(row.remaining_amount),
      currency: row.currency,
      paymentMethod: row.payment_method,
      status: row.status,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(q: ListSupplierPaymentsDto, user?: JwtUser) {
    const and: Prisma.prc_supplier_paymentsWhereInput[] = [notDeletedFilter()];
    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    if (scopedBranches) {
      and.push({
        OR: [
          { branch_id: { in: scopedBranches } },
          { branch_id: null, invoice: { branch_id: { in: scopedBranches } } },
        ],
      });
    }
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ payment_number: { contains: s } }, { notes: { contains: s } }] });
    }
    if (q.supplierId && q.supplierId !== 'all') and.push({ supplier_id: Number(q.supplierId) });
    if (q.status && q.status !== 'all') and.push({ status: q.status });
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.prc_supplier_payments.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.prc_supplier_payments.count({ where }),
    ]);
    const suppliers = await this.prisma.inv_suppliers.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.supplier_id))] } },
      select: { id: true, name_ar: true },
    });
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name_ar]));
    return paginated(
      rows.map((r) => ({ ...this.map(r), supplierName: supplierName.get(r.supplier_id) ?? null })),
      total,
      q.page,
      q.pageSize,
    );
  }

  /** Suppliers selectable in the statement report (active and archived, so old accounts stay reachable). */
  async statementSuppliers() {
    const rows = await this.prisma.inv_suppliers.findMany({
      where: { is_deleted: false },
      select: { id: true, name_ar: true },
      orderBy: { name_ar: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, name: row.name_ar }));
  }

  /**
   * Supplier account statement across the caller's branches, from the supplier's side:
   * purchases are credit (owed to the supplier), payments and returns are debit.
   */
  async supplierStatement(
    q: { supplierId: number; branchId?: number | null; dateFrom?: string; dateTo?: string },
    user?: JwtUser,
  ) {
    const supplier = await this.prisma.inv_suppliers.findFirst({
      where: { id: q.supplierId, is_deleted: false },
      select: { id: true, name_ar: true },
    });
    if (!supplier) throw new NotFoundException('المورد غير موجود');
    const scopedBranches = this.branchScope.resolveListFilter(user, q.branchId ?? null);
    const branchWhere = scopedBranches ? { in: scopedBranches } : { not: null };

    const invoices = await this.prisma.prc_supplier_invoices.findMany({
      where: { supplier_id: q.supplierId, branch_id: branchWhere, is_deleted: false },
      include: { payments: { where: { is_deleted: false, status: 'مدفوع' } } },
    });
    const returns = await this.prisma.prc_purchase_returns.findMany({
      where: {
        supplier_id: q.supplierId,
        ...(scopedBranches ? { branch_id: { in: scopedBranches } } : {}),
        stock_posted: true,
        is_deleted: false,
      },
    });
    const branchIds = [...new Set([...invoices.map((i) => i.branch_id), ...returns.map((r) => r.branch_id)])]
      .filter((id): id is number => !!id);
    const branches = await this.prisma.tbl_branches.findMany({
      where: { branch_id: { in: branchIds } },
      select: { branch_id: true, branch_name: true },
    });
    const branchName = new Map(branches.map((b) => [b.branch_id, b.branch_name ?? `فرع ${b.branch_id}`]));

    const day = (value: string | null, fallback: Date) => value || fallback.toISOString().slice(0, 10);
    const events = invoices.flatMap((i) => [
      {
        date: day(i.invoice_date, i.created_at),
        createdAt: i.created_at.getTime(),
        reference: i.invoice_number,
        operation: i.is_opening_balance ? 'رصيد افتتاحي' : 'فاتورة شراء',
        branchId: i.branch_id,
        debit: 0,
        credit: toNumber(i.total_amount),
      },
      ...i.payments.map((p) => {
        const amount = toNumber(p.payment_amount);
        return {
          date: day(p.payment_date, p.created_at),
          createdAt: p.created_at.getTime(),
          reference: p.payment_number,
          operation: amount < 0 ? 'استرداد من المورد' : 'سداد',
          branchId: p.branch_id ?? i.branch_id,
          // A refund received from the supplier reverses a payment, so it lands on the credit side.
          debit: amount < 0 ? 0 : amount,
          credit: amount < 0 ? -amount : 0,
        };
      }),
    ]);
    events.push(...returns.map((r) => ({
      date: day(r.return_date, r.created_at),
      createdAt: r.created_at.getTime(),
      reference: r.return_number,
      operation: 'مرتجع شراء',
      branchId: r.branch_id,
      debit: toNumber(r.total_amount),
      credit: 0,
    })));
    events.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt || a.reference.localeCompare(b.reference));

    const round = (value: number) => Math.round(value * 100) / 100;
    const opening = round(events
      .filter((e) => q.dateFrom && e.date < q.dateFrom)
      .reduce((sum, e) => sum + e.credit - e.debit, 0));
    let balance = opening;
    let totalDebit = 0;
    let totalCredit = 0;
    const rows = events
      .filter((e) => (!q.dateFrom || e.date >= q.dateFrom) && (!q.dateTo || e.date <= q.dateTo))
      .map((e) => {
        balance = round(balance + e.credit - e.debit);
        totalDebit += e.debit;
        totalCredit += e.credit;
        return {
          date: e.date,
          reference: e.reference,
          operation: e.operation,
          branchName: e.branchId ? branchName.get(e.branchId) ?? null : null,
          debit: round(e.debit),
          credit: round(e.credit),
          balance,
        };
      });
    return {
      supplierId: supplier.id,
      supplierName: supplier.name_ar,
      openingBalance: opening,
      totalDebit: round(totalDebit),
      totalCredit: round(totalCredit),
      balance,
      rows,
    };
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.prc_supplier_payments.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { invoice: { select: { branch_id: true } } },
    });
    const branchId = row?.branch_id ?? row?.invoice?.branch_id;
    if (!row || !branchId || !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new NotFoundException('دفعة المورد غير موجودة');
    }
    return this.map(row);
  }

  private async assertPaymentAgainstInvoice(
    dto: { supplierId: number; invoiceId?: number | null; paymentAmount: number },
    excludePaymentId?: number,
  ) {
    if (!dto.invoiceId) return;
    const invoice = await this.prisma.prc_supplier_invoices.findFirst({
      where: { id: dto.invoiceId, ...notDeletedFilter() },
    });
    if (!invoice) throw new BadRequestException('فاتورة المورد غير موجودة');
    if (invoice.supplier_id !== dto.supplierId) {
      throw new BadRequestException('المورد لا يطابق فاتورة المورد');
    }
    const paidAgg = await this.prisma.prc_supplier_payments.aggregate({
      where: {
        invoice_id: dto.invoiceId,
        ...notDeletedFilter(),
        ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}),
        status: { in: ['مدفوع', 'مسودة'] },
      },
      _sum: { payment_amount: true },
    });
    const paidSoFar = toNumber(paidAgg._sum.payment_amount);
    const balance = Math.round((toNumber(invoice.total_amount) - toNumber(invoice.returned_amount) - paidSoFar) * 100) / 100;
    assertOverpayCap(dto.paymentAmount, balance, 'المبلغ المدفوع أكبر من رصيد الفاتورة');
  }

  async create(dto: UpsertSupplierPaymentDto, userId: number, user?: JwtUser) {
    await this.assertPaymentAgainstInvoice(dto);
    const invoice = dto.invoiceId
      ? await this.prisma.prc_supplier_invoices.findFirst({ where: { id: dto.invoiceId, is_deleted: false } })
      : null;
    const branchId = Number(invoice?.branch_id ?? dto.branchId ?? user?.branch ?? 0);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      throw new BadRequestException('اختر فرع دفعة المورد');
    }
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new BadRequestException('لا تملك صلاحية تسجيل دفعة لهذا الفرع');
    }
    const originalAmount = dto.originalAmount ?? dto.paymentAmount;
    const remainingAmount = Math.round((originalAmount - dto.paymentAmount) * 100) / 100;
    const row = await this.prisma.$transaction(async (tx) => {
      const paymentNumber =
        dto.paymentNumber?.trim() ||
        (await nextDocNumber(tx, 'prc_supplier_payments', 'payment_number', 'PAY'));
      const created = await tx.prc_supplier_payments.create({
        data: {
          payment_number: paymentNumber,
          supplier_id: dto.supplierId,
          invoice_id: dto.invoiceId ?? null,
          branch_id: branchId,
          payment_date: dto.paymentDate ?? null,
          payment_amount: dto.paymentAmount,
          original_amount: originalAmount,
          remaining_amount: remainingAmount,
          currency: dto.currency ?? 'EGP',
          payment_method: dto.paymentMethod,
          status: dto.status ?? 'مسودة',
          notes: dto.notes?.trim() ?? null,
          created_by: userId,
        },
      });
      if ((dto.status ?? 'مسودة') === 'مدفوع') {
        const invoice = created.invoice_id
          ? await tx.prc_supplier_invoices.findUnique({ where: { id: created.invoice_id } })
          : null;
        await this.moduleLedger.postSupplierPayment(
          {
            paymentNumber: created.payment_number,
            branchId: invoice?.branch_id ?? undefined,
            paymentDate: created.payment_date ?? new Date().toISOString().slice(0, 10),
            amount: toNumber(created.payment_amount),
            paymentMethod: created.payment_method,
            createdBy: userId,
          },
          tx,
        );
      }
      await this.syncInvoiceBalance(tx, created.invoice_id);
      return created;
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertSupplierPaymentDto>, user?: JwtUser) {
    const existing = await this.prisma.prc_supplier_payments.findFirst({
      where: { id, ...notDeletedFilter() },
      include: { invoice: { select: { branch_id: true } } },
    });
    const existingBranchId = existing?.branch_id ?? existing?.invoice?.branch_id;
    if (!existing || !existingBranchId || !this.branchScope.isBranchAllowed(user, existingBranchId)) {
      throw new NotFoundException('دفعة المورد غير موجودة');
    }
    if (existing.status === 'مدفوع') {
      throw new BadRequestException('لا يمكن تعديل دفعة مورد مرحّلة ماليًا؛ استخدم إجراء عكس مستقل');
    }

    const paymentAmount = dto.paymentAmount ?? toNumber(existing.payment_amount);
    const invoiceId = dto.invoiceId !== undefined ? dto.invoiceId : existing.invoice_id;
    const supplierId = dto.supplierId ?? existing.supplier_id;
    await this.assertPaymentAgainstInvoice(
      { supplierId, invoiceId, paymentAmount },
      id,
    );
    const originalAmount = dto.originalAmount ?? toNumber(existing.original_amount);
    const remainingAmount = Math.round((originalAmount - paymentAmount) * 100) / 100;

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.prc_supplier_payments.update({
        where: { id },
        data: {
          ...(dto.supplierId != null ? { supplier_id: dto.supplierId } : {}),
          ...(dto.invoiceId !== undefined ? { invoice_id: dto.invoiceId ?? null } : {}),
          ...(dto.paymentDate !== undefined ? { payment_date: dto.paymentDate ?? null } : {}),
          payment_amount: paymentAmount,
          original_amount: originalAmount,
          remaining_amount: remainingAmount,
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          ...(dto.paymentMethod != null ? { payment_method: dto.paymentMethod } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() ?? null } : {}),
        },
      });
      if (dto.status === 'مدفوع' && existing.status !== 'مدفوع') {
        const invoice = updated.invoice_id
          ? await tx.prc_supplier_invoices.findUnique({ where: { id: updated.invoice_id } })
          : null;
        await this.moduleLedger.postSupplierPayment(
          {
            paymentNumber: updated.payment_number,
            branchId: invoice?.branch_id ?? undefined,
            paymentDate: updated.payment_date ?? new Date().toISOString().slice(0, 10),
            amount: toNumber(updated.payment_amount),
            paymentMethod: updated.payment_method,
            createdBy: existing.created_by ?? 1,
          },
          tx,
        );
      }
      await this.syncInvoiceBalance(tx, existing.invoice_id);
      if (updated.invoice_id !== existing.invoice_id) {
        await this.syncInvoiceBalance(tx, updated.invoice_id);
      }
      return updated;
    });
    return this.map(row);
  }

  async remove(id: number, user?: JwtUser) {
    const existing = await this.prisma.prc_supplier_payments.findFirst({
      where: { id, is_deleted: false },
      include: { invoice: { select: { branch_id: true } } },
    });
    const branchId = existing?.branch_id ?? existing?.invoice?.branch_id;
    if (!existing || !branchId || !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new NotFoundException('دفعة المورد غير موجودة');
    }
    if (existing.status === 'مدفوع') {
      throw new BadRequestException('لا يمكن حذف دفعة مورد مرحّلة ماليًا؛ استخدم إجراء عكس مستقل');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.prc_supplier_payments.update({ where: { id }, data: { is_deleted: true } });
      await this.syncInvoiceBalance(tx, existing.invoice_id);
    });
    return { success: true };
  }

  async settleDebt(dto: SettleSupplierDebtDto, userId: number, user?: JwtUser) {
    const supplier = await this.prisma.inv_suppliers.findFirst({
      where: { id: dto.supplierId, is_deleted: false, is_active: true },
    });
    if (!supplier) throw new BadRequestException('المورد غير موجود أو غير نشط');

    const branchId = Number(dto.branchId ?? user?.branch ?? 0);
    if (!Number.isInteger(branchId) || branchId <= 0) throw new BadRequestException('اختر فرع المديونية');
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new BadRequestException('لا تملك صلاحية سداد مديونية هذا الفرع');
    }

    return this.prisma.$transaction(async (tx) => {
      // Lock outstanding invoices so two cashiers cannot settle the same debt concurrently.
      await tx.$queryRaw`
        SELECT id FROM prc_supplier_invoices
        WHERE supplier_id = ${dto.supplierId} AND branch_id = ${branchId} AND is_deleted = 0 AND remaining_amount <> 0
        ORDER BY COALESCE(due_date, invoice_date), id FOR UPDATE
      `;
      const invoices = await tx.prc_supplier_invoices.findMany({
        where: { supplier_id: dto.supplierId, branch_id: branchId, is_deleted: false, remaining_amount: { not: 0 } },
        orderBy: [{ due_date: 'asc' }, { invoice_date: 'asc' }, { id: 'asc' }],
      });
      const totalBefore = Math.round(invoices.reduce((sum, row) => sum + toNumber(row.remaining_amount), 0) * 100) / 100;
      if (totalBefore <= 0) throw new BadRequestException('لا توجد مديونية مستحقة لهذا المورد');
      assertOverpayCap(dto.paymentAmount, totalBefore, 'المبلغ المدفوع أكبر من مديونية المورد');

      let pending = Math.round(dto.paymentAmount * 100) / 100;
      const allocations: Array<{ invoiceId: number; invoiceNumber: string; amount: number; paymentNumber: string }> = [];
      for (const invoice of invoices) {
        if (pending <= 0) break;
        const invoiceBalance = toNumber(invoice.remaining_amount);
        if (invoiceBalance <= 0) continue;
        const amount = Math.min(invoiceBalance, pending);
        const paymentNumber = await nextDocNumber(tx, 'prc_supplier_payments', 'payment_number', 'PAY');
        await tx.prc_supplier_payments.create({
          data: {
            payment_number: paymentNumber,
            supplier_id: dto.supplierId,
            invoice_id: invoice.id,
            branch_id: branchId,
            payment_date: dto.paymentDate ?? new Date().toISOString().slice(0, 10),
            payment_amount: amount,
            original_amount: invoice.total_amount,
            remaining_amount: Math.max(0, invoiceBalance - amount),
            currency: invoice.currency,
            payment_method: dto.paymentMethod,
            status: 'مدفوع',
            notes: dto.notes?.trim() || `سداد مديونية المورد - ${invoice.invoice_number}`,
            created_by: userId,
          },
        });
        await this.syncInvoiceBalance(tx, invoice.id);
        await this.moduleLedger.postSupplierPayment({
          paymentNumber,
          branchId: invoice.branch_id ?? undefined,
          paymentDate: dto.paymentDate ?? new Date().toISOString().slice(0, 10),
          amount,
          paymentMethod: dto.paymentMethod,
          createdBy: userId,
        }, tx);
        allocations.push({ invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, amount, paymentNumber });
        pending = Math.round((pending - amount) * 100) / 100;
      }
      return {
        supplierId: dto.supplierId,
        supplierName: supplier.name_ar,
        totalBefore,
        paid: dto.paymentAmount,
        remaining: Math.max(0, Math.round((totalBefore - dto.paymentAmount) * 100) / 100),
        allocations,
      };
    }, { maxWait: 10000, timeout: 20000 });
  }

  async receiveRefund(dto: SettleSupplierDebtDto, user: JwtUser) {
    const branchId=Number(dto.branchId ?? user.branch);
    if (!this.branchScope.isBranchAllowed(user,branchId)) throw new BadRequestException('الفرع خارج الصلاحيات');
    await this.moduleLedger.ensureChart();
    return this.prisma.$transaction(async(tx)=>{
      await tx.$queryRaw`SELECT id FROM prc_supplier_invoices WHERE supplier_id=${dto.supplierId} AND branch_id=${branchId} AND is_deleted=0 ORDER BY id FOR UPDATE`;
      const invoices=await tx.prc_supplier_invoices.findMany({where:{supplier_id:dto.supplierId,branch_id:branchId,is_deleted:false}});
      const net=invoices.reduce((s,i)=>s+toNumber(i.remaining_amount),0);
      if (!Number.isFinite(dto.paymentAmount) || dto.paymentAmount<=0 || dto.paymentAmount>Math.max(0,-net)+0.001) throw new BadRequestException('المبلغ أكبر من الرصيد المستحق لنا لدى المورد');
      let pending=dto.paymentAmount;
      for(const invoice of invoices.filter((i)=>toNumber(i.remaining_amount)<0)){
        if(pending<=0)break;
        const amount=Math.min(pending,-toNumber(invoice.remaining_amount));
        const reference=await nextDocNumber(tx,'prc_supplier_payments','payment_number','REF');
        await tx.prc_supplier_payments.create({data:{payment_number:reference,supplier_id:dto.supplierId,invoice_id:invoice.id,branch_id:branchId,payment_date:dto.paymentDate,payment_amount:-amount,payment_method:dto.paymentMethod,status:'مدفوع',created_by:user.sub,notes:'استلام مبلغ مسترد من المورد'}});
        await this.syncInvoiceBalance(tx,invoice.id);
        await this.moduleLedger.postSupplierPayment({paymentNumber:reference,branchId,paymentDate:dto.paymentDate??new Date().toISOString().slice(0,10),amount,paymentMethod:dto.paymentMethod,createdBy:user.sub,isRefund:true},tx);
        pending=Math.round((pending-amount)*100)/100;
      }
      return {remaining:Math.round((net+dto.paymentAmount)*100)/100};
    });
  }
}
