import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowUpLeft,
  Banknote,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock3,
  Coffee,
  CreditCard,
  FileBarChart,
  Lightbulb,
  PackageSearch,
  ReceiptText,
  RefreshCw,
  Scale,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type {
  DashboardInsight,
  DashboardSummary,
  PeriodPreset,
} from './dashboard-model';

export interface DashboardFormatters {
  money: (value: number, compact?: boolean) => string;
  number: (value: number) => string;
  percent: (value: number) => string;
}

interface BranchOption {
  id: number;
  name: string;
}

interface CommandBannerProps extends DashboardFormatters {
  ui: (value: string) => string;
  userName?: string | null;
  selectedBranch: string;
  startDate: string;
  endDate: string;
  preset: PeriodPreset;
  branchId: string;
  branches: BranchOption[];
  updatedAt?: string;
  netSales: number;
  grossProfit: number;
  orders: number;
  isFetching: boolean;
  posHref: string;
  onPresetChange: (preset: Exclude<PeriodPreset, 'custom'>) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onRefresh: () => void;
}

const presets: Array<[Exclude<PeriodPreset, 'custom'>, string]> = [
  ['today', 'اليوم'],
  ['7d', 'آخر 7 أيام'],
  ['30d', 'آخر 30 يومًا'],
  ['month', 'هذا الشهر'],
];

export function CommandBanner({
  ui,
  userName,
  selectedBranch,
  startDate,
  endDate,
  preset,
  branchId,
  branches,
  updatedAt,
  netSales,
  grossProfit,
  orders,
  isFetching,
  posHref,
  onPresetChange,
  onStartDateChange,
  onEndDateChange,
  onBranchChange,
  onRefresh,
  money,
  number,
}: CommandBannerProps) {
  return (
    <section className="dashboard-command-banner overflow-hidden rounded-2xl border bg-card text-card-foreground" aria-labelledby="dashboard-welcome-title">
      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <Coffee className="mt-1 size-7 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h1 id="dashboard-welcome-title" className="text-xl font-bold leading-relaxed sm:text-2xl">
                {userName ? ui(`أهلًا ${userName}، دي صورة الكافيه كاملة`) : ui('مركز قيادة الكافيه')}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-7 text-muted-foreground">
                {ui('المبيعات والربحية والتشغيل والمخزون في شاشة واحدة تساعدك تاخد القرار بسرعة')}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2"><Store className="size-4" />{selectedBranch}</span>
            <span className="flex items-center gap-2"><Clock3 className="size-4" />{updatedAt ? `${ui('آخر تحديث')} ${updatedAt}` : ui('جاري تحديث البيانات')}</span>
          </div>
        </div>
        <Button permissionAction={null} asChild variant="brand" className="min-h-11 shrink-0">
          <Link to={posHref}><Coffee className="size-4" />{ui('فتح نقطة البيع')}</Link>
        </Button>
      </div>

      <dl className="dashboard-command-totals grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-3 sm:gap-6 sm:px-6">
        {[
          [ui('صافي المبيعات'), money(netSales)],
          [ui('مجمل الربح'), money(grossProfit)],
          [ui('طلبات الفترة'), number(orders)],
        ].map(([label, value]) => <div key={label} className="flex min-w-0 items-center justify-between gap-3 sm:block">
          <dt className="text-sm">{label}</dt>
          <dd className="nums mt-1 break-words text-2xl font-bold leading-relaxed">{value}</dd>
        </div>)}
      </dl>

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="size-4 text-primary" />{ui('نطاق التحليل')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {presets.map(([key, label]) => <button key={key} type="button" aria-pressed={preset === key}
              onClick={() => onPresetChange(key)}
              className={cn('min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                preset === key ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-card-foreground hover:bg-muted')}>
              {ui(label)}
            </button>)}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.3fr_auto] lg:items-end">
          <label className="grid min-w-0 gap-2 text-sm text-foreground">
            <span>{ui('من تاريخ')}</span>
            <input aria-label={ui('من تاريخ')} type="date" value={startDate} max={endDate}
              onChange={(event) => onStartDateChange(event.target.value)} className="dashboard-command-field nums" />
          </label>
          <label className="grid min-w-0 gap-2 text-sm text-foreground">
            <span>{ui('إلى تاريخ')}</span>
            <input aria-label={ui('إلى تاريخ')} type="date" value={endDate} min={startDate}
              onChange={(event) => onEndDateChange(event.target.value)} className="dashboard-command-field nums" />
          </label>
          <label className="grid min-w-0 gap-2 text-sm text-foreground">
            <span>{ui('الفرع')}</span>
            <select aria-label={ui('الفرع')} value={branchId} onChange={(event) => onBranchChange(event.target.value)} className="dashboard-command-field">
              <option value="all">{ui('كل الفروع المتاحة')}</option>
              {branches.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}
            </select>
          </label>
          <Button permissionAction={null} variant="outline" className="min-h-11 self-end" onClick={onRefresh} disabled={isFetching}>
            <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />{ui('تحديث البيانات')}
          </Button>
        </div>
      </div>
    </section>
  );
}

