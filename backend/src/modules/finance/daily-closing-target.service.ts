import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, QuickSaleStatus } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../sales/sales.utils';
import { REFUND_EXPENSE_CATEGORY } from './finance.utils';
import { INITIAL_PURCHASE_PAYMENT_NOTE } from '../procurement/procurement.utils';

type DailyClosingQuery = {
  branchId?: string;
  fromDate?: string;
  toDate?: string;
  gender?: 'male' | 'female';
};

type ReceiptTotals = { total: string; cash: string; knet: string };
const EXPENSE_CASH_METHODS = new Set(['نقدي', 'نقدى', 'كاش', 'cash']);
type AmountTotals = { total: string };

type TargetReportQuery = {
  branchId?: string;
  employeeId?: number;
  targetEmployeeId?: number;
  operationType?: 'subscriptions' | 'sales' | 'all';
  operation?: 'subscriptions' | 'sales' | 'all';
  fromDate?: string;
  toDate?: string;
};

@Injectable()
export class DailyClosingTargetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private money(value: unknown): Prisma.Decimal {
    if (value instanceof Prisma.Decimal) return value;
    if (value && typeof (value as { toString?: () => string }).toString === 'function') {
      return new Prisma.Decimal((value as { toString: () => string }).toString());
    }
    return new Prisma.Decimal(0);
  }

  private format(value: Prisma.Decimal): string {
    return value.toDecimalPlaces(2).toFixed(2);
  }

  private total(rows: Array<Record<string, unknown>>, field: string): Prisma.Decimal {
    return rows.reduce(
      (sum, row) => sum.plus(this.money(row[field])),
      new Prisma.Decimal(0),
    );
  }

  private receiptTotals(
    rows: Array<Record<string, unknown>>,
    amountField: string,
  ): ReceiptTotals {
    let total = new Prisma.Decimal(0);
    let cash = new Prisma.Decimal(0);
    let knet = new Prisma.Decimal(0);
    for (const row of rows) {
      const amount = this.money(row[amountField]);
      total = total.plus(amount);
      if (row.payment_method == null) continue;
      if (row.payment_method === 'cash') cash = cash.plus(amount);
      else if (row.payment_method === 'mixed' && Array.isArray(row.payments) && row.payments.length) {
        // Split payment: the cash portion is cash, everything else (card/wallet/transfer) is KNET.
        const cashPart = Prisma.Decimal.min(
          amount,
          (row.payments as Array<{ method: string; amount: unknown }>)
            .filter((payment) => payment.method === 'cash')
            .reduce((sum, payment) => sum.plus(this.money(payment.amount)), new Prisma.Decimal(0)),
        );
        cash = cash.plus(cashPart);
        knet = knet.plus(amount.minus(cashPart));
      } else knet = knet.plus(amount);
    }
    return { total: this.format(total), cash: this.format(cash), knet: this.format(knet) };
  }

  private expandedBranchIds(branchIds: number[] | null): number[] | null {
    if (branchIds == null) return null;
    return [...new Set(branchIds.flatMap((id) => (id === 3 ? [3, 8, 9] : [id])))];
  }

  /**
   * Keep daily closing available while an older production database awaits the
   * additive cafe reporting migrations. Both the category relation and its
   * classification column are optional enhancements to this report.
   */
  private isMissingDailyClosingSalesDimension(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: unknown; message?: unknown; meta?: { column?: unknown } };
    const text = `${String(candidate.message ?? '')} ${String(candidate.meta?.column ?? '')}`.toLowerCase();
    // A generated Prisma client can reject this optional relation before it
    // reaches the database ("Unknown field"), while an older database rejects
    // it with P2022. In either case the report has a safe base-query fallback.
    return text.includes('daily_closing_classification') || text.includes('cafe_category_id');
  }

  private async dailySales(branchIds: number[] | null, fromDate: string, toDate: string) {
    const where = {
      status: QuickSaleStatus.completed,
      sale_date: { gte: fromDate, lte: toDate },
      ...(branchIds == null ? {} : { branch_id: { in: branchIds } }),
    };
    const salesSelect = { collected_amount: true, payment_method: true, payments: { select: { method: true, amount: true } } } as const;
    try {
      const rows = await this.prisma.sales_quick_sales.findMany({
        where,
        select: {
          ...salesSelect,
          cafe_category: { select: { daily_closing_classification: true, name_ar: true } },
        },
      });
      return { rows: rows as unknown as Array<Record<string, unknown>>, classificationAvailable: true };
    } catch (error) {
      if (!this.isMissingDailyClosingSalesDimension(error)) throw error;
      const rows = await this.prisma.sales_quick_sales.findMany({ where, select: salesSelect });
      return { rows: rows as unknown as Array<Record<string, unknown>>, classificationAvailable: false };
    }
  }

  private isMissingColumn(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: unknown };
    return candidate.code === 'P2022';
  }

  private effectiveBranches(query: DailyClosingQuery, user: JwtUser): number[] | null {
    const requested = query.branchId && query.branchId !== 'all' ? Number(query.branchId) : null;
    if (requested != null && (!Number.isInteger(requested) || requested <= 0)) {
      throw new BadRequestException('معرف الفرع غير صالح');
    }
    if (user.level === 1) {
      const allowed = this.branchScope.resolveListFilter(user, requested ?? null);
      if (requested != null && allowed !== null && !allowed.includes(requested)) {
        throw new ForbiddenException('الفرع المحدد خارج نطاق الصلاحية');
      }
      return this.expandedBranchIds(requested == null ? allowed : [requested]);
    }
    if (!Number.isInteger(user.branch) || user.branch <= 0) {
      throw new ForbiddenException('لا يوجد فرع مرتبط بالمستخدم');
    }
    if (requested != null && requested !== user.branch) {
      throw new ForbiddenException('الفرع المحدد خارج نطاق الصلاحية');
    }
    return this.expandedBranchIds([user.branch]);
  }

  private effectiveDates(query: DailyClosingQuery, user: JwtUser): { fromDate: string; toDate: string } {
    const today = localDateString();
    if (user.level === 2 || user.level === 3) return { fromDate: today, toDate: today };
    const fromDate = query.fromDate ?? today;
    const toDate = query.toDate ?? fromDate;
    if (fromDate > toDate) throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');
    return { fromDate, toDate };
  }

  async dailyClosing(query: DailyClosingQuery, user: JwtUser) {
    const branchIds = this.effectiveBranches(query, user);
    const { fromDate, toDate } = this.effectiveDates(query, user);
    const range = (field: string) => ({ [field]: { gte: fromDate, lte: toDate } });
    const branchWhere = branchIds == null ? {} : { in: branchIds };

    const expensesWhere = {
      is_deleted: false,
      ...range('expense_date'),
      ...(branchIds == null ? {} : { branch_id: branchWhere }),
      ...(query.gender ? { gender_scope: query.gender } : {}),
    };
    const expensesPromise = (async () => {
      try {
        return await this.prisma.fin_expenses.findMany({
          where: expensesWhere,
          select: { total_amount: true, category: true, invoice_number: true, payment_method: true },
        });
      } catch (error) {
        // قاعدة بيانات قديمة تنقصها أعمدة التقسيم (parent_id/nesba/main_value):
        // أعد المحاولة بدون فلتر الجنس إن كان هو سبب التعارض، ثم بدون select موسّع.
        if (!this.isMissingColumn(error)) throw error;
        if (query.gender) {
          try {
            return await this.prisma.fin_expenses.findMany({
              where: {
                is_deleted: false,
                ...range('expense_date'),
                ...(branchIds == null ? {} : { branch_id: branchWhere }),
              },
              select: { total_amount: true, category: true, invoice_number: true, payment_method: true },
            });
          } catch {
            // تجاهل وأكمل للفallback الأخير
          }
        }
        throw error;
      }
    })();

    const [subscriptions, lockers, dailySales, purchaseReturnRows, purchases, supplierPayments, expenses, subscriptionRefunds, refundedSales] = await Promise.all([
      this.prisma.club_subscriptions.findMany({
        where: { ...range('registration_date'), ...(branchIds == null ? {} : { branch_id: branchWhere }) },
        select: { private_package_id: true, paid_amount: true, payment_method: true },
      }),
      this.prisma.club_locker_subscriptions.findMany({
        where: { ...range('subscription_start_date'), ...(branchIds == null ? {} : { sub_branch_id: branchWhere }) },
        select: { paid_amount: true, payment_method: true },
      }),
      this.dailySales(branchIds, fromDate, toDate),
      // Only returns that were actually posted (stock went back to the supplier) count.
      this.prisma.prc_purchase_returns.findMany({
        where: { is_deleted: false, stock_posted: true, ...range('return_date'), ...(branchIds == null ? {} : { branch_id: branchWhere }) },
        select: { total_amount: true },
      }),
      // المشتريات = cash paid at purchase time (purchase orders / cafe purchase invoices).
      this.prisma.prc_supplier_payments.findMany({
        where: { is_deleted: false, notes: INITIAL_PURCHASE_PAYMENT_NOTE, ...range('payment_date'), ...(branchIds == null ? {} : { branch_id: branchWhere }) },
        select: { payment_amount: true },
      }),
      // حساب موردين = later payments of supplier debt.
      this.prisma.prc_supplier_payments.findMany({
        where: {
          is_deleted: false,
          OR: [{ notes: null }, { notes: { not: INITIAL_PURCHASE_PAYMENT_NOTE } }],
          ...range('payment_date'),
          ...(branchIds == null ? {} : { branch_id: branchWhere }),
        },
        select: { payment_amount: true },
      }),
      expensesPromise,
      this.prisma.club_subscription_refunds.findMany({
        where: { status: 'completed', ...range('refund_date'), ...(branchIds == null ? {} : { branch_id: branchWhere }) },
        select: { refund_amount: true, invoice_number: true },
      }),
      // Refunded sales are already excluded from sales revenue (only completed sales count), so they are
      // reported for information only and never deducted again.
      this.prisma.sales_quick_sales.findMany({
        where: { status: QuickSaleStatus.refunded, ...range('sale_date'), ...(branchIds == null ? {} : { branch_id: branchWhere }) },
        select: { collected_amount: true, payment_method: true, payments: { select: { method: true, amount: true } } },
      }),
    ]);

    const regularSubscriptions = this.receiptTotals(subscriptions.filter((row: any) => row.private_package_id == null), 'paid_amount');
    const privateSubscriptions = this.receiptTotals(subscriptions.filter((row: any) => row.private_package_id != null), 'paid_amount');
    const lockersTotal = this.receiptTotals(lockers, 'paid_amount');
    // The category name is the classification: بروتين → protein, بار → normal (عادي);
    // any other category (e.g. مستهلكات) is not part of the closing. The saved classification
    // is only used when the sale's category has no name.
    const salesBucket = (row: any) => {
      const name = String(row.cafe_category?.name_ar ?? '').trim();
      if (!name) {
        const explicit = row.cafe_category?.daily_closing_classification;
        return explicit === 'NORMAL' || explicit === 'PROTEIN' ? explicit : null;
      }
      if (/بروتين|protein/i.test(name)) return 'PROTEIN';
      if (/بار|bar/i.test(name)) return 'NORMAL';
      return null;
    };
    const normalSales = this.receiptTotals(dailySales.classificationAvailable ? dailySales.rows.filter((row: any) => salesBucket(row) === 'NORMAL') : dailySales.rows, 'collected_amount');
    const proteinSales = this.receiptTotals(dailySales.classificationAvailable ? dailySales.rows.filter((row: any) => salesBucket(row) === 'PROTEIN') : [], 'collected_amount');
    const purchaseReturns: AmountTotals = { total: this.format(this.total(purchaseReturnRows, 'total_amount')) };
    const purchasesTotal: AmountTotals = { total: this.format(this.total(purchases, 'payment_amount')) };
    const supplierPaymentsTotal: AmountTotals = { total: this.format(this.total(supplierPayments, 'payment_amount')) };
    const refundInvoices = new Set(subscriptionRefunds.map(row => row.invoice_number).filter(Boolean));
    const generalExpenses = expenses.filter(row => !(row.category === REFUND_EXPENSE_CATEGORY && row.invoice_number && refundInvoices.has(row.invoice_number)));
    // Expenses store an Arabic/English payment method label; anything that is not cash is a card/transfer (KNET).
    const expensesTotal: ReceiptTotals = this.receiptTotals(
      generalExpenses.map((row: any) => ({ ...row, payment_method: EXPENSE_CASH_METHODS.has(String(row.payment_method ?? 'نقدي').trim().toLowerCase()) ? 'cash' : 'knet' })),
      'total_amount',
    );
    const salesReturns = this.receiptTotals(refundedSales, 'collected_amount');
    const subscriptionRefundsTotal: AmountTotals = { total: this.format(this.total(subscriptionRefunds, 'refund_amount')) };

    const totalRevenue = new Prisma.Decimal(regularSubscriptions.total)
      .plus(privateSubscriptions.total)
      .plus(lockersTotal.total)
      .plus(normalSales.total)
      .plus(proteinSales.total);
    const totalOutflows = new Prisma.Decimal(purchasesTotal.total)
      .plus(supplierPaymentsTotal.total)
      .plus(expensesTotal.total)
      .plus(subscriptionRefundsTotal.total)
      .minus(purchaseReturns.total);
    const totalCash = new Prisma.Decimal(regularSubscriptions.cash)
      .plus(privateSubscriptions.cash)
      .plus(lockersTotal.cash)
      .plus(normalSales.cash)
      .plus(proteinSales.cash);
    const totalKnet = new Prisma.Decimal(regularSubscriptions.knet)
      .plus(privateSubscriptions.knet)
      .plus(lockersTotal.knet)
      .plus(normalSales.knet)
      .plus(proteinSales.knet);

    return {
      period: { fromDate, toDate },
      branchIds,
      regularSubscriptions,
      privateSubscriptions,
      lockers: lockersTotal,
      normalSales,
      proteinSales,
      purchaseReturns,
      purchases: purchasesTotal,
      supplierPayments: supplierPaymentsTotal,
      expenses: expensesTotal,
      subscriptionRefunds: subscriptionRefundsTotal,
      salesReturns,
      salesClassificationAvailable: dailySales.classificationAvailable,
      totalRevenue: this.format(totalRevenue),
      totalOutflows: this.format(totalOutflows),
      netProfit: this.format(totalRevenue.minus(totalOutflows)),
      totalCash: this.format(totalCash),
      totalKnet: this.format(totalKnet),
    };
  }

  private targetMonth(): { fromDate: string; toDate: string } {
    const today = localDateString();
    const [year, month] = today.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      fromDate: `${year}-${String(month).padStart(2, '0')}-01`,
      toDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  private async targetEmployeeId(
    query: TargetReportQuery,
    user: JwtUser,
    branchIds: number[] | null,
  ): Promise<number> {
    if (user.level === 2) {
      if (!user.emp_code) throw new ForbiddenException('لا يوجد موظف مرتبط بالمستخدم');
      const requestedEmployeeId = query.employeeId ?? query.targetEmployeeId;
      if (requestedEmployeeId && requestedEmployeeId !== user.emp_code) {
        throw new ForbiddenException('الموظف المحدد خارج نطاق الصلاحية');
      }
      return user.emp_code;
    }
    const requestedEmployeeId = query.employeeId ?? query.targetEmployeeId;
    if (!requestedEmployeeId) {
      throw new BadRequestException('يجب تحديد موظف التارجت');
    }
    const employee = await this.prisma.employees.findFirst({
      where: {
        id: requestedEmployeeId,
        ...(branchIds == null ? {} : { branch_id_fk: { in: branchIds } }),
      },
      select: { id: true },
    });
    if (!employee) throw new ForbiddenException('الموظف المحدد خارج نطاق الفروع المسموح بها');
    return employee.id;
  }

  private targetDates(query: TargetReportQuery, user: JwtUser): { fromDate: string; toDate: string } {
    const currentMonth = this.targetMonth();
    if (user.level === 2 || user.level === 3) return currentMonth;
    const fromDate = query.fromDate ?? currentMonth.fromDate;
    const toDate = query.toDate ?? currentMonth.toDate;
    if (fromDate > toDate) throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');
    return { fromDate, toDate };
  }

  async targetReport(query: TargetReportQuery, user: JwtUser) {
    const branchIds = this.effectiveBranches(query, user);
    const employeeId = await this.targetEmployeeId(query, user, branchIds);
    const { fromDate, toDate } = this.targetDates(query, user);
    const branchWhere = branchIds == null ? {} : { in: branchIds };
    const range = (field: string) => ({ [field]: { gte: fromDate, lte: toDate } });
    const operation = query.operationType ?? query.operation ?? 'all';
    const [subscriptions, lockers, sales] = await Promise.all([
      operation === 'sales'
        ? Promise.resolve([])
        : this.prisma.club_subscriptions.findMany({
            where: {
              ...range('registration_date'),
              employee_id: employeeId,
              ...(branchIds == null ? {} : { branch_id: branchWhere }),
            },
            include: { type: { select: { name: true, is_part_of_target: true } } },
          }),
      operation === 'sales'
        ? Promise.resolve([])
        : this.prisma.club_locker_subscriptions.findMany({
            where: {
              ...range('subscription_start_date'),
              recommended_employee_id: employeeId,
              ...(branchIds == null ? {} : { sub_branch_id: branchWhere }),
            },
            include: { type: { select: { name: true } } },
          }),
      operation === 'subscriptions'
        ? Promise.resolve([])
        : this.prisma.sales_quick_sales.findMany({
            where: {
              status: QuickSaleStatus.completed,
              ...range('sale_date'),
              target_employee_id: employeeId,
              ...(branchIds == null ? {} : { branch_id: branchWhere }),
            },
            include: { cafe_category: { select: { name_ar: true } } },
          }),
    ]);

    const rows = [
      ...subscriptions
        .filter((row: any) => row.type?.is_part_of_target === true)
        .map((row: any) => ({
          operation: 'اشتراك نادي',
          kind: 'subscription' as const,
          type: row.type?.name ?? row.subscription_type ?? 'اشتراك',
          beforeDiscount: this.format(this.money(row.subscription_value)),
          discount: this.format(this.money(row.discount_value)),
          afterDiscount: this.format(this.money(row.subscription_value).minus(this.money(row.discount_value))),
          paid: this.format(this.money(row.paid_amount)),
          date: row.registration_date,
        })),
      ...lockers.map((row: any) => ({
        operation: 'اشتراك لوكر',
        kind: 'locker' as const,
        type: row.type?.name ?? 'لوكر',
        beforeDiscount: this.format(this.money(row.subscription_value)),
        discount: this.format(new Prisma.Decimal(0)),
        afterDiscount: this.format(this.money(row.subscription_value)),
        paid: this.format(this.money(row.paid_amount)),
        date: row.subscription_start_date,
      })),
      ...sales.map((row: any) => ({
        operation: 'مبيعات كافيه',
        kind: 'sale' as const,
        // The product category (بار / بروتين …) identifies a sale for target follow-up.
        type: row.cafe_category?.name_ar ?? 'مبيعات كافيه',
        beforeDiscount: this.format(this.money(row.subtotal)),
        discount: this.format(this.money(row.discount_amount)),
        afterDiscount: this.format(this.money(row.subtotal).minus(this.money(row.discount_amount))),
        paid: this.format(this.money(row.collected_amount)),
        date: row.sale_date,
      })),
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const totals = rows.reduce(
      (sum, row) => ({
        beforeDiscount: sum.beforeDiscount.plus(row.beforeDiscount),
        discount: sum.discount.plus(row.discount),
        afterDiscount: sum.afterDiscount.plus(row.afterDiscount),
        paid: sum.paid.plus(row.paid),
      }),
      {
        beforeDiscount: new Prisma.Decimal(0),
        discount: new Prisma.Decimal(0),
        afterDiscount: new Prisma.Decimal(0),
        paid: new Prisma.Decimal(0),
      },
    );
    return {
      period: { fromDate, toDate },
      branchIds,
      employeeId,
      rows,
      subscriptionTotal: this.format(this.total(rows.filter((row) => row.operation === 'اشتراك نادي'), 'paid')),
      lockerTotal: this.format(this.total(rows.filter((row) => row.operation === 'اشتراك لوكر'), 'paid')),
      salesTotal: this.format(this.total(rows.filter((row) => row.operation === 'مبيعات كافيه'), 'paid')),
      grandTotal: this.format(totals.paid),
      totals: {
        beforeDiscount: this.format(totals.beforeDiscount),
        discount: this.format(totals.discount),
        afterDiscount: this.format(totals.afterDiscount),
        paid: this.format(totals.paid),
      },
    };
  }
}
