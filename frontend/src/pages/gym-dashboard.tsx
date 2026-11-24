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
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BadgeDollarSign,
  BadgePercent,
  Banknote,
  Building2,
  Boxes,
  Cake,
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
  PieChart as PieChartIcon,
  ReceiptText,
  RefreshCw,
  Repeat,
  ScanLine,
  ShoppingBag,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Target,
  TimerOff,
  Trophy,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { CLUB_ROUTES } from '@/lib/club-routes';
import { localDateStr, localToday } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ExecutiveDashboardSummary, ExecutiveTeamPerformance } from '@/types/club';
import { SearchableSelect } from '@/components/common/searchable-select';

const CHART_COLORS = ['#D4A72C', '#8b5cf6', '#0ea5e9', '#f97316', '#f43f5e', '#64748b'];
const IS_LOCAL_PREVIEW = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const TOOLTIP_STYLE = { borderRadius: 14, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' };

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
    maximumFractionDigits: compact ? 1 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(Number.isFinite(value) ? value : 0);
}

function number(value: number) {
  return new Intl.NumberFormat('ar-EG').format(Number.isFinite(value) ? value : 0);
}

/** Percent from a 0–100 value (the API sends percentages, not fractions). */
function pct(value: number, digits = 1) {
  return new Intl.NumberFormat('ar-EG', { style: 'percent', maximumFractionDigits: digits }).format(Number.isFinite(value) ? value / 100 : 0);
}

