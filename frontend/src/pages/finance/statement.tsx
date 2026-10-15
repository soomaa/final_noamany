import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Calculator, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { DatePresets } from '@/components/common/date-presets';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/states';
import { firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { financeListLink, financeQueryDates, normalizeFinancialAnalysis, normalizeProfitLoss } from '@/lib/finance-api';
import { FINANCE_ROUTES } from '@/lib/finance-routes';
import { downloadMultiSheetExcel, printElement } from '@/lib/export';
import { formatMoneyNumber, localDateStr } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ExpenseReportData, ProfitLossLineItem, RevenueReportData } from '@/types/finance';
import { useLocale } from '@/store/locale';
import { payrollApi } from './payroll/payroll-api';
import {
  openPayroll,
  pendingApproval,
  signedPercent,
  statementFiltersFromSearch,
  uncollected,
  type StatusAmount,
} from './statement-model';

function isForbidden(error: unknown) {
  return isAxiosError(error) && error.response?.status === 403;
}

function yearStart() {
  return localDateStr(new Date(new Date().getFullYear(), 0, 1));
}

interface ExpenseStats {
  byApprovalStatus?: { status: string; count: number; totalAmount: number }[];
  byPaymentStatus?: { status: string; count: number; totalAmount: number }[];
}

interface RevenueStats {
  byPaymentStatus?: { status: string; count: number; netAmount: number }[];
}

interface GymRevenue extends RevenueReportData {
  subscriptions?: {
    gross: number;
    refunds: number;
    byType: {
      typeName: string;
      receiptsCount: number;
      gross: number;
      refunds: number;
    }[];
  };
}

function Money({ value, className }: { value: number; className?: string }) {
  return <span dir="ltr" className={cn('nums inline-block tabular-nums', className)}>{formatMoneyNumber(value)}</span>;
}

function Figure({ children, className }: { children: ReactNode; className?: string }) {
  return <span dir="ltr" className={cn('nums inline-block tabular-nums', className)}>{children}</span>;
}

function AccountLabel({ label, codeClassName }: { label: string; codeClassName: string }) {
  const parts = label.match(/^(.*\S)\s+[—–-]\s+(\S.*)$/);
  if (!parts) return <bdi>{label}</bdi>;
  return (
    <span className="inline-flex min-w-0 items-baseline gap-2">
      <span className="min-w-0">{parts[2]}</span>
      <span dir="ltr" className={cn('nums shrink-0', codeClassName)}>{parts[1]}</span>
    </span>
  );
}

