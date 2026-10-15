import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import {
  ExpenseStatisticsQueryDto,
  ListExpensesDto,
  RejectExpenseDto,
  UpsertExpenseDto,
} from './dto/finance.dto';
import {
  computeExpenseTotal,
  EXPENSE_APPROVED,
  nextFinDocNumber,
  notDeletedFilter,
  toNumber,
} from './finance.utils';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number | null | undefined) {
    if (branchId == null || !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private branchFilter(user?: JwtUser, requested?: string | number | null): Prisma.fin_expensesWhereInput | null {
    const scope = this.branchScope.resolveListFilter(user, requested ?? null);
    return scope === null ? null : { branch_id: { in: scope } };
  }

  private map(row: Prisma.fin_expensesGetPayload<object>) {
    return {
      id: row.id,
      expenseNumber: row.expense_number,
      expenseDate: row.expense_date,
      category: row.category,
      subCategory: row.sub_category,
      amount: toNumber(row.amount),
      taxAmount: toNumber(row.tax_amount),
      totalAmount: toNumber(row.total_amount),
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      approvalStatus: row.approval_status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      rejectionNotes: row.rejection_notes,
      description: row.description,
      vendor: row.vendor,
      invoiceNumber: row.invoice_number,
      branchId: row.branch_id,
      departmentId: row.department_id,
      attachments: row.attachments,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isRecurring: row.is_recurring,
      recurringFrequency: row.recurring_frequency,
      nextRecurringDate: row.next_recurring_date,
    };
  }

  private buildListWhere(q: ListExpensesDto, user?: JwtUser): Prisma.fin_expensesWhereInput {
    const and: Prisma.fin_expensesWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { expense_number: { contains: s } },
          { description: { contains: s } },
          { vendor: { contains: s } },
        ],
      });
    }
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    const scope = this.branchFilter(user, q.branchId ?? null);
    if (scope) and.push(scope);
    if (q.category && q.category !== 'all') and.push({ category: q.category });
    if (q.approvalStatus && q.approvalStatus !== 'all') {
      and.push({ approval_status: q.approvalStatus });
    }
    if (q.paymentStatus && q.paymentStatus !== 'all') {
      and.push({ payment_status: q.paymentStatus });
    }
    if (q.dateFrom || q.dateTo) {
      and.push({
        expense_date: {
          ...(q.dateFrom ? { gte: q.dateFrom } : {}),
          ...(q.dateTo ? { lte: q.dateTo } : {}),
        },
      });
    }
    return { AND: and };
  }

  async list(q: ListExpensesDto, user?: JwtUser) {
    const where = this.buildListWhere(q, user);
    const [rows, total] = await Promise.all([
      this.prisma.fin_expenses.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.fin_expenses.count({ where }),
    ]);
    return paginated(rows.map((r) => this.map(r)), total, q.page, q.pageSize);
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!row) throw new NotFoundException('المصروف غير موجود');
    this.assertBranchAccess(user, row.branch_id);
    return this.map(row);
  }

  async statistics(q: ExpenseStatisticsQueryDto, user?: JwtUser) {
    const and: Prisma.fin_expensesWhereInput[] = [notDeletedFilter()];
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    const scope = this.branchFilter(user, q.branchId ?? null);
    if (scope) and.push(scope);
    if (q.dateFrom || q.dateTo) {
      and.push({
        expense_date: {
          ...(q.dateFrom ? { gte: q.dateFrom } : {}),
          ...(q.dateTo ? { lte: q.dateTo } : {}),
        },
      });
    }
    const where = { AND: and };
    const [total, aggregate, byCategory, byApproval, byPayment] = await Promise.all([
      this.prisma.fin_expenses.count({ where }),
      this.prisma.fin_expenses.aggregate({ where, _sum: { total_amount: true } }),
      this.prisma.fin_expenses.groupBy({
        by: ['category'],
        where,
        _count: true,
        _sum: { total_amount: true },
      }),
      this.prisma.fin_expenses.groupBy({
        by: ['approval_status'],
        where,
        _count: true,
        _sum: { total_amount: true },
      }),
      this.prisma.fin_expenses.groupBy({
        by: ['payment_status'],
        where,
        _count: true,
        _sum: { total_amount: true },
      }),
    ]);
    return {
      total,
      totalAmount: toNumber(aggregate._sum.total_amount),
      byCategory: byCategory.map((r) => ({
        category: r.category,
        count: r._count,
        totalAmount: toNumber(r._sum.total_amount),
      })),
      byApprovalStatus: byApproval.map((r) => ({
        status: r.approval_status,
        count: r._count,
        totalAmount: toNumber(r._sum.total_amount),
      })),
      byPaymentStatus: byPayment.map((r) => ({
        status: r.payment_status,
        count: r._count,
        totalAmount: toNumber(r._sum.total_amount),
      })),
    };
  }

  async create(dto: UpsertExpenseDto, userId: number, user?: JwtUser) {
    const allowed = this.branchScope.allowedBranchIds(user);
    const branchId = dto.branchId ?? (allowed === null ? undefined : allowed[0]);
    if (branchId != null) this.assertBranchAccess(user, branchId);
    const totals = computeExpenseTotal(dto.amount, dto.taxAmount ?? 0);
    const row = await this.prisma.$transaction(async (tx) => {
      const expenseNumber = await nextFinDocNumber(tx, 'fin_expenses', 'expense_number', 'EXP');
      return tx.fin_expenses.create({
        data: {
          expense_number: expenseNumber,
          expense_date: dto.expenseDate ?? new Date().toISOString().slice(0, 10),
          category: dto.category.trim(),
          sub_category: dto.subCategory?.trim() ?? null,
          amount: totals.amount,
          tax_amount: totals.taxAmount,
          total_amount: totals.totalAmount,
          payment_method: dto.paymentMethod ?? 'نقدي',
          payment_status: dto.paymentStatus ?? 'معلق',
          description: dto.description ?? null,
          vendor: dto.vendor ?? null,
          invoice_number: dto.invoiceNumber ?? null,
          branch_id: branchId ?? null,
          department_id: dto.departmentId ?? null,
          notes: dto.notes ?? null,
          is_recurring: dto.isRecurring ?? false,
          recurring_frequency: dto.recurringFrequency ?? null,
          next_recurring_date: dto.isRecurring
            ? (dto.nextRecurringDate ?? dto.expenseDate ?? new Date().toISOString().slice(0, 10))
            : null,
          created_by: userId,
        },
      });
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertExpenseDto>, user?: JwtUser) {
    const existing = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المصروف غير موجود');
    this.assertBranchAccess(user, existing.branch_id);
    if (dto.branchId != null) this.assertBranchAccess(user, dto.branchId);
    if (existing.approval_status === EXPENSE_APPROVED) {
      throw new BadRequestException('لا يمكن تعديل مصروف معتمد');
    }
    const amount = dto.amount ?? toNumber(existing.amount);
    const taxAmount = dto.taxAmount ?? toNumber(existing.tax_amount);
    const totals = computeExpenseTotal(amount, taxAmount);
    const row = await this.prisma.fin_expenses.update({
      where: { id },
      data: {
        ...(dto.expenseDate !== undefined ? { expense_date: dto.expenseDate } : {}),
        ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
        ...(dto.subCategory !== undefined ? { sub_category: dto.subCategory?.trim() ?? null } : {}),
        amount: totals.amount,
        tax_amount: totals.taxAmount,
        total_amount: totals.totalAmount,
        ...(dto.paymentMethod !== undefined ? { payment_method: dto.paymentMethod } : {}),
        ...(dto.paymentStatus !== undefined ? { payment_status: dto.paymentStatus } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.vendor !== undefined ? { vendor: dto.vendor } : {}),
        ...(dto.invoiceNumber !== undefined ? { invoice_number: dto.invoiceNumber } : {}),
        ...(dto.branchId !== undefined ? { branch_id: dto.branchId } : {}),
        ...(dto.departmentId !== undefined ? { department_id: dto.departmentId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number, user?: JwtUser) {
    const existing = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المصروف غير موجود');
    this.assertBranchAccess(user, existing.branch_id);
    if (existing.approval_status === EXPENSE_APPROVED) {
      throw new BadRequestException('لا يمكن حذف مصروف معتمد');
    }
    await this.prisma.fin_expenses.update({
      where: { id },
      data: { is_deleted: true, deleted_at: new Date() },
    });
    return { success: true };
  }

  async approve(id: number, userId: number, user?: JwtUser) {
    const existing = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المصروف غير موجود');
    this.assertBranchAccess(user, existing.branch_id);
    if (existing.approval_status === EXPENSE_APPROVED) {
      throw new BadRequestException('المصروف معتمد مسبقاً');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.fin_expenses.update({
        where: { id },
        data: {
          approval_status: EXPENSE_APPROVED,
          approved_by: userId,
          approved_at: new Date(),
          rejection_notes: null,
        },
      });
      await this.moduleLedger.postExpenseApproval(
        {
          expenseId: updated.id,
          expenseNumber: updated.expense_number,
          branchId: updated.branch_id ?? undefined,
          expenseDate: updated.expense_date,
          totalAmount: toNumber(updated.total_amount),
          paymentMethod: updated.payment_method,
          createdBy: userId,
        },
        tx,
      );
      return updated;
    });
    return this.map(row);
  }

  async reject(id: number, dto: RejectExpenseDto, userId: number, user?: JwtUser) {
    const existing = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المصروف غير موجود');
    this.assertBranchAccess(user, existing.branch_id);
    if (existing.approval_status === EXPENSE_APPROVED) {
      throw new BadRequestException('لا يمكن رفض مصروف معتمد');
    }
    const row = await this.prisma.fin_expenses.update({
      where: { id },
      data: {
        approval_status: 'مرفوض',
        rejection_notes: dto.notes.trim(),
        approved_by: userId,
        approved_at: new Date(),
      },
    });
    return this.map(row);
  }
}