function useMediaQuery(query: string) {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** A section's open/closed state, remembered per browser (falls back to open). */
function usePersistentOpen(id: string) {
  const key = `gym-dashboard:collapsed:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(key) !== '1';
    } catch {
      return true;
    }
  });
  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      try {
        if (next) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, '1');
      } catch {
        /* storage unavailable: keep in memory only */
      }
      return next;
    });
  }, [key]);
  return [open, toggle] as const;
}

/** Header link to the full page behind a widget; a ≥44px touch target. */
function ViewAll({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 hover:underline">
      {label}
      <ArrowLeft className="size-3.5" />
    </Link>
  );
}

/**
 * A dashboard card whose body can be collapsed from its header (state remembered per section).
 * The whole title row is the toggle, so it is an easy thumb target on phones.
 */
function DashCard({
  id,
  icon: Icon,
  title,
  subtitle,
  action,
  className,
  children,
  iconClassName,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  iconClassName?: string;
}) {
  const [open, toggle] = usePersistentOpen(id);
  const bodyId = useId();
  return (
    <Card className={cn('min-w-0 overflow-hidden p-4 sm:p-5', className)}>
      <div className={cn(open && 'mb-4')}>
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={bodyId}
            className="-m-1.5 flex min-h-11 min-w-0 flex-1 items-start gap-2.5 rounded-xl p-1.5 text-start transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:items-center sm:gap-3"
          >
            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-10', iconClassName)}>
              <Icon className="size-[18px] sm:size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[15px] font-bold leading-snug sm:text-base">{title}</span>
              {subtitle && <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground sm:line-clamp-none">{subtitle}</span>}
            </span>
            <span className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/60 sm:mt-0">
              <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform motion-reduce:transition-none', !open && 'rotate-90')} />
            </span>
          </button>
          {open && action ? <div className="hidden shrink-0 sm:block">{action}</div> : null}
        </div>
        {/* Phones: the header action sits under the title so the title keeps the full width. */}
        {open && action ? <div className="-mb-2 mt-0.5 flex ps-10 sm:hidden">{action}</div> : null}
      </div>
      <div id={bodyId} hidden={!open}>
        {children}
      </div>
    </Card>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <div className="flex h-full min-h-24 items-center justify-center text-center text-sm text-muted-foreground">{label}</div>;
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

type BranchTone = 'emerald' | 'amber' | 'cyan' | 'violet' | 'rose' | 'blue' | 'fuchsia' | 'teal' | 'slate';

// Static class strings so Tailwind keeps them. `bar` is the neutral share bar in the metric's accent colour.
const BRANCH_TONES: Record<BranchTone, { line: string; head: string; icon: string; bar: string; total: string; foot: string; border: string }> = {
  emerald: { line: 'bg-emerald-500', head: 'from-emerald-500/[0.16] via-emerald-500/[0.06]', icon: 'bg-emerald-500 text-white shadow-emerald-500/30', bar: 'bg-emerald-500/60', total: 'text-emerald-700 dark:text-emerald-300', foot: 'bg-emerald-500/[0.08] border-emerald-500/20', border: 'border-emerald-500/25' },
  amber: { line: 'bg-amber-500', head: 'from-amber-500/[0.18] via-amber-500/[0.06]', icon: 'bg-amber-500 text-white shadow-amber-500/30', bar: 'bg-amber-500/60', total: 'text-amber-700 dark:text-amber-300', foot: 'bg-amber-500/[0.09] border-amber-500/20', border: 'border-amber-500/25' },
  cyan: { line: 'bg-cyan-500', head: 'from-cyan-500/[0.16] via-cyan-500/[0.06]', icon: 'bg-cyan-500 text-white shadow-cyan-500/30', bar: 'bg-cyan-500/60', total: 'text-cyan-700 dark:text-cyan-300', foot: 'bg-cyan-500/[0.08] border-cyan-500/20', border: 'border-cyan-500/25' },
  violet: { line: 'bg-violet-500', head: 'from-violet-500/[0.16] via-violet-500/[0.06]', icon: 'bg-violet-500 text-white shadow-violet-500/30', bar: 'bg-violet-500/60', total: 'text-violet-700 dark:text-violet-300', foot: 'bg-violet-500/[0.08] border-violet-500/20', border: 'border-violet-500/25' },
  rose: { line: 'bg-rose-500', head: 'from-rose-500/[0.16] via-rose-500/[0.06]', icon: 'bg-rose-500 text-white shadow-rose-500/30', bar: 'bg-rose-500/60', total: 'text-rose-700 dark:text-rose-300', foot: 'bg-rose-500/[0.08] border-rose-500/20', border: 'border-rose-500/25' },
  blue: { line: 'bg-blue-500', head: 'from-blue-500/[0.16] via-blue-500/[0.06]', icon: 'bg-blue-500 text-white shadow-blue-500/30', bar: 'bg-blue-500/60', total: 'text-blue-700 dark:text-blue-300', foot: 'bg-blue-500/[0.08] border-blue-500/20', border: 'border-blue-500/25' },
  fuchsia: { line: 'bg-fuchsia-500', head: 'from-fuchsia-500/[0.16] via-fuchsia-500/[0.06]', icon: 'bg-fuchsia-500 text-white shadow-fuchsia-500/30', bar: 'bg-fuchsia-500/60', total: 'text-fuchsia-700 dark:text-fuchsia-300', foot: 'bg-fuchsia-500/[0.08] border-fuchsia-500/20', border: 'border-fuchsia-500/25' },
  teal: { line: 'bg-teal-500', head: 'from-teal-500/[0.16] via-teal-500/[0.06]', icon: 'bg-teal-500 text-white shadow-teal-500/30', bar: 'bg-teal-500/60', total: 'text-teal-700 dark:text-teal-300', foot: 'bg-teal-500/[0.08] border-teal-500/20', border: 'border-teal-500/25' },
  slate: { line: 'bg-slate-500', head: 'from-slate-500/[0.18] via-slate-500/[0.06]', icon: 'bg-slate-600 text-white shadow-slate-500/30 dark:bg-slate-500', bar: 'bg-slate-500/60', total: 'text-slate-700 dark:text-slate-200', foot: 'bg-slate-500/[0.09] border-slate-500/20', border: 'border-slate-500/30' },
};

function wholeMoney(value: number) {
  return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
}

function percent(value: number) {
  return new Intl.NumberFormat('ar-EG', { style: 'percent', maximumFractionDigits: value > 0 && value < 0.01 ? 1 : 0 }).format(Number.isFinite(value) ? value : 0);
}

type BranchStanding = 'best' | 'worst' | 'neutral';

function BranchComparison({
  rows,
  ui,
  demo,
  compact,
  reducedMotion,
}: {
  rows: ExecutiveDashboardSummary['branchBreakdown'];
  ui: (value: string) => string;
  demo?: boolean;
  compact: boolean;
  reducedMotion: boolean;
}) {
  // `lowerIsBetter`: for expenses and blocked members the highest branch is the worst (red), the lowest the best (green).
  const metrics: Array<{ key: BranchMetricKey; label: string; currency: boolean; tone: BranchTone; icon: LucideIcon; lowerIsBetter?: boolean }> = [
    { key: 'totalRevenue', label: ui('إجمالي الإيرادات'), currency: true, tone: 'emerald', icon: TrendingUp },
    { key: 'subscriptionRevenue', label: ui('إيرادات الاشتراكات'), currency: true, tone: 'amber', icon: ReceiptText },
    { key: 'barRevenue', label: ui('إيرادات البار والكافيه'), currency: true, tone: 'cyan', icon: ShoppingBag },
    { key: 'productRevenue', label: ui('إيرادات البروتين والمنتجات'), currency: true, tone: 'violet', icon: Dumbbell },
    { key: 'expenses', label: ui('إجمالي المصروفات'), currency: true, tone: 'rose', icon: TrendingDown, lowerIsBetter: true },
    { key: 'subscriptionsCount', label: ui('عدد الاشتراكات'), currency: false, tone: 'blue', icon: PackageCheck },
    { key: 'newMembers', label: ui('الأعضاء الجدد'), currency: false, tone: 'fuchsia', icon: UserPlus },
    { key: 'inbodyCount', label: ui('جلسات InBody'), currency: false, tone: 'teal', icon: HeartPulse },
    { key: 'blockedMembers', label: ui('الأعضاء المحظورون'), currency: false, tone: 'slate', icon: AlertTriangle, lowerIsBetter: true },
  ];

  const standingStyles: Record<BranchStanding, { row: string; badge: string; bar?: string; value: string; tag: string }> = {
    best: {
      row: 'bg-emerald-500/[0.09] ring-emerald-500/35',
      badge: 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30',
      bar: 'bg-emerald-500',
      value: 'text-emerald-700 dark:text-emerald-300',
      tag: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300',
    },
    worst: {
      row: 'bg-rose-500/[0.08] ring-rose-500/35',
      badge: 'bg-rose-500 text-white shadow-sm shadow-rose-500/30',
      bar: 'bg-rose-500',
      value: 'text-rose-700 dark:text-rose-300',
      tag: 'bg-rose-500/15 text-rose-700 ring-rose-500/30 dark:text-rose-300',
    },
    neutral: {
      row: 'bg-background/60 ring-border/70',
      badge: 'bg-muted text-muted-foreground ring-1 ring-border',
      value: 'text-foreground',
      tag: '',
    },
  };

  const [open, toggle] = usePersistentOpen('branches');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeSlide, setActiveSlide] = useState(0);

  // On phones the cards are a swipe carousel; track which card is centred for the dots.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || typeof IntersectionObserver === 'undefined' || !open) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = slideRefs.current.indexOf(entry.target as HTMLDivElement);
            if (index >= 0) setActiveSlide(index);
          }
        }
      },
      { root, threshold: 0.6 },
    );
    slideRefs.current.forEach((slide) => slide && observer.observe(slide));
    return () => observer.disconnect();
  }, [open, rows.length]);

  const goToSlide = (index: number) => {
    const scroller = scrollerRef.current;
    const slide = slideRefs.current[index];
    if (!scroller || !slide) return;
    // Scroll only the carousel horizontally (scrollIntoView would also move the page). Measuring
    // from the rendered boxes keeps this correct in RTL, where scrollLeft runs negative.
    const slideBox = slide.getBoundingClientRect();
    const scrollerBox = scroller.getBoundingClientRect();
    const delta = slideBox.left + slideBox.width / 2 - (scrollerBox.left + scrollerBox.width / 2);
    scroller.scrollBy({ left: delta, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  if (!rows.length) return null;

  return (
    <section className="min-w-0 rounded-[24px] border border-border/60 bg-gradient-to-b from-card/70 to-background/30 p-3 shadow-sm sm:p-5">
      <div className={cn('flex flex-wrap items-center justify-between gap-2', open && 'mb-4')}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="-m-1.5 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-start transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold sm:text-base">{ui('ملخص الفروع')}</span>
            <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground sm:line-clamp-none">{ui('ترتيب الفروع في كل مؤشر ونصيب كل فرع من الإجمالي')}</span>
          </span>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/60">
            <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform motion-reduce:transition-none', !open && 'rotate-90')} />
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {demo && <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300">{ui('بيانات تجريبية للمعاينة')}</span>}
          <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">{number(rows.length)} {ui('فروع')}</span>
        </div>
      </div>
      {open && (
        <>
          <div
            ref={scrollerRef}
            className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-3 px-3 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:snap-none md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-3 [&::-webkit-scrollbar]:hidden"
            aria-roledescription={ui('عرض شرائح')}
          >
            {metrics.map((metric, metricIndex) => {
              const values = rows.map((row) => {
                const value = Number(row[metric.key] ?? 0);
                return Number.isFinite(value) ? value : 0;
              });
              const total = values.reduce((sum, value) => sum + value, 0);
              const max = Math.max(...values);
              const min = Math.min(...values);
              // Green/red only when there is a real difference between branches; ties at the top/bottom share the colour.
              const ranked = rows.length > 1 && max !== min;
              const distinctDesc = Array.from(new Set(values)).sort((a, b) => b - a);
              const ordered = rows
                .map((branch, index) => ({ branch, value: values[index], index }))
                .sort((a, b) => b.value - a.value || a.index - b.index);
              const tone = BRANCH_TONES[metric.tone];
              const Icon = metric.icon;
              const format = (value: number) => (metric.currency ? (compact ? money(value, true) : wholeMoney(value)) : number(value));
              return (
                <div
                  key={metric.key}
                  ref={(element) => { slideRefs.current[metricIndex] = element; }}
                  className="w-[86%] max-w-[22rem] shrink-0 snap-center md:w-auto md:max-w-none"
                  aria-label={`${metric.label} (${number(metricIndex + 1)} / ${number(metrics.length)})`}
                >
                  <Card className={cn('group relative flex h-full flex-col overflow-hidden p-0 shadow-sm transition-all duration-300 hover:shadow-lg md:hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:md:hover:translate-y-0', tone.border)}>
                    <div className={cn('absolute inset-x-0 top-0 h-1.5', tone.line)} />
                    <div className={cn('flex items-center justify-between gap-3 bg-gradient-to-l to-transparent px-4 pb-3 pt-5', tone.head)}>
                      <div className="min-w-0">
                        <p className="text-[15px] font-black leading-snug">{metric.label}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {ui('إجمالي كل الفروع')}: <span className={cn('nums font-bold', tone.total)}>{metric.currency ? money(total, true) : number(total)}</span>
                        </p>
                      </div>
                      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl shadow-lg transition-transform group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100', tone.icon)}><Icon className="size-5" /></span>
                    </div>
                    <ul className="flex-1 space-y-2 px-3 py-3 sm:px-4">
                      {ordered.map(({ branch, value }) => {
                        const rank = distinctDesc.indexOf(value) + 1;
                        const share = total > 0 ? value / total : 0;
                        let standing: BranchStanding = 'neutral';
                        if (ranked && value === max) standing = metric.lowerIsBetter ? 'worst' : 'best';
                        else if (ranked && value === min) standing = metric.lowerIsBetter ? 'best' : 'worst';
                        const style = standingStyles[standing];
                        const isHighest = ranked && value === max;
                        return (
                          <li key={branch.branchId} className={cn('rounded-xl px-3 py-2.5 ring-1', style.row)}>
                            <div className="flex items-start gap-2.5">
                              <span className={cn('nums mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black', style.badge)}>{number(rank)}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                                  <p className="min-w-0 break-words text-[13px] font-bold leading-snug">{branch.branchName}</p>
                                  <p className={cn('nums shrink-0 text-sm font-black', style.value)}>{format(value)}</p>
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div className={cn('h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', style.bar ?? tone.bar)} style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }} />
                                  </div>
                                  <span className="nums w-10 shrink-0 text-end text-[11px] font-bold text-muted-foreground">{percent(share)}</span>
                                  {standing !== 'neutral' && (
                                    <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1', style.tag)}>
                                      {isHighest ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                                      {isHighest ? ui('الأعلى') : ui('الأقل')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <div className={cn('flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3', tone.foot)}>
                      <span className="text-xs font-bold text-muted-foreground">{ui('الإجمالي')} <span className="font-medium">({ui('كل الفروع')})</span></span>
                      <span className={cn('nums text-lg font-black tracking-tight sm:text-xl', tone.total)}>{format(total)}</span>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
          {/* Carousel dots (phones only). Each dot is a 44px-tall hit area around a small visual dot. */}
          <div className="mt-1 flex items-center justify-center md:hidden" role="tablist" aria-label={ui('مؤشرات الفروع')}>
            {metrics.map((metric, index) => (
              <button
                key={metric.key}
                type="button"
                role="tab"
                aria-selected={activeSlide === index}
                aria-label={metric.label}
                onClick={() => goToSlide(index)}
                className="flex h-11 w-7 items-center justify-center"
              >
                <span className={cn('block h-2 rounded-full transition-all duration-300 motion-reduce:transition-none', activeSlide === index ? cn('w-5', BRANCH_TONES[metric.tone].line) : 'w-2 bg-muted-foreground/30')} />
              </button>
            ))}
          </div>
          <p className="-mt-1 text-center text-[11px] font-semibold text-muted-foreground md:hidden">
            <span className="nums">{number(activeSlide + 1)} / {number(metrics.length)}</span> · {metrics[activeSlide]?.label} · {ui('اسحب للتنقل')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-emerald-500" />{ui('الأفضل في المؤشر')}</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-rose-500" />{ui('الأضعف في المؤشر')}</span>
            <span>{ui('في المصروفات والأعضاء المحظورين: الأعلى باللون الأحمر والأقل بالأخضر.')}</span>
          </div>
        </>
      )}
    </section>
  );
}

/* ───────────────────────── Today at a glance ───────────────────────── */

function TodayGlance({
  snapshot,
  ui,
  compact,
}: {
  snapshot: NonNullable<ExecutiveDashboardSummary['todaySnapshot']>;
  ui: (value: string) => string;
  compact: boolean;
}) {
  const change = snapshot.revenueChangePct;
  const up = change != null && change > 0;
  const down = change != null && change < 0;
  const tiles: Array<{
    key: string;
    label: string;
    value: string;
    icon: LucideIcon;
    href: string;
    tone: string;
    wash: string;
    foot: React.ReactNode;
    live?: boolean;
  }> = [
    {
      key: 'revenue',
      label: ui('إيراد اليوم'),
      value: money(snapshot.revenue, compact),
      icon: Banknote,
      href: CLUB_ROUTES.subscriptions.receipts,
      tone: 'bg-amber-500 text-white shadow-amber-500/30',
      wash: 'from-amber-500/[0.14]',
      foot: (
        <span className="flex flex-wrap items-center gap-1.5">
          {change != null ? (
            <span className={cn('nums inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-black ring-1',
              up && 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300',
              down && 'bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300',
              !up && !down && 'bg-muted text-muted-foreground ring-border')}
            >
              {up ? <ArrowUp className="size-3" /> : down ? <ArrowDown className="size-3" /> : null}
              {pct(Math.abs(change))}
            </span>
          ) : null}
          <span className="nums">{ui('أمس')}: {money(snapshot.yesterdayRevenue, true)}</span>
        </span>
      ),
    },
    {
      key: 'subs',
      label: ui('اشتراكات جديدة اليوم'),
      value: number(snapshot.newSubscriptions),
      icon: UserPlus,
      href: CLUB_ROUTES.subscriptions.list,
      tone: 'bg-violet-500 text-white shadow-violet-500/30',
      wash: 'from-violet-500/[0.14]',
      foot: <span className="inline-flex items-center gap-1"><Repeat className="size-3" /><span className="nums">{number(snapshot.renewals)}</span> {ui('تجديد')}</span>,
    },
    {
      key: 'checkins',
      label: ui('حضور اليوم'),
      value: number(snapshot.checkins),
      icon: ScanLine,
      href: CLUB_ROUTES.members.attendance,
      tone: 'bg-sky-500 text-white shadow-sky-500/30',
      wash: 'from-sky-500/[0.14]',
      foot: <span>{ui('تسجيلات دخول اليوم')}</span>,
    },
    {
      key: 'inside',
      label: ui('داخل الجيم الآن'),
      value: number(snapshot.insideNow),
      icon: Users,
      href: CLUB_ROUTES.members.attendance,
      tone: 'bg-emerald-500 text-white shadow-emerald-500/30',
      wash: 'from-emerald-500/[0.14]',
      foot: <span>{ui('دخلوا خلال آخر')} <span className="nums">{number(snapshot.insideWindowHours)}</span> {ui('ساعات ولم يسجلوا خروج')}</span>,
      live: true,
    },
  ];

  return (
    <section aria-label={ui('اليوم في لمحة')} className="min-w-0">
      <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
        <h2 className="flex items-center gap-2 text-sm font-black"><Sparkles className="size-4 text-amber-500" />{ui('اليوم في لمحة')}</h2>
        <span className="nums text-[11px] text-muted-foreground">{new Date(`${snapshot.date}T00:00:00`).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            to={tile.href}
            className={cn('group relative flex min-h-[7.5rem] min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card p-3 shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.98] sm:p-4 motion-reduce:transition-none motion-reduce:active:scale-100')}
          >
            <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-bl to-transparent', tile.wash)} />
            <div className="relative flex items-start justify-between gap-2">
              <p className="min-w-0 text-[11px] font-bold leading-snug text-muted-foreground sm:text-xs">{tile.label}</p>
              <span className={cn('relative flex size-9 shrink-0 items-center justify-center rounded-xl shadow-md sm:size-10', tile.tone)}>
                <tile.icon className="size-4 sm:size-5" />
                {tile.live && (
                  <span className="absolute -end-0.5 -top-0.5 flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400 ring-2 ring-card" />
                  </span>
                )}
              </span>
            </div>
            <p className="nums relative mt-2 text-xl font-black leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-2xl">{tile.value}</p>
            <div className="relative mt-1 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">{tile.foot}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ───────────────────────── Alerts ───────────────────────── */

function AlertCenter({
  data,
  ui,
  activeRate,
}: {
  data: ExecutiveDashboardSummary;
  ui: (value: string) => string;
  activeRate: number;
}) {
  const alerts = data.managerAlerts;
  const rows: Array<{ key: string; label: string; hint?: string; value: number; icon: LucideIcon; href: string; tone: string; extra?: React.ReactNode }> = [
    ...(alerts ? [
      { key: 'endingToday', label: ui('اشتراكات تنتهي اليوم'), hint: ui('كلّمهم للتجديد قبل ما يمشوا'), value: alerts.endingToday, icon: TimerOff, href: CLUB_ROUTES.subscriptions.expiring, tone: 'bg-rose-500/12 text-rose-600 dark:text-rose-300' },
      { key: 'ending3', label: ui('تنتهي خلال ٣ أيام'), value: alerts.ending3Days, icon: CalendarClock, href: CLUB_ROUTES.subscriptions.expiring, tone: 'bg-orange-500/12 text-orange-600 dark:text-orange-300' },
      { key: 'absent', label: `${ui('غائبون')} ${number(alerts.absentDays)} ${ui('أيام أو أكثر')}`, hint: ui('عندهم اشتراك ساري ولم يحضروا'), value: alerts.absentMembers, icon: Clock3, href: CLUB_ROUTES.sales.whatsapp, tone: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' },
      {
        key: 'birthdays',
        label: ui('أعياد ميلاد اليوم'),
        value: alerts.birthdaysToday,
        icon: Cake,
        href: CLUB_ROUTES.sales.whatsapp,
        tone: 'bg-pink-500/12 text-pink-600 dark:text-pink-300',
        extra: alerts.birthdays.length ? (
          <span className="mt-1 flex flex-wrap gap-1">
            {alerts.birthdays.slice(0, 3).map((member) => (
              <span key={member.id} className="max-w-[9rem] truncate rounded-full bg-pink-500/10 px-2 py-0.5 text-[10px] font-semibold text-pink-700 dark:text-pink-300">{member.name}</span>
            ))}
            {alerts.birthdaysToday > 3 && <span className="nums rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">+{number(alerts.birthdaysToday - 3)}</span>}
          </span>
        ) : undefined,
      },
      { key: 'frozen', label: ui('اشتراكات موقوفة حاليًا'), value: alerts.frozen, icon: Snowflake, href: CLUB_ROUTES.subscriptions.list, tone: 'bg-sky-500/12 text-sky-600 dark:text-sky-300' },
    ] : [
      { key: 'expiring7', label: ui('تنتهي خلال 7 أيام'), value: data.operations.expiring7, icon: CalendarClock, href: CLUB_ROUTES.subscriptions.expiring, tone: 'bg-rose-500/12 text-rose-600 dark:text-rose-300' },
    ]),
    { key: 'outstanding', label: ui('اشتراكات عليها متبقي'), value: data.operations.outstandingCount, icon: WalletCards, href: CLUB_ROUTES.subscriptions.outstanding, tone: 'bg-violet-500/12 text-violet-600 dark:text-violet-300' },
    { key: 'expiring30', label: ui('تنتهي خلال 30 يومًا'), value: data.operations.expiring30, icon: CalendarDays, href: '/reports/club/subscriptions-expiring', tone: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' },
    { key: 'lowStock', label: ui('أصناف وصلت لإعادة الطلب'), value: data.operations.lowStock, icon: Boxes, href: CLUB_ROUTES.cafe.dashboard, tone: 'bg-teal-500/12 text-teal-600 dark:text-teal-300' },
  ];
  const visible = rows.filter((row) => row.value > 0);

  return (
    <DashCard id="alerts" icon={AlertTriangle} iconClassName="bg-rose-500/10 text-rose-600 dark:text-rose-300" title={ui('مركز التنبيهات')} subtitle={ui('أولويات تحتاج متابعة — اضغط للتفاصيل')}>
      {visible.length ? (
        <div className="space-y-2">
          {visible.map((alert) => (
            <Link key={alert.key} to={alert.href} className="group flex min-h-[3.25rem] items-center gap-3 rounded-2xl border border-border/70 px-3 py-2 transition-all hover:border-primary/30 hover:bg-muted/40 active:bg-muted/60">
              <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', alert.tone)}><alert.icon className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug">{alert.label}</span>
                {alert.hint && <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{alert.hint}</span>}
                {alert.extra}
              </span>
              <span className="nums flex min-w-10 items-center justify-center rounded-lg bg-muted px-2 py-1 text-sm font-black transition-colors group-hover:bg-primary group-hover:text-primary-foreground">{number(alert.value)}</span>
              <ArrowLeft className="size-4 shrink-0 text-muted-foreground/60" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/[0.08] p-4 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
          <CheckCircle2 className="size-5 shrink-0" />{ui('لا توجد تنبيهات تحتاج متابعة الآن')}
        </div>
      )}
      <div className="mt-4 rounded-2xl bg-amber-500/[0.08] p-4 ring-1 ring-amber-500/15">
        <div className="flex items-center justify-between"><span className="text-xs font-medium">{ui('صحة قاعدة الأعضاء')}</span><span className="nums text-sm font-black text-amber-700 dark:text-amber-300">{pct(activeRate, 0)}</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-l from-amber-300 to-amber-600 transition-all duration-1000 motion-reduce:transition-none" style={{ width: `${Math.min(activeRate, 100)}%` }} /></div>
        <p className="mt-2 text-[11px] text-muted-foreground">{number(data.totalMembers.active)} {ui('نشط من إجمالي')} {number(data.totalMembers.total)}</p>
      </div>
    </DashCard>
  );
}

/* ───────────────────────── Revenue mix & discounts ───────────────────────── */

const MIX_COLORS = { subscriptions: '#D4A72C', bar: '#0ea5e9', products: '#8b5cf6' } as const;

function RevenueMixCard({
  mix,
  ui,
  compact,
  reducedMotion,
}: {
  mix: NonNullable<ExecutiveDashboardSummary['revenueMix']>;
  ui: (value: string) => string;
  compact: boolean;
  reducedMotion: boolean;
}) {
  const parts = [
    { key: 'subscriptions' as const, name: ui('الاشتراكات'), value: mix.subscriptions },
    { key: 'bar' as const, name: ui('البار والكافيه'), value: mix.bar },
    { key: 'products' as const, name: ui('البروتين والمنتجات'), value: mix.products },
  ];
  const chartParts = parts.filter((part) => part.value > 0);
  return (
    <DashCard id="revenue-mix" icon={PieChartIcon} iconClassName="bg-amber-500/10 text-amber-600 dark:text-amber-300" title={ui('مصادر الإيراد')} subtitle={ui('توزيع الإيراد خلال الفترة المحددة')}>
      <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col 2xl:flex-row">
        <div className="relative h-[180px] w-full max-w-[200px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartParts} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="98%" paddingAngle={chartParts.length > 1 ? 3 : 0} stroke="none" isAnimationActive={!reducedMotion} animationDuration={900}>
                {chartParts.map((part) => <Cell key={part.key} fill={MIX_COLORS[part.key]} />)}
              </Pie>
              <Tooltip formatter={(value) => money(Number(value))} contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-semibold text-muted-foreground">{ui('الإجمالي')}</span>
            <span className="nums mt-0.5 max-w-[7.5rem] text-base font-black leading-tight [overflow-wrap:anywhere]">{money(mix.total, true)}</span>
          </div>
        </div>
        <ul className="w-full min-w-0 space-y-2.5">
          {parts.map((part) => {
            const share = mix.total > 0 ? (part.value / mix.total) * 100 : 0;
            return (
              <li key={part.key} className="min-w-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2 font-semibold"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: MIX_COLORS[part.key] }} />{part.name}</span>
                  <span className="nums shrink-0 font-black">{money(part.value, compact)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: MIX_COLORS[part.key] }} /></div>
                  <span className="nums w-9 shrink-0 text-end text-[10px] font-bold text-muted-foreground">{pct(share, 0)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </DashCard>
  );
}

function DiscountsCard({
  discounts,
  ui,
  compact,
}: {
  discounts: NonNullable<ExecutiveDashboardSummary['discounts']>;
  ui: (value: string) => string;
  compact: boolean;
}) {
  const level = discounts.discountPct >= 20 ? 'high' : discounts.discountPct >= 10 ? 'mid' : 'low';
  const levelTone = {
    high: 'text-rose-600 dark:text-rose-300',
    mid: 'text-amber-600 dark:text-amber-300',
    low: 'text-emerald-600 dark:text-emerald-300',
  }[level];
  const discountedShare = discounts.subscriptionsCount > 0 ? (discounts.discountedCount / discounts.subscriptionsCount) * 100 : 0;
  return (
    <DashCard
      id="discounts"
      icon={BadgePercent}
      iconClassName="bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300"
      title={ui('الخصومات الممنوحة')}
      subtitle={ui('خصومات اشتراكات الفترة من قيمتها قبل الخصم')}
      action={<ViewAll to={CLUB_ROUTES.subscriptions.discounts} label={ui('التفاصيل')} />}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('nums text-4xl font-black leading-none tracking-tight', levelTone)}>{pct(discounts.discountPct)}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{ui('نسبة الخصم من إجمالي قيمة الاشتراكات')}</p>
        </div>
        <div className="shrink-0 text-end">
          <p className="nums text-lg font-black text-fuchsia-700 dark:text-fuchsia-300">{money(discounts.discountValue, compact)}</p>
          <p className="text-[11px] text-muted-foreground">{ui('قيمة الخصم')}</p>
        </div>
      </div>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full bg-emerald-500/80" style={{ width: `${Math.max(0, 100 - discounts.discountPct)}%` }} />
        <div className="h-full bg-fuchsia-500" style={{ width: `${Math.min(100, discounts.discountPct)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-muted-foreground">
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" />{ui('الصافي')}</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-fuchsia-500" />{ui('الخصم')}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-muted/40 p-2.5">
          <dt className="text-[10px] text-muted-foreground">{ui('القيمة قبل الخصم')}</dt>
          <dd className="nums mt-0.5 text-sm font-black [overflow-wrap:anywhere]">{money(discounts.grossValue, compact)}</dd>
        </div>
        <div className="rounded-xl bg-muted/40 p-2.5">
          <dt className="text-[10px] text-muted-foreground">{ui('بعد الخصم')}</dt>
          <dd className="nums mt-0.5 text-sm font-black [overflow-wrap:anywhere]">{money(discounts.netValue, compact)}</dd>
        </div>
        <div className="col-span-2 rounded-xl bg-muted/40 p-2.5">
          <dt className="text-[10px] text-muted-foreground">{ui('اشتراكات بخصم')}</dt>
          <dd className="nums mt-0.5 text-sm font-black">{number(discounts.discountedCount)} <span className="text-[11px] font-medium text-muted-foreground">{ui('من')} {number(discounts.subscriptionsCount)} ({pct(discountedShare, 0)})</span></dd>
        </div>
      </dl>
    </DashCard>
  );
}

/* ───────────────────────── Sales & captains vs target ───────────────────────── */

function TeamPerformanceCard({
  id,
  title,
  subtitle,
  icon,
  iconClassName,
  data,
  href,
  ui,
  compact,
  noTargetHint,
}: {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconClassName: string;
  data: ExecutiveTeamPerformance;
  href: string;
  ui: (value: string) => string;
  compact: boolean;
  /** Shown instead of the hit-target summary when nobody has a target this month. */
  noTargetHint: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? data.rows : data.rows.slice(0, 5);
  const format = (value: number, unit: 'money' | 'count') => (unit === 'money' ? money(value, compact) : number(value));
  return (
    <DashCard id={id} icon={icon} iconClassName={iconClassName} title={title} subtitle={subtitle} action={<ViewAll to={href} label={ui('عرض الكل')} />}>
      {data.withTarget === 0 && (
        <Link to={href} className="mb-3 flex min-h-11 items-center gap-2.5 rounded-2xl bg-amber-500/[0.08] px-3 py-2.5 text-xs font-semibold leading-snug text-amber-800 ring-1 ring-amber-500/20 transition-colors hover:bg-amber-500/[0.12] dark:text-amber-200">
          <Target className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{noTargetHint}</span>
          <ArrowLeft className="size-4 shrink-0 opacity-70" />
        </Link>
      )}
      {data.withTarget > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-emerald-500/[0.07] px-3 py-2.5 ring-1 ring-emerald-500/15">
          <Trophy className="size-5 shrink-0 text-amber-500" />
          <p className="min-w-0 flex-1 text-xs font-semibold leading-snug">
            {ui('حقق التارجت')}: <span className="nums font-black text-emerald-700 dark:text-emerald-300">{number(data.hitCount)}</span> {ui('من')} <span className="nums font-black">{number(data.withTarget)}</span>
          </p>
          <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted sm:w-24">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(data.hitCount / data.withTarget) * 100}%` }} />
          </div>
        </div>
      )}
      <ol className="space-y-2">
        {rows.map((row, index) => {
          const value = row.achievementPct ?? 0;
          const bar = row.hitTarget ? 'bg-emerald-500' : value >= 70 ? 'bg-amber-500' : row.target > 0 ? 'bg-rose-500' : 'bg-muted-foreground/40';
          const text = row.hitTarget ? 'text-emerald-700 dark:text-emerald-300' : value >= 70 ? 'text-amber-700 dark:text-amber-300' : row.target > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground';
          return (
            <li key={row.id} className={cn('rounded-xl px-3 py-2.5 ring-1', row.hitTarget ? 'bg-emerald-500/[0.06] ring-emerald-500/25' : 'bg-background/60 ring-border/70')}>
              <div className="flex items-start gap-2.5">
                <span className={cn('nums mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black', index === 0 ? 'bg-amber-400 text-amber-950' : 'bg-muted text-muted-foreground ring-1 ring-border')}>{number(index + 1)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
                    <div className="min-w-0">
                      <p className="break-words text-[13px] font-bold leading-snug">
                        {row.name}
                        {row.hitTarget && <CheckCircle2 className="ms-1 inline size-3.5 text-emerald-500" aria-label={ui('حقق التارجت')} />}
                      </p>
                      {(row.branchName || row.nameIsBranch) && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] leading-snug text-muted-foreground">
                          {row.branchName && <span className="inline-flex items-center gap-0.5"><Building2 className="size-3" />{row.branchName}</span>}
                          {row.nameIsBranch && <span className="rounded-full bg-amber-500/12 px-1.5 py-px font-semibold text-amber-700 dark:text-amber-300">{ui('مسجل باسم فرع — راجع بيانات الموظف')}</span>}
                        </p>
                      )}
                    </div>
                    <p className={cn('nums shrink-0 text-xs font-black', text)}>{row.achievementPct != null ? pct(row.achievementPct, 0) : row.target > 0 ? '' : ui('بدون تارجت')}</p>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', bar)} style={{ width: `${row.target > 0 ? Math.min(100, value) : 100}%`, opacity: row.target > 0 ? 1 : 0.35 }} />
                  </div>
                  <p className="nums mt-1 text-[11px] text-muted-foreground">
                    {format(row.achieved, row.unit)}
                    {row.target > 0 && <> / {format(row.target, row.unit)}</>}
                    {row.unit === 'money' && row.count > 0 && <> · {number(row.count)} {ui('اشتراك')}</>}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {data.rows.length > 5 && (
        <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 rounded-xl text-xs font-bold text-primary transition-colors hover:bg-primary/5">
          {showAll ? ui('عرض أقل') : `${ui('عرض الكل')} (${number(data.rows.length)})`}
          <ChevronDown className={cn('size-4 transition-transform motion-reduce:transition-none', showAll && 'rotate-180')} />
        </button>
      )}
    </DashCard>
  );
}

/* ───────────────────────── Filters ───────────────────────── */

function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <Skeleton className="h-52 rounded-3xl sm:h-64" />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-72 rounded-2xl" />)}
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const chipRowRef = useRef<HTMLDivElement>(null);
  const compact = useMediaQuery('(max-width: 639px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

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
  const presets: Array<[PeriodPreset, string]> = [
    ['today', ui('اليوم')],
    ['7d', ui('آخر 7 أيام')],
    ['30d', ui('آخر 30 يومًا')],
    ['month', ui('هذا الشهر')],
    ['custom', ui('فترة مخصصة')],
  ];
  const shortPresetLabels: Partial<Record<PeriodPreset, string>> = {
    today: ui('اليوم'),
    '7d': ui('٧ أيام'),
    '30d': ui('٣٠ يوم'),
    month: ui('الشهر'),
  };
  const filtersCustomized = branchId !== 'all' || preset === 'custom';
  const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  const animate = !reducedMotion;

  const quickActions = [
    { label: ui('اشتراك جديد'), icon: UserPlus, href: '/club/subscriptions/new', tone: 'bg-emerald-500/10 text-emerald-600' },
    { label: ui('تسجيل حضور'), icon: ScanLine, href: '/club/attendance', tone: 'bg-sky-500/10 text-sky-600' },
    { label: ui('إيصال اشتراك'), icon: ReceiptText, href: '/club/subscriptions/receipts', tone: 'bg-amber-500/10 text-amber-600' },
    { label: ui('فاتورة InBody'), icon: HeartPulse, href: '/club/subscriptions/inbody-invoices', tone: 'bg-violet-500/10 text-violet-600' },
    { label: ui('إدارة الإيرادات'), icon: TrendingUp, href: '/finance/revenues', tone: 'bg-teal-500/10 text-teal-600' },
    { label: ui('التقارير الشاملة'), icon: FileBarChart, href: '/reports', tone: 'bg-rose-500/10 text-rose-600' },
  ];

  // Keep the selected period chip visible in the sticky bar (it scrolls horizontally on phones).
  // Only the chip row scrolls, never the page, and it works in RTL (measured from rendered boxes).
  const isLoading = query.isLoading;
  useEffect(() => {
    const row = chipRowRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !chip) return;
    const rowBox = row.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const pad = 8;
    if (chipBox.left < rowBox.left + pad) row.scrollBy({ left: chipBox.left - rowBox.left - pad });
    else if (chipBox.right > rowBox.right - pad) row.scrollBy({ left: chipBox.right - rowBox.right + pad });
  }, [preset, isLoading]);

  if (query.isLoading) return <DashboardSkeleton />;
  if (query.isError) {
    return <ErrorState message={apiError(query.error, ui('تعذر تحميل لوحة تحكم الجيم'))} onRetry={() => void query.refetch()} />;
  }

  const refreshButton = (className?: string) => (
    <Button variant="outline" size="icon" className={cn('size-11 shrink-0', className)} onClick={() => void query.refetch()} disabled={query.isFetching} aria-label={ui('تحديث الآن')}>
      <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin motion-reduce:animate-none')} />
    </Button>
  );

  const showMix = Boolean(data?.revenueMix && data.revenueMix.total > 0);
  const showDiscounts = Boolean(data?.discounts && data.discounts.grossValue > 0);
  const salesTeam = data?.salesTeamPerformance;
  const captains = data?.captainsPerformance;

  return (
    <div className="space-y-4 pb-8 sm:space-y-5" dir="rtl">
      <section className="relative isolate -mx-3 w-[calc(100%+1.5rem)] overflow-hidden rounded-[24px] bg-brand-gradient px-4 py-5 text-white shadow-xl ring-1 ring-white/10 sm:-mx-4 sm:w-[calc(100%+2rem)] sm:rounded-[28px] sm:px-7 sm:py-6 lg:-mx-5 lg:w-[calc(100%+2.5rem)] lg:px-8 lg:py-7 xl:-mx-6 xl:w-[calc(100%+3rem)]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:28px_28px]" />
        <div className="pointer-events-none absolute -end-16 -top-16 size-72 animate-banner-drift rounded-full bg-white/12 blur-3xl motion-reduce:animate-none" />
        <div className="pointer-events-none absolute -bottom-24 start-1/4 size-64 animate-banner-drift-reverse rounded-full bg-brand-300/30 blur-3xl motion-reduce:animate-none" />
        <div className="pointer-events-none absolute start-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 animate-banner-drift rounded-full bg-brand-400/15 blur-3xl [animation-delay:3s] motion-reduce:animate-none" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden"><div className="absolute inset-y-0 w-1/3 animate-banner-shine bg-gradient-to-r from-transparent via-white/10 to-transparent" /></div>
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(21rem,.75fr)] lg:items-stretch">
          <div className="flex min-w-0 flex-col justify-center lg:pe-4">
            <div className="mb-2.5 flex items-center gap-2 text-[11px] text-emerald-300 sm:mb-3 sm:text-xs lg:text-sm">
              <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" /><span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" /></span>
              {ui('بيانات تشغيلية ومحاسبية مباشرة')}
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="hidden size-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 sm:flex"><LayoutDashboard className="size-7 text-amber-300" /></div>
              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight sm:text-2xl lg:text-3xl">{ui('لوحة الإدارة الرئيسية')}</h1>
                <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-white/65 sm:mt-2 sm:text-sm lg:text-base">{ui('صورة واحدة واضحة للأعضاء، الاشتراكات، الحضور، المبيعات والربحية')}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-5 sm:grid-cols-3 sm:gap-3">
              <div className="min-w-0 rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/10 sm:p-4">
                <p className="text-[11px] text-white/55">{ui('صافي الربح للفترة')}</p>
                <p className={cn('nums mt-1 text-lg font-black leading-tight [overflow-wrap:anywhere] sm:text-xl', (data?.financials.profit ?? 0) >= 0 ? 'text-amber-200' : 'text-rose-300')}>{money(data?.financials.profit ?? 0, compact)}</p>
              </div>
              <div className="min-w-0 rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/10 sm:p-4">
                <p className="text-[11px] text-white/55">{ui('الأعضاء النشطون')}</p>
                <p className="nums mt-1 text-lg font-black leading-tight text-white sm:text-xl">{number(data?.totalMembers.active ?? 0)} <span className="text-xs font-medium text-white/45">/ {number(data?.totalMembers.total ?? 0)}</span></p>
              </div>
              <div className="col-span-2 hidden min-w-0 rounded-2xl bg-white/[0.07] p-3 ring-1 ring-white/10 sm:col-span-1 sm:block sm:p-4">
                <p className="text-[11px] text-white/55">{ui('النطاق الحالي')}</p>
                <p className="mt-1 text-sm font-bold leading-snug text-white">{selectedBranch} · <span className="nums">{number(data?.period.days ?? 0)}</span> {ui('يوم')}</p>
              </div>
            </div>
          </div>

          {/* Desktop filter panel; phones and tablets use the sticky bar + bottom sheet below. */}
          <div className="hidden rounded-[22px] bg-black/30 p-4 shadow-xl ring-1 ring-white/15 lg:block">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-amber-300/10 text-amber-300 ring-1 ring-amber-300/20"><SlidersHorizontal className="size-5" /></span>
                <div><p className="text-sm font-bold">{ui('نطاق لوحة التحكم')}</p><p className="mt-0.5 text-[10px] text-white/45">{ui('خصص الفترة والفرع المعروض')}</p></div>
              </div>
              {refreshButton('border-amber-300/25 bg-black/30 text-white hover:border-amber-300/60 hover:bg-black/50 hover:text-amber-100')}
            </div>

            <p className="mb-2 mt-3 text-[10px] font-semibold text-white/45">{ui('الفترة الزمنية')}</p>
            <div className="grid grid-cols-3 gap-2">
              {presets.map(([key, label]) => (
                <button key={key} type="button" onClick={() => setPeriod(key)} aria-pressed={preset === key} className={cn('min-h-11 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-200 motion-reduce:transition-none', preset === key ? 'bg-amber-300 text-slate-950 shadow-lg shadow-amber-500/20 ring-1 ring-amber-100/70' : 'bg-white/[0.06] text-white/75 ring-1 ring-white/10 hover:bg-white/[0.12] hover:text-white')}>
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2.5">
              <label className="grid min-h-11 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-[14px] px-3 py-2.5 shadow-md ring-1 ring-inset ring-amber-200/20 transition-all focus-within:ring-amber-300/70" style={{ backgroundColor: '#171306' }}>
                <CalendarDays className="size-4 shrink-0 text-amber-300" />
                <input aria-label={ui('من تاريخ')} type="date" value={startDate} max={endDate} onChange={(event) => { setPreset('custom'); setStartDate(event.target.value); }} className="nums min-w-0 appearance-none !bg-transparent text-xs text-white outline-none [color-scheme:dark]" />
                <span className="text-white/35">—</span>
                <input aria-label={ui('إلى تاريخ')} type="date" value={endDate} min={startDate} onChange={(event) => { setPreset('custom'); setEndDate(event.target.value); }} className="nums min-w-0 appearance-none !bg-transparent text-xs text-white outline-none [color-scheme:dark]" />
              </label>
              <label className="relative flex min-w-0 items-center overflow-hidden rounded-[14px] shadow-md ring-1 ring-inset ring-amber-300/35 transition-all hover:ring-amber-200/70 focus-within:ring-2 focus-within:ring-amber-300/70" style={{ backgroundColor: '#171306' }}>
                <Building2 className="pointer-events-none absolute start-3 size-4 text-amber-300" />
                <SearchableSelect aria-label={ui('الفرع')} value={branchId} onChange={(event) => setBranchId(event.target.value)} className="h-11 w-full appearance-none border-0 !bg-transparent py-2 pe-9 ps-10 text-xs font-bold !text-white outline-none [color-scheme:dark] [&_option]:bg-slate-950 [&_option]:text-white">
                  <option value="all">{ui('كل الفروع')}</option>
                  {branches.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}
                </SearchableSelect>
                <ChevronDown className="pointer-events-none absolute end-3 size-4 text-white/65" />
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Phones/tablets: compact sticky filter bar — period chips + a button opening the filter sheet. */}
      <div className="sticky top-0 z-30 -mx-3 -mt-1 border-b border-border/60 bg-background/90 px-3 py-2 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/75 sm:-mx-4 sm:px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <div ref={chipRowRef} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain pe-1 ps-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={ui('الفترة الزمنية')}>
            {presets.filter(([key]) => key !== 'custom').map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                aria-pressed={preset === key}
                className={cn('min-h-11 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-bold transition-colors motion-reduce:transition-none sm:px-3.5', preset === key ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/70 text-muted-foreground hover:bg-muted')}
              >
                <span className="sm:hidden">{shortPresetLabels[key] ?? label}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <Button variant="outline" className="relative min-h-11 shrink-0 gap-1.5 rounded-full px-3" onClick={() => setFiltersOpen(true)} aria-label={ui('تخصيص الفترة والفرع')}>
            <SlidersHorizontal className="size-4" />
            <span className="text-xs font-bold">{ui('فلترة')}</span>
            {filtersCustomized && <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-background" />}
          </Button>
        </div>
        <button type="button" onClick={() => setFiltersOpen(true)} className="mt-1 flex min-h-6 w-full items-center gap-1.5 text-start text-[11px] text-muted-foreground">
          <Building2 className="size-3.5 shrink-0" />
          <span className="truncate font-semibold">{selectedBranch}</span>
          <span className="shrink-0">·</span>
          <span className="nums shrink-0">{dateLabel(startDate)} — {dateLabel(endDate)}</span>
          {query.isFetching && <RefreshCw className="size-3 shrink-0 animate-spin motion-reduce:animate-none" />}
        </button>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-[28px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" dir="rtl">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" aria-hidden />
          <SheetHeader className="text-start">
            <SheetTitle className="flex items-center gap-2"><SlidersHorizontal className="size-5 text-primary" />{ui('نطاق لوحة التحكم')}</SheetTitle>
            <SheetDescription>{ui('خصص الفترة والفرع المعروض')}</SheetDescription>
          </SheetHeader>
          <p className="mb-2 mt-4 text-xs font-bold text-muted-foreground">{ui('الفترة الزمنية')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {presets.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setPeriod(key)} aria-pressed={preset === key} className={cn('min-h-12 rounded-2xl px-3 text-sm font-bold ring-1 transition-colors motion-reduce:transition-none', preset === key ? 'bg-primary text-primary-foreground ring-primary' : 'bg-muted/40 text-foreground ring-border hover:bg-muted')}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <label className="min-w-0">
              <span className="mb-1 block text-xs font-bold text-muted-foreground">{ui('من تاريخ')}</span>
              <input type="date" value={startDate} max={endDate} onChange={(event) => { setPreset('custom'); setStartDate(event.target.value); }} className="nums h-12 w-full min-w-0 rounded-2xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring dark:[color-scheme:dark]" />
            </label>
            <label className="min-w-0">
              <span className="mb-1 block text-xs font-bold text-muted-foreground">{ui('إلى تاريخ')}</span>
              <input type="date" value={endDate} min={startDate} onChange={(event) => { setPreset('custom'); setEndDate(event.target.value); }} className="nums h-12 w-full min-w-0 rounded-2xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring dark:[color-scheme:dark]" />
            </label>
          </div>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">{ui('الفرع')}</span>
            <SearchableSelect aria-label={ui('الفرع')} value={branchId} onChange={(event) => setBranchId(event.target.value)} className="h-12 w-full rounded-2xl border border-input bg-background px-3 text-sm font-bold">
              <option value="all">{ui('كل الفروع')}</option>
              {branches.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}
            </SearchableSelect>
          </label>
          <div className="mt-5 flex items-center gap-2">
            <Button className="h-12 flex-1 rounded-2xl text-sm font-bold" onClick={() => setFiltersOpen(false)}>{ui('عرض النتائج')}</Button>
            {refreshButton('size-12 rounded-2xl')}
          </div>
        </SheetContent>
      </Sheet>

      <BranchComparison rows={branchComparisonRows} ui={ui} demo={!hasRealBranchData && IS_LOCAL_PREVIEW} compact={compact} reducedMotion={reducedMotion} />

      {data?.todaySnapshot && <TodayGlance snapshot={data.todaySnapshot} ui={ui} compact={compact} />}

      {data && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 sm:gap-5">
          <AlertCenter data={data} ui={ui} activeRate={activeRate} />
          {showMix && data.revenueMix && <RevenueMixCard mix={data.revenueMix} ui={ui} compact={compact} reducedMotion={reducedMotion} />}
          {showDiscounts && data.discounts && <DiscountsCard discounts={data.discounts} ui={ui} compact={compact} />}
        </section>
      )}

      {(salesTeam || captains) && (
        <section className="grid gap-4 md:grid-cols-2 sm:gap-5">
          {salesTeam && (
            <TeamPerformanceCard
              id="sales-team"
              title={ui('أداء المبيعات مقابل التارجت')}
              subtitle={ui('تحصيل كل مسؤول مبيعات هذا الشهر من إيصالات اشتراكاته')}
              icon={Target}
              iconClassName="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
              data={salesTeam}
              href={CLUB_ROUTES.sales.team}
              ui={ui}
              compact={compact}
              noTargetHint={ui('مفيش تارجت متحدد لفريق المبيعات الشهر ده — حدده من إعدادات المبيعات')}
            />
          )}
          {captains && (
            <TeamPerformanceCard
              id="captains"
              title={ui('أداء الكباتن مقابل التارجت')}
              subtitle={ui('مبيعات البرايفت لكل كابتن هذا الشهر بعد الخصم')}
              icon={Dumbbell}
              iconClassName="bg-violet-500/10 text-violet-600 dark:text-violet-300"
              data={captains}
              href="/club/fitness/trainer-targets"
              ui={ui}
              compact={compact}
              noTargetHint={ui('مفيش تارجت متحدد للكباتن الشهر ده — حدده من صفحة تارجت الكباتن')}
            />
          )}
        </section>
      )}

      <section className="grid gap-4 sm:gap-5 xl:grid-cols-3">
        <DashCard id="finance-trend" className="xl:col-span-2" icon={Landmark} title={ui('حركة المدفوعات والمصروفات')} subtitle={ui('المدفوع من إدارة الأعضاء والمصروفات من القيود المحاسبية')} action={<ViewAll to="/finance/analysis" label={ui('التحليل المالي')} />}>
          <div className="h-[260px] min-w-0 sm:h-[330px]">
            {financialTrend.some((row) => row.revenue || row.expenses) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={financialTrend} margin={{ top: 12, right: compact ? 8 : 4, left: compact ? 8 : 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gymRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#D4A72C" stopOpacity={0.35} /><stop offset="95%" stopColor="#D4A72C" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gymExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="hsl(var(--border))" opacity={0.7} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={compact ? 28 : 22} />
                  <YAxis hide={compact} tickFormatter={(value) => money(Number(value), true)} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={62} />
                  <Tooltip formatter={(value, name) => [money(Number(value)), name]} labelFormatter={(label) => `${ui('التاريخ')}: ${label}`} contentStyle={TOOLTIP_STYLE} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: compact ? 11 : 12 }} />
                  <Area isAnimationActive={animate} animationDuration={900} type="monotone" dataKey="revenue" name={ui('المدفوع')} stroke="#D4A72C" strokeWidth={3} fill="url(#gymRevenue)" />
                  <Area isAnimationActive={animate} animationDuration={1050} type="monotone" dataKey="expenses" name={ui('المصروفات')} stroke="#f43f5e" strokeWidth={2.5} fill="url(#gymExpense)" />
                  <Line isAnimationActive={animate} animationDuration={1200} type="monotone" dataKey="profit" name={ui('صافي الربح')} stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart label={ui('لا توجد مدفوعات أو مصروفات في الفترة')} />}
          </div>
        </DashCard>

        <DashCard id="expenses" icon={BadgeDollarSign} title={ui('المصروفات راحت في إيه')} subtitle={ui('تفصيل المصروفات حسب الحساب المحاسبي')}>
          <div className="h-[220px] min-w-0 sm:h-[245px]">
            {expenseBreakdown.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseBreakdown} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={3} isAnimationActive={animate} animationDuration={1000}>
                    {expenseBreakdown.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => money(Number(value))} contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart label={ui('لا توجد مصروفات في الفترة')} />}
          </div>
          <div className="space-y-2">
            {expenseBreakdown.slice(0, 4).map((item, index) => (
              <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} /><span className="truncate">{item.name}</span></span>
                <span className="nums shrink-0 font-bold">{money(item.value, true)}</span>
              </div>
            ))}
          </div>
        </DashCard>
      </section>

      <section className="grid gap-4 sm:gap-5 xl:grid-cols-3">
        <DashCard id="operations-trend" className="xl:col-span-2" icon={Dumbbell} title={ui('نبض التشغيل اليومي')} subtitle={ui('الحضور والأعضاء والاشتراكات الجديدة خلال الفترة')} action={<ViewAll to="/reports/club/attendance" label={ui('تقرير الحضور')} />}>
          <div className="h-[260px] min-w-0 sm:h-[315px]">
            {financialTrend.some((row) => row.checkins || row.newMembers || row.newSubscriptions) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financialTrend} margin={{ top: 12, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={compact ? 26 : 20} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={compact ? 26 : 36} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: compact ? 11 : 12 }} />
                  <Bar dataKey="checkins" name={ui('الزيارات')} fill="#0ea5e9" radius={[5, 5, 0, 0]} isAnimationActive={animate} animationDuration={850} />
                  <Bar dataKey="newSubscriptions" name={ui('اشتراكات جديدة')} fill="#8b5cf6" radius={[5, 5, 0, 0]} isAnimationActive={animate} animationDuration={1000} />
                  <Bar dataKey="newMembers" name={ui('أعضاء جدد')} fill="#D4A72C" radius={[5, 5, 0, 0]} isAnimationActive={animate} animationDuration={1150} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart label={ui('لا توجد حركة تشغيلية في الفترة')} />}
          </div>
        </DashCard>

        <DashCard id="today-ops" icon={Activity} title={ui('تشغيل اليوم')} subtitle={ui('لقطة سريعة للحالة الحالية')}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-2">
            {[
              { label: ui('زيارات اليوم'), value: data?.todaySnapshot?.checkins ?? data?.operations.checkinsToday ?? 0, icon: ScanLine, tone: 'text-sky-600' },
              { label: ui('حجوزات اليوم'), value: data?.operations.bookingsToday ?? 0, icon: CalendarDays, tone: 'text-violet-600' },
              { label: ui('حصص اليوم'), value: data?.operations.classesToday ?? 0, icon: Dumbbell, tone: 'text-amber-600' },
              { label: ui('المدربون'), value: data?.operations.trainers ?? 0, icon: Activity, tone: 'text-amber-600' },
              { label: ui('الموظفون'), value: data?.operations.employees ?? 0, icon: Users, tone: 'text-rose-600' },
              { label: ui('مرافق النادي'), value: data?.operations.facilities ?? 0, icon: CheckCircle2, tone: 'text-teal-600' },
            ].map((item) => (
              <div key={item.label} className="min-w-0 rounded-2xl border border-border/70 bg-muted/20 p-3 text-center transition-colors hover:bg-muted/50">
                <item.icon className={cn('mx-auto size-5', item.tone)} />
                <p className="nums mt-2 text-xl font-black">{number(item.value)}</p>
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </DashCard>
      </section>

      <section className="grid gap-4 sm:gap-5 xl:grid-cols-3">
        <DashCard id="packages" className="xl:col-span-2" icon={PackageCheck} title={ui('أداء الباقات')} subtitle={ui('الباقات الأكثر تحقيقًا للتحصيل خلال الفترة')} action={<ViewAll to="/reports/club/subscriptions-daily" label={ui('تقرير الاشتراكات')} />}>
          <div className="h-[280px] min-w-0 sm:h-[310px]">
            {packagePerformance.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={packagePerformance} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 5" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis hide={compact} type="number" tickFormatter={(value) => money(Number(value), true)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={compact ? 88 : 105} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value, name) => name === 'revenue' ? money(Number(value)) : number(Number(value))} contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="revenue" name={ui('التحصيل')} fill="#8b5cf6" radius={[0, 7, 7, 0]} isAnimationActive={animate} animationDuration={1100} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart label={ui('لا توجد اشتراكات جديدة في الفترة')} />}
          </div>
        </DashCard>

        <DashCard id="quick-actions" icon={ClipboardPlus} title={ui('إجراءات سريعة')} subtitle={ui('أكثر العمليات استخدامًا')}>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 xl:grid-cols-2">
            {quickActions.map((action) => (
              <Link key={action.href} to={action.href} className="group flex min-h-[5.5rem] flex-col items-center justify-center rounded-2xl border border-border/70 p-2.5 text-center transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.97] md:hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:md:hover:translate-y-0">
                <span className={cn('flex size-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100', action.tone)}><action.icon className="size-5" /></span>
                <p className="mt-2 text-[11px] font-medium leading-snug">{action.label}</p>
              </Link>
            ))}
          </div>
        </DashCard>
      </section>

      <section className="grid gap-4 sm:gap-5 md:grid-cols-2">
        <DashCard id="recent-members" icon={Users} title={ui('أحدث الأعضاء')} subtitle={ui('آخر ملفات أعضاء تمت إضافتها')}>
          <div className="space-y-1.5">
            {(data?.recentActivities.members ?? []).length ? data?.recentActivities.members.map((member, index) => (
              <Link key={`${member.code}-${index}`} to="/club/members" className="flex min-h-12 items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/50 active:bg-muted/70">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-xs font-black text-sky-600">{member.label?.slice(0, 1) || 'ع'}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{member.label}</span><span className="nums mt-0.5 block text-[10px] text-muted-foreground">{member.code}</span></span>
                <span className="nums shrink-0 text-[10px] text-muted-foreground">{new Date(member.date).toLocaleDateString('ar-EG')}</span>
              </Link>
            )) : <EmptyChart label={ui('لا يوجد أعضاء جدد')} />}
          </div>
        </DashCard>

        <DashCard id="recent-payments" icon={Banknote} title={ui('أحدث التحصيلات')} subtitle={ui('آخر إيصالات الاشتراكات المسجلة')}>
          <div className="space-y-1.5">
            {(data?.recentActivities.payments ?? []).length ? data?.recentActivities.payments.map((payment, index) => (
              <Link key={`${payment.receiptNumber}-${index}`} to="/club/subscriptions/receipts" className="flex min-h-12 items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/50 active:bg-muted/70">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300"><Banknote className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{payment.label}</span><span className="nums mt-0.5 block text-[10px] text-muted-foreground">{payment.receiptNumber}</span></span>
                <span className="nums shrink-0 text-[11px] font-black text-amber-700 dark:text-amber-300">{money(payment.amount, compact)}</span>
              </Link>
            )) : <EmptyChart label={ui('لا توجد تحصيلات في الفترة')} />}
          </div>
        </DashCard>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed bg-muted/20 px-4 py-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2"><CheckCircle2 className="size-4 shrink-0 text-amber-600" />{ui('الأرقام المالية متطابقة مع القيود المرحّلة في دفتر الأستاذ العام')}</span>
        <span className="nums">{data?.period.start} — {data?.period.end}</span>
      </div>
    </div>
  );
}
