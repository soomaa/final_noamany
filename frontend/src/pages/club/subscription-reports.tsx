import { formatDisplayNumber } from '@/lib/number-display';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Download,
  Filter,
  Landmark,
  PieChart as PieChartIcon,
  ReceiptText,
  RefreshCw,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DataTable } from '@/components/common/data-table';
import { DatePresets } from '@/components/common/date-presets';
import { PageHeader } from '@/components/common/page-header';
import { firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';
import { BranchFilter } from '@/components/reports/branch-filter';
import { ClubStatCard } from '@/components/club/stat-card';
import { clubPaymentMethodLabel, CLUB_PAYMENT_METHODS } from '@/components/club/club-payment-method-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClubT } from '@/hooks/use-club-t';
import { api } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { cn, toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { usePermission } from '@/hooks/use-permission';

type DetailDimension = 'payment' | 'sales' | 'user' | 'status' | 'source' | 'subscriptionType';

interface ReportFilters {
  startDate: string;
  endDate: string;
  branch: string;
  subscriptionTypeId: string;
  gender: string;
  status: string;
  paymentState: string;
  paymentMethod: string;
  salesId: string;
  userId: string;
  customerSourceId: string;
  hasDiscount: string;
  kind: string;
  source: string;
}

interface SummaryResponse {
  period: { startDate: string; endDate: string };
  overview: {
    contractsCount: number;
    contractsValue: number;
    subscriptionCollected: number;
    totalCollectedAllSources: number;
    remainingAmount: number;
    refundsAmount: number;
    refundsCount: number;
    waiversAmount: number;
    waiversCount: number;
    discountedCount: number;
  };
  statuses: Array<{ key: string; name: string; count: number }>;
  services: Array<{ key: string; name: string; count: number; amount: number }>;
  payments: Array<{ key: string; count: number; amount: number }>;
  sales: Array<{
    id: number;
    name: string;
    membersCount: number;
    contractsCount: number;
    contractsValue: number;
    collectedAmount: number;
    remainingAmount: number;
  }>;
  users: Array<{
    id: number;
    name: string;
    subscriptionsCount: number;
    subscriptionsValue: number;
    receiptsCount: number;
    collectedAmount: number;
  }>;
  subscriptionTypes: Array<{ id: number | null; name: string; count: number; value: number; collected: number }>;
  customerSources: Array<{ id: number; name: string; count: number; value: number }>;
  trend: Array<{ date: string; subscriptions: number; services: number }>;
}

interface DetailRow {
  id: string;
  activity: string;
  memberName: string;
  memberCode?: string | null;
  phone?: string | null;
  reference: string;
  category: string;
  date: string;
  amount: number;
  collected: number;
  remaining?: number | null;
  branchId?: number | null;
  userName?: string | null;
  lastCheckIn?: string | null;
}

interface DetailResponse {
  data: DetailRow[];
  total: number;
  page: number;
  pageSize: number;
}

const CHART_COLORS = ['#eab308', '#2fbf87', '#38bdf8', '#8b5cf6', '#ec4899', '#e5736b', '#14b8a6'];

const initialFilters = (): ReportFilters => ({
  startDate: firstOfMonth(),
  endDate: todayLocal(),
  branch: 'all',
  subscriptionTypeId: 'all',
  gender: 'all',
  status: 'all',
  paymentState: 'all',
  paymentMethod: 'all',
  salesId: 'all',
  userId: 'all',
  customerSourceId: 'all',
  hasDiscount: 'all',
  kind: 'all',
  source: 'all',
});

function cleanParams(filters: ReportFilters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== '' && value !== 'all'),
  );
}

