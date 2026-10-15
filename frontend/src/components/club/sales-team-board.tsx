import { Crown, Dumbbell, Target, Trophy, Users } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/formatters';
import type { SalesDashboardKpis, SalesRepPerformance } from '@/lib/sales-commission';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ProfileMode } from '@/pages/club/sales-team-view-model';
import { uiStatic } from '@/lib/ui-static';

export function SalesTeamSummaryStrip({
  kpis,
  loading,
}: {
  kpis?: SalesDashboardKpis;
  loading?: boolean;
}) {
  const { ui } = useLocale();

  if (loading) {
    return (
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }
  if (!kpis) return null;

  const items = [
    { label: ui('إجمالي المبيعات'), value: formatMoney(kpis.totalSales), hint: `${ui('التارجت')}: ${formatMoney(kpis.teamTarget)}` },
    { label: ui('نسبة التحقيق'), value: `${toArabicDigits(kpis.achievementPct)}%` },
    { label: ui('معدل التحويل'), value: `${toArabicDigits(kpis.conversionRate)}%` },
    { label: ui('متأخرون 24 ساعة'), value: toArabicDigits(kpis.overdueLeads), alert: kpis.overdueLeads > 0 },
  ];

  return (
    <div className="surface-card grid gap-px overflow-hidden rounded-xl border bg-border/60 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="bg-card px-4 py-4">
          <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
          <p className={cn(
            'nums mt-1 text-lg font-bold tabular-nums tracking-tight',
            item.alert ? 'text-destructive' : 'text-foreground',
          )}
          >
            {item.value}
          </p>
          {item.hint ? <p className="nums mt-0.5 text-xs text-muted-foreground">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

export interface SalesLeaderboardEntry {
  employeeId: number;
  name: string;
  achievementPct: number;
  rank?: number;
  isCurrent?: boolean;
  actual?: number;
  commissionPercent?: number;
  commissionDue?: number;
}

export function SalesLeaderboardPanel({
  rows,
  loading,
  showFinancials = false,
  onSelect,
}: {
  rows: SalesLeaderboardEntry[];
  loading?: boolean;
  showFinancials?: boolean;
  onSelect?: (row: SalesLeaderboardEntry) => void;
}) {
  const { ui } = useLocale();
  if (loading) return <Skeleton className="min-h-[20rem] rounded-xl" />;

  return (
    <section className="surface-card flex min-h-[20rem] flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-bold">{ui('ترتيب فريق المبيعات')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{ui('حسب نسبة تحقيق التارجت')}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-[10px] bg-primary/15 text-foreground">
          <Trophy className="size-4" aria-hidden="true" />
        </span>
      </div>

      {!rows.length ? <EmptyState compact title={ui('لا يوجد ترتيب حاليًا')} /> : (
        <ol className="divide-y">
          {rows.map((row, index) => {
            const rank = row.rank ?? index + 1;
            const content = (
              <>
                <span className={cn(
                  'nums grid size-9 shrink-0 place-items-center rounded-[10px] text-sm font-bold tabular-nums',
                  rank === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                )}
                >
                  {rank === 1 ? <Crown className="size-4" aria-label={ui('المركز الأول')} /> : toArabicDigits(rank)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold">{row.name}</span>
                    {row.isCurrent ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold">{ui('أنت')}</span> : null}
                  </span>
                  {showFinancials && row.actual != null ? (
                    <span className="nums mt-0.5 block text-xs text-muted-foreground">
                      {formatMoney(row.actual)}
                      {row.commissionDue != null ? ` · ${ui('عمولة')} ${formatMoney(row.commissionDue)}` : ''}
                      {row.commissionPercent != null ? ` (${toArabicDigits(row.commissionPercent)}%)` : ''}
                    </span>
                  ) : null}
                </span>
                <span className="nums shrink-0 text-sm font-bold tabular-nums">{toArabicDigits(row.achievementPct)}%</span>
              </>
            );

            return (
              <li key={row.employeeId}>
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(row)}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-start transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    {content}
                  </button>
                ) : (
                  <div className={cn('flex items-center gap-3 px-5 py-3.5', row.isCurrent && 'bg-primary/[0.06]')}>
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function SalesRepCards({
  rows,
  loading,
  error,
  onRetry,
  onSelect,
  profileMode = 'settings',
}: {
  rows: SalesRepPerformance[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onSelect: (row: SalesRepPerformance) => void;
  profileMode?: ProfileMode;
}) {
  const { ui } = useLocale();

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
      </div>
    );
  }
  if (error) {
    return <ErrorState inline onRetry={onRetry} />;
  }
  if (!rows.length) {
    return (
      <EmptyState
        icon={Users}
        compact
        title={ui('لا يوجد أخصائيو مبيعات')}
        description={ui('أضف موظفين بمسمى مبيعات ليظهروا هنا مع أهدافهم وأدائهم.')}
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <SalesRepCard key={row.salesRepId} row={row} onSelect={onSelect} profileMode={profileMode} />
      ))}
    </div>
  );
}

function SalesRepCard({
  row,
  onSelect,
  profileMode,
}: {
  row: SalesRepPerformance;
  onSelect: (row: SalesRepPerformance) => void;
  profileMode: ProfileMode;
}) {
  const { ui } = useLocale();
  const pct = Math.max(0, row.achievementPct);
  const bar = Math.min(100, pct);
  const over = pct >= 100;

  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className={cn(
        'surface-card group rounded-xl border p-5 text-start shadow-sm transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold tracking-tight">{row.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {ui(profileMode === 'settings' ? uiStatic('اضغط لضبط التارجت والعمولة') : uiStatic('اضغط لعرض ملف الأداء التفصيلي'))}
          </p>
        </div>
        <span className={cn(
          'nums inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums',
          over ? 'bg-success/15 text-success' : 'bg-primary/15 text-foreground',
        )}
        >
          <Target className="size-3.5" />
          {toArabicDigits(pct)}%
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{ui('الفعلي مقابل التارجت')}</span>
          <span className="nums tabular-nums text-muted-foreground">
            {formatMoney(row.actual)} / {formatMoney(row.financialTarget)}
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={ui('نسبة تحقيق التارجت')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={bar}
        >
          <div
            className={cn('h-full rounded-full transition-[width] duration-200', over ? 'bg-success' : 'bg-primary')}
            style={{ width: `${bar}%` }}
          />
        </div>
      </div>

      {row.receivedLeads != null ? (
        <dl className="mt-4 grid grid-cols-3 gap-2">
          <MiniStat label={ui('مستلم')} value={row.receivedLeads} />
          <MiniStat label={ui('تواصل')} value={row.contacted ?? 0} />
          <MiniStat label={ui('محوّل')} value={row.converted ?? 0} />
        </dl>
      ) : null}
    </button>
  );
}

export interface TrainerCardPerformance {
  trainerId: number;
  name: string;
  sessions: number;
  revenue: number;
  target: number;
  targetUnit: string;
  achievementPct: number;
  commissionDue: number;
}

export function TrainerPerformanceCards({
  rows,
  loading,
  error,
  onRetry,
  onSelect,
  profileMode,
}: {
  rows: TrainerCardPerformance[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onSelect: (row: TrainerCardPerformance) => void;
  profileMode: ProfileMode;
}) {
  const { ui } = useLocale();
  if (loading) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-48 rounded-xl" />)}</div>;
  if (error) return <ErrorState inline onRetry={onRetry} />;
  if (!rows.length) return <EmptyState icon={Dumbbell} compact title={ui('لا يوجد مدربون مرتبطون بموظفين.')} />;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        const pct = Math.max(0, row.achievementPct);
        return (
          <button
            key={row.trainerId}
            type="button"
            onClick={() => onSelect(row)}
            className="surface-card group rounded-xl border p-5 text-start shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-base font-bold">{row.name}</p><p className="mt-1 text-xs text-muted-foreground">{ui(profileMode === 'settings' ? uiStatic('اضغط لضبط التارجت والعمولة') : uiStatic('اضغط لعرض ملف الأداء التفصيلي'))}</p></div>
              <span className="nums rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold">{toArabicDigits(pct)}%</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${Math.min(100, pct)}%` }} /></div>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <MiniStat label={ui('حصص')} value={row.sessions} />
              <div className="rounded-[10px] bg-muted/40 px-2 py-2 text-center"><dt className="text-[11px] font-semibold text-muted-foreground">{ui('إيراد')}</dt><dd className="nums mt-0.5 text-xs font-bold">{formatMoney(row.revenue)}</dd></div>
              <div className="rounded-[10px] bg-muted/40 px-2 py-2 text-center"><dt className="text-[11px] font-semibold text-muted-foreground">{ui('عمولة')}</dt><dd className="nums mt-0.5 text-xs font-bold">{formatMoney(row.commissionDue)}</dd></div>
            </dl>
          </button>
        );
      })}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] bg-muted/40 px-2 py-2 text-center">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="nums mt-0.5 text-sm font-bold tabular-nums">{toArabicDigits(value)}</dd>
    </div>
  );
}
