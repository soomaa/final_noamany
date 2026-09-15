import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '@/components/common/states';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import {
  AttentionQueue,
  CommandBanner,
  DashboardSkeleton,
  InsightsPanel,
  OperationalPulse,
  OutcomeGrid,
  PaymentMixPanel,
  QuickActions,
  TopProductsPanel,
  TrendAnalysis,
  dashboardIcons,
} from './dashboard-sections';
import {
  deriveInsights,
  paymentBreakdown,
  periodRange,
  productRanking,
  normalizeBranchOptions,
  type DashboardSummary,
  type PeriodPreset,
} from './dashboard-model';
import './dashboard-command-center.css';

const CAFE_DASHBOARD_ROUTES = {
  pos: '/sales/new',
  shifts: '/sales/shifts',
  treasury: '/sales/treasury',
  waste: '/club/cafe/waste',
  rawMaterials: '/club/cafe/raw-materials',
  reports: '/club/cafe/reports',
  inventory: '/inventory/dashboard',
} as const;

export function CafeDashboardPage() {
  const { ui, isRtl } = useLocale();
  const user = useAuth((state) => state.user);
  const { data: branches = [] } = useBranches();
  const today = localToday();
  const initialPeriod = periodRange('month', today);
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [startDate, setStartDate] = useState(initialPeriod.startDate);
  const [endDate, setEndDate] = useState(initialPeriod.endDate);
  const [branchId, setBranchId] = useState('all');

  const query = useQuery({
    queryKey: ['cafe-dashboard', 'command-center', startDate, endDate, branchId],
    queryFn: async () => (await api.get<DashboardSummary>('/cafe-dashboard/summary', {
      params: { startDate, endDate, branchId },
    })).data,
    enabled: Boolean(startDate && endDate && startDate <= endDate),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const setPeriod = (next: Exclude<PeriodPreset, 'custom'>) => {
    const range = periodRange(next, today);
    setPreset(next);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const data = query.data;
  const locale = isRtl ? 'ar-EG' : 'en-US';
  const money = (value: number, compact = false) => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EGP',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number.isFinite(value) ? value : 0);
  const percent = (value: number) => `${number(value)}%`;

  const trend = useMemo(() => (data?.trend ?? []).map((row) => ({
    ...row,
    label: new Date(`${row.date}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
  })), [data?.trend, locale]);
  const rankedProducts = useMemo(() => productRanking(data?.topProducts ?? []), [data?.topProducts]);
  const payments = useMemo(() => paymentBreakdown(data?.paymentMix ?? []), [data?.paymentMix]);
  const insights = useMemo(() => data ? deriveInsights(data) : [], [data]);
  const branchOptions = useMemo(
    () => normalizeBranchOptions(branches, (id) => `${ui('فرع')} #${id}`),
    [branches, ui],
  );
  const selectedBranch = branchId === 'all'
    ? ui('كل الفروع المتاحة')
    : branchOptions.find((branch) => String(branch.id) === branchId)?.name ?? ui('الفرع المحدد');
  const updatedAt = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : undefined;

  if (query.isLoading) return <DashboardSkeleton />;
  if (query.isError) {
    return (
      <ErrorState
        title={ui('تعذر تحميل مركز قيادة الكافيه')}
        message={apiError(query.error, ui('راجع الاتصال ثم حاول تحديث بيانات الداشبورد مرة أخرى'))}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const outcomes = data?.outcomes ?? {
    netSales: 0,
    orders: 0,
    averageTicket: 0,
    grossProfit: 0,
    grossMargin: 0,
    salesChange: null,
  };
  const operations = data?.operations ?? {
    openShift: null,
    cashVariance: 0,
    expectedCash: 0,
    actualCash: 0,
    wasteCost: 0,
    wasteQuantity: 0,
    lowStockCount: 0,
  };

  return (
    <main className="space-y-7 pb-10" dir={isRtl ? 'rtl' : 'ltr'}>
      <CommandBanner
        ui={ui}
        userName={user?.name}
        selectedBranch={selectedBranch}
        startDate={startDate}
        endDate={endDate}
        preset={preset}
        branchId={branchId}
        branches={branchOptions}
        updatedAt={updatedAt}
        netSales={outcomes.netSales}
        grossProfit={outcomes.grossProfit}
        orders={outcomes.orders}
        isFetching={query.isFetching}
        posHref={CAFE_DASHBOARD_ROUTES.pos}
        onPresetChange={setPeriod}
        onStartDateChange={(value) => { setPreset('custom'); setStartDate(value); }}
        onEndDateChange={(value) => { setPreset('custom'); setEndDate(value); }}
        onBranchChange={setBranchId}
        onRefresh={() => void query.refetch()}
        money={money}
        number={number}
        percent={percent}
      />

      <OperationalPulse
        ui={ui}
        items={[
          {
            title: ui('الوردية الحالية'),
            value: operations.openShift ? ui('مفتوحة الآن') : ui('لا توجد وردية مفتوحة'),
            description: operations.openShift ? ui('نقطة البيع تعمل') : ui('راجع الورديات قبل البيع'),
            href: CAFE_DASHBOARD_ROUTES.shifts,
            icon: dashboardIcons.shift,
            status: operations.openShift ? 'good' : 'warning',
          },
          {
            title: ui('آخر فرق نقدية'),
            value: money(operations.cashVariance),
            description: Math.abs(operations.cashVariance) > 0.01 ? ui('يحتاج مطابقة') : ui('الإغلاق متطابق'),
            href: CAFE_DASHBOARD_ROUTES.treasury,
            icon: dashboardIcons.cash,
            status: Math.abs(operations.cashVariance) > 0.01 ? 'warning' : 'good',
          },
          {
            title: ui('تكلفة الهالك'),
            value: money(operations.wasteCost),
            description: `${number(operations.wasteQuantity)} ${ui('كمية مسجلة')}`,
            href: CAFE_DASHBOARD_ROUTES.waste,
            icon: dashboardIcons.waste,
            status: operations.wasteCost > 0 ? 'warning' : 'good',
          },
          {
            title: ui('مخزون منخفض'),
            value: `${number(operations.lowStockCount)} ${ui('صنف')}`,
            description: operations.lowStockCount ? ui('تحتاج إعادة طلب') : ui('لا توجد تنبيهات حالية'),
            href: CAFE_DASHBOARD_ROUTES.rawMaterials,
            icon: dashboardIcons.stock,
            status: operations.lowStockCount ? 'warning' : 'good',
          },
        ]}
      />

      <OutcomeGrid
        ui={ui}
        items={[
          {
            title: ui('صافي المبيعات'),
            value: money(outcomes.netSales, true),
            note: outcomes.salesChange == null
              ? ui('لا توجد فترة سابقة للمقارنة')
              : `${outcomes.salesChange >= 0 ? '+' : ''}${percent(outcomes.salesChange)} ${ui('عن الفترة السابقة')}`,
            icon: dashboardIcons.sales,
            tone: 'primary',
          },
          {
            title: ui('الطلبات المكتملة'),
            value: number(outcomes.orders),
            note: ui('فاتورة مكتملة داخل الفترة'),
            icon: dashboardIcons.orders,
            tone: 'sky',
          },
          {
            title: ui('متوسط الفاتورة'),
            value: money(outcomes.averageTicket),
            note: ui('متوسط قيمة الطلب الواحد'),
            icon: dashboardIcons.averageTicket,
            tone: 'violet',
          },
          {
            title: ui('مجمل الربح'),
            value: money(outcomes.grossProfit, true),
            note: `${percent(outcomes.grossMargin)} ${ui('هامش بعد التكلفة والهالك')}`,
            icon: dashboardIcons.profit,
            tone: 'emerald',
          },
        ]}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,.85fr)]">
        <TrendAnalysis ui={ui} data={trend} money={money} number={number} />
        <TopProductsPanel ui={ui} rows={rankedProducts} money={money} number={number} reportsHref={CAFE_DASHBOARD_ROUTES.reports} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <PaymentMixPanel ui={ui} rows={payments} money={money} />
        <InsightsPanel ui={ui} insights={insights} money={money} percent={percent} />
      </section>

      <AttentionQueue
        ui={ui}
        groups={[
          {
            title: ui('تنبيهات المخزون'),
            description: ui('أقل من أو يساوي حد الطلب'),
            icon: dashboardIcons.inventory,
            href: CAFE_DASHBOARD_ROUTES.rawMaterials,
            tone: 'warning',
            empty: ui('المخزون داخل الحدود المسجلة'),
            rows: (data?.attention.lowStock ?? []).map((row) => ({
              title: row.name,
              value: `${number(row.quantity)} / ${number(row.reorderPoint)}`,
              note: ui('الحالي / حد الطلب'),
            })),
          },
          {
            title: ui('هالك يحتاج مراجعة'),
            description: ui('أعلى تكلفة هالك في الفترة'),
            icon: dashboardIcons.waste,
            href: CAFE_DASHBOARD_ROUTES.waste,
            tone: 'danger',
            empty: ui('لا يوجد هالك يحتاج مراجعة'),
            rows: (data?.attention.highWaste ?? []).map((row) => ({
              title: row.name,
              value: money(row.cost),
              note: row.reason || ui('بدون سبب مسجل'),
            })),
          },
          {
            title: ui('فروق الورديات'),
            description: ui('إغلاقات بها فرق نقدي'),
            icon: dashboardIcons.treasury,
            href: CAFE_DASHBOARD_ROUTES.shifts,
            tone: 'primary',
            empty: ui('لا توجد فروق ورديات في الفترة'),
            rows: (data?.attention.shiftVariance ?? []).map((row) => ({
              title: new Date(`${row.date}T12:00:00`).toLocaleDateString(locale),
              value: money(row.variance),
              note: ui('فرق الإغلاق'),
            })),
          },
        ]}
      />

      <QuickActions
        ui={ui}
        actions={[
          { label: ui('فتح نقطة البيع'), href: CAFE_DASHBOARD_ROUTES.pos, icon: dashboardIcons.shift },
          { label: ui('مراجعة الورديات'), href: CAFE_DASHBOARD_ROUTES.shifts, icon: dashboardIcons.cash },
          { label: ui('تسجيل ومراجعة الهالك'), href: CAFE_DASHBOARD_ROUTES.waste, icon: dashboardIcons.waste },
          { label: ui('متابعة المخزون'), href: CAFE_DASHBOARD_ROUTES.inventory, icon: dashboardIcons.stock },
          { label: ui('تقارير الكافيه'), href: CAFE_DASHBOARD_ROUTES.reports, icon: dashboardIcons.reports },
        ]}
      />
    </main>
  );
}