function AnalysisCard({
  title,
  subtitle,
  value,
  meta,
  icon: Icon,
  active,
  onClick,
}: {
  title: string;
  subtitle?: string;
  value: string;
  meta?: string;
  icon: typeof Activity;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group relative flex min-h-56 w-full flex-col items-center overflow-hidden rounded-2xl border bg-card p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md',
        active && 'border-primary shadow-md ring-2 ring-primary/15',
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-amber-300 to-emerald-400 opacity-80" />
      <div className="flex flex-col items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{title}</p>
          {subtitle ? <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      <p className="mt-5 text-2xl font-bold nums">{value}</p>
      {meta ? <p className="mt-1 text-xs text-muted-foreground">{meta}</p> : null}
      <p className="mt-auto flex items-center justify-center gap-1 pt-5 text-sm font-extrabold text-primary">
        عرض آخر العمليات <ChevronDown className={cn('size-3.5 transition-transform', active && 'rotate-180')} />
      </p>
    </button>
  );
}

export function ClubSubscriptionReportsPage() {
  const { can } = usePermission();
  const canExport = can('club.subscriptions.user_analytics:export');
  const { ui, locale } = useLocale();
  const ct = useClubT();
  const [draft, setDraft] = useState<ReportFilters>(initialFilters);
  const [applied, setApplied] = useState<ReportFilters>(initialFilters);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [tab, setTab] = useState('overview');
  const [detail, setDetail] = useState<{ dimension: DetailDimension; key: string; title: string } | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const detailSectionRef = useRef<HTMLDivElement | null>(null);
  const detailPageSize = 10;

  const { data: subscriptionTypes } = useArrayResource<{ id: number; name: string }>('club-subscription-types');
  const { data: salesReps } = useArrayResource<{ id: number; name: string }>('employees/sales-reps');
  const { data: customerSources } = useArrayResource<{ id: number; name: string }>('club-customer-sources');

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['club-subscription-reports', applied],
    queryFn: async () => {
      const response = await api.get<SummaryResponse>('/club-subscriptions/reports/summary', {
        params: cleanParams(applied),
      });
      return response.data;
    },
    placeholderData: (previousData) => previousData,
  });

  const { data: detailData, isLoading: detailLoading, isError: detailError } = useQuery({
    queryKey: ['club-subscription-report-details', detail, detailPage, applied],
    enabled: detail != null,
    queryFn: async () => {
      const response = await api.get<DetailResponse>('/club-subscriptions/reports/details', {
        params: {
          ...cleanParams(applied),
          dimension: detail?.dimension,
          key: detail?.key,
          page: detailPage,
          pageSize: detailPageSize,
        },
      });
      return response.data;
    },
  });

  const selectDetail = (dimension: DetailDimension, key: string | number, title: string) => {
    const next = { dimension, key: String(key), title };
    if (detail?.dimension === next.dimension && detail.key === next.key) {
      setDetail(null);
      return;
    }
    setDetail(next);
    setDetailPage(1);
  };

  useEffect(() => {
    if (!detail) return;
    const frame = window.requestAnimationFrame(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [detail]);

  const totalPayments = data?.payments.reduce((sum, row) => sum + row.amount, 0) ?? 0;
  const revenueMix = (() => {
    const fromServices = (data?.services ?? []).filter((row) => row.amount > 0);
    if (fromServices.length > 0) return fromServices;
    // Fallback: payment-method mix when source buckets are empty (e.g. receipts without new contracts).
    return (data?.payments ?? [])
      .filter((row) => row.amount > 0)
      .map((row) => ({
        key: row.key,
        name: clubPaymentMethodLabel(ct, row.key as (typeof CLUB_PAYMENT_METHODS)[number]),
        amount: row.amount,
        count: row.count,
      }));
  })();

  const detailColumns = useMemo<ColumnDef<DetailRow>[]>(
    () => [
      {
        accessorKey: 'activity',
        header: ui('العملية'),
        cell: ({ getValue }) => (
          <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {String(getValue() ?? '—')}
          </span>
        ),
      },
      {
        id: 'member',
        header: ui('العضو'),
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.memberName || '—'}</p>
            <p className="text-xs text-muted-foreground nums">{formatDigits(row.original.memberCode ?? row.original.phone ?? '—')}</p>
          </div>
        ),
      },
      {
        accessorKey: 'reference',
        header: ui('المرجع'),
        cell: ({ getValue }) => <span className="whitespace-nowrap font-mono text-xs nums">{formatDigits(String(getValue() ?? '—'))}</span>,
      },
      { accessorKey: 'category', header: ui('التصنيف') },
      {
        accessorKey: 'date',
        header: ui('التاريخ والوقت'),
        cell: ({ getValue }) => <span className="whitespace-nowrap nums">{formatDateTime(String(getValue() ?? ''), locale)}</span>,
      },
      {
        accessorKey: 'amount',
        header: ui('القيمة'),
        cell: ({ getValue }) => <span className="whitespace-nowrap nums">{formatMoney(Number(getValue() ?? 0), undefined, locale)}</span>,
      },
      {
        accessorKey: 'collected',
        header: ui('المحصل'),
        cell: ({ getValue }) => <span className="whitespace-nowrap font-semibold text-emerald-600 nums">{formatMoney(Number(getValue() ?? 0), undefined, locale)}</span>,
      },
      {
        accessorKey: 'remaining',
        header: ui('المتبقي'),
        cell: ({ getValue }) => {
          const value = getValue() as number | null | undefined;
          return value == null ? '—' : <span className={cn('whitespace-nowrap nums', value > 0 && 'text-destructive')}>{formatMoney(value, undefined, locale)}</span>;
        },
      },
      {
        accessorKey: 'userName',
        header: ui('مستخدم النظام'),
        cell: ({ getValue }) => String(getValue() ?? '—'),
      },
    ],
    [locale, ui],
  );

  const applyFilters = () => {
    setApplied({ ...draft });
    setDetail(null);
    setDetailPage(1);
    setAdvancedOpen(false);
  };

  const resetFilters = () => {
    const reset = initialFilters();
    setDraft(reset);
    setApplied(reset);
    setDetail(null);
    setDetailPage(1);
    setAdvancedOpen(false);
  };

  const applyBaseFilters = (patch: Partial<Pick<ReportFilters, 'startDate' | 'endDate' | 'branch'>>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setApplied((current) => ({ ...current, ...patch }));
    setDetail(null);
    setDetailPage(1);
  };

  const activeFilterCount = Object.entries(applied).filter(
    ([key, value]) => key !== 'startDate' && key !== 'endDate' && value !== '' && value !== 'all',
  ).length;
  const filtersChanged = Object.keys(draft).some(
    (key) => draft[key as keyof ReportFilters] !== applied[key as keyof ReportFilters],
  );
  const defaultFilterValues = initialFilters();
  const canResetFilters = Object.keys(defaultFilterValues).some((key) => {
    const filterKey = key as keyof ReportFilters;
    return draft[filterKey] !== defaultFilterValues[filterKey] || applied[filterKey] !== defaultFilterValues[filterKey];
  });

  const exportSummary = () => {
    if (!data) return;
    const rows = [
      [ui('المؤشر'), ui('القيمة')],
      [ui('عدد الاشتراكات'), data.overview.contractsCount],
      [ui('قيمة الاشتراكات'), data.overview.contractsValue],
      [ui('تحصيل الاشتراكات'), data.overview.subscriptionCollected],
      [ui('إجمالي التحصيل من كل المصادر'), data.overview.totalCollectedAllSources],
      [ui('إجمالي المتبقي'), data.overview.remainingAmount],
      [],
      [ui('مصدر الإيراد'), ui('عدد العمليات'), ui('المبلغ')],
      ...data.services.map((row) => [row.name, row.count, row.amount]),
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `subscription-reports-${applied.startDate}-${applied.endDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const DetailSection = () =>
    detail ? (
      <Card ref={detailSectionRef} className="mt-6 scroll-mt-24 overflow-hidden rounded-2xl border-2 border-primary/25 shadow-md">
        <CardHeader className="flex-row items-start justify-between gap-3 border-b border-primary/15 bg-gradient-to-l from-primary/[0.09] via-primary/[0.03] to-transparent">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="size-5 text-primary" />
              {detail.title}
            </CardTitle>
            <CardDescription>{ui('آخر السجلات تُحمّل عند الطلب فقط لتسريع الصفحة وتقليل الضغط على السيرفر.')}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>{ui('إغلاق')}</Button>
        </CardHeader>
        <CardContent className="p-3 sm:p-5">
          <p className="mb-3 text-xs text-muted-foreground sm:hidden">
            {ui('اسحبي الجدول يمينًا ويسارًا لعرض كل الأعمدة.')}
          </p>
          <DataTable
            columns={detailColumns}
            data={detailData?.data ?? []}
            total={detailData?.total ?? 0}
            page={detailPage}
            pageSize={detailPageSize}
            onPageChange={setDetailPage}
            isLoading={detailLoading}
            isError={detailError}
            emptyTitle={ui('لا توجد سجلات مطابقة')}
            enableExport={false}
          />
        </CardContent>
      </Card>
    ) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('تقارير الاشتراكات')}
        description={ui('صورة موحدة للاشتراكات والتحصيل والمبيعات والخدمات، مع تفاصيل تُحمّل عند الطلب.')}
        actions={canExport ? (
          <Button variant="outline" onClick={exportSummary} disabled={!data}>
            <Download className="size-4" /> {ui('تصدير الملخص')}
          </Button>
        ) : undefined}
      />

      {isLoading ? <Card><CardContent className="py-14 text-center text-muted-foreground">{ui('جارٍ تجهيز التحليل…')}</CardContent></Card> : null}
      {isError ? <Card><CardContent className="py-14 text-center text-destructive">{ui('تعذر تحميل التقرير.')} <Button variant="link" onClick={() => void refetch()}>{ui('إعادة المحاولة')}</Button></CardContent></Card> : null}

      {data ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <ClubStatCard centered label={ui('إجمالي التحصيل من كل المصادر')} value={formatMoney(data.overview.totalCollectedAllSources, undefined, locale)} icon={CircleDollarSign} tone="revenue" />
            <ClubStatCard centered label={ui('قيمة الاشتراكات')} value={formatMoney(data.overview.contractsValue, undefined, locale)} icon={ReceiptText} tone="primary" />
            <ClubStatCard centered label={ui('عدد الاشتراكات')} value={data.overview.contractsCount} icon={WalletCards} tone="members" />
            <ClubStatCard centered label={ui('إجمالي المتبقي')} value={formatMoney(data.overview.remainingAmount, undefined, locale)} icon={Landmark} tone="alert" />
          </div>

          <Tabs value={tab} onValueChange={(value) => { setTab(value); setDetail(null); }}>
            <div className="overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]">
              <TabsList className="flex h-12 w-max min-w-full flex-nowrap justify-center gap-3 rounded-xl border border-primary/15 bg-card p-1.5 shadow-sm">
                <TabsTrigger className="border border-border/70 bg-background/60 px-5 data-[state=active]:border-primary/35" value="overview"><TrendingUp className="size-4" /> {ui('نظرة عامة')}</TabsTrigger>
                <TabsTrigger className="border border-border/70 bg-background/60 px-5 data-[state=active]:border-primary/35" value="subscriptions"><WalletCards className="size-4" /> {ui('الاشتراكات')}</TabsTrigger>
                <TabsTrigger className="border border-border/70 bg-background/60 px-5 data-[state=active]:border-primary/35" value="payments"><CreditCard className="size-4" /> {ui('وسائل الدفع')}</TabsTrigger>
                <TabsTrigger className="border border-border/70 bg-background/60 px-5 data-[state=active]:border-primary/35" value="sales"><UserCheck className="size-4" /> {ui('أخصائي المبيعات')}</TabsTrigger>
                <TabsTrigger className="border border-border/70 bg-background/60 px-5 data-[state=active]:border-primary/35" value="users"><Users className="size-4" /> {ui('مستخدمو النظام')}</TabsTrigger>
                <TabsTrigger className="border border-border/70 bg-background/60 px-5 data-[state=active]:border-primary/35" value="services"><Sparkles className="size-4" /> {ui('الخدمات والإيرادات')}</TabsTrigger>
              </TabsList>
            </div>

            <section className="mt-3 overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm">
              <div className="flex min-h-12 w-full flex-wrap items-center justify-between gap-3 px-3 py-2 sm:px-4">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                    <Filter className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {ui('فلترة التقرير')}
                      {activeFilterCount > 0 ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                          {toArabicDigits(activeFilterCount)} {ui('مفعّلة')}
                        </span>
                      ) : null}
                      {filtersChanged ? (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                          {ui('تغييرات غير مطبقة')}
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {toArabicDigits(applied.startDate)} — {toArabicDigits(applied.endDate)}
                      {isFetching && !isLoading ? ` · ${ui('جارٍ تحديث النتائج…')}` : ''}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canResetFilters}
                    onClick={resetFilters}
                    className="h-8"
                  >
                    <RefreshCw className="size-3.5" />
                    {ui('إزالة الفلاتر')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={advancedOpen}
                    onClick={() => setAdvancedOpen((value) => !value)}
                    className="h-8 text-primary"
                  >
                    {ui('خيارات متقدمة')}
                    <ChevronDown className={cn('size-4 transition-transform', advancedOpen && 'rotate-180')} />
                  </Button>
                </span>
              </div>

              <div className="overflow-x-auto border-t border-primary/10 bg-primary/[0.025] px-3 py-3 overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <div className="mx-auto flex w-max min-w-full items-end justify-center gap-3">
                  <div className="shrink-0 pb-1 [&>div]:flex-nowrap [&_button]:h-9 [&_button]:px-3">
                    <DatePresets
                      locale={locale}
                      activeStart={draft.startDate}
                      activeEnd={draft.endDate}
                      onSelect={(startDate, endDate) => applyBaseFilters({ startDate, endDate })}
                    />
                  </div>
                  <div className="grid shrink-0 gap-1.5">
                    <Label htmlFor="subscription-report-start" className="text-xs text-muted-foreground">{ui('من')}</Label>
                    <Input
                      id="subscription-report-start"
                      type="date"
                      value={draft.startDate}
                      onChange={(event) => applyBaseFilters({ startDate: event.target.value })}
                      className="w-36"
                    />
                  </div>
                  <div className="grid shrink-0 gap-1.5">
                    <Label htmlFor="subscription-report-end" className="text-xs text-muted-foreground">{ui('إلى')}</Label>
                    <Input
                      id="subscription-report-end"
                      type="date"
                      value={draft.endDate}
                      onChange={(event) => applyBaseFilters({ endDate: event.target.value })}
                      className="w-36"
                    />
                  </div>
                  <div className="shrink-0 [&_select]:w-44">
                    <BranchFilter value={draft.branch} onChange={(branch) => applyBaseFilters({ branch })} />
                  </div>
                </div>
              </div>

              {advancedOpen ? (
                <div className="border-t border-primary/15 bg-muted/20 p-3 sm:p-4">
                  <div className="rounded-xl border border-primary/20 bg-background/80 p-3 shadow-inner sm:p-4">
                    <div className="mb-4">
                      <h2 className="text-sm font-bold">{ui('خيارات الفلترة المتقدمة')}</h2>
                      <p className="text-xs text-muted-foreground">{ui('اختاري القيم المطلوبة ثم اضغطي تطبيق لعرض النتائج المطابقة فقط.')}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <SelectFilter
                        label={ui('نوع الاشتراك')}
                        value={draft.subscriptionTypeId}
                        onChange={(subscriptionTypeId) => setDraft((current) => ({ ...current, subscriptionTypeId }))}
                        options={[
                          { value: 'all', label: ui('كل أنواع الاشتراكات') },
                          ...(subscriptionTypes ?? []).map((row) => ({ value: String(row.id), label: row.name })),
                        ]}
                      />
                      <SelectFilter label={ui('النوع')} value={draft.gender} onChange={(gender) => setDraft((current) => ({ ...current, gender }))} options={[
                        { value: 'all', label: ui('الكل') }, { value: 'male', label: ui('رجال') }, { value: 'female', label: ui('سيدات') },
                      ]} />
                      <SelectFilter label={ui('حالة الاشتراك')} value={draft.status} onChange={(status) => setDraft((current) => ({ ...current, status }))} options={[
                        { value: 'all', label: ui('كل الحالات') }, { value: 'active', label: ui('نشط') }, { value: 'expiring', label: ui('ينتهي خلال 7 أيام') }, { value: 'expired', label: ui('منتهي') }, { value: 'upcoming', label: ui('قادم') }, { value: 'frozen', label: ui('مجمّد') },
                      ]} />
                      <SelectFilter label={ui('حالة السداد')} value={draft.paymentState} onChange={(paymentState) => setDraft((current) => ({ ...current, paymentState }))} options={[
                        { value: 'all', label: ui('كل حالات السداد') }, { value: 'paid', label: ui('مدفوع بالكامل') }, { value: 'partial', label: ui('مدفوع جزئيًا') }, { value: 'unpaid', label: ui('غير مدفوع') },
                      ]} />
                      <SelectFilter label={ui('طريقة الدفع')} value={draft.paymentMethod} onChange={(paymentMethod) => setDraft((current) => ({ ...current, paymentMethod }))} options={[
                        { value: 'all', label: ui('كل طرق الدفع') },
                        ...CLUB_PAYMENT_METHODS.map((method) => ({ value: method, label: clubPaymentMethodLabel(ct, method) })),
                      ]} />
                      <SelectFilter label={ui('أخصائي المبيعات')} value={draft.salesId} onChange={(salesId) => setDraft((current) => ({ ...current, salesId }))} options={[
                        { value: 'all', label: ui('الكل') },
                        ...(salesReps ?? []).map((row) => ({ value: String(row.id), label: row.name })),
                      ]} />
                      <SelectFilter label={ui('مستخدم النظام')} value={draft.userId} onChange={(userId) => setDraft((current) => ({ ...current, userId }))} options={[
                        { value: 'all', label: ui('كل المستخدمين') },
                        ...(data?.users ?? []).map((row) => ({ value: String(row.id), label: row.name })),
                      ]} />
                      <SelectFilter label={ui('مصدر العميل')} value={draft.customerSourceId} onChange={(customerSourceId) => setDraft((current) => ({ ...current, customerSourceId }))} options={[
                        { value: 'all', label: ui('كل مصادر العملاء') },
                        ...(customerSources ?? []).map((row) => ({ value: String(row.id), label: row.name })),
                      ]} />
                      <SelectFilter label={ui('نوع الباقة')} value={draft.kind} onChange={(kind) => setDraft((current) => ({ ...current, kind }))} options={[
                        { value: 'all', label: ui('كل الباقات') }, { value: 'package', label: ui('اشتراك عادي') }, { value: 'sessions', label: ui('باقة حصص') }, { value: 'special', label: ui('اشتراك خاص') },
                      ]} />
                      <SelectFilter label={ui('الخصم')} value={draft.hasDiscount} onChange={(hasDiscount) => setDraft((current) => ({ ...current, hasDiscount }))} options={[
                        { value: 'all', label: ui('بخصم وبدون') }, { value: 'true', label: ui('به خصم') }, { value: 'false', label: ui('بدون خصم') },
                      ]} />
                      <SelectFilter label={ui('مصدر الإيراد')} value={draft.source} onChange={(source) => setDraft((current) => ({ ...current, source }))} options={[
                        { value: 'all', label: ui('كل المصادر') }, { value: 'subscriptions', label: ui('الاشتراكات') }, { value: 'spa', label: 'SPA' }, { value: 'inbody', label: 'InBody' }, { value: 'locker', label: ui('اللوكر') },
                      ]} />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                      <Button variant="brand" onClick={applyFilters} disabled={!filtersChanged}>
                        <BarChart3 className="size-4" /> {ui('تطبيق الفلاتر')}
                      </Button>
                      <Button variant="outline" onClick={resetFilters}>
                        <RefreshCw className="size-4" /> {ui('إعادة ضبط')}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <TabsContent value="overview" className="space-y-6 pt-5">
              <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><TrendingUp className="size-5 text-primary" /> {ui('حركة التحصيل خلال الفترة')}</CardTitle>
                    <CardDescription>{ui('تحصيل الاشتراكات مقابل الخدمات يومًا بيوم.')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.trend}>
                          <defs>
                            <linearGradient id="subscriptionsGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#eab308" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="servicesGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2fbf87" stopOpacity={0.32} />
                              <stop offset="95%" stopColor="#2fbf87" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis tickFormatter={formatDisplayNumber} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(value: number) => formatMoney(value, undefined, locale)} />
                          <Legend />
                          <Area type="monotone" dataKey="subscriptions" name={ui('الاشتراكات')} stroke="#eab308" fill="url(#subscriptionsGradient)" strokeWidth={2.5} />
                          <Area type="monotone" dataKey="services" name={ui('الخدمات')} stroke="#2fbf87" fill="url(#servicesGradient)" strokeWidth={2.5} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><PieChartIcon className="size-5 text-primary" /> {ui('توزيع الإيرادات')}</CardTitle>
                    <CardDescription>{ui('نسبة مساهمة كل مصدر في إجمالي التحصيل.')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      {revenueMix.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          {ui('لا توجد إيرادات في الفترة المحددة')}
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={revenueMix} dataKey="amount" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                              {revenueMix.map((row, index) => <Cell key={row.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatMoney(value, undefined, locale)} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <div className="mb-3">
                  <h2 className="text-lg font-semibold">{ui('حالة الاشتراكات')}</h2>
                  <p className="text-sm text-muted-foreground">{ui('اضغطي على أي مؤشر لعرض آخر الاشتراكات المطابقة.')}</p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {data.statuses.map((row) => (
                    <AnalysisCard
                      key={row.key}
                      title={row.name}
                      value={toArabicDigits(row.count)}
                      icon={Activity}
                      active={detail?.dimension === 'status' && detail.key === row.key}
                      onClick={() => selectDetail('status', row.key, `${ui('تفاصيل')} ${row.name}`)}
                    />
                  ))}
                </div>
                <DetailSection />
              </div>
            </TabsContent>

            <TabsContent value="subscriptions" className="space-y-6 pt-5">
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <ClubStatCard centered label={ui('تحصيل الاشتراكات')} value={formatMoney(data.overview.subscriptionCollected, undefined, locale)} icon={CircleDollarSign} />
                <ClubStatCard centered label={ui('المستردات')} value={formatMoney(data.overview.refundsAmount, undefined, locale)} icon={RefreshCw} tone="alert" />
                <ClubStatCard centered label={ui('الإعفاءات')} value={formatMoney(data.overview.waiversAmount, undefined, locale)} icon={ReceiptText} tone="alert" />
                <ClubStatCard centered label={ui('اشتراكات عليها خصم')} value={data.overview.discountedCount} icon={Sparkles} />
              </div>
              <div>
                <h2 className="mb-1 text-lg font-semibold">{ui('الأداء حسب نوع الاشتراك')}</h2>
                <p className="mb-4 text-sm text-muted-foreground">{ui('قيمة العقود والتحصيل الفعلي لكل باقة.')}</p>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {data.subscriptionTypes.map((row) => (
                    <AnalysisCard
                      key={String(row.id ?? row.name)}
                      title={row.name}
                      subtitle={`${toArabicDigits(row.count)} ${ui('اشتراك')}`}
                      value={formatMoney(row.collected, undefined, locale)}
                      meta={`${ui('قيمة العقود')}: ${formatMoney(row.value, undefined, locale)}`}
                      icon={WalletCards}
                      active={detail?.dimension === 'subscriptionType' && detail.key === String(row.id)}
                      onClick={() => selectDetail('subscriptionType', row.id ?? 'null', `${ui('اشتراكات')} ${row.name}`)}
                    />
                  ))}
                </div>
              </div>
              {data.customerSources.length ? (
                <div>
                  <h2 className="mb-4 text-lg font-semibold">{ui('مصادر العملاء')}</h2>
                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    {data.customerSources.map((row) => (
                      <AnalysisCard
                        key={row.id}
                        title={row.name}
                        subtitle={`${toArabicDigits(row.count)} ${ui('اشتراك')}`}
                        value={formatMoney(row.value, undefined, locale)}
                        icon={TrendingUp}
                        active={detail?.dimension === 'source' && detail.key === String(row.id)}
                        onClick={() => selectDetail('source', row.id, `${ui('عملاء مصدر')} ${row.name}`)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              <DetailSection />
            </TabsContent>

            <TabsContent value="payments" className="space-y-5 pt-5">
              <div>
                <h2 className="text-lg font-semibold">{ui('التحصيل حسب وسيلة الدفع')}</h2>
                <p className="text-sm text-muted-foreground">{ui('يشمل الدفع المقسّم بدقة، بالإضافة إلى فواتير SPA وInBody واللوكر.')}</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {data.payments.map((row) => {
                  const percent = totalPayments > 0 ? (row.amount / totalPayments) * 100 : 0;
                  return (
                    <AnalysisCard
                      key={row.key}
                      title={clubPaymentMethodLabel(ct, row.key)}
                      subtitle={`${toArabicDigits(row.count)} ${ui('عملية')} · ${toArabicDigits(percent.toFixed(1))}%`}
                      value={formatMoney(row.amount, undefined, locale)}
                      meta={`${ui('متوسط العملية')}: ${formatMoney(row.count ? row.amount / row.count : 0, undefined, locale)}`}
                      icon={CreditCard}
                      active={detail?.dimension === 'payment' && detail.key === row.key}
                      onClick={() => selectDetail('payment', row.key, `${ui('آخر عمليات')} ${clubPaymentMethodLabel(ct, row.key)}`)}
                    />
                  );
                })}
              </div>
              <DetailSection />
            </TabsContent>

            <TabsContent value="sales" className="space-y-5 pt-5">
              <div>
                <h2 className="text-lg font-semibold">{ui('أداء أخصائي المبيعات')}</h2>
                <p className="text-sm text-muted-foreground">{ui('النسبة مبنية على أخصائي المبيعات المختار في ملف العضو، وليست على مستخدم النظام.')}</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {data.sales.map((row) => (
                  <AnalysisCard
                    key={row.id}
                    title={row.name}
                    subtitle={`${toArabicDigits(row.membersCount)} ${ui('عضو جديد')} · ${toArabicDigits(row.contractsCount)} ${ui('اشتراك')}`}
                    value={formatMoney(row.collectedAmount, undefined, locale)}
                    meta={`${ui('قيمة العقود')}: ${formatMoney(row.contractsValue, undefined, locale)} · ${ui('المتبقي')}: ${formatMoney(row.remainingAmount, undefined, locale)}`}
                    icon={UserCheck}
                    active={detail?.dimension === 'sales' && detail.key === String(row.id)}
                    onClick={() => selectDetail('sales', row.id, `${ui('آخر أعضاء أخصائي المبيعات')} ${row.name}`)}
                  />
                ))}
              </div>
              {!data.sales.length ? <EmptyPanel text={ui('لا توجد بيانات مبيعات مطابقة للفلاتر خلال الفترة.')} /> : null}
              <DetailSection />
            </TabsContent>

            <TabsContent value="users" className="space-y-5 pt-5">
              <div>
                <h2 className="text-lg font-semibold">{ui('نشاط مستخدمي النظام')}</h2>
                <p className="text-sm text-muted-foreground">{ui('من أنشأ الاشتراك ومن سجّل التحصيل، بشكل مستقل عن أخصائي المبيعات.')}</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {data.users.map((row) => (
                  <AnalysisCard
                    key={row.id}
                    title={row.name}
                    subtitle={`${toArabicDigits(row.subscriptionsCount)} ${ui('اشتراك')} · ${toArabicDigits(row.receiptsCount)} ${ui('دفعة')}`}
                    value={formatMoney(row.collectedAmount, undefined, locale)}
                    meta={`${ui('قيمة الاشتراكات المدخلة')}: ${formatMoney(row.subscriptionsValue, undefined, locale)}`}
                    icon={Users}
                    active={detail?.dimension === 'user' && detail.key === String(row.id)}
                    onClick={() => selectDetail('user', row.id, `${ui('آخر عمليات المستخدم')} ${row.name}`)}
                  />
                ))}
              </div>
              {!data.users.length ? <EmptyPanel text={ui('لا توجد عمليات مستخدمين مطابقة للفلاتر خلال الفترة.')} /> : null}
              <DetailSection />
            </TabsContent>

            <TabsContent value="services" className="space-y-5 pt-5">
              <div>
                <h2 className="text-lg font-semibold">{ui('الإيرادات حسب المصدر والخدمة')}</h2>
                <p className="text-sm text-muted-foreground">{ui('الاشتراكات وفواتير SPA وInBody واللوكر في مكان واحد.')}</p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {data.services.map((row) => (
                  <AnalysisCard
                    key={row.key}
                    title={row.name}
                    subtitle={`${toArabicDigits(row.count)} ${ui('عملية')}`}
                    value={formatMoney(row.amount, undefined, locale)}
                    meta={`${ui('من إجمالي التحصيل')}: ${toArabicDigits(data.overview.totalCollectedAllSources ? ((row.amount / data.overview.totalCollectedAllSources) * 100).toFixed(1) : 0)}%`}
                    icon={row.key === 'subscriptions' ? WalletCards : Sparkles}
                    active={applied.source === row.key}
                    onClick={() => {
                      const source = applied.source === row.key ? 'all' : row.key;
                      setDraft((current) => ({ ...current, source }));
                      setApplied((current) => ({ ...current, source }));
                      setDetail(null);
                    }}
                  />
                ))}
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>{ui('ملاحظة التحليل')}</CardTitle>
                  <CardDescription>{ui('اختيار أي مصدر يطبّق فلتره على تفاصيل وسائل الدفع، ويمكن الرجوع إلى كل المصادر من شريط الفلاتر.')}</CardDescription>
                </CardHeader>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid min-w-40 gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <BarChart3 className="mb-3 size-8 opacity-40" />
        <p>{text}</p>
      </CardContent>
    </Card>
  );
}
