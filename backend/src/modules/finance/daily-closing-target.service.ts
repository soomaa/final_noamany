import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { clampManagerDays, managerKind } from '../../common/utils/manager-scope.util';
import { Prisma, QuickSaleStatus } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isSystemAdmin } from '../../common/utils/system-admin.util';
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
  gender?: 'male' | 'female';
};

type CaptainBucket = { count: number; afterDiscount: Prisma.Decimal; paid: Prisma.Decimal };

/** Café category name → target bucket (same naming rule as the daily closing). */
function saleBucket(categoryName: string | null | undefined): 'protein' | 'bar' | 'other' {
  const name = String(categoryName ?? '').trim();
  if (/بروتين|protein/i.test(name)) return 'protein';
  if (/بار|bar/i.test(name)) return 'bar';
  return 'other';
}

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
          cafe_category: { select: { id: true, daily_closing_classification: true, name_ar: true } },
          items: { select: { cafe_product_id: true, line_total: true } },
        },
      });
      return { rows: await this.splitMixedCategorySales(rows), classificationAvailable: true };
    } catch (error) {
      if (!this.isMissingDailyClosingSalesDimension(error)) throw error;
      const rows = await this.prisma.sales_quick_sales.findMany({ where, select: salesSelect });
      return { rows: rows as unknown as Array<Record<string, unknown>>, classificationAvailable: false };
    }
  }

  /**
   * An invoice whose items belong to several café categories (allowed by the POS setting
   * allow_mixed_categories) is split into one row per category, each with its share of the collected
   * amount and payments by the items' totals, so بار and بروتين are counted correctly.
   */
  private async splitMixedCategorySales(rows: Array<Record<string, any>>): Promise<Array<Record<string, unknown>>> {
    const productIds = [...new Set(rows.flatMap((row) => (row.items ?? []).map((item: any) => item.cafe_product_id).filter((id: unknown): id is number => typeof id === 'number')))];
    const products = productIds.length
      ? await this.prisma.cafe_products.findMany({
          where: { id: { in: productIds } },
          select: { id: true, category: { select: { id: true, daily_closing_classification: true, name_ar: true } } },
        })
      : [];
    const categoryOf = new Map(products.map((product) => [product.id, product.category]));
    return rows.flatMap((row) => {
      const byCategory = new Map<number, { category: any; amount: Prisma.Decimal }>();
      for (const item of row.items ?? []) {
        const category = item.cafe_product_id != null ? categoryOf.get(item.cafe_product_id) : null;
        const key = category?.id ?? row.cafe_category?.id ?? 0;
        const entry = byCategory.get(key) ?? { category: category ?? row.cafe_category, amount: new Prisma.Decimal(0) };
        entry.amount = entry.amount.plus(this.money(item.line_total));
        byCategory.set(key, entry);
      }
      const parts = [...byCategory.values()];
      const total = parts.reduce((sum, part) => sum.plus(part.amount), new Prisma.Decimal(0));
      if (parts.length <= 1 || total.lte(0)) return [row];
      const collected = this.money(row.collected_amount);
      return parts.map((part) => {
        const share = part.amount.div(total);
        return {
          ...row,
          cafe_category: part.category,
          collected_amount: collected.times(share),
          payments: Array.isArray(row.payments)
            ? row.payments.map((payment: any) => ({ ...payment, amount: this.money(payment.amount).times(share) }))
            : row.payments,
        };
      });
    });
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
    // Staff are locked to their branch (Tanta main also covers Tanta Up/Down); admins choose.
    const allowed = this.branchScope.allowedBranchIds(user);
    if (allowed !== null && allowed.length === 0) {
      throw new ForbiddenException('لا يوجد فرع مرتبط بالمستخدم');
    }
    if (requested != null && allowed !== null && !allowed.includes(requested)) {
      throw new ForbiddenException('الفرع المحدد خارج نطاق الصلاحية');
    }
    return this.expandedBranchIds(requested != null ? [requested] : allowed);
  }

  private effectiveDates(query: DailyClosingQuery, user: JwtUser): { fromDate: string; toDate: string } {
    const today = localDateString();
    if (!isSystemAdmin(user)) return { fromDate: today, toDate: today };
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

  /**
   * The employee whose target is shown. A regular employee only ever sees their own target.
   * Admins and branch managers pick an employee, or get every employee of the branch (null).
   */
  private async targetEmployeeId(
    query: TargetReportQuery,
    user: JwtUser,
    branchIds: number[] | null,
  ): Promise<number | null> {
    const requestedEmployeeId = query.employeeId ?? query.targetEmployeeId;
    if (!isSystemAdmin(user) && user.level !== 3 && !managerKind(user)) {
      if (!user.emp_code) throw new ForbiddenException('لا يوجد موظف مرتبط بالمستخدم');
      if (requestedEmployeeId && requestedEmployeeId !== user.emp_code) {
        throw new ForbiddenException('الموظف المحدد خارج نطاق الصلاحية');
      }
      return user.emp_code;
    }
    if (!requestedEmployeeId) return null;
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
    // Branch manager / section supervisor: the current and the previous month (client sheet, 22 Nov).
    const managerRange = clampManagerDays(user, 'twoMonths', query.fromDate ?? currentMonth.fromDate, query.toDate ?? currentMonth.toDate);
    if (managerRange.clamped) return { fromDate: managerRange.from!, toDate: managerRange.to! };
    // Everyone else: any days inside the current month (client video, 23 Nov: «من يوم ٤ لحد يوم ٦»).
    if (!isSystemAdmin(user)) {
      const clamp = (d: string | undefined, fallback: string) => (!d || d < currentMonth.fromDate || d > currentMonth.toDate ? fallback : d.slice(0, 10));
      const fromDate = clamp(query.fromDate, currentMonth.fromDate);
      const toDate = clamp(query.toDate, currentMonth.toDate);
      if (fromDate > toDate) throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');
      return { fromDate, toDate };
    }
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
    const genderWhere = query.gender === 'male' || query.gender === 'female' ? { gender: query.gender } : {};
    const [subscriptions, lockers, sales] = await Promise.all([
      operation === 'sales'
        ? Promise.resolve([])
        : this.prisma.club_subscriptions.findMany({
            where: {
              ...range('registration_date'),
              ...(employeeId == null ? { employee_id: { not: null } } : { employee_id: employeeId }),
              ...(branchIds == null ? {} : { branch_id: branchWhere }),
              ...genderWhere,
            },
            include: {
              type: { select: { name: true, is_part_of_target: true } },
              member: { select: { member_code: true } },
            },
          }),
      operation === 'sales'
        ? Promise.resolve([])
        : this.prisma.club_locker_subscriptions.findMany({
            where: {
              ...range('subscription_start_date'),
              ...(employeeId == null ? { recommended_employee_id: { not: null } } : { recommended_employee_id: employeeId }),
              ...(branchIds == null ? {} : { sub_branch_id: branchWhere }),
              ...genderWhere,
            },
            include: { type: { select: { name: true } }, member: { select: { member_code: true } } },
          }),
      operation === 'subscriptions'
        ? Promise.resolve([])
        : this.prisma.sales_quick_sales.findMany({
            where: {
              status: QuickSaleStatus.completed,
              ...range('sale_date'),
              ...(employeeId == null ? { target_employee_id: { not: null } } : { target_employee_id: employeeId }),
              ...(branchIds == null ? {} : { branch_id: branchWhere }),
              ...genderWhere,
            },
            include: { cafe_category: { select: { name_ar: true } } },
          }),
    ]);

    const rawRows = [
      ...subscriptions
        .filter((row: any) => row.type?.is_part_of_target === true)
        .map((row: any) => ({
          operation: 'اشتراك نادي',
          kind: 'subscription' as const,
          employeeId: row.employee_id as number | null,
          customerName: row.customer_name ?? null,
          memberCode: row.member?.member_code ?? null,
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
        employeeId: row.recommended_employee_id as number | null,
        customerName: row.customer_name ?? null,
        memberCode: row.member?.member_code ?? null,
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
        employeeId: row.target_employee_id as number | null,
        customerName: row.customer_name ?? null,
        memberCode: null as string | null,
        // The product category (بار / بروتين …) identifies a sale for target follow-up.
        type: row.cafe_category?.name_ar ?? 'مبيعات كافيه',
        saleBucket: saleBucket(row.cafe_category?.name_ar),
        beforeDiscount: this.format(this.money(row.subtotal)),
        discount: this.format(this.money(row.discount_amount)),
        afterDiscount: this.format(this.money(row.subtotal).minus(this.money(row.discount_amount))),
        paid: this.format(this.money(row.collected_amount)),
        date: row.sale_date,
      })),
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const employeeIds = [...new Set(rawRows.map((row) => row.employeeId).filter((id): id is number => id != null))];
    const employeeNames = employeeIds.length
      ? new Map((await this.prisma.employees.findMany({ where: { id: { in: employeeIds } }, select: { id: true, employee: true } }))
          .map((employee) => [employee.id, employee.employee ?? null] as const))
      : new Map<number, string | null>();
    const rows = rawRows.map((row) => ({ ...row, employeeName: row.employeeId != null ? employeeNames.get(row.employeeId) ?? null : null }));
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
    // Old "تقرير الكباتن خلال فترة": per captain, target-plan subscriptions, protein and other
    // café sales they recommended, and lockers. InBody invoices have no captain field, so they
    // cannot be attributed to a captain yet.
    const empty = (): CaptainBucket => ({ count: 0, afterDiscount: new Prisma.Decimal(0), paid: new Prisma.Decimal(0) });
    const captains = new Map<number, { employeeId: number; employeeName: string | null; subscriptions: CaptainBucket; protein: CaptainBucket; bar: CaptainBucket; otherSales: CaptainBucket; lockers: CaptainBucket }>();
    for (const row of rows) {
      if (row.employeeId == null) continue;
      let captain = captains.get(row.employeeId);
      if (!captain) {
        captain = { employeeId: row.employeeId, employeeName: row.employeeName, subscriptions: empty(), protein: empty(), bar: empty(), otherSales: empty(), lockers: empty() };
        captains.set(row.employeeId, captain);
      }
      const bucket = row.kind === 'subscription'
        ? captain.subscriptions
        : row.kind === 'locker'
          ? captain.lockers
          : (row as { saleBucket?: string }).saleBucket === 'protein'
            ? captain.protein
            : (row as { saleBucket?: string }).saleBucket === 'bar' ? captain.bar : captain.otherSales;
      bucket.count += 1;
      bucket.afterDiscount = bucket.afterDiscount.plus(row.afterDiscount);
      bucket.paid = bucket.paid.plus(row.paid);
    }
    const fmtBucket = (b: CaptainBucket) => ({ count: b.count, afterDiscount: this.format(b.afterDiscount), paid: this.format(b.paid) });
    const byCaptain = [...captains.values()]
      .map((c) => {
        const total = c.subscriptions.paid.plus(c.protein.paid).plus(c.bar.paid).plus(c.otherSales.paid).plus(c.lockers.paid);
        return {
          employeeId: c.employeeId,
          employeeName: c.employeeName,
          subscriptions: fmtBucket(c.subscriptions),
          protein: fmtBucket(c.protein),
          bar: fmtBucket(c.bar),
          otherSales: fmtBucket(c.otherSales),
          lockers: fmtBucket(c.lockers),
          totalPaid: this.format(total),
          _sort: Number(total),
        };
      })
      .sort((a, b) => b._sort - a._sort)
      .map(({ _sort: _ignored, ...row }) => row);
    return {
      period: { fromDate, toDate },
      branchIds,
      employeeId,
      rows,
      byCaptain,
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
