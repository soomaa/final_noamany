import {
  Activity,
  DollarSign,
  Lock,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { formatMoney } from '@/lib/formatters';
import { toArabicDigits, withAlpha } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubDashboardSummary } from '@/types/club';

const REVENUE_COLORS = {
  subscription: '#F7CE1B',
  locker: '#14B8A6',
  spa: '#EC4899',
  class: '#E8A44B',
  inbody: '#8B5CF6',
  other: '#6FB7E6',
} as const;

function AttendanceRing({ rate }: { rate: number }) {
  const pct = Math.min(100, Math.max(0, rate));
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div className="relative mx-auto size-28">
      <svg className="size-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-white/15" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#38BDF8"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="nums text-2xl font-bold text-white">{toArabicDigits(Math.round(pct))}%</span>
      </div>
    </div>
  );
}

function RevenueBar({
  label,
  amount,
  max,
  color,
}: {
  label: string;
  amount: number;
  max: number;
  color: string;
}) {
  const { locale } = useLocale();
  const pct = max > 0 ? Math.min(100, (amount / max) * 100) : 0;

  return (
    <div className="group">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-muted-foreground dark:text-white/80">{label}</span>
        <span className="nums shrink-0 font-semibold tabular-nums" style={{ color }}>
          {formatMoney(amount, undefined, locale)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-foreground/[0.06] dark:bg-white/10">
        <div
          className="h-full rounded-full transition-all duration-500 group-hover:brightness-110"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function OpStat({
  icon: Icon,
  label,
  value,
  suffix,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  suffix?: string;
  color: string;
}) {
  return (
    <div className="flex min-w-[7.5rem] flex-1 flex-col items-center gap-2 px-4 py-3 text-center sm:min-w-0">
      <div
        className="flex size-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: withAlpha(color, 0.14), color, border: `1px solid ${withAlpha(color, 0.28)}` }}
      >
        <Icon className="size-[18px]" />
      </div>
      <p className="nums text-xl font-bold tracking-tight dark:text-white" style={{ color }}>
        {typeof value === 'number' ? toArabicDigits(value) : value}
        {suffix && <span className="ms-0.5 text-sm font-normal text-muted-foreground dark:text-white/60">{suffix}</span>}
      </p>
      <p className="text-xs font-medium leading-snug text-muted-foreground dark:text-white/65">{label}</p>
    </div>
  );
}

interface ClubDashboardMetricsProps {
  data: ClubDashboardSummary;
  labels: {
    monthlyRevenue: string;
    totalRemaining: string;
    netProfit: string;
    expenses: string;
    expenseBreakdown: string;
    totalMembers: string;
    activeMembers: string;
    newMembersMonth: string;
    inactiveMembers: string;
    attendanceRate: string;
    revenueBreakdown: string;
    subscriptionRevenue: string;
    lockerRevenue: string;
    spaRevenue: string;
    classRevenue: string;
    inbodyRevenue: string;
    otherRevenue: string;
    operationsOverview: string;
    trainersCount: string;
    classesToday: string;
    facilities: string;
    avgMembership: string;
  };
}

export function ClubDashboardMetrics({ data, labels }: ClubDashboardMetricsProps) {
  const { locale } = useLocale();
  const { total, active, inactive, newThisMonth } = data.totalMembers;
  const activePct = total > 0 ? (active / total) * 100 : 0;

  const revenueSources = [
    { key: 'paid', label: labels.monthlyRevenue, amount: data.totalPaid, color: REVENUE_COLORS.subscription },
    { key: 'remaining', label: labels.totalRemaining, amount: data.totalRemaining, color: REVENUE_COLORS.inbody },
  ].filter((s) => s.amount > 0);

  const maxRevenue = Math.max(...revenueSources.map((s) => s.amount), 1);

  return (
    <div className="space-y-4">
      {/* ── Hero bento row ── */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* Revenue hero */}
        <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-lg ring-1 ring-white/10 lg:col-span-5">
          <div className="pointer-events-none absolute -end-8 -top-8 size-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-6 -start-6 size-32 rounded-full bg-amber-300/20 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-sm font-medium text-white/75">
              <DollarSign className="size-4 text-amber-200" />
              {labels.monthlyRevenue}
            </div>
            <p className="nums mt-2 text-4xl font-bold tracking-tight sm:text-[2.75rem]">
              {formatMoney(data.monthlyRevenue, undefined, locale)}
            </p>
            <div className="mt-5 flex flex-wrap gap-6 border-t border-white/15 pt-4">
              <div>
                <p className="text-xs text-white/60">{labels.totalRemaining}</p>
                <p className="nums mt-0.5 text-lg font-semibold text-violet-200">
                  {formatMoney(data.totalRemaining, undefined, locale)}
                </p>
              </div>
              <div>
                <p className="text-xs text-white/60">{labels.netProfit}</p>
                <p className="nums mt-0.5 text-lg font-semibold text-emerald-200">
                  {formatMoney(data.netProfit, undefined, locale)}
                </p>
              </div>
              {data.expensesAvailable && (
                <div>
                  <p className="text-xs text-white/60">{labels.expenses}</p>
                  <p className="nums mt-0.5 text-lg font-semibold text-rose-200">
                    {formatMoney(data.expenses ?? 0, undefined, locale)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-white/60">{labels.newMembersMonth}</p>
                <p className="nums mt-0.5 text-lg font-semibold">{toArabicDigits(newThisMonth)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Members panel */}
        <div className="surface-card rounded-2xl border p-5 lg:col-span-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground dark:text-white/75">{labels.totalMembers}</p>
              <p className="nums mt-1 text-3xl font-bold tracking-tight text-primary dark:text-white">
                {toArabicDigits(total)}
              </p>
            </div>
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex justify-between text-xs">
              <span className="text-muted-foreground dark:text-white/65">{labels.activeMembers}</span>
              <span className="nums font-semibold text-primary dark:text-amber-300">
                {toArabicDigits(active)} ({toArabicDigits(activePct.toFixed(0))}%)
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-primary/10 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-700"
                style={{ width: `${activePct}%` }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-500/[0.08] px-3 py-2.5 dark:bg-emerald-400/10">
              <p className="text-[11px] text-muted-foreground dark:text-white/60">{labels.activeMembers}</p>
              <p className="nums mt-0.5 text-lg font-bold text-emerald-600 dark:text-emerald-300">{toArabicDigits(active)}</p>
            </div>
            <div className="rounded-xl bg-foreground/[0.04] px-3 py-2.5 dark:bg-white/[0.06]">
              <p className="text-[11px] text-muted-foreground dark:text-white/60">{labels.inactiveMembers}</p>
              <p className="nums mt-0.5 text-lg font-bold text-muted-foreground dark:text-white/80">{toArabicDigits(inactive)}</p>
            </div>
          </div>
        </div>

        {/* Attendance ring */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-5 text-white shadow-md lg:col-span-3">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.12),transparent_60%)]" />
          <div className="relative flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex items-center gap-1.5 text-sm font-medium text-white/80">
              <Activity className="size-4" />
              {labels.attendanceRate}
            </div>
            <AttendanceRing rate={data.attendanceRate} />
          </div>
        </div>
      </div>

      {/* ── Revenue breakdown + operations ── */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="surface-card rounded-2xl border p-5 lg:col-span-8">
          <div className="mb-5 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="font-semibold dark:text-white">{labels.revenueBreakdown}</h3>
          </div>
          {revenueSources.length === 0 ? (
            <p className="text-sm text-muted-foreground dark:text-white/60">—</p>
          ) : (
            <div className="space-y-4">
              {revenueSources.map((s) => (
                <RevenueBar key={s.key} label={s.label} amount={s.amount} max={maxRevenue} color={s.color} />
              ))}
            </div>
          )}
        </div>

        <div className="surface-card rounded-2xl border p-5 lg:col-span-4">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <h3 className="font-semibold dark:text-white">{labels.operationsOverview}</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <OpStat icon={Users} label={labels.trainersCount} value={data.trainers} color="#8B5CF6" />
            <OpStat icon={Activity} label={labels.classesToday} value={data.classesToday ?? 0} color="#E8A44B" />
            <OpStat
              icon={UserPlus}
              label={labels.avgMembership}
              value={formatMoney(data.avgMonthlyMembership, undefined, locale)}
              color="#F7CE1B"
            />
          </div>
          {data.facilities > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-primary/20 bg-primary/[0.04] px-3 py-2.5 text-sm dark:border-white/10 dark:bg-white/[0.04]">
              <Lock className="size-4 shrink-0 text-primary" />
              <span className="text-muted-foreground dark:text-white/70">{labels.facilities}</span>
              <span className="nums ms-auto font-bold text-primary dark:text-amber-300">{toArabicDigits(data.facilities)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="surface-card rounded-2xl border p-5">
        <div className="mb-5 flex items-center gap-2">
          <DollarSign className="size-4 text-rose-500" />
          <h3 className="font-semibold dark:text-white">{labels.expenseBreakdown}</h3>
        </div>
        {data.expenseBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground dark:text-white/60">—</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.expenseBreakdown.map((item, index) => (
              <RevenueBar
                key={`${item.name}-${index}`}
                label={item.name}
                amount={item.value}
                max={Math.max(...data.expenseBreakdown.map((entry) => entry.value), 1)}
                color="#F43F5E"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
