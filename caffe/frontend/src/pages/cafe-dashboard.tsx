import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endOfMonth, format, startOfMonth, subDays } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CircleDollarSign,
  Coffee,
  CreditCard,
  Lightbulb,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WelcomeBanner } from '@/components/common/welcome-banner';
import { api } from '@/lib/api';
import { CAFE_ROUTES } from '@/lib/cafe-routes';
import { FINANCE_ROUTES } from '@/lib/finance-routes';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/store/auth';

interface ProductMetric {
  productId: number;
  name: string;
  quantity: number;
  revenue: number;
  profit: number;
}

interface CafeReport {
  totalSales: number;
  totalOrders: number;
  averageOrderValue: number;
  netRevenue: number;
  previousRevenue: number;
  revenueGrowth: number;
  totalDiscounts: number;
  grossProfit: number;
  products: { bestSelling: ProductMetric[] };
  time: {
    byDay: Array<{ date: string; orders: number; sales: number }>;
    rushHours: Array<{ label: string; sales: number }>;
  };
  inventory: {
    lowStock: Array<{ productId: number; name: string; stock: number; reorderPoint: number }>;
  };
  insights: string[];
}

interface QuickSaleSummary {
  todaySales?: number;
  todayRevenue?: number;
}

const iso = (date: Date) => format(date, 'yyyy-MM-dd');
const money = (value: number) => `${toArabicDigits((value ?? 0).toFixed(2))} ج.م`;

type DashboardPeriod = 'today' | 'week' | 'month';