interface PulseItem {
  title: string;
  value: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status: 'good' | 'warning' | 'neutral';
}

export function OperationalPulse({ ui, items }: { ui: (value: string) => string; items: PulseItem[] }) {
  return (
    <section aria-labelledby="operational-pulse-title">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="size-5 text-primary" />
        <h2 id="operational-pulse-title" className="font-bold">{ui('نبض التشغيل الآن')}</h2>
      </div>
      <div className="grid overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.title} to={item.href} className="group flex min-h-32 items-center gap-3 border-b p-4 transition-colors hover:bg-muted/45 sm:border-e xl:border-b-0">
              <span className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-xl',
                item.status === 'good' && 'bg-success/10 text-success',
                item.status === 'warning' && 'bg-warning/12 text-warning',
                item.status === 'neutral' && 'bg-primary/10 text-primary',
              )}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-muted-foreground">{item.title}</span>
                <strong className="nums mt-1 block truncate text-base">{item.value}</strong>
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">{item.description}</span>
              </span>
              <ArrowUpLeft className="ms-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 rtl:rotate-0" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

interface OutcomeItem {
  title: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone: 'primary' | 'sky' | 'emerald' | 'violet';
}

export function OutcomeGrid({ ui, items }: { ui: (value: string) => string; items: OutcomeItem[] }) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
  };
  return (
    <section aria-labelledby="outcomes-title">
      <SectionHeading icon={BarChart3} title={ui('نتائج الفترة')} description={ui('أهم مؤشرات الأداء والمقارنة')} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title} className="overflow-hidden border-0 shadow-sm ring-1 ring-border transition-transform duration-200 hover:-translate-y-0.5">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{item.title}</p>
                    <p className="nums mt-3 truncate text-2xl font-black tracking-[-0.025em]">{item.value}</p>
                    <p className="mt-1 min-h-5 text-xs text-muted-foreground">{item.note}</p>
                  </div>
                  <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', tones[item.tone])}><Icon className="size-5" /></span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function SectionHeading({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
        <div>
          <h2 className="font-bold">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function TrendAnalysis({
  ui,
  data,
  money,
  number,
}: {
  ui: (value: string) => string;
  data: Array<{ date: string; label: string; sales: number; orders: number }>;
  money: DashboardFormatters['money'];
  number: DashboardFormatters['number'];
}) {
  return (
    <section className="min-w-0 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-5" aria-labelledby="trend-title">
      <SectionHeading icon={TrendingUp} title={ui('اتجاه المبيعات والطلبات')} description={ui('تطور الأداء داخل الفترة المختارة')} />
      {data.length ? (
        <div className="h-[330px] w-full" role="img" aria-label={ui('رسم يوضح المبيعات والطلبات حسب اليوم')}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="dashboardSalesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 5" vertical={false} opacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
              <YAxis yAxisId="sales" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={54} tickFormatter={(value) => money(Number(value), true)} />
              <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
              <Tooltip
                formatter={(value, name) => [
                  name === 'sales' ? money(Number(value)) : number(Number(value)),
                  name === 'sales' ? ui('المبيعات') : ui('الطلبات'),
                ]}
                labelFormatter={(label) => `${ui('التاريخ')}: ${label}`}
                contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
              />
              <Legend formatter={(value) => value === 'sales' ? ui('المبيعات') : ui('الطلبات')} />
              <Area yAxisId="sales" type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#dashboardSalesFill)" activeDot={{ r: 5 }} />
              <Line yAxisId="orders" type="monotone" dataKey="orders" stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <DashboardEmpty icon={BarChart3} title={ui('لا توجد مبيعات في الفترة')} description={ui('غيّر الفترة أو الفرع لعرض اتجاه المبيعات والطلبات')} />
      )}
    </section>
  );
}