function LedgerPanel({
  tone,
  title,
  icon,
  items,
  totalLabel,
  total,
}: {
  tone: 'revenue' | 'expense';
  title: string;
  icon: ReactNode;
  items: ProfitLossLineItem[];
  totalLabel: string;
  total: number;
}) {
  const revenue = tone === 'revenue';
  return (
    <div className={cn('rounded-lg p-4', revenue ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30')}>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="font-semibold">{title}</span>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-3 text-sm">
          {items.map((item, index) => {
            const basis = items.reduce((sum, row) => sum + Math.abs(row.amount), 0);
            const share = basis > 0 ? Math.min(100, (Math.abs(item.amount) / basis) * 100) : 0;
            return (
              <li key={`${item.label}-${index}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <AccountLabel label={item.label} codeClassName={revenue ? 'text-green-800/70 dark:text-green-300/80' : 'text-red-800/70 dark:text-red-300/80'} />
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <Figure className={revenue ? 'text-green-800/80 dark:text-green-200/80' : 'text-red-800/80 dark:text-red-200/80'}>{share.toFixed(0)}%</Figure>
                    <span dir="ltr" className={cn('inline-block font-medium', revenue ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300')}>
                      {revenue ? <Money value={item.amount} /> : <>(<Money value={item.amount} />)</>}
                    </span>
                  </span>
                </div>
                <div className={cn('mt-1.5 h-1.5 overflow-hidden rounded-full', revenue ? 'bg-green-200/80 dark:bg-green-900' : 'bg-red-200/80 dark:bg-red-900')} aria-hidden>
                  <div className={cn('h-full rounded-full', revenue ? 'bg-green-600' : 'bg-red-600')} style={{ width: `${share}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className={cn('flex items-baseline justify-between gap-3 border-t pt-3 font-bold', items.length > 0 && 'mt-3', revenue ? 'border-green-200 text-green-800 dark:border-green-900 dark:text-green-200' : 'border-red-200 text-red-800 dark:border-red-900 dark:text-red-200')}>
        <span>{totalLabel}</span>
        <span dir="ltr" className={cn('inline-block', revenue ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300')}>
          {revenue ? <Money value={total} /> : <>(<Money value={total} />)</>}
        </span>
      </div>
    </div>
  );
}

export function FinanceReportRedirect() {
  const { search } = useLocation();
  return <Navigate to={`${FINANCE_ROUTES.dashboard}${search}`} replace />;
}

export function FinanceStatementPage() {
  const printRef = useRef<HTMLDivElement>(null);
  const { ui, locale } = useLocale();
  const { data: branches } = useBranches();
  const { search } = useLocation();
  const [initial] = useState(() => statementFiltersFromSearch(search, {
    startDate: firstOfMonth(),
    endDate: todayLocal(),
    branchId: 'all',
  }));
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [branchId, setBranchId] = useState(initial.branchId);
  const [exporting, setExporting] = useState(false);
  const dates = financeQueryDates(startDate, endDate);
  const branch = branchId !== 'all' ? { branchId } : {};
  const params = { ...dates, ...branch };

  const profitLoss = useQuery({
    queryKey: ['finance', 'statement', 'profit-loss', startDate, endDate, branchId],
    retry: false,
    queryFn: async () => {
      const { data } = await api.get<Record<string, unknown>>('/finance/profit-loss', { params });
      return normalizeProfitLoss(data);
    },
  });

  const dashboardFallback = useQuery({
    queryKey: ['finance', 'statement', 'dashboard', startDate, endDate, branchId],
    enabled: profitLoss.isError && isForbidden(profitLoss.error),
    retry: false,
    queryFn: async () => {
      const { data } = await api.get<Record<string, unknown>>('/finance/dashboard', { params });
      const revenue = Number(data.totalRevenue ?? data.totalRevenues ?? 0);
      const expenses = Number(data.totalExpenses ?? 0);
      const lines = (rows: unknown, labelKey: string): ProfitLossLineItem[] =>
        Array.isArray(rows)
          ? rows.map((row) => {
              const item = row as Record<string, unknown>;
              return { label: String(item[labelKey] ?? ''), amount: Number(item.total ?? 0) };
            })
          : [];
      return {
        revenue: { items: lines(data.revenuesBySource, 'source'), total: revenue },
        expenses: { items: lines(data.expensesByCategory, 'category'), total: expenses },
        netProfit: Number(data.netProfit ?? revenue - expenses),
        profitMargin: Number(data.profitMargin ?? (revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0)),
        daily: [] as { date: string; revenue: number; expenses: number; net: number }[],
      };
    },
  });

  const analysis = useQuery({
    queryKey: ['finance', 'statement', 'analysis', startDate, endDate, branchId],
    retry: false,
    queryFn: async () => {
      const { data } = await api.get<Record<string, unknown>>('/finance/analysis', { params });
      return normalizeFinancialAnalysis(data);
    },
  });

  const gymRevenue = useQuery({
    queryKey: ['finance', 'statement', 'revenue', startDate, endDate, branchId],
    retry: false,
    queryFn: async () => (await api.get<GymRevenue>('/finance/revenue-reports', { params })).data,
  });

  const expenseStats = useQuery({
    queryKey: ['finance', 'statement', 'expense-stats', startDate, endDate, branchId],
    retry: false,
    queryFn: async () => (await api.get<ExpenseStats>('/expenses/statistics', { params: { dateFrom: startDate, dateTo: endDate, ...branch } })).data,
  });

  const revenueStats = useQuery({
    queryKey: ['finance', 'statement', 'revenue-stats', startDate, endDate, branchId],
    retry: false,
    queryFn: async () => (await api.get<RevenueStats>('/revenues/statistics', { params: { dateFrom: startDate, dateTo: endDate, ...branch } })).data,
  });

  const payroll = useQuery({
    queryKey: ['finance', 'statement', 'payroll'],
    retry: false,
    queryFn: async () => {
      const first = await payrollApi.list({ page: 1, pageSize: 100 });
      const runs = [...first.data];
      for (let page = 2; runs.length < first.total; page++) {
        const result = await payrollApi.list({ page, pageSize: 100 });
        if (!result.data.length) break;
        runs.push(...result.data);
      }
      return runs.map((run) => ({
        status: run.status === 'completed' || run.status === 'banked' ? 'paid' : run.status === 'draft' ? 'draft' : 'submitted',
        period_start: run.periodStart ?? `${run.year}-${String(run.month).padStart(2, '0')}-01`,
        period_end: run.periodEnd ?? localDateStr(new Date(run.year, Number(run.month), 0)),
        total_net: run.totalAmount,
      }));
    },
  });

  const analysisBooks = useMemo(() => {
    if (!analysis.data) return undefined;
    return {
      revenue: {
        items: (analysis.data.revenuesBySource ?? []).map((row) => ({ label: row.source, amount: row.total })),
        total: analysis.data.totalRevenue,
      },
      expenses: {
        items: (analysis.data.expensesByCategory ?? []).map((row) => ({ label: row.category, amount: row.total })),
        total: analysis.data.totalExpenses,
      },
      netProfit: analysis.data.netProfit,
      profitMargin: analysis.data.profitMargin,
      daily: [] as { date: string; revenue: number; expenses: number; net: number }[],
    };
  }, [analysis.data]);

  const books = profitLoss.data ?? dashboardFallback.data ?? analysisBooks;
  const booksLoading = !books && (
    profitLoss.isLoading
    || analysis.isLoading
    || (isForbidden(profitLoss.error) && !dashboardFallback.isFetched)
  );
  const booksForbidden = isForbidden(profitLoss.error)
    && isForbidden(dashboardFallback.error)
    && isForbidden(analysis.error);

  // Without any income-statement grant, show the side(s) the expense/revenue report grants allow.
  const expenseReport = useQuery({
    queryKey: ['finance', 'statement', 'expense-report', startDate, endDate, branchId],
    enabled: booksForbidden,
    retry: false,
    queryFn: async () => (await api.get<ExpenseReportData>('/finance/expense-reports', { params })).data,
  });
  const partialRevenue = booksForbidden && gymRevenue.isSuccess
    ? {
        items: (gymRevenue.data.revenuesBySource ?? []).map((row) => ({ label: row.source, amount: Number(row.total ?? 0) })),
        total: Number(gymRevenue.data.totalAmount ?? 0),
      }
    : null;
  const partialExpenses = booksForbidden && expenseReport.isSuccess
    ? {
        items: (expenseReport.data.expensesByCategory ?? []).map((row) => ({ label: row.category, amount: Number(row.total ?? 0) })),
        total: Number(expenseReport.data.totalAmount ?? 0),
      }
    : null;
  const partialLoading = booksForbidden && (expenseReport.isLoading || gymRevenue.isLoading);

  const booksDenied = !books && !booksLoading && booksForbidden
    && !partialLoading && !partialRevenue && !partialExpenses;
  const booksBroken = !books && !booksLoading && !booksForbidden
    && (profitLoss.isError || analysis.isError || dashboardFallback.isError);

  const collectedGap = useMemo(
    () => uncollected((revenueStats.data?.byPaymentStatus ?? []).map((row) => ({
      status: row.status,
      amount: row.netAmount,
      count: row.count,
    } satisfies StatusAmount))),
    [revenueStats.data],
  );
  const waitingExpense = useMemo(
    () => pendingApproval((expenseStats.data?.byApprovalStatus ?? []).map((row) => ({
      status: row.status,
      amount: row.totalAmount,
      count: row.count,
    } satisfies StatusAmount))),
    [expenseStats.data],
  );
  const payrollGap = useMemo(
    () => openPayroll(payroll.data ?? [], startDate, endDate),
    [payroll.data, startDate, endDate],
  );

  const openRows = [
    revenueStats.isSuccess && collectedGap.amount > 0
      ? {
          key: 'revenue',
          label: ui('إيراد لم يُحصَّل'),
          detail: ui('يشمل المعلّق والجزئي'),
          amount: formatMoneyNumber(collectedGap.amount),
          href: financeListLink(FINANCE_ROUTES.revenues, startDate, endDate, branchId),
          action: ui('افتح الإيرادات'),
        }
      : null,
    expenseStats.isSuccess && waitingExpense.amount > 0
      ? {
          key: 'expense',
          label: ui('مصروف بانتظار الاعتماد'),
          detail: ui('حركات بانتظار الاعتماد'),
          amount: formatMoneyNumber(waitingExpense.amount),
          href: financeListLink(FINANCE_ROUTES.expenses, startDate, endDate, branchId) + '&approvalStatus=' + encodeURIComponent('معلق'),
          action: ui('افتح المصروفات'),
        }
      : null,
    payroll.isSuccess && payrollGap.waitingCount > 0
      ? {
          key: 'payroll',
          label: ui('مرتبات لسه متصرفتش'),
          detail: ui('دورات المرتبات المتاحة لحسابك خلال الفترة، لجميع الفروع المتاحة. ليست مفلترة بالفرع المختار.'),
          amount: formatMoneyNumber(payrollGap.waitingAmount),
          href: FINANCE_ROUTES.payrollApproval,
          action: ui('افتح المرتبات'),
        }
      : null,
  ].filter((row) => row != null);

  const openLoading = revenueStats.isLoading || expenseStats.isLoading || payroll.isLoading;
  const openClear = revenueStats.isSuccess && expenseStats.isSuccess && payroll.isSuccess
    && openRows.length === 0 && payrollGap.partialCount === 0;

  const trend = (analysis.data?.monthlyComparison ?? []).filter((point) => point.revenue || point.expense);
  const revenueGrowth = signedPercent(analysis.data?.revenueGrowth);
  const expenseGrowth = signedPercent(analysis.data?.expenseGrowth);
  const profitGrowth = signedPercent(analysis.data?.ratioAnalysis?.find((row) => row.label.includes('الربح'))?.value ?? null);
  const subscriptionTypes = gymRevenue.data?.subscriptions?.byType ?? [];
  const net = books?.netProfit ?? 0;
  const margin = books?.profitMargin ?? 0;

  const exportExcel = async () => {
    setExporting(true);
    try {
      if (!books) throw new Error(ui('انتظر تحميل التقرير'));
      const columns = [{ key: 'label', header: ui('البند') }, { key: 'amount', header: ui('المبلغ') }];
      await downloadMultiSheetExcel([
        { name: ui('الإيرادات'), columns, rows: books.revenue.items.map((row) => ({ ...row })) },
        { name: ui('المصروفات'), columns, rows: books.expenses.items.map((row) => ({ ...row })) },
        { name: ui('ملخص'), columns, rows: [
          { label: `${startDate} — ${endDate}`, amount: null },
          { label: ui('الإيرادات'), amount: books.revenue.total },
          { label: ui('المصروفات'), amount: books.expenses.total },
          { label: ui('الصافي'), amount: books.netProfit },
        ] },
      ], 'financial-summary');
    } catch (error) {
      toast.error(apiError(error, ui('تعذر تصدير الملف.')));
    } finally {
      setExporting(false);
    }
  };

  const printStatement = () => {
    printRef.current?.querySelectorAll('details').forEach((node) => {
      node.open = true;
    });
    if (printRef.current) printElement(printRef.current, ui('التقرير المالي'));
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={ui('التقرير المالي')}
        description={ui('إيراد الجيم ومصروفه وصافي الفترة، والمبالغ اللي لسه مفتوحة.')}
        actions={
          <>
            <Button variant="outline" disabled={exporting} onClick={() => void exportExcel()}>
              {ui('تصدير Excel')}
            </Button>
            <Button variant="brand" onClick={printStatement}>
              {ui('طباعة')}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <DatePresets
            locale={locale}
            activeStart={startDate}
            activeEnd={endDate}
            onSelect={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant={startDate === yearStart() && endDate === todayLocal() ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => {
              setStartDate(yearStart());
              setEndDate(todayLocal());
            }}
          >
            {ui('من أول السنة')}
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="statement-from" className="text-xs text-muted-foreground">{ui('من')}</Label>
            <Input id="statement-from" className="nums w-40" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="statement-to" className="text-xs text-muted-foreground">{ui('إلى')}</Label>
            <Input id="statement-to" className="nums w-40" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="statement-branch" className="text-xs text-muted-foreground">{ui('الفرع')}</Label>
            <select
              id="statement-branch"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value="all">{ui('كل الفروع')}</option>
              {(branches ?? []).map((branchOption) => (
                <option key={branchOption.id} value={String(branchOption.id)}>{branchOption.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div ref={printRef} className="space-y-8">
        {(openLoading || openRows.length > 0 || openClear || (payroll.isSuccess && payrollGap.partialCount > 0)) && (
          <section aria-label={ui('مبالغ مفتوحة')}>
            <h2 className="text-lg font-bold">{ui('لسه مفتوح')}</h2>
            {openLoading && openRows.length === 0 ? <Skeleton className="mt-3 h-12 w-full" /> : null}
            {openClear ? (
              <p className="mt-2 text-sm text-muted-foreground">{ui('مفيش تحصيل أو اعتماد أو مرتب مفتوح في الفترة.')}</p>
            ) : (
              <ul className="mt-3 divide-y rounded-xl border">
                {openRows.map((row) => (
                  <li key={row.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-semibold">{row.label}</p>
                      <p className="text-sm text-muted-foreground">{row.detail}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span dir="ltr" className="nums inline-block text-lg font-bold tabular-nums">{row.amount}</span>
                      <Link className="text-sm font-semibold text-primary underline-offset-4 hover:underline" to={row.href}>{row.action}</Link>
                    </div>
                  </li>
                ))}
                {payroll.isSuccess && payrollGap.partialCount > 0 ? (
                  <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <p className="font-semibold">{ui('دورة مرتبات اتصرّف جزء منها')}</p>
                    <Link className="text-sm font-semibold text-primary underline-offset-4 hover:underline" to={FINANCE_ROUTES.payrollApproval}>{ui('افتح المرتبات')}</Link>
                  </li>
                ) : null}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-xl border bg-card p-5 sm:p-6">
          {booksLoading || (!books && partialLoading) ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-12 w-48" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}

          {booksBroken ? (
            <ErrorState onRetry={() => {
              void profitLoss.refetch();
              void analysis.refetch();
              if (isForbidden(profitLoss.error)) void dashboardFallback.refetch();
            }} />
          ) : null}

          {booksDenied ? (
            <p className="text-sm text-muted-foreground">{ui('قائمة الدخل محتاجة صلاحية التقرير المالي.')}</p>
          ) : null}

          {!books && !partialLoading && (partialRevenue || partialExpenses) ? (
            <div className="space-y-6">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Calculator className="h-6 w-6" />
                {ui('قائمة الأرباح والخسائر')}
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {partialRevenue ? (
                  <LedgerPanel
                    tone="revenue"
                    title={ui('الإيرادات')}
                    icon={<TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />}
                    items={partialRevenue.items}
                    totalLabel={ui('إجمالي الإيرادات')}
                    total={partialRevenue.total}
                  />
                ) : null}
                {partialExpenses ? (
                  <LedgerPanel
                    tone="expense"
                    title={ui('المصروفات')}
                    icon={<TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />}
                    items={partialExpenses.items}
                    totalLabel={ui('إجمالي المصروفات')}
                    total={partialExpenses.total}
                  />
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{ui('صافي الربح محتاج صلاحية التقرير المالي.')}</p>
            </div>
          ) : null}

          {books && !booksLoading ? (
            <div className="space-y-6">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Calculator className="h-6 w-6" />
                {ui('قائمة الأرباح والخسائر')}
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <LedgerPanel
                  tone="revenue"
                  title={ui('الإيرادات')}
                  icon={<TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />}
                  items={books.revenue.items}
                  totalLabel={ui('إجمالي الإيرادات')}
                  total={books.revenue.total}
                />
                <LedgerPanel
                  tone="expense"
                  title={ui('المصروفات')}
                  icon={<TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />}
                  items={books.expenses.items}
                  totalLabel={ui('إجمالي المصروفات')}
                  total={books.expenses.total}
                />
              </div>
              <div className={cn('rounded-lg p-6', net >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-orange-50 dark:bg-orange-950/30')}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xl font-bold">{ui('صافي الربح/الخسارة')}</p>
                    <p className={cn('mt-1 text-sm', net >= 0 ? 'text-emerald-800 dark:text-emerald-200' : 'text-orange-800 dark:text-orange-200')}>
                      {ui('هامش الربح')}: <Figure>{Number(margin).toFixed(1)}%</Figure>
                    </p>
                  </div>
                  <p className={cn('text-4xl font-bold', net >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-orange-600 dark:text-orange-300')}>
                    <Money value={net} />
                  </p>
                </div>
              </div>
              {revenueGrowth || expenseGrowth || profitGrowth ? (
                <p className="text-sm">
                  {ui('مقارنة بالفترة السابقة:')}{' '}
                  {revenueGrowth ? <span>{ui('الإيراد')} <Figure>{revenueGrowth}%</Figure></span> : null}
                  {expenseGrowth ? <span>{revenueGrowth ? ' · ' : null}{ui('المصروف')} <Figure>{expenseGrowth}%</Figure></span> : null}
                  {profitGrowth ? <span>{(revenueGrowth || expenseGrowth) ? ' · ' : null}{ui('الصافي')} <Figure>{profitGrowth}%</Figure></span> : null}
                </p>
              ) : null}
              {books.revenue.total === 0 && books.expenses.total === 0 ? (
                <div>
                  <p className="text-sm">{ui('مفيش حركة في الفترة دي.')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{ui('وسّع الفترة، أو زامن إيصالات الجيم من إدارة الإيرادات.')}</p>
                  <Link className="mt-3 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline" to={financeListLink(FINANCE_ROUTES.revenues, startDate, endDate, branchId)}>
                    {ui('زامن الإيرادات من الجيم')}
                  </Link>
                </div>
              ) : null}
              <p className="text-sm leading-6 text-muted-foreground">
                {ui('قائمة الدخل من دفتر الأستاذ. المبالغ المفتوحة فوق من سجل التشغيل، ومش داخلة في الصافي.')}
              </p>
            </div>
          ) : null}
        </section>

        {trend.length >= 2 ? (
          <section>
            <h2 className="text-lg font-bold">{ui('حركة الشهور')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{ui('الإيراد خط متصل، المصروف خط متصل، والصافي خط متقطع.')}</p>
            <div className="mt-4 h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(value) => formatMoneyNumber(Number(value))} width={72} />
                  <Tooltip formatter={(value) => formatMoneyNumber(Number(value ?? 0))} />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" name={ui('الإيرادات')} stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expense" name={ui('المصروفات')} stroke="#dc2626" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="profit" name={ui('الصافي')} stroke="#047857" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : null}

        {gymRevenue.isSuccess && (subscriptionTypes.length > 0 || (gymRevenue.data.totalTax ?? 0) > 0 || (gymRevenue.data.totalDiscount ?? 0) > 0) ? (
          <section>
            <h2 className="text-lg font-bold">{ui('اشتراكات الأعضاء')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{ui('مردودات الاشتراكات متسجلة في المصروفات، مش مخصومة من الإيراد.')}</p>
            {subscriptionTypes.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{ui('اشتراكات الأعضاء حسب النوع')}</caption>
                  <thead className="text-muted-foreground">
                    <tr className="border-b text-start">
                      <th className="py-2 pe-3 font-medium">{ui('النوع')}</th>
                      <th className="py-2 pe-3 font-medium">{ui('عدد الإيصالات')}</th>
                      <th className="py-2 pe-3 font-medium">{ui('المحصّل')}</th>
                      <th className="py-2 font-medium">{ui('المردود')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptionTypes.map((row, index) => (
                      <tr key={`${row.typeName}-${index}`} className="border-b">
                        <td className="py-2 pe-3">{row.typeName}</td>
                        <td className="py-2 pe-3"><Figure>{String(row.receiptsCount)}</Figure></td>
                        <td className="py-2 pe-3"><Money value={row.gross} /></td>
                        <td className="py-2"><Money value={row.refunds} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {(gymRevenue.data.totalTax ?? 0) > 0 || (gymRevenue.data.totalDiscount ?? 0) > 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {(gymRevenue.data.totalTax ?? 0) > 0 ? <span>{ui('ضريبة في سجل الإيرادات')} <Money value={gymRevenue.data.totalTax ?? 0} className="font-semibold text-foreground" /></span> : null}
                {(gymRevenue.data.totalDiscount ?? 0) > 0 ? <span>{(gymRevenue.data.totalTax ?? 0) > 0 ? ' · ' : null}{ui('خصومات في سجل الإيرادات')} <Money value={gymRevenue.data.totalDiscount ?? 0} className="font-semibold text-foreground" /></span> : null}
              </p>
            ) : null}
          </section>
        ) : null}

        {gymRevenue.isSuccess && (gymRevenue.data.topCustomers?.length ?? 0) > 0 ? (
          <section>
            <h2 className="text-lg font-bold">{ui('أكبر العملاء')}</h2>
            <ul className="mt-3 divide-y">
              {(gymRevenue.data.topCustomers ?? []).slice(0, 8).map((customer, index) => (
                <li key={`${customer.customerName}-${index}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span>{customer.customerName}</span>
                  <Money value={customer.total} className="font-semibold" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {books && (books.daily?.length ?? 0) > 0 ? (
          <section>
            <h2 className="text-lg font-bold">{ui('حركة كل يوم')}</h2>
            <div className="mt-3 max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{ui('الإيراد والمصروف اليومي')}</caption>
                <thead className="sticky top-0 bg-background text-muted-foreground">
                  <tr className="border-b text-start">
                    <th className="py-2 pe-3 font-medium">{ui('اليوم')}</th>
                    <th className="py-2 pe-3 font-medium">{ui('إيراد')}</th>
                    <th className="py-2 pe-3 font-medium">{ui('مصروف')}</th>
                    <th className="py-2 font-medium">{ui('صافي')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(books.daily ?? []).map((row) => (
                    <tr key={row.date} className="border-b">
                      <td className="py-2 pe-3"><Figure>{row.date}</Figure></td>
                      <td className="py-2 pe-3"><Money value={row.revenue} /></td>
                      <td className="py-2 pe-3"><Money value={row.expenses} /></td>
                      <td className={cn('py-2 font-semibold', row.net < 0 && 'text-destructive')}><Money value={row.net} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
