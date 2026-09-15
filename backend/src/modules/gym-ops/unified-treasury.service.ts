import { Injectable } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExportService, ExportColumn } from '../../common/export/export.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubDashboardService } from '../club-dashboard/club-dashboard.service';
import { resolveTreasuryPeriod } from './treasury-range.util';

export interface TreasuryEntry {
  source: string;
  sourceLabel: string;
  customerName: string;
  amount: number;
  paymentMethod: string;
  reference?: string;
  time?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  receipt: 'إيصالات',
  subscription: 'اشتراكات',
  'subscription-special': 'اشتراكات خاصة',
  'subscription-time': 'اشتراكات زمنية',
  locker: 'خزائن',
  spa: 'سبا',
  inbody: 'InBody',
  'quick-sale': 'مبيعات POS',
  revenue: 'إيرادات',
  expense: 'مصروفات',
};

@Injectable()
export class UnifiedTreasuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clubDashboard: ClubDashboardService,
    private readonly exportService: ExportService,
    private readonly branchScope: BranchScopeService,
  ) {}

  /** Aggregate cash sources for a day, range, or all time. */
  async daily(
    params: { date?: string; branchId?: number; startDate?: string; endDate?: string; dateFrom?: string; dateTo?: string },
    user?: JwtUser,
  ) {
    const {
      dateFrom,
      dateTo,
      periodMode,
      summaryOnly,
      detailRangeLimitDays,
    } = resolveTreasuryPeriod({
      date: params.date,
      dateFrom: params.dateFrom || params.startDate,
      dateTo: params.dateTo || params.endDate,
    });

    const scopedBranches = this.branchScope.resolveListFilter(user, params.branchId ?? null);
    const branchFilter = scopedBranches === null ? {} : { branch_id: { in: scopedBranches } };

    const dateEqOrRange = (field: string) => {
      if (!dateFrom || !dateTo) return {};
      if (dateFrom === dateTo) return { [field]: dateFrom };
      return { [field]: { gte: dateFrom, lte: dateTo } };
    };

    if (summaryOnly) {
      const [clubTreasury, quickSales, revenues, expenses] = await Promise.all([
        this.clubDashboard.treasury(
          {
            dateFrom: dateFrom ?? undefined,
            dateTo: dateTo ?? undefined,
            branchId: params.branchId != null ? String(params.branchId) : undefined,
          },
          user,
        ),
        this.prisma.sales_quick_sales.groupBy({
          by: ['payment_method'],
          where: {
            ...dateEqOrRange('sale_date'),
            status: 'completed',
            ...branchFilter,
          },
          _sum: { total_amount: true },
          _count: { _all: true },
        }),
        this.prisma.fin_revenues.groupBy({
          by: ['payment_method'],
          where: {
            ...dateEqOrRange('revenue_date'),
            is_deleted: false,
            payment_status: { in: ['مدفوع', 'paid'] },
            OR: [{ source_module: null }, { source_module: '' }],
            ...branchFilter,
          },
          _sum: { net_amount: true },
          _count: { _all: true },
        }),
        this.prisma.fin_expenses.aggregate({
          where: {
            ...dateEqOrRange('expense_date'),
            is_deleted: false,
            payment_status: { in: ['مدفوع', 'paid'] },
            ...branchFilter,
          },
          _sum: { total_amount: true },
        }),
      ]);

      const byMethod: Record<string, { count: number; total: number }> = {};
      const bySource: Record<string, { count: number; total: number }> = {};
      const add = (source: string, method: string, count: number, amount: unknown) => {
        const total = Number(amount ?? 0);
        const normalizedMethod = this.normalizeMethod(method);
        const methodBucket = byMethod[normalizedMethod] ?? { count: 0, total: 0 };
        methodBucket.count += count;
        methodBucket.total += total;
        byMethod[normalizedMethod] = methodBucket;
        const sourceBucket = bySource[source] ?? { count: 0, total: 0 };
        sourceBucket.count += count;
        sourceBucket.total += total;
        bySource[source] = sourceBucket;
      };

      for (const [method, bucket] of Object.entries(clubTreasury.byMethodSummary)) {
        const normalizedMethod = this.normalizeMethod(method);
        const methodBucket = byMethod[normalizedMethod] ?? { count: 0, total: 0 };
        methodBucket.count += bucket.count;
        methodBucket.total += bucket.total;
        byMethod[normalizedMethod] = methodBucket;
      }
      for (const [source, bucket] of Object.entries(clubTreasury.bySource)) {
        bySource[source] = { ...bucket };
      }
      quickSales.forEach((row) =>
        add('quick-sale', row.payment_method, row._count._all, row._sum.total_amount),
      );
      revenues.forEach((row) =>
        add('revenue', row.payment_method, row._count._all, row._sum.net_amount),
      );

      const grandTotal = Object.values(bySource).reduce(
        (sum, bucket) => sum + bucket.total,
        0,
      );
      const grandCount = Object.values(bySource).reduce(
        (sum, bucket) => sum + bucket.count,
        0,
      );
      const totalExpenses = Number(expenses._sum.total_amount ?? 0);

      return {
        date: dateFrom && dateTo && dateFrom === dateTo ? dateFrom : null,
        dateFrom,
        dateTo,
        periodMode,
        branchId: scopedBranches?.length === 1 ? scopedBranches[0] : null,
        grandTotal,
        grandCount,
        totalExpenses,
        netCash: grandTotal - totalExpenses,
        byMethod,
        bySource,
        entries: [] as TreasuryEntry[],
        summaryOnly: true,
        detailRangeLimitDays,
      };
    }

    const [clubTreasury, quickSales, revenues, expenses] = await Promise.all([
      this.clubDashboard.treasury(
        {
          dateFrom: dateFrom ?? undefined,
          dateTo: dateTo ?? undefined,
          branchId: params.branchId != null ? String(params.branchId) : undefined,
        },
        user,
      ),
      this.prisma.sales_quick_sales.findMany({
        where: {
          ...dateEqOrRange('sale_date'),
          status: 'completed',
          ...branchFilter,
        },
        select: {
          sale_number: true, customer_name: true, total_amount: true,
          payment_method: true, sale_time: true,
        },
      }),
      this.prisma.fin_revenues.findMany({
        where: {
          ...dateEqOrRange('revenue_date'),
          is_deleted: false,
          payment_status: { in: ['مدفوع', 'paid'] },
          ...branchFilter,
        },
      }),
      this.prisma.fin_expenses.findMany({
        where: {
          ...dateEqOrRange('expense_date'),
          is_deleted: false,
          payment_status: { in: ['مدفوع', 'paid'] },
          ...branchFilter,
        },
      }),
    ]);

    const entries: TreasuryEntry[] = [];

    for (const e of clubTreasury.entries) {
      entries.push({
        source: e.source,
        sourceLabel: SOURCE_LABELS[e.source] ?? e.source,
        customerName: e.customerName,
        amount: e.amount,
        paymentMethod: this.normalizeMethod(e.paymentMethod),
      });
    }

    for (const s of quickSales) {
      entries.push({
        source: 'quick-sale',
        sourceLabel: SOURCE_LABELS['quick-sale'],
        customerName: s.customer_name,
        amount: Number(s.total_amount),
        paymentMethod: this.normalizeMethod(s.payment_method),
        reference: s.sale_number,
        time: s.sale_time,
      });
    }

    for (const r of revenues) {
      if (r.source_module) continue;
      entries.push({
        source: 'revenue',
        sourceLabel: SOURCE_LABELS.revenue,
        customerName: r.customer_name ?? '—',
        amount: Number(r.net_amount),
        paymentMethod: this.normalizeMethod(r.payment_method),
        reference: r.revenue_number,
      });
    }

    const byMethod: Record<string, { count: number; total: number }> = {};
    const bySource: Record<string, { count: number; total: number }> = {};
    let grandTotal = 0;
    let grandCount = 0;

    for (const e of entries) {
      grandTotal += e.amount;
      grandCount++;
      if (!byMethod[e.paymentMethod]) byMethod[e.paymentMethod] = { count: 0, total: 0 };
      byMethod[e.paymentMethod].count++;
      byMethod[e.paymentMethod].total += e.amount;
      if (!bySource[e.source]) bySource[e.source] = { count: 0, total: 0 };
      bySource[e.source].count++;
      bySource[e.source].total += e.amount;
    }

    const totalExpenses = expenses.reduce((s, x) => s + Number(x.total_amount), 0);

    return {
      date: dateFrom && dateTo && dateFrom === dateTo ? dateFrom : null,
      dateFrom,
      dateTo,
      periodMode,
      branchId: scopedBranches?.length === 1 ? scopedBranches[0] : null,
      grandTotal,
      grandCount,
      totalExpenses,
      netCash: grandTotal - totalExpenses,
      byMethod,
      bySource,
      entries,
      summaryOnly: false,
      detailRangeLimitDays,
    };
  }

  buildExportSheets(data: Awaited<ReturnType<UnifiedTreasuryService['daily']>>) {
    const detailCols: ExportColumn[] = [
      { key: 'sourceLabel', header: 'المصدر' },
      { key: 'customerName', header: 'العميل' },
      { key: 'amount', header: 'المبلغ' },
      { key: 'paymentMethod', header: 'طريقة الدفع' },
      { key: 'reference', header: 'المرجع' },
    ];
    const methodCols: ExportColumn[] = [
      { key: 'method', header: 'طريقة التحصيل' },
      { key: 'count', header: 'العدد' },
      { key: 'total', header: 'الإجمالي' },
    ];
    const sourceCols: ExportColumn[] = [
      { key: 'source', header: 'مصدر الإيراد' },
      { key: 'count', header: 'العدد' },
      { key: 'total', header: 'الإجمالي' },
    ];
    return [
      { name: 'التفاصيل', columns: detailCols, rows: data.entries as unknown as Record<string, unknown>[] },
      {
        name: 'طرق التحصيل',
        columns: methodCols,
        rows: Object.entries(data.byMethod).map(([method, v]) => ({ method, count: v.count, total: v.total })),
      },
      {
        name: 'مصادر الإيراد',
        columns: sourceCols,
        rows: Object.entries(data.bySource).map(([source, v]) => ({
          source: SOURCE_LABELS[source] ?? source, count: v.count, total: v.total,
        })),
      },
    ];
  }

  private normalizeMethod(m: string): string {
    const lower = m.toLowerCase();
    if (lower.includes('cash') || lower.includes('نقد')) return 'cash';
    if (lower.includes('instapay') || lower.includes('إنستا') || lower.includes('انستا')) return 'instapay';
    if (lower.includes('wallet') || lower.includes('محفظ')) return 'wallet';
    if (lower.includes('visa') || lower.includes('فيزا')) return 'visa';
    if (lower.includes('transfer') || lower.includes('تحو')) return 'transfer';
    if (lower.includes('bank') || lower.includes('بنك')) return 'bank';
    if (lower.includes('card') || lower.includes('بطاق')) return 'card';
    if (lower.includes('online') || lower.includes('إلكتر')) return 'online';
    return 'other';
  }
}