export function TopProductsPanel({
  ui,
  rows,
  money,
  number,
  reportsHref,
}: {
  ui: (value: string) => string;
  rows: Array<DashboardSummary['topProducts'][number] & { rank: number; percentage: number }>;
  money: DashboardFormatters['money'];
  number: DashboardFormatters['number'];
  reportsHref: string;
}) {
  return (
    <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-5" aria-labelledby="top-products-title">
      <SectionHeading
        icon={ShoppingBag}
        title={ui('المنتجات التي تقود المبيعات')}
        description={ui('ترتيب حسب إيراد الفترة')}
        action={<Button permissionAction={null} asChild variant="ghost" size="sm" className="min-h-11"><Link to={reportsHref}>{ui('التقارير')}<ArrowUpLeft className="size-4" /></Link></Button>}
      />
      {rows.length ? (
        <div className="space-y-4">
          {rows.slice(0, 6).map((row) => (
            <div key={row.name} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3">
              <span className={cn('nums flex size-8 items-center justify-center rounded-lg text-xs font-black', row.rank <= 3 ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground')}>{number(row.rank)}</span>
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-bold">{row.name}</p>
                  <p className="nums shrink-0 text-sm font-black">{money(row.revenue)}</p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, row.percentage)}%` }} />
                </div>
                <p className="nums mt-1 text-[11px] text-muted-foreground">{number(row.quantity)} {ui('وحدة مباعة')} · {row.percentage.toFixed(0)}%</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DashboardEmpty icon={ShoppingBag} title={ui('لا توجد منتجات مباعة')} description={ui('ستظهر المنتجات الأعلى مبيعًا بعد اكتمال أول طلب في الفترة')} compact />
      )}
    </section>
  );
}

const PAYMENT_COLORS = ['#f59e0b', '#0ea5e9', '#8b5cf6', '#10b981', '#f43f5e', '#64748b'];

export function PaymentMixPanel({
  ui,
  rows,
  money,
}: {
  ui: (value: string) => string;
  rows: Array<DashboardSummary['paymentMix'][number] & { percentage: number }>;
  money: DashboardFormatters['money'];
}) {
  return (
    <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-5" aria-labelledby="payment-mix-title">
      <SectionHeading icon={CreditCard} title={ui('توزيع طرق الدفع')} description={ui('كيف تم تحصيل مبيعات الفترة')} />
      {rows.length ? (
        <div className="grid items-center gap-4 sm:grid-cols-[minmax(10rem,.85fr)_minmax(0,1.15fr)]">
          <div className="h-52" role="img" aria-label={ui('رسم يوضح نسبة كل طريقة دفع')}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="amount" nameKey="method" innerRadius={48} outerRadius={76} paddingAngle={3} stroke="none">
                  {rows.map((row, index) => <Cell key={row.method} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => money(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2.5">
            {rows.map((row, index) => (
              <div key={row.method} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: PAYMENT_COLORS[index % PAYMENT_COLORS.length] }} />
                <span className="truncate">{ui(row.method)}</span>
                <span className="nums text-end"><b>{row.percentage.toFixed(0)}%</b><span className="ms-2 text-xs text-muted-foreground">{money(row.amount, true)}</span></span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <DashboardEmpty icon={WalletCards} title={ui('لا توجد مدفوعات')} description={ui('طرق الدفع ستظهر بعد تسجيل مبيعات مكتملة')} compact />
      )}
    </section>
  );
}

export function InsightsPanel({
  ui,
  insights,
  money,
  percent,
}: {
  ui: (value: string) => string;
  insights: DashboardInsight[];
  money: DashboardFormatters['money'];
  percent: DashboardFormatters['percent'];
}) {
  const copy = (insight: DashboardInsight) => {
    if (insight.key === 'sales-change') return {
      title: insight.value >= 0 ? ui('المبيعات أعلى من الفترة السابقة') : ui('المبيعات أقل من الفترة السابقة'),
      description: `${insight.value >= 0 ? '+' : ''}${percent(insight.value)} ${ui('مقارنة بنفس طول الفترة السابقة')}`,
      icon: insight.value >= 0 ? TrendingUp : TrendingDown,
    };
    if (insight.key === 'waste-ratio') return {
      title: insight.value > 0 ? ui('الهالك مؤثر على صافي الفترة') : ui('لا توجد تكلفة هالك مسجلة'),
      description: `${percent(insight.value)} ${ui('من صافي المبيعات')}`,
      icon: Trash2,
    };
    if (insight.key === 'cash-variance') return {
      title: Math.abs(insight.value) > 0.01 ? ui('فرق نقدية يحتاج مراجعة') : ui('آخر إغلاق نقدي متطابق'),
      description: Math.abs(insight.value) > 0.01 ? money(insight.value) : ui('لا يوجد فرق مسجل'),
      icon: Banknote,
    };
    return {
      title: ui('المنتج الأول يقود جزءًا من الإيراد'),
      description: `${percent(insight.value)} ${ui('من صافي المبيعات')}`,
      icon: ShoppingBag,
    };
  };

  return (
    <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-5" aria-labelledby="insights-title">
      <SectionHeading icon={Lightbulb} title={ui('قراءة سريعة للأرقام')} description={ui('استنتاجات مباشرة من بيانات الفترة')} />
      {insights.length ? (
        <div className="space-y-2">
          {insights.map((insight) => {
            const item = copy(insight);
            const Icon = item.icon;
            return (
              <div key={insight.key} className="flex items-start gap-3 border-b border-border/70 py-3 last:border-0">
                <span className={cn(
                  'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg',
                  insight.tone === 'positive' && 'bg-success/10 text-success',
                  insight.tone === 'warning' && 'bg-warning/12 text-warning',
                  insight.tone === 'neutral' && 'bg-primary/10 text-primary',
                )}><Icon className="size-4" /></span>
                <div><h3 className="text-sm font-bold">{item.title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p></div>
              </div>
            );
          })}
        </div>
      ) : (
        <DashboardEmpty icon={Lightbulb} title={ui('نحتاج بيانات أكثر')} description={ui('ستظهر القراءة السريعة بعد وجود مبيعات أو إغلاق وردية')} compact />
      )}
    </section>
  );
}

interface AttentionGroup {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  rows: Array<{ title: string; value: string; note?: string }>;
  empty: string;
  tone: 'warning' | 'danger' | 'primary';
}

export function AttentionQueue({ ui, groups }: { ui: (value: string) => string; groups: AttentionGroup[] }) {
  const toneClasses = {
    warning: 'bg-warning/12 text-warning',
    danger: 'bg-destructive/10 text-destructive',
    primary: 'bg-primary/10 text-primary',
  };
  return (
    <section aria-labelledby="attention-title">
      <SectionHeading icon={AlertTriangle} title={ui('يحتاج انتباهك')} description={ui('أهم العناصر التي تستحق مراجعة الآن')} />
      <div className="grid gap-3 lg:grid-cols-3">
        {groups.map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.title} className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={cn('flex size-10 items-center justify-center rounded-xl', toneClasses[group.tone])}><Icon className="size-5" /></span>
                  <div><h3 className="font-bold">{group.title}</h3><p className="mt-0.5 text-xs text-muted-foreground">{group.description}</p></div>
                </div>
                <Button permissionAction={null} asChild variant="ghost" size="icon" className="size-11 shrink-0">
                  <Link to={group.href} aria-label={ui(`عرض ${group.title}`)}><ArrowUpLeft className="size-4" /></Link>
                </Button>
              </div>
              {group.rows.length ? (
                <div className="mt-4 space-y-1">
                  {group.rows.slice(0, 4).map((row) => (
                    <div key={`${row.title}-${row.value}`} className="flex items-center justify-between gap-3 border-b border-border/70 py-2.5 last:border-0">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{row.title}</p>{row.note ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.note}</p> : null}</div>
                      <b className="nums shrink-0 text-sm">{row.value}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 flex items-center gap-2 rounded-xl bg-success/8 px-3 py-3 text-sm text-success"><CheckCircle2 className="size-4" />{group.empty}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

export function QuickActions({ ui, actions }: { ui: (value: string) => string; actions: QuickAction[] }) {
  return (
    <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-5" aria-labelledby="quick-actions-title">
      <SectionHeading icon={Zap} title={ui('اختصارات التشغيل')} description={ui('وصل سريع لأكثر المهام استخدامًا')} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} to={action.href} className="group flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl bg-muted/45 px-3 py-3 text-center text-sm font-bold transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Icon className="size-5 text-primary transition-transform group-hover:-translate-y-0.5" />
              {action.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function DashboardEmpty({ icon: Icon, title, description, compact }: { icon: LucideIcon; title: string; description: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'min-h-44 py-6' : 'min-h-[300px] py-10')}>
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Icon className="size-6" /></span>
      <h3 className="mt-3 text-sm font-bold">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 pb-8">
      <Skeleton className="h-[34rem] rounded-2xl lg:h-[27rem]" />
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}</div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,.85fr)]"><Skeleton className="h-[420px] rounded-2xl" /><Skeleton className="h-[420px] rounded-2xl" /></div>
    </div>
  );
}

export const dashboardIcons = {
  shift: Coffee,
  cash: Banknote,
  waste: Trash2,
  stock: Boxes,
  sales: TrendingUp,
  orders: ReceiptText,
  averageTicket: Coffee,
  profit: Scale,
  inventory: PackageSearch,
  reports: FileBarChart,
  treasury: WalletCards,
};
