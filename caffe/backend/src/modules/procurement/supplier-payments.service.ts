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
    const remaining = Math.max(0, Math.round((toNumber(invoice.total_amount) - paid) * 100) / 100);
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
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
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
    const balance = Math.round((toNumber(invoice.total_amount) - paidSoFar) * 100) / 100;
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
        WHERE supplier_id = ${dto.supplierId} AND branch_id = ${branchId} AND is_deleted = 0 AND remaining_amount > 0
        ORDER BY COALESCE(due_date, invoice_date), id FOR UPDATE
      `;
      const invoices = await tx.prc_supplier_invoices.findMany({
        where: { supplier_id: dto.supplierId, branch_id: branchId, is_deleted: false, remaining_amount: { gt: 0 } },
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
}
