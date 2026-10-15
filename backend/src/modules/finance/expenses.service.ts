import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ShiftSessionStatus } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { expectedDrawerBalance } from '../sales/cash-drawer.math';
import { expensePayments } from './expense-payments';
import {
  ExpenseStatisticsQueryDto,
  ExpenseUserOptionsQueryDto,
  ListExpensesDto,
  RejectExpenseDto,
  UpsertExpenseDto,
} from './dto/finance.dto';
import {
  createdByFilter,
  resolveFinanceCreatorScope,
} from './finance-user-scope';
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
    private readonly permissions: PermissionEngineService,
  ) {}

  private assertBranchAccess(user: JwtUser | undefined, branchId: number | null | undefined) {
    if (branchId == null || !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  private async assertCreatorAccess(
    user: JwtUser | undefined,
    createdBy: number | null | undefined,
  ) {
    if (!user) return;
    const scope = await resolveFinanceCreatorScope(this.permissions, user, null, 'financial-reports.expenses');
    if (scope.selectedUserId != null && createdBy !== scope.selectedUserId) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لمصروفات مستخدم آخر');
    }
  }

  private branchFilter(user?: JwtUser, requested?: string | number | null): Prisma.fin_expensesWhereInput | null {
    const scope = this.branchScope.resolveListFilter(user, requested ?? null);
    return scope === null ? null : { branch_id: { in: scope } };
  }

  private map(
    row: Prisma.fin_expensesGetPayload<object>,
    extras?: { createdByName?: string | null },
  ) {
    return {
      id: row.id,
      expenseNumber: row.expense_number,
      expenseDate: row.expense_date,
      businessUnit: row.business_unit ?? 'gym',
      paymentNeedsReview: row.paid_amount == null && row.payment_status === 'جزئي',
      paidAmount: row.paid_amount != null ? toNumber(row.paid_amount) : row.payment_status === 'مدفوع' ? toNumber(row.total_amount) : 0,
      remainingAmount: Math.max(0, toNumber(row.total_amount) - (row.paid_amount != null ? toNumber(row.paid_amount) : row.payment_status === 'مدفوع' ? toNumber(row.total_amount) : 0)),
      payments: row.payments,
      systemManaged: row.notes === 'مستند تلقائي مربوط بالنظام' || row.expense_number.startsWith('CAFE-'),
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
      createdByName: extras?.createdByName ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isRecurring: row.is_recurring,
      recurringFrequency: row.recurring_frequency,
      nextRecurringDate: row.next_recurring_date,
    };
  }

  private async enrichCreatorNames(
    rows: Prisma.fin_expensesGetPayload<object>[],
  ) {
    const userIds = [
      ...new Set(rows.map((r) => r.created_by).filter((id): id is number => id != null)),
    ];
    if (!userIds.length) return rows.map((r) => this.map(r));
    const users = await this.prisma.users.findMany({
      where: { user_id: { in: userIds } },
      select: { user_id: true, name: true },
    });
    const nameById = new Map(users.map((u) => [u.user_id, u.name]));
    return rows.map((r) =>
      this.map(r, {
        createdByName: r.created_by != null ? nameById.get(r.created_by) ?? null : null,
      }),
    );
  }

  private async buildListWhere(
    q: ListExpensesDto,
    user?: JwtUser,
  ): Promise<Prisma.fin_expensesWhereInput> {
    const and: Prisma.fin_expensesWhereInput[] = [notDeletedFilter()];
    if (q.businessUnit) and.push({ business_unit: q.businessUnit });
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
          ...(q.dateTo ? { lte: q.dateTo.length === 10 ? `${q.dateTo}T23:59:59` : q.dateTo } : {}),
        },
      });
    }
    const creator = await resolveFinanceCreatorScope(this.permissions, user, q.userId, 'financial-reports.expenses');
    const creatorFilter = createdByFilter(creator.selectedUserId);
    if ('created_by' in creatorFilter) and.push(creatorFilter);
    return { AND: and };
  }

  async list(q: ListExpensesDto, user?: JwtUser) {
    const where = await this.buildListWhere(q, user);
    const [rows, total] = await Promise.all([
      this.prisma.fin_expenses.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.fin_expenses.count({ where }),
    ]);
    const mapped = await this.enrichCreatorNames(rows);
    return paginated(mapped, total, q.page, q.pageSize);
  }

  async userOptions(q: ExpenseUserOptionsQueryDto, user?: JwtUser) {
    // Derive choices from accessible expenses, including historical creators.
    // Never depend on admin.users permission or expose full user records.
    const and: Prisma.fin_expensesWhereInput[] = [notDeletedFilter(), { created_by: { not: null } }];
    if (q.businessUnit) and.push({ business_unit: q.businessUnit });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    const branch = this.branchFilter(user, q.branchId ?? null);
    if (branch) and.push(branch);
    const creator = await resolveFinanceCreatorScope(this.permissions, user, null, 'financial-reports.expenses');
    if (creator.selectedUserId != null) and.push(createdByFilter(creator.selectedUserId));
    const creators = await this.prisma.fin_expenses.groupBy({ by: ['created_by'], where: { AND: and } });
    const ids = creators.flatMap((row) => row.created_by == null ? [] : [row.created_by]);
    if (!ids.length) return [];
    const users = await this.prisma.users.findMany({
      where: { user_id: { in: ids } },
      select: { user_id: true, name: true },
      orderBy: [{ name: 'asc' }, { user_id: 'asc' }],
    });
    return users.map((account) => ({ id: account.user_id, name: account.name }));
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!row) throw new NotFoundException('المصروف غير موجود');
    this.assertBranchAccess(user, row.branch_id);
    await this.assertCreatorAccess(user, row.created_by);
    const [mapped] = await this.enrichCreatorNames([row]);
    return mapped;
  }

  async statistics(q: ExpenseStatisticsQueryDto, user?: JwtUser) {
    const and: Prisma.fin_expensesWhereInput[] = [notDeletedFilter()];
    if (q.businessUnit) and.push({ business_unit: q.businessUnit });
    if (q.branchId && q.branchId !== 'all') and.push({ branch_id: Number(q.branchId) });
    const scope = this.branchFilter(user, q.branchId ?? null);
    if (scope) and.push(scope);
    if (q.dateFrom || q.dateTo) {
      and.push({
        expense_date: {
          ...(q.dateFrom ? { gte: q.dateFrom } : {}),
          ...(q.dateTo ? { lte: q.dateTo.length === 10 ? `${q.dateTo}T23:59:59` : q.dateTo } : {}),
        },
      });
    }
    const creator = await resolveFinanceCreatorScope(this.permissions, user, q.userId, 'financial-reports.expenses');
    const creatorFilter = createdByFilter(creator.selectedUserId);
    if ('created_by' in creatorFilter) and.push(creatorFilter);
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
    const payment = expensePayments(totals.totalAmount, dto);
    const deductFromDrawer = dto.deductFromDrawer === true;
    if (deductFromDrawer && branchId == null) {
      throw new BadRequestException('اختر الفرع قبل خصم المصروف من الدرج');
    }
    if (deductFromDrawer && payment.paymentMethod !== 'نقدي') {
      throw new BadRequestException('خصم المصروف من الدرج متاح للمصروف النقدي فقط');
    }
    if (deductFromDrawer && payment.paidAmount <= 0) {
      throw new BadRequestException('خصم المصروف من الدرج يتطلب أن تكون حالة الدفع مدفوع');
    }
    if (deductFromDrawer && totals.totalAmount < 0.01) {
      throw new BadRequestException('المبلغ المخصوم من الدرج يجب ألا يقل عن 0.01 ج.م');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const policy = await tx.club_gym_policies.findUnique({
        where: { id: 1 },
        select: { require_expense_approval: true },
      });
      // Missing policy rows preserve ONE80's historical manual-approval workflow.
      const requiresApproval = policy?.require_expense_approval ?? true;
      let drawerSession: Prisma.sales_shift_sessionsGetPayload<object> | null = null;
      let availableDrawerCash = 0;
      if (deductFromDrawer) {
        drawerSession = await tx.sales_shift_sessions.findFirst({
          where: {
            branch_id: branchId!,
            status: ShiftSessionStatus.open,
          },
          orderBy: { start_time: 'desc' },
        });
        if (!drawerSession) {
          throw new BadRequestException(
            'لا توجد وردية مفتوحة في هذا الفرع لخصم المصروف من الدرج',
          );
        }
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM sales_shift_sessions WHERE id = ${drawerSession.id} FOR UPDATE
        `);
        drawerSession = await tx.sales_shift_sessions.findUnique({
          where: { id: drawerSession.id },
        });
        if (!drawerSession || drawerSession.status !== ShiftSessionStatus.open) {
          throw new BadRequestException('الوردية لم تعد مفتوحة');
        }
        const movements = await tx.sales_cash_drawer_transactions.findMany({
          where: {
            shift_session_id: drawerSession.id,
            status: 'posted',
            movement_type: {
              in: ['petty_expense', 'custody_issue', 'custody_return', 'adjustment'],
            },
          },
          select: { direction: true, amount: true },
        });
        const adjustments = movements.reduce(
          (sum, movement) =>
            sum + (movement.direction === 'in' ? toNumber(movement.amount) : -toNumber(movement.amount)),
          0,
        );
        availableDrawerCash = expectedDrawerBalance(
          toNumber(drawerSession.opening_balance),
          toNumber(drawerSession.total_cash),
          adjustments,
        );
        if (payment.paidAmount > availableDrawerCash + 0.001) {
          throw new BadRequestException(
            `الرصيد المتاح في الدرج ${availableDrawerCash.toFixed(2)} ج.م فقط`,
          );
        }
      }
      const expenseNumber = await nextFinDocNumber(tx, 'fin_expenses', 'expense_number', 'EXP');
      const created = await tx.fin_expenses.create({
        data: {
          expense_number: expenseNumber,
          expense_date: dto.expenseDate ?? new Date().toISOString().slice(0, 19),
          business_unit: dto.businessUnit ?? 'gym',
          paid_amount: payment.paidAmount,
          ...(payment.payments ? { payments: payment.payments } : {}),
          category: dto.category.trim(),
          sub_category: dto.subCategory?.trim() ?? null,
          amount: totals.amount,
          tax_amount: totals.taxAmount,
          total_amount: totals.totalAmount,
          payment_method: payment.paymentMethod,
          payment_status: payment.paymentStatus,
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
          ...(!requiresApproval
            ? {
                approval_status: EXPENSE_APPROVED,
                approved_by: userId,
                approved_at: new Date(),
                rejection_notes: null,
              }
            : {}),
          created_by: userId,
        },
      });
      if (deductFromDrawer && drawerSession) {
        await tx.sales_cash_drawer_transactions.create({
          data: {
            reference: `FIN-EXP-${created.id}`,
            branch_id: branchId!,
            shift_session_id: drawerSession.id,
            movement_type: 'petty_expense',
            direction: 'out',
            amount: payment.paidAmount,
            category: 'other',
            description: `مصروف ${created.expense_number}: ${dto.description?.trim() || dto.category.trim()}`,
            created_by: userId,
          },
        });
        await tx.sales_shift_sessions.update({
          where: { id: drawerSession.id },
          data: {
            expected_closing_balance: expectedDrawerBalance(
              availableDrawerCash,
              0,
              -payment.paidAmount,
            ),
          },
        });
      }
      if (!requiresApproval) {
        await this.moduleLedger.postExpenseApproval(
          {
            expenseId: created.id,
            expenseNumber: created.expense_number,
            branchId: created.branch_id ?? undefined,
            expenseDate: created.expense_date,
            totalAmount: toNumber(created.total_amount),
            paidAmount: created.paid_amount != null ? toNumber(created.paid_amount) : undefined,
            payments: payment.payments,
            paymentMethod: created.payment_method,
            createdBy: userId,
          },
          tx,
        );
      }
      return created;
    });
    return { ...this.map(row), drawerDeducted: deductFromDrawer };
  }

  async update(id: number, dto: Partial<UpsertExpenseDto>, user?: JwtUser) {
    const existing = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المصروف غير موجود');
    this.assertBranchAccess(user, existing.branch_id);
    await this.assertCreatorAccess(user, existing.created_by);
    if (dto.branchId != null) this.assertBranchAccess(user, dto.branchId);
    this.assertManualMutation(existing);
    const amount = dto.amount ?? toNumber(existing.amount);
    const taxAmount = dto.taxAmount ?? toNumber(existing.tax_amount);
    const totals = computeExpenseTotal(amount, taxAmount);
    const payment = expensePayments(totals.totalAmount, {
      ...dto,
      paidAmount: dto.paidAmount ?? (existing.paid_amount != null ? toNumber(existing.paid_amount) : existing.payment_status === 'مدفوع' ? toNumber(existing.total_amount) : 0),
      paymentMethod: dto.paymentMethod ?? existing.payment_method,
      payments: dto.payments ?? (Array.isArray(existing.payments) ? existing.payments as unknown as UpsertExpenseDto['payments'] : undefined),
    });
    const row = await this.prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM fin_expenses WHERE id = ${id} FOR UPDATE`);
    await this.assertUnchanged(tx, existing);
    await this.syncDrawer(tx, id, payment.paidAmount, payment.paymentMethod, dto.branchId ?? existing.branch_id);
    const updated = await tx.fin_expenses.update({
      where: { id },
      data: {
        ...(dto.expenseDate !== undefined ? { expense_date: dto.expenseDate } : {}),
        ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
        ...(dto.subCategory !== undefined ? { sub_category: dto.subCategory?.trim() ?? null } : {}),
        amount: totals.amount,
        tax_amount: totals.taxAmount,
        total_amount: totals.totalAmount,
        ...(dto.businessUnit !== undefined ? { business_unit: dto.businessUnit } : {}),
        paid_amount: payment.paidAmount,
        ...(payment.payments ? { payments: payment.payments } : {}),
        payment_method: payment.paymentMethod,
        payment_status: payment.paymentStatus,
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.vendor !== undefined ? { vendor: dto.vendor } : {}),
        ...(dto.invoiceNumber !== undefined ? { invoice_number: dto.invoiceNumber } : {}),
        ...(dto.branchId !== undefined ? { branch_id: dto.branchId } : {}),
        ...(dto.departmentId !== undefined ? { department_id: dto.departmentId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    if (existing.approval_status === EXPENSE_APPROVED) {
      await this.moduleLedger.syncExpense({
        expenseId: id, expenseNumber: updated.expense_number,
        branchId: updated.branch_id ?? undefined, expenseDate: updated.expense_date,
        totalAmount: toNumber(updated.total_amount), paidAmount: payment.paidAmount,
        payments: payment.payments, paymentMethod: updated.payment_method,
        createdBy: user?.sub ?? existing.created_by ?? 0, post: true,
      }, tx);
    }
    return updated;
    });
    return this.map(row);
  }

  async remove(id: number, user?: JwtUser) {
    const existing = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المصروف غير موجود');
    this.assertBranchAccess(user, existing.branch_id);
    await this.assertCreatorAccess(user, existing.created_by);
    this.assertManualMutation(existing);
    await this.prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM fin_expenses WHERE id = ${id} FOR UPDATE`);
    await this.assertUnchanged(tx, existing);
    await this.syncDrawer(tx, id, 0, existing.payment_method, existing.branch_id);
    if (existing.approval_status === EXPENSE_APPROVED) {
      await this.moduleLedger.syncExpense({
        expenseId: id, expenseNumber: existing.expense_number,
        expenseDate: existing.expense_date, totalAmount: toNumber(existing.total_amount),
        createdBy: user?.sub ?? existing.created_by ?? 0, post: false,
      }, tx);
    }
    await tx.fin_expenses.update({
      where: { id },
      data: { is_deleted: true, deleted_at: new Date() },
    });
    });
    return { success: true };
  }

  async approve(id: number, userId: number, user?: JwtUser) {
    const existing = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المصروف غير موجود');
    this.assertBranchAccess(user, existing.branch_id);
    await this.assertCreatorAccess(user, existing.created_by);
    if (existing.approval_status === EXPENSE_APPROVED) {
      throw new BadRequestException('المصروف معتمد مسبقاً');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM fin_expenses WHERE id = ${id} FOR UPDATE`);
      await this.assertUnchanged(tx, existing);
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
          paidAmount: updated.paid_amount != null ? toNumber(updated.paid_amount) : updated.payment_status === 'مدفوع' ? toNumber(updated.total_amount) : 0,
          payments: Array.isArray(updated.payments) ? updated.payments as unknown as UpsertExpenseDto['payments'] : undefined,
          paymentMethod: updated.payment_method,
          createdBy: userId,
        },
        tx,
      );
      return updated;
    });
    return this.map(row);
  }

  private assertManualMutation(row: Prisma.fin_expensesGetPayload<object>) {
    if (row.notes === 'مستند تلقائي مربوط بالنظام' || row.expense_number.startsWith('CAFE-')) {
      throw new BadRequestException('عدّل المستند التلقائي من شاشة مصدره');
    }
  }

  private async assertUnchanged(tx: Prisma.TransactionClient, existing: Prisma.fin_expensesGetPayload<object>) {
    const current = await tx.fin_expenses.findUnique({ where: { id: existing.id } });
    if (!current || current.is_deleted) throw new NotFoundException('المصروف غير موجود');
    if (current.updated_at.getTime() !== existing.updated_at.getTime()) {
      throw new BadRequestException('المصروف اتغير أثناء العملية. حدّث الصفحة وحاول تاني');
    }
  }

  private async syncDrawer(tx: Prisma.TransactionClient, id: number, paid: number, method: string | null, branch: number | null) {
    const movement = await tx.sales_cash_drawer_transactions.findFirst({ where: { reference: `FIN-EXP-${id}`, status: 'posted' } });
    if (!movement) return;
    if (paid > 0 && (method !== 'نقدي' || branch !== movement.branch_id)) {
      throw new BadRequestException('المصروف المخصوم من الدرج لازم يفضل نقدي وفي نفس الفرع');
    }
    await tx.$queryRaw(Prisma.sql`SELECT id FROM sales_shift_sessions WHERE id = ${movement.shift_session_id} FOR UPDATE`);
    const session = await tx.sales_shift_sessions.findUnique({ where: { id: movement.shift_session_id } });
    if (!session || session.status !== ShiftSessionStatus.open) {
      throw new BadRequestException('لا يمكن تعديل أو حذف مصروف درج بعد إغلاق ورديته');
    }
    const movements = await tx.sales_cash_drawer_transactions.findMany({ where: {
      shift_session_id: session.id, status: 'posted',
      movement_type: { in: ['petty_expense', 'custody_issue', 'custody_return', 'adjustment'] },
    }, select: { direction: true, amount: true } });
    const adjustments = movements.reduce((sum, row) => sum + (row.direction === 'in' ? toNumber(row.amount) : -toNumber(row.amount)), 0);
    const balance = expectedDrawerBalance(toNumber(session.opening_balance), toNumber(session.total_cash), adjustments)
      + toNumber(movement.amount) - paid;
    if (balance < -0.001) throw new BadRequestException('رصيد الدرج لا يكفي للمبلغ المدفوع');
    await tx.sales_cash_drawer_transactions.update({ where: { id: movement.id }, data: { amount: paid } });
    await tx.sales_shift_sessions.update({ where: { id: session.id }, data: { expected_closing_balance: balance } });
  }

  async reject(id: number, dto: RejectExpenseDto, userId: number, user?: JwtUser) {
    const existing = await this.prisma.fin_expenses.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException('المصروف غير موجود');
    this.assertBranchAccess(user, existing.branch_id);
    await this.assertCreatorAccess(user, existing.created_by);
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
