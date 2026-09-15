import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  Banknote,
  Building2,
  Boxes,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardPlus,
  Clock3,
  Dumbbell,
  FileBarChart,
  HeartPulse,
  Landmark,
  LayoutDashboard,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  ScanLine,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ExecutiveDashboardSummary } from '@/types/club';

const CHART_COLORS = ['#D4A72C', '#8b5cf6', '#0ea5e9', '#f97316', '#f43f5e', '#64748b'];
const IS_LOCAL_PREVIEW = ['localhost', '127.0.0.1'].includes(window.location.hostname);

type PeriodPreset = 'today' | '7d' | '30d' | 'month' | 'custom';

function daysAgo(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return localDateStr(value);
}

function startOfMonth() {
  const value = new Date();
  return localDateStr(new Date(value.getFullYear(), value.getMonth(), 1));
}

function money(value: number, compact = false) {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(Number.isFinite(value) ? value : 0);
}

function number(value: number) {
  return new Intl.NumberFormat('ar-EG').format(Number.isFinite(value) ? value : 0);
}

function SectionTitle({ icon: Icon, title, subtitle, action }: { icon: LucideIcon; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="font-bold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{label}</div>;
}

type BranchMetricKey = keyof Pick<
  ExecutiveDashboardSummary['branchBreakdown'][number],
  | 'totalRevenue'
  | 'subscriptionRevenue'
  | 'barRevenue'
  | 'productRevenue'
  | 'expenses'
  | 'subscriptionsCount'
  | 'newMembers'
  | 'inbodyCount'
  | 'blockedMembers'
>;

const DEMO_BRANCH_BREAKDOWN: ExecutiveDashboardSummary['branchBreakdown'] = [
  { branchId: 1, branchName: 'طنطا', totalRevenue: 92400, subscriptionRevenue: 78100, barRevenue: 7200, productRevenue: 7100, expenses: 28400, subscriptionsCount: 15, newMembers: 7, inbodyCount: 12, inbodyRevenue: 2400, blockedMembers: 2 },
  { branchId: 2, branchName: 'البراشري', totalRevenue: 79600, subscriptionRevenue: 66400, barRevenue: 8400, productRevenue: 4800, expenses: 26300, subscriptionsCount: 13, newMembers: 5, inbodyCount: 8, inbodyRevenue: 1600, blockedMembers: 1 },
  { branchId: 3, branchName: 'الجلاء', totalRevenue: 96500, subscriptionRevenue: 76500, barRevenue: 11200, productRevenue: 8800, expenses: 32600, subscriptionsCount: 14, newMembers: 6, inbodyCount: 7, inbodyRevenue: 1400, blockedMembers: 3 },
];

function BranchComparison({
  rows,
  ui,
  demo,
}: {
  rows: ExecutiveDashboardSummary['branchBreakdown'];
  ui: (value: string) => string;
  demo?: boolean;
}) {
  const metrics: Array<{ key: BranchMetricKey; label: string; currency: boolean; tone: 'emerald' | 'amber' | 'cyan' | 'violet' | 'rose' | 'blue' | 'fuchsia' | 'teal' | 'slate'; icon: LucideIcon }> = [
    { key: 'totalRevenue', label: ui('إجمالي الإيرادات'), currency: true, tone: 'emerald', icon: TrendingUp },
    { key: 'subscriptionRevenue', label: ui('إيرادات الاشتراكات'), currency: true, tone: 'amber', icon: ReceiptText },
    { key: 'barRevenue', label: ui('إيرادات البار والكافيه'), currency: true, tone: 'cyan', icon: ShoppingBag },
    { key: 'productRevenue', label: ui('إيرادات البروتين والمنتجات'), currency: true, tone: 'violet', icon: Dumbbell },
    { key: 'expenses', label: ui('إجمالي المصروفات'), currency: true, tone: 'rose', icon: TrendingDown },
    { key: 'subscriptionsCount', label: ui('عدد الاشتراكات'), currency: false, tone: 'blue', icon: PackageCheck },
    { key: 'newMembers', label: ui('الأعضاء الجدد'), currency: false, tone: 'fuchsia', icon: UserPlus },
    { key: 'inbodyCount', label: ui('جلسات InBody'), currency: false, tone: 'teal', icon: HeartPulse },
    { key: 'blockedMembers', label: ui('الأعضاء المحظورون'), currency: false, tone: 'slate', icon: AlertTriangle },
  ];

  const tones = {
    emerald: { line: 'bg-emerald-500', icon: 'bg-emerald-500/12 text-emerald-600 ring-emerald-500/20', wash: 'from-emerald-500/[0.09]', total: 'text-emerald-700 dark:text-emerald-300' },
    amber: { line: 'bg-amber-500', icon: 'bg-amber-500/12 text-amber-600 ring-amber-500/20', wash: 'from-amber-500/[0.09]', total: 'text-amber-700 dark:text-amber-300' },
    cyan: { line: 'bg-cyan-500', icon: 'bg-cyan-500/12 text-cyan-600 ring-cyan-500/20', wash: 'from-cyan-500/[0.09]', total: 'text-cyan-700 dark:text-cyan-300' },
    violet: { line: 'bg-violet-500', icon: 'bg-violet-500/12 text-violet-600 ring-violet-500/20', wash: 'from-violet-500/[0.09]', total: 'text-violet-700 dark:text-violet-300' },
    rose: { line: 'bg-rose-500', icon: 'bg-rose-500/12 text-rose-600 ring-rose-500/20', wash: 'from-rose-500/[0.09]', total: 'text-rose-700 dark:text-rose-300' },
    blue: { line: 'bg-blue-500', icon: 'bg-blue-500/12 text-blue-600 ring-blue-500/20', wash: 'from-blue-500/[0.09]', total: 'text-blue-700 dark:text-blue-300' },
    fuchsia: { line: 'bg-fuchsia-500', icon: 'bg-fuchsia-500/12 text-fuchsia-600 ring-fuchsia-500/20', wash: 'from-fuchsia-500/[0.09]', total: 'text-fuchsia-700 dark:text-fuchsia-300' },
    teal: { line: 'bg-teal-500', icon: 'bg-teal-500/12 text-teal-600 ring-teal-500/20', wash: 'from-teal-500/[0.09]', total: 'text-teal-700 dark:text-teal-300' },
    slate: { line: 'bg-slate-500', icon: 'bg-slate-500/12 text-slate-600 ring-slate-500/20', wash: 'from-slate-500/[0.09]', total: 'text-slate-700 dark:text-slate-300' },
  };

  if (!rows.length) return null;

  return (
    <section className="rounded-[24px] border border-border/60 bg-gradient-to-b from-card/70 to-background/30 p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></span>
          <div>
            <h2 className="font-bold">{ui('ملخص الفروع')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{ui('كل مؤشرات اللوحة القديمة بتصميم أوضح وأسرع في القراءة')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {demo && <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300">{ui('بيانات تجريبية للمعاينة')}</span>}
          <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">{number(rows.length)} {ui('فروع')}</span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => {
          const values = rows.map((row) => Number(row[metric.key] ?? 0));
          const max = Math.max(...values);
          const total = values.reduce((sum, value) => sum + value, 0);
          const tone = tones[metric.tone];
          const Icon = metric.icon;
          return (
            <Card key={metric.key} className="group relative overflow-hidden border-border/70 p-0 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg">
              <div className={cn('absolute inset-x-0 top-0 h-1', tone.line)} />
              <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-bl to-transparent opacity-80', tone.wash)} />
              <div className="relative p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{metric.label}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{ui('إجمالي كل الفروع')}</p>
                    <p className={cn('nums mt-1.5 text-2xl font-black tracking-tight', tone.total)}>{metric.currency ? money(total, true) : number(total)}</p>
                  </div>
                  <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 transition-transform group-hover:scale-105', tone.icon)}><Icon className="size-6" /></span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
                  {rows.map((branch, index) => {
                    const value = values[index];
                    const best = max > 0 && value === max;
                    return (
                      <div key={branch.branchId} className={cn('min-w-0 rounded-xl bg-background/55 px-2 py-2.5 text-center ring-1 ring-border/60', best && 'bg-emerald-500/[0.08] ring-emerald-500/25')}>
                        <p className="truncate text-[10px] font-medium text-muted-foreground">{branch.branchName}</p>
                        <p className={cn('nums mt-1 truncate text-xs font-black sm:text-sm', best && 'text-emerald-700 dark:text-emerald-300')}>{metric.currency ? money(value, true) : number(value)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">{ui('الفرع المميز باللون الأخضر هو الأعلى في المؤشر خلال الفترة المحددة.')}</p>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-64 rounded-3xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-xl" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Skeleton className="h-[420px] rounded-2xl xl:col-span-2" />
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { ui } = useLocale();
  const { data: branches = [] } = useBranches();
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [startDate, setStartDate] = useState(startOfMonth);
  const [endDate, setEndDate] = useState(localToday);
  const [branchId, setBranchId] = useState('all');

  const setPeriod = (next: PeriodPreset) => {
    setPreset(next);
    const today = localToday();
    if (next === 'today') setStartDate(today);
    if (next === '7d') setStartDate(daysAgo(6));
    if (next === '30d') setStartDate(daysAgo(29));
    if (next === 'month') setStartDate(startOfMonth());
    if (next !== 'custom') setEndDate(today);
  };

  const query = useQuery({
    queryKey: ['dashboard', 'executive', startDate, endDate, branchId],
    queryFn: async () => {
      const { data } = await api.get<ExecutiveDashboardSummary>('/dashboard/executive', {
        params: {
          startDate,
          endDate,
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return data;
    },
    enabled: Boolean(startDate && endDate && startDate <= endDate),
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const data = query.data;
  const hasRealBranchData = Boolean(data?.branchBreakdown?.length);
  const configuredBranchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  const realBranchRows = (data?.branchBreakdown ?? []).map((row) => ({
    ...row,
    branchName: configuredBranchNames.get(row.branchId) || row.branchName,
  }));
  const demoBranchRows = branches.map((branch, index) => {
    const sample = DEMO_BRANCH_BREAKDOWN[index % DEMO_BRANCH_BREAKDOWN.length];
    return {
      ...sample,
      branchId: branch.id,
      branchName: branch.name || `${ui('فرع')} ${number(index + 1)}`,
    };
  });
  const branchComparisonRows = hasRealBranchData
    ? realBranchRows
    : IS_LOCAL_PREVIEW
      ? demoBranchRows
      : [];
  const financialTrend = useMemo(() => {
    const rows = data?.trends ?? [];
    if (rows.length <= 45) return rows;
    const chunk = Math.ceil(rows.length / 30);
    const merged = [];
    for (let index = 0; index < rows.length; index += chunk) {
      const group = rows.slice(index, index + chunk);
      merged.push({
        ...group[group.length - 1],
        revenue: group.reduce((sum, row) => sum + row.revenue, 0),
        expenses: group.reduce((sum, row) => sum + row.expenses, 0),
        profit: group.reduce((sum, row) => sum + row.profit, 0),
        newMembers: group.reduce((sum, row) => sum + row.newMembers, 0),
        newSubscriptions: group.reduce((sum, row) => sum + row.newSubscriptions, 0),
        checkins: group.reduce((sum, row) => sum + row.checkins, 0),
      });
    }
    return merged;
  }, [data?.trends]);

  const expenseBreakdown = (data?.expenseBreakdown ?? []).slice(0, 6);
  const packagePerformance = (data?.packagePerformance ?? []).slice(0, 7);
  const selectedBranch = branchId === 'all' ? ui('كل الفروع') : branches.find((branch) => String(branch.id) === branchId)?.name;
  const activeRate = data?.totalMembers.total
    ? Math.round((data.totalMembers.active / data.totalMembers.total) * 100)
    : 0;

  const quickActions = [
    { label: ui('اشتراك جديد'), icon: UserPlus, href: '/club/subscriptions/new', tone: 'bg-emerald-500/10 text-emerald-600' },
    { label: ui('تسجيل حضور'), icon: ScanLine, href: '/club/members/attendance', tone: 'bg-sky-500/10 text-sky-600' },
    { label: ui('إيصال اشتراك'), icon: ReceiptText, href: '/club/subscriptions/receipts', tone: 'bg-amber-500/10 text-amber-600' },
    { label: ui('فاتورة InBody'), icon: HeartPulse, href: '/club/subscriptions/inbody-invoices', tone: 'bg-violet-500/10 text-violet-600' },
    { label: ui('إدارة الإيرادات'), icon: TrendingUp, href: '/finance/revenues', tone: 'bg-teal-500/10 text-teal-600' },
    { label: ui('التقارير الشاملة'), icon: FileBarChart, href: '/reports', tone: 'bg-rose-500/10 text-rose-600' },
  ];

  if (query.isLoading) return <DashboardSkeleton />;
  if (query.isError) {
    return <ErrorState message={apiError(query.error, ui('تعذر تحميل لوحة تحكم الجيم'))} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="space-y-5 pb-8" dir="rtl">
      <section className="relative isolate -mx-3 w-[calc(100%+1.5rem)] overflow-hidden rounded-[28px] bg-brand-gradient px-5 py-6 text-white shadow-xl ring-1 ring-white/10 sm:-mx-4 sm:w-[calc(100%+2rem)] sm:px-7 lg:-mx-5 lg:w-[calc(100%+2.5rem)] lg:px-8 lg:py-7 xl:-mx-6 xl:w-[calc(100%+3rem)]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:28px_28px]" />
        <div className="pointer-events-none absolute -end-16 -top-16 size-72 animate-banner-drift rounded-full bg-white/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 start-1/4 size-64 animate-banner-drift-reverse rounded-full bg-brand-300/30 blur-3xl" />
        <div className="pointer-events-none absolute start-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 animate-banner-drift rounded-full bg-brand-400/15 blur-3xl [animation-delay:3s]" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute inset-y-0 w-1/3 animate-banner-shine bg-gradient-to-r from-transparent via-white/10 to-transparent" /></div>
        <div className="relative flex flex-col">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(21rem,.75fr)] lg:items-stretch">
            <div className="flex flex-col justify-center lg:pe-4">
              <div className="mb-3 flex items-center gap-2 text-xs text-emerald-300 lg:text-sm">
                <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" /></span>
                {ui('بيانات تشغيلية ومحاسبية مباشرة')}
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden size-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:flex"><LayoutDashboard className="size-7 text-amber-300" /></div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight lg:text-3xl">{ui('لوحة الإدارة الرئيسية')}</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/65 lg:text-base">{ui('صورة واحدة واضحة للأعضاء، الاشتراكات، الحضور، المبيعات والربحية')}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10">
                  <p className="text-[11px] text-white/55">{ui('صافي الربح للفترة')}</p>
                  <p className={cn('nums mt-1 text-xl font-black', (data?.financials.profit ?? 0) >= 0 ? 'text-amber-200' : 'text-rose-300')}>{money(data?.financials.profit ?? 0)}</p>
                </div>
                <div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10">
                  <p className="text-[11px] text-white/55">{ui('الأعضاء النشطون')}</p>
                  <p className="nums mt-1 text-xl font-black text-white">{number(data?.totalMembers.active ?? 0)} <span className="text-xs font-medium text-white/45">/ {number(data?.totalMembers.total ?? 0)}</span></p>
                </div>
                <div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/10">
                  <p className="text-[11px] text-white/55">{ui('النطاق الحالي')}</p>
                  <p className="mt-1 truncate text-sm font-bold text-white">{selectedBranch} · {number(data?.period.days ?? 0)} {ui('يوم')}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] bg-black/30 p-4 shadow-xl ring-1 ring-white/15">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-amber-300/10 text-amber-300 ring-1 ring-amber-300/20"><SlidersHorizontal className="size-5" /></span>
                  <div><p className="text-sm font-bold">{ui('نطاق لوحة التحكم')}</p><p className="mt-0.5 text-[10px] text-white/45">{ui('خصص الفترة والفرع المعروض')}</p></div>
                </div>
                <Button variant="outline" size="icon" className="border-amber-300/25 bg-black/30 text-white hover:border-amber-300/60 hover:bg-black/50 hover:text-amber-100" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label={ui('تحديث الآن')}>
                  <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />
                </Button>
              </div>

              <p className="mb-2 mt-3 text-[10px] font-semibold text-white/45">{ui('الفترة الزمنية')}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {([
                  ['today', ui('اليوم')],
                  ['7d', ui('آخر 7 أيام')],
                  ['30d', ui('آخر 30 يومًا')],
                  ['month', ui('هذا الشهر')],
                  ['custom', ui('فترة مخصصة')],
                ] as Array<[PeriodPreset, string]>).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setPeriod(key)} className={cn('rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200', preset === key ? 'bg-amber-300 text-slate-950 shadow-lg shadow-amber-500/20 ring-1 ring-amber-100/70' : 'bg-white/[0.06] text-white/75 ring-1 ring-white/10 hover:bg-white/[0.12] hover:text-white')}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-2.5">
                <label className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-[14px] px-3 py-2.5 shadow-md ring-1 ring-inset ring-amber-200/20 transition-all focus-within:ring-amber-300/70" style={{ backgroundColor: '#171306' }}>
                  <CalendarDays className="size-4 shrink-0 text-amber-300" />
                  <input aria-label={ui('من تاريخ')} type="date" value={startDate} max={endDate} onChange={(event) => { setPreset('custom'); setStartDate(event.target.value); }} className="nums min-w-0 appearance-none !bg-transparent text-xs text-white outline-none [color-scheme:dark]" />
                  <span className="text-white/35">—</span>
                  <input aria-label={ui('إلى تاريخ')} type="date" value={endDate} min={startDate} onChange={(event) => { setPreset('custom'); setEndDate(event.target.value); }} className="nums min-w-0 appearance-none !bg-transparent text-xs text-white outline-none [color-scheme:dark]" />
                </label>
                <label className="relative flex min-w-0 items-center overflow-hidden rounded-[14px] shadow-md ring-1 ring-inset ring-amber-300/35 transition-all hover:ring-amber-200/70 focus-within:ring-2 focus-within:ring-amber-300/70" style={{ backgroundColor: '#171306' }}>
                  <Building2 className="pointer-events-none absolute start-3 size-4 text-amber-300" />
                  <select aria-label={ui('الفرع')} value={branchId} onChange={(event) => setBranchId(event.target.value)} className="h-11 w-full appearance-none border-0 !bg-transparent py-2 pe-9 ps-10 text-xs font-bold !text-white outline-none [color-scheme:dark] [&_option]:bg-slate-950 [&_option]:text-white">
                    <option value="all">{ui('كل الفروع')}</option>
                    {branches.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute end-3 size-4 text-white/65" />
                </label>
              </div>
            </div>
          </div>

          <div className="hidden">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-white/55"><Activity className="size-4 text-amber-300" />{ui('نبض التشغيل الآن')}</div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: ui('زيارات اليوم'), value: data?.operations.checkinsToday ?? 0, icon: ScanLine, tone: 'text-sky-300 bg-sky-300/10 ring-sky-300/20' },
                { label: ui('اشتراكات جديدة'), value: data?.operations.newSubscriptions ?? 0, icon: PackageCheck, tone: 'text-violet-300 bg-violet-300/10 ring-violet-300/20' },
                { label: ui('مبيعات مكتملة اليوم'), value: data?.operations.quickSalesToday ?? 0, icon: ShoppingBag, tone: 'text-amber-300 bg-amber-300/10 ring-amber-300/20' },
                { label: ui('تنتهي خلال 30 يومًا'), value: data?.operations.expiring30 ?? 0, icon: CalendarClock, tone: 'text-rose-300 bg-rose-300/10 ring-rose-300/20' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-3.5 py-3 ring-1 ring-white/10 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10">
                  <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl ring-1', item.tone)}><item.icon className="size-5" /></span>
                  <div className="min-w-0"><p className="truncate text-[11px] font-medium text-white/55">{item.label}</p><p className="nums mt-0.5 text-xl font-black text-white">{number(item.value)}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <BranchComparison rows={branchComparisonRows} ui={ui} demo={!hasRealBranchData && IS_LOCAL_PREVIEW} />

      <section className="grid gap-5 xl:grid-cols-3">
        <Card className="overflow-hidden p-5 xl:col-span-2">
          <SectionTitle icon={Landmark} title={ui('حركة المدفوعات والمصروفات')} subtitle={ui('المدفوع من إدارة الأعضاء والمصروفات من القيود المحاسبية')} action={<Link to="/finance/analysis" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">{ui('التحليل المالي')}<ArrowLeft className="size-3.5" /></Link>} />
          <div className="h-[330px] min-w-0">
            {financialTrend.some((row) => row.revenue || row.expenses) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={financialTrend} margin={{ top: 12, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gymRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#D4A72C" stopOpacity={0.35} /><stop offset="95%" stopColor="#D4A72C" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gymExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="hsl(var(--border))" opacity={0.7} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={22} />
                  <YAxis tickFormatter={(value) => money(Number(value), true)} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={62} />
                  <Tooltip formatter={(value, name) => [money(Number(value)), name]} labelFormatter={(label) => `${ui('التاريخ')}: ${label}`} contentStyle={{ borderRadius: 14, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                  <Legend iconType="circle" />
                  <Area animationDuration={900} type="monotone" dataKey="revenue" name={ui('المدفوع')} stroke="#D4A72C" strokeWidth={3} fill="url(#gymRevenue)" />
                  <Area animationDuration={1050} type="monotone" dataKey="expenses" name={ui('المصروفات')} stroke="#f43f5e" strokeWidth={2.5} fill="url(#gymExpense)" />
                  <Line animationDuration={1200} type="monotone" dataKey="profit" name={ui('صافي الربح')} stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart label={ui('لا توجد مدفوعات أو مصروفات في الفترة')} />}
          </div>
        </Card>

        <Card className="overflow-hidden p-5">
          <SectionTitle icon={BadgeDollarSign} title={ui('المصروفات راحت في إيه')} subtitle={ui('تفصيل المصروفات حسب الحساب المحاسبي')} />
          <div className="h-[245px] min-w-0">
            {expenseBreakdown.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseBreakdown} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3} animationDuration={1000}>
                    {expenseBreakdown.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderRadius: 14, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart label={ui('لا توجد مصروفات في الفترة')} />}
          </div>
          <div className="space-y-2">
            {expenseBreakdown.slice(0, 4).map((item, index) => (
              <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2"><span className="size-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} /><span className="truncate">{item.name}</span></span>
                <span className="nums shrink-0 font-bold">{money(item.value, true)}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle icon={Dumbbell} title={ui('نبض التشغيل اليومي')} subtitle={ui('الحضور والأعضاء والاشتراكات الجديدة خلال الفترة')} action={<Link to="/reports/club/attendance" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">{ui('تقرير الحضور')}<ArrowLeft className="size-3.5" /></Link>} />
          <div className="h-[315px] min-w-0">
            {financialTrend.some((row) => row.checkins || row.newMembers || row.newSubscriptions) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financialTrend} margin={{ top: 12, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 14, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                  <Legend iconType="circle" />
                  <Bar dataKey="checkins" name={ui('الزيارات')} fill="#0ea5e9" radius={[5, 5, 0, 0]} animationDuration={850} />
                  <Bar dataKey="newSubscriptions" name={ui('اشتراكات جديدة')} fill="#8b5cf6" radius={[5, 5, 0, 0]} animationDuration={1000} />
                  <Bar dataKey="newMembers" name={ui('أعضاء جدد')} fill="#D4A72C" radius={[5, 5, 0, 0]} animationDuration={1150} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart label={ui('لا توجد حركة تشغيلية في الفترة')} />}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={AlertTriangle} title={ui('مركز التنبيهات')} subtitle={ui('أولويات تحتاج متابعة من الإدارة')} />
          <div className="space-y-3">
            {[
              { label: ui('تنتهي خلال 7 أيام'), value: data?.operations.expiring7 ?? 0, icon: CalendarClock, href: '/club/subscriptions/expired', tone: 'text-rose-600 bg-rose-500/10' },
              { label: ui('تنتهي خلال 30 يومًا'), value: data?.operations.expiring30 ?? 0, icon: Clock3, href: '/reports/club/subscriptions-expiring', tone: 'text-amber-600 bg-amber-500/10' },
              { label: ui('اشتراكات عليها متبقي'), value: data?.operations.outstandingCount ?? 0, icon: WalletCards, href: '/club/subscriptions/outstanding', tone: 'text-violet-600 bg-violet-500/10' },
              { label: ui('أصناف وصلت لإعادة الطلب'), value: data?.operations.lowStock ?? 0, icon: Boxes, href: '/inventory/dashboard', tone: 'text-sky-600 bg-sky-500/10' },
            ].map((alert) => (
              <Link key={alert.label} to={alert.href} className="group flex items-center gap-3 rounded-2xl border border-border/70 p-3 transition-all hover:border-primary/30 hover:bg-muted/40">
                <span className={cn('flex size-10 items-center justify-center rounded-xl', alert.tone)}><alert.icon className="size-5" /></span>
                <span className="min-w-0 flex-1 text-sm font-medium">{alert.label}</span>
                <span className="nums flex min-w-9 items-center justify-center rounded-lg bg-muted px-2 py-1 text-sm font-black group-hover:bg-primary group-hover:text-primary-foreground">{number(alert.value)}</span>
              </Link>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-amber-500/[0.08] p-4 ring-1 ring-amber-500/15">
            <div className="flex items-center justify-between"><span className="text-xs font-medium">{ui('صحة قاعدة الأعضاء')}</span><span className="nums text-sm font-black text-amber-700 dark:text-amber-300">{number(activeRate)}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-l from-amber-300 to-amber-600 transition-all duration-1000" style={{ width: `${Math.min(activeRate, 100)}%` }} /></div>
            <p className="mt-2 text-[11px] text-muted-foreground">{number(data?.totalMembers.active ?? 0)} {ui('نشط من إجمالي')} {number(data?.totalMembers.total ?? 0)}</p>
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle icon={PackageCheck} title={ui('أداء الباقات')} subtitle={ui('الباقات الأكثر تحقيقًا للتحصيل خلال الفترة')} action={<Link to="/reports/club/subscriptions-daily" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">{ui('تقرير الاشتراكات')}<ArrowLeft className="size-3.5" /></Link>} />
          <div className="h-[310px] min-w-0">
            {packagePerformance.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={packagePerformance} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 5" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(value) => money(Number(value), true)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={105} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value, name) => name === 'revenue' ? money(Number(value)) : number(Number(value))} contentStyle={{ borderRadius: 14, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                  <Bar dataKey="revenue" name={ui('التحصيل')} fill="#8b5cf6" radius={[0, 7, 7, 0]} animationDuration={1100} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart label={ui('لا توجد اشتراكات جديدة في الفترة')} />}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Sparkles} title={ui('تشغيل اليوم')} subtitle={ui('لقطة سريعة للحالة الحالية')} />
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: ui('زيارات اليوم'), value: data?.operations.checkinsToday ?? 0, icon: ScanLine, tone: 'text-sky-600' },
              { label: ui('حجوزات اليوم'), value: data?.operations.bookingsToday ?? 0, icon: CalendarDays, tone: 'text-violet-600' },
              { label: ui('حصص اليوم'), value: data?.operations.classesToday ?? 0, icon: Dumbbell, tone: 'text-amber-600' },
              { label: ui('المدربون'), value: data?.operations.trainers ?? 0, icon: Activity, tone: 'text-amber-600' },
              { label: ui('الموظفون'), value: data?.operations.employees ?? 0, icon: Users, tone: 'text-rose-600' },
              { label: ui('مرافق النادي'), value: data?.operations.facilities ?? 0, icon: CheckCircle2, tone: 'text-teal-600' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border/70 bg-muted/20 p-3 text-center transition-colors hover:bg-muted/50">
                <item.icon className={cn('mx-auto size-5', item.tone)} />
                <p className="nums mt-2 text-xl font-black">{number(item.value)}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <Card className="p-5">
          <SectionTitle icon={ClipboardPlus} title={ui('إجراءات سريعة')} subtitle={ui('أكثر العمليات استخدامًا')} />
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link key={action.href} to={action.href} className="group rounded-2xl border border-border/70 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                <span className={cn('mx-auto flex size-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110', action.tone)}><action.icon className="size-5" /></span>
                <p className="mt-2 text-[11px] font-medium">{action.label}</p>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Users} title={ui('أحدث الأعضاء')} subtitle={ui('آخر ملفات أعضاء تمت إضافتها')} />
          <div className="space-y-2.5">
            {(data?.recentActivities.members ?? []).length ? data?.recentActivities.members.map((member, index) => (
              <Link key={`${member.code}-${index}`} to="/club/members" className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/50">
                <span className="flex size-9 items-center justify-center rounded-full bg-sky-500/10 text-xs font-black text-sky-600">{member.label?.slice(0, 1) || 'ع'}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{member.label}</span><span className="nums mt-0.5 block text-[10px] text-muted-foreground">{member.code}</span></span>
                <span className="text-[9px] text-muted-foreground">{new Date(member.date).toLocaleDateString('ar-EG')}</span>
              </Link>
            )) : <EmptyChart label={ui('لا يوجد أعضاء جدد')} />}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Banknote} title={ui('أحدث التحصيلات')} subtitle={ui('آخر إيصالات الاشتراكات المسجلة')} />
          <div className="space-y-2.5">
            {(data?.recentActivities.payments ?? []).length ? data?.recentActivities.payments.map((payment, index) => (
              <Link key={`${payment.receiptNumber}-${index}`} to="/club/subscriptions/receipts" className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/50">
                <span className="flex size-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300"><Banknote className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{payment.label}</span><span className="nums mt-0.5 block text-[10px] text-muted-foreground">{payment.receiptNumber}</span></span>
                <span className="nums text-[11px] font-black text-amber-700 dark:text-amber-300">{money(payment.amount)}</span>
              </Link>
            )) : <EmptyChart label={ui('لا توجد تحصيلات في الفترة')} />}
          </div>
        </Card>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed bg-muted/20 px-4 py-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-amber-600" />{ui('الأرقام المالية متطابقة مع القيود المرحّلة في دفتر الأستاذ العام')}</span>
        <span className="nums">{data?.period.start} — {data?.period.end}</span>
      </div>
    </div>
  );
}