export function CafeDashboardPage() {
  const { ui, t } = useLocale();
  const user = useAuth((s) => s.user);
  const { data: branches = [] } = useBranches();
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const branchId =
    (user?.branch && user.branch > 0 ? String(user.branch) : '') || String(branches[0]?.id ?? '');

  const today = new Date();
  const monthFrom = iso(startOfMonth(today));
  const monthTo = iso(endOfMonth(today));
  const weekFrom = iso(subDays(today, 6));

  const periodRange = useMemo(() => {
    if (period === 'today') return { from: iso(today), to: iso(today) };
    if (period === 'week') return { from: weekFrom, to: iso(today) };
    return { from: monthFrom, to: monthTo };
  }, [period, today, weekFrom, monthFrom, monthTo]);

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['cafe-dashboard', period, periodRange.from, periodRange.to, branchId],
    queryFn: async () =>
      (
        await api.get<CafeReport>('/cafe-products/reports/summary', {
          params: {
            dateFrom: periodRange.from,
            dateTo: periodRange.to,
            branchId: branchId || undefined,
          },
        })
      ).data,
    enabled: !!branchId,
  });

  const { data: todayReport, isLoading: todayLoading } = useQuery({
    queryKey: ['cafe-dashboard', 'today', branchId],
    queryFn: async () =>
      (
        await api.get<CafeReport>('/cafe-products/reports/summary', {
          params: { dateFrom: iso(today), dateTo: iso(today), branchId: branchId || undefined },
        })
      ).data,
    enabled: !!branchId,
  });

  const { data: month, isLoading: monthLoading } = useQuery({
    queryKey: ['cafe-dashboard', 'month', monthFrom, monthTo, branchId],
    queryFn: async () =>
      (
        await api.get<CafeReport>('/cafe-products/reports/summary', {
          params: { dateFrom: monthFrom, dateTo: monthTo, branchId: branchId || undefined },
        })
      ).data,
    enabled: !!branchId,
  });

  const { data: salesStats } = useQuery({
    queryKey: ['quick-sales', 'stats', 'dashboard'],
    queryFn: async () => (await api.get<QuickSaleSummary>('/quick-sales/stats/summary')).data,
  });

  const weekTrend = useMemo(() => {
    const rows = month?.time.byDay ?? [];
    return rows.filter((row) => row.date >= weekFrom);
  }, [month, weekFrom]);

  const quickLinks = [
    { to: CAFE_ROUTES.pos, label: ui('نقطة البيع'), icon: ShoppingCart, tone: 'from-orange-500/15 to-orange-500/5 text-orange-700' },
    { to: CAFE_ROUTES.shifts, label: ui('الورديات'), icon: CreditCard, tone: 'from-sky-500/15 to-sky-500/5 text-sky-700' },
    { to: CAFE_ROUTES.reports, label: ui('تقارير الكافيه'), icon: BarChart3, tone: 'from-violet-500/15 to-violet-500/5 text-violet-700' },
    { to: FINANCE_ROUTES.dashboard, label: ui('لوحة تحكم المالية'), icon: Wallet, tone: 'from-emerald-500/15 to-emerald-500/5 text-emerald-700' },
    { to: FINANCE_ROUTES.expenses, label: ui('إدارة المصروفات'), icon: ReceiptText, tone: 'from-rose-500/15 to-rose-500/5 text-rose-700' },
    { to: CAFE_ROUTES.dashboard, label: ui('لوحة تحكم المخزون'), icon: Boxes, tone: 'from-amber-500/15 to-amber-500/5 text-amber-700' },
  ];

  const kpis = [
    {
      title: ui('مبيعات اليوم'),
      value: todayLoading ? '…' : money(todayReport?.totalSales ?? salesStats?.todayRevenue ?? 0),
      hint: todayLoading ? undefined : `${toArabicDigits(todayReport?.totalOrders ?? salesStats?.todaySales ?? 0)} ${ui('طلب')}`,
      icon: CircleDollarSign,
    },
    {
      title: ui('مبيعات الشهر'),
      value: monthLoading ? '…' : money(month?.totalSales ?? 0),
      hint: monthLoading ? undefined : `${toArabicDigits(month?.totalOrders ?? 0)} ${ui('طلب')}`,
      icon: TrendingUp,
    },
    {
      title: ui('متوسط قيمة الطلب'),
      value: monthLoading ? '…' : money(month?.averageOrderValue ?? 0),
      hint: ui('هذا الشهر'),
      icon: Coffee,
    },
    {
      title: ui('صافي الربح'),
      value: monthLoading ? '…' : money(month?.grossProfit ?? 0),
      hint: monthLoading
        ? undefined
        : `${toArabicDigits((month?.revenueGrowth ?? 0).toFixed(1))}% ${ui('نمو الإيراد')}`,
      icon: ArrowUpRight,
    },
  ];

  const bannerStats = [
    { label: t('banner.sales'), value: money(report?.totalSales ?? 0) },
    { label: t('banner.orders'), value: report?.totalOrders ?? 0 },
    { label: t('banner.avgOrder'), value: money(report?.averageOrderValue ?? 0) },
    { label: t('banner.profit'), value: money(report?.grossProfit ?? 0) },
  ];

  const periodFilter = (
    <div className="inline-flex items-center gap-1 rounded-2xl border border-white/35 bg-white/15 p-1.5 shadow-[0_10px_30px_-18px_rgba(0,0,0,.55)] backdrop-blur-md">
      {(
        [
          ['today', t('banner.periodToday')],
          ['week', t('banner.periodWeek')],
          ['month', t('banner.periodMonth')],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setPeriod(value)}
          className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${
            period === value
              ? 'bg-[#FFF8F0] text-[#4A3224] shadow-md ring-1 ring-white/70'
              : 'text-white/85 hover:bg-white/12 hover:text-white'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <WelcomeBanner
        name={user?.name}
        instituteName="Ordera"
        stats={bannerStats}
        periodFilter={periodFilter}
        loading={reportLoading}
      />
      <PageHeader
        eyebrow={ui('Ordera')}
        title={ui('لوحة تحكم الكافيه')}
        description={ui('نظرة سريعة على مبيعات اليوم والشهر والمخزون والوصول السريع')}
        actions={
          <Button asChild variant="brand">
            <Link to={CAFE_ROUTES.pos}>
              {ui('فتح نقطة البيع')}
              <ArrowLeft className="ms-2 size-4" />
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="overflow-hidden border-border/60 shadow-sm">
            <CardContent className="relative p-5">
              <div className="absolute end-0 top-0 size-20 rounded-es-full bg-primary/5" />
              <kpi.icon className="mb-3 size-6 text-primary" />
              <p className="text-sm text-muted-foreground">{kpi.title}</p>
              <p className="nums mt-1 text-2xl font-bold">{kpi.value}</p>
              {kpi.hint ? <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden border-0 bg-gradient-to-l from-primary/10 via-card to-card shadow-sm">
          <CardHeader>
            <CardTitle>{ui('اتجاه المبيعات — آخر 7 أيام')}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {monthLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekTrend}>
                  <defs>
                    <linearGradient id="dashSalesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F07820" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#F07820" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => money(Number(value))} />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="#F07820"
                    strokeWidth={3}
                    fill="url(#dashSalesFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="size-5 text-amber-500" />
              {ui('رؤى سريعة')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {monthLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (month?.insights ?? []).length ? (
              (month?.insights ?? []).slice(0, 4).map((insight, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-amber-200/70 bg-background/80 p-3 text-sm leading-6 dark:border-amber-900"
                >
                  <span className="me-2 font-bold text-amber-600">{toArabicDigits(index + 1)}.</span>
                  {insight}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{ui('لا توجد رؤى بعد — ابدأ بتسجيل المبيعات')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{ui('الأكثر مبيعًا')}</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to={CAFE_ROUTES.reports}>{ui('عرض الكل')}</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {monthLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (month?.products.bestSelling ?? []).length ? (
              (month?.products.bestSelling ?? []).slice(0, 5).map((row, index) => (
                <div key={row.productId} className="flex items-center gap-3 rounded-xl border p-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {toArabicDigits(index + 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {toArabicDigits(row.quantity)} {ui('وحدة')}
                    </p>
                  </div>
                  <p className="nums font-semibold">{money(row.revenue)}</p>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">{ui('لا توجد مبيعات بعد')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ui('ساعات الذروة')}</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {monthLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(month?.time.rushHours ?? []).slice(0, 6)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value) => money(Number(value))} />
                  <Bar dataKey="sales" fill="#E6C98A" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-rose-200/70">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-rose-500" />
              {ui('تنبيهات المخزون')}
            </CardTitle>
            <Badge variant="destructive">{toArabicDigits(month?.inventory.lowStock.length ?? 0)}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {monthLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (month?.inventory.lowStock ?? []).length ? (
              (month?.inventory.lowStock ?? []).slice(0, 5).map((row) => (
                <div
                  key={row.productId}
                  className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900 dark:bg-rose-950/10"
                >
                  <span className="min-w-0 truncate font-medium">{row.name}</span>
                  <Badge variant="destructive">
                    {toArabicDigits(row.stock)} / {toArabicDigits(row.reorderPoint)}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">{ui('لا توجد تنبيهات مخزون')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-muted-foreground">{ui('وصول سريع')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`group flex items-center gap-3 rounded-2xl border bg-gradient-to-br p-4 transition hover:shadow-md ${link.tone}`}
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-background/80 shadow-sm">
                <link.icon className="size-5" />
              </span>
              <span className="font-bold">{link.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
