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
import { isReceptionEmployee } from '../../common/utils/reception-user.util';
import { localDateString } from '../club-members/club-member.utils';
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
  roundMoney,
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

  private receptionFilter(user?: JwtUser): Prisma.fin_expensesWhereInput | null {
    return isReceptionEmployee(user) ? { branch_id: Number(user?.branch ?? 0), expense_date: localDateString() } : null;
  }

  private assertExpenseAccess(user: JwtUser | undefined, row: { branch_id: number | null; expense_date: string }) {
    this.assertBranchAccess(user, row.branch_id);
    if (isReceptionEmployee(user) && row.expense_date !== localDateString()) {
      throw new ForbiddenException('موظف الاستقبال يمكنه الوصول إلى مصروفات اليوم لفرعه فقط');
    }
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
      genderScope: row.gender_scope ?? null,
      parentId: row.parent_id ?? null,
      nesba: row.nesba != null ? toNumber(row.nesba) : null,
      mainValue: row.main_value != null ? toNumber(row.main_value) : null,
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
    const reception = this.receptionFilter(user);
    if (reception) and.push(reception);
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
    // Gender scope filter — 'all' or omitted = no filter
    if (q.genderScope && q.genderScope !== 'all') {
      and.push({ gender_scope: q.genderScope as 'male' | 'female' });
    }
    // NOTE: split records (male 120 + female 80) are two independent rows.
    // Do NOT filter parent_id — both rows must appear in the list.
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
    this.assertExpenseAccess(user, row);
    return this.map(row);
  }

  async statistics(q: ExpenseStatisticsQueryDto, user?: JwtUser) {
    const and: Prisma.fin_expensesWhereInput[] = [notDeletedFilter()];
    const reception = this.receptionFilter(user);
    if (reception) and.push(reception);
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
    const today = localDateString();
    const expenseDate = dto.expenseDate ?? today;
    if (isReceptionEmployee(user) && expenseDate !== today) throw new ForbiddenException('موظف الاستقبال يمكنه تسجيل مصروفات اليوم فقط');

    // --- Percentage-split creation (legacy: creates 2 linked records) ---
    if (dto.hasPercentage) {
      const malePct = dto.malePercentage ?? 0;
      const femalePct = dto.femalePercentage ?? 0;
      if (malePct < 0 || femalePct < 0 || malePct + femalePct !== 100) {
        throw new BadRequestException('مجموع نسبة الرجال والحريم يجب أن يساوي 100');
      }
      const mainTotal = totals.totalAmount;
      const maleAmount = roundMoney((mainTotal * malePct) / 100);
      const femaleAmount = roundMoney(mainTotal - maleAmount); // avoid floating-point drift

      const maleRow = await this.prisma.$transaction(async (tx) => {
        const maleNumber = await nextFinDocNumber(tx, 'fin_expenses', 'expense_number', 'EXP');
        const male = await tx.fin_expenses.create({
          data: {
            expense_number: maleNumber,
            expense_date: expenseDate,
            category: dto.category.trim(),
            sub_category: dto.subCategory?.trim() ?? null,
            amount: maleAmount,
            tax_amount: 0,
            total_amount: maleAmount,
            payment_method: dto.paymentMethod ?? 'نقدي',
            payment_status: dto.paymentStatus ?? 'معلق',
            description: dto.description ?? null,
            vendor: dto.vendor ?? null,
            invoice_number: dto.invoiceNumber ?? null,
            branch_id: branchId ?? null,
            department_id: dto.departmentId ?? null,
            notes: dto.notes ?? null,
            is_recurring: false,
            gender_scope: 'male',
            nesba: malePct,
            main_value: mainTotal,
            created_by: userId,
          },
        });

        const femaleNumber = await nextFinDocNumber(tx, 'fin_expenses', 'expense_number', 'EXP');
        await tx.fin_expenses.create({
          data: {
            expense_number: femaleNumber,
            expense_date: expenseDate,
            category: dto.category.trim(),
            sub_category: dto.subCategory?.trim() ?? null,
            amount: femaleAmount,
            tax_amount: 0,
            total_amount: femaleAmount,
            payment_method: dto.paymentMethod ?? 'نقدي',
            payment_status: dto.paymentStatus ?? 'معلق',
            description: dto.description ?? null,
            vendor: dto.vendor ?? null,
            invoice_number: dto.invoiceNumber ?? null,
            branch_id: branchId ?? null,
            department_id: dto.departmentId ?? null,
            notes: dto.notes ?? null,
            is_recurring: false,
            gender_scope: 'female',
            nesba: femalePct,
            main_value: mainTotal,
            parent_id: male.id,
            created_by: userId,
          },
        });

        return male;
      });
      return this.map(maleRow);
    }

    // --- Normal single-record creation ---
    const row = await this.prisma.$transaction(async (tx) => {
      const expenseNumber = await nextFinDocNumber(tx, 'fin_expenses', 'expense_number', 'EXP');
      return tx.fin_expenses.create({
        data: {
          expense_number: expenseNumber,
          expense_date: expenseDate,
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
            ? (dto.nextRecurringDate ?? expenseDate)
            : null,
          gender_scope: dto.genderScope ?? null,
          created_by: userId,
        },
      });
    });
    return this.map(row);
  }

  /** Resolve the split group root id for any row (parent or child). Returns null for single rows. */
  private resolveSplitRootId(existing: { parent_id: number | null; nesba: unknown; id: number }): number | null {
    if (existing.parent_id != null) return existing.parent_id;
    if (existing.nesba != null) return existing.id;
    return null;
  }

  async update(id: number, dto: Partial<UpsertExpenseDto>, user?: JwtUser) {
    const existing = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المصروف غير موجود');
    this.assertExpenseAccess(user, existing);
    if (isReceptionEmployee(user) && dto.expenseDate && dto.expenseDate !== localDateString()) throw new ForbiddenException('موظف الاستقبال يمكنه تسجيل مصروفات اليوم فقط');
    if (dto.branchId != null) this.assertBranchAccess(user, dto.branchId);

    const splitRootId = this.resolveSplitRootId(existing);

    // --- Split group update (works from male row OR female row) ---
    if (splitRootId != null) {
      const group = await this.prisma.fin_expenses.findMany({
        where: {
          OR: [{ id: splitRootId }, { parent_id: splitRootId }],
          ...notDeletedFilter(),
        },
      });
      if (group.length === 0) throw new NotFoundException('المصروف غير موجود');
      const parentRow = group.find((r) => r.id === splitRootId) ?? group[0];
      if (group.some((r) => r.approval_status === EXPENSE_APPROVED)) {
        throw new BadRequestException('لا يمكن تعديل مصروف معتمد');
      }

      // New total comes from the form's amount field (mainValue = full amount before split)
      const prevTotal = toNumber(parentRow.main_value ?? parentRow.total_amount);
      const newTotalRaw = dto.amount ?? prevTotal;
      // New percentages: prefer payload, else keep stored split
      let malePct: number;
      let femalePct: number;
      if (dto.hasPercentage && dto.malePercentage !== undefined && dto.femalePercentage !== undefined) {
        malePct = dto.malePercentage;
        femalePct = dto.femalePercentage;
      } else if (dto.malePercentage !== undefined) {
        malePct = dto.malePercentage;
        femalePct = 100 - dto.malePercentage;
      } else if (dto.femalePercentage !== undefined) {
        femalePct = dto.femalePercentage;
        malePct = 100 - dto.femalePercentage;
      } else {
        malePct = toNumber(parentRow.nesba);
        femalePct = 100 - malePct;
        // If editing from the female child and stored parent nesba missing, derive from child
        if (!Number.isFinite(malePct) || malePct <= 0) {
          const child = group.find((r) => r.parent_id === splitRootId);
          if (child?.nesba != null) femalePct = toNumber(child.nesba);
          malePct = 100 - femalePct;
        }
      }
      if (!(malePct > 0 && femalePct > 0 && malePct + femalePct === 100)) {
        throw new BadRequestException('مجموع نسبة الرجال والحريم يجب أن يساوي 100');
      }
      const totals = computeExpenseTotal(newTotalRaw, 0);
      const newTotal = totals.totalAmount;
      const maleAmount = roundMoney((newTotal * malePct) / 100);
      const femaleAmount = roundMoney(newTotal - maleAmount);

      const common = {
        ...(dto.expenseDate !== undefined ? { expense_date: dto.expenseDate } : {}),
        ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
        ...(dto.subCategory !== undefined ? { sub_category: dto.subCategory?.trim() ?? null } : {}),
        ...(dto.paymentMethod !== undefined ? { payment_method: dto.paymentMethod } : {}),
        ...(dto.paymentStatus !== undefined ? { payment_status: dto.paymentStatus } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.vendor !== undefined ? { vendor: dto.vendor } : {}),
        ...(dto.invoiceNumber !== undefined ? { invoice_number: dto.invoiceNumber } : {}),
        ...(dto.branchId !== undefined ? { branch_id: dto.branchId } : {}),
        ...(dto.departmentId !== undefined ? { department_id: dto.departmentId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      };

      await this.prisma.$transaction(async (tx) => {
        for (const r of group) {
          const isParent = r.id === splitRootId;
          await tx.fin_expenses.update({
            where: { id: r.id },
            data: {
              ...common,
              amount: isParent ? maleAmount : femaleAmount,
              tax_amount: 0,
              total_amount: isParent ? maleAmount : femaleAmount,
              gender_scope: isParent ? 'male' : 'female',
              nesba: isParent ? malePct : femalePct,
              main_value: newTotal,
            },
          });
        }
      });

      const refreshed = await this.prisma.fin_expenses.findFirst({
        where: { id, ...notDeletedFilter() },
      });
      return this.map(refreshed!);
    }

    // --- Convert a single row into a split (user checked percentage on edit) ---
    if (dto.hasPercentage) {
      const malePct = dto.malePercentage ?? 60;
      const femalePct = dto.femalePercentage ?? (100 - malePct);
      if (!(malePct > 0 && femalePct > 0 && malePct + femalePct === 100)) {
        throw new BadRequestException('مجموع نسبة الرجال والحريم يجب أن يساوي 100');
      }
      if (existing.approval_status === EXPENSE_APPROVED) {
        throw new BadRequestException('لا يمكن تعديل مصروف معتمد');
      }
      const totals = computeExpenseTotal(dto.amount ?? toNumber(existing.total_amount), 0);
      const newTotal = totals.totalAmount;
      const maleAmount = roundMoney((newTotal * malePct) / 100);
      const femaleAmount = roundMoney(newTotal - maleAmount);
      const result = await this.prisma.$transaction(async (tx) => {
        const parent = await tx.fin_expenses.update({
          where: { id },
          data: {
            amount: maleAmount,
            tax_amount: 0,
            total_amount: maleAmount,
            gender_scope: 'male',
            nesba: malePct,
            main_value: newTotal,
          },
        });
        const femaleNumber = await nextFinDocNumber(tx, 'fin_expenses', 'expense_number', 'EXP');
        await tx.fin_expenses.create({
          data: {
            expense_number: femaleNumber,
            expense_date: dto.expenseDate ?? parent.expense_date,
            category: (dto.category ?? parent.category).trim(),
            sub_category: dto.subCategory?.trim() ?? parent.sub_category,
            amount: femaleAmount,
            tax_amount: 0,
            total_amount: femaleAmount,
            payment_method: dto.paymentMethod ?? parent.payment_method,
            payment_status: dto.paymentStatus ?? parent.payment_status,
            description: dto.description ?? parent.description,
            vendor: dto.vendor ?? parent.vendor,
            invoice_number: dto.invoiceNumber ?? parent.invoice_number,
            branch_id: dto.branchId ?? parent.branch_id,
            department_id: dto.departmentId ?? parent.department_id,
            notes: dto.notes ?? parent.notes,
            is_recurring: false,
            gender_scope: 'female',
            nesba: femalePct,
            main_value: newTotal,
            parent_id: parent.id,
            created_by: parent.created_by,
          },
        });
        return parent;
      });
      const refreshed = await this.prisma.fin_expenses.findFirst({
        where: { id: result.id },
      });
      return this.map(refreshed!);
    }

    // --- Normal single-record update ---
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
        ...(dto.genderScope !== undefined ? { gender_scope: dto.genderScope ?? null } : {}),
      },
    });

    return this.map(row);
  }

  async remove(id: number, user?: JwtUser) {
    const existing = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المصروف غير موجود');
    this.assertExpenseAccess(user, existing);
    // Resolve whole split group (parent + child) so deleting either row deletes both
    const rootId = existing.parent_id ?? (existing.nesba != null ? existing.id : null);
    const idsToDelete: number[] = [id];
    if (rootId != null) {
      const group = await this.prisma.fin_expenses.findMany({
        where: {
          OR: [{ id: rootId }, { parent_id: rootId }],
          ...notDeletedFilter(),
        },
        select: { id: true, approval_status: true },
      });
      if (group.some((r) => r.approval_status === EXPENSE_APPROVED)) {
        throw new BadRequestException('لا يمكن حذف مصروف معتمد');
      }
      for (const r of group) if (!idsToDelete.includes(r.id)) idsToDelete.push(r.id);
    } else if (existing.approval_status === EXPENSE_APPROVED) {
      throw new BadRequestException('لا يمكن حذف مصروف معتمد');
    }
    const now = new Date();
    await this.prisma.fin_expenses.updateMany({
      where: { id: { in: idsToDelete } },
      data: { is_deleted: true, deleted_at: now },
    });
    return { success: true };
  }

  async approve(id: number, userId: number, user?: JwtUser) {
    const existing = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المصروف غير موجود');
    this.assertExpenseAccess(user, existing);
    if (existing.approval_status === EXPENSE_APPROVED) {
      throw new BadRequestException('المصروف معتمد مسبقاً');
    }
    // Resolve whole split group so approving either row approves both (male + female)
    const rootId = existing.parent_id ?? (existing.nesba != null ? existing.id : null);
    let groupIds = [id];
    if (rootId != null) {
      const group = await this.prisma.fin_expenses.findMany({
        where: { OR: [{ id: rootId }, { parent_id: rootId }], ...notDeletedFilter() },
        select: { id: true },
      });
      groupIds = group.map((r) => r.id);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      for (const gid of groupIds) {
        await tx.fin_expenses.update({
          where: { id: gid },
          data: {
            approval_status: EXPENSE_APPROVED,
            approved_by: userId,
            approved_at: now,
            rejection_notes: null,
          },
        });
      }
      // Post a ledger entry per row so male 120 + female 80 both hit accounting
      for (const gid of groupIds) {
        const r = await tx.fin_expenses.findFirst({ where: { id: gid } });
        if (!r) continue;
        await this.moduleLedger.postExpenseApproval(
          {
            expenseId: r.id,
            expenseNumber: r.expense_number,
            branchId: r.branch_id ?? undefined,
            expenseDate: r.expense_date,
            totalAmount: toNumber(r.total_amount),
            paymentMethod: r.payment_method,
            createdBy: userId,
          },
          tx,
        );
      }
      return tx.fin_expenses.findFirst({ where: { id } });
    });
    return this.map(row!);
  }

  async reject(id: number, dto: RejectExpenseDto, userId: number, user?: JwtUser) {
    const existing = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المصروف غير موجود');
    this.assertExpenseAccess(user, existing);
    if (existing.approval_status === EXPENSE_APPROVED) {
      throw new BadRequestException('لا يمكن رفض مصروف معتمد');
    }
    const rootId = existing.parent_id ?? (existing.nesba != null ? existing.id : null);
    let groupIds = [id];
    if (rootId != null) {
      const group = await this.prisma.fin_expenses.findMany({
        where: { OR: [{ id: rootId }, { parent_id: rootId }], ...notDeletedFilter() },
        select: { id: true },
      });
      groupIds = group.map((r) => r.id);
    }
    await this.prisma.fin_expenses.updateMany({
      where: { id: { in: groupIds } },
      data: {
        approval_status: 'مرفوض',
        rejection_notes: dto.notes.trim(),
        approved_by: userId,
        approved_at: new Date(),
      },
    });
    const row = await this.prisma.fin_expenses.findFirst({ where: { id } });
    return this.map(row!);
  }
}
