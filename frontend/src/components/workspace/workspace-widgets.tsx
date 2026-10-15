import { useQuery } from '@tanstack/react-query';
import { LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatTimeFromDate } from '@/lib/formatters';
import type { WorkspaceConfig } from '@/hooks/use-permission';
import { useLocale } from '@/store/locale';
import { cn, toArabicDigits, withAlpha } from '@/lib/utils';
import { uiStatic } from '@/lib/ui-static';

export interface WorkspaceWidgetsResponse {
  config: WorkspaceConfig;
  data: Record<string, unknown>;
}

function WidgetSkeleton() {
  return <Skeleton className="h-24 w-full rounded-xl" />;
}

function RecentCheckinsWidget({ data }: { data: unknown }) {
  const items = (data as Array<{ memberName: string; memberCode?: string; checkInTime: string }>) ?? [];
  if (!items.length) return <p className="text-sm text-muted-foreground dark:text-white/80">{uiStatic('لا توجد تسجيلات اليوم')}</p>;
  return (
    <ul className="space-y-2 text-sm">
      {items.map((r, i) => (
        <li key={i} className="flex justify-between gap-2">
          <span>{r.memberName}</span>
          <span className="nums text-muted-foreground dark:text-white/70">{formatTimeFromDate(r.checkInTime)}</span>
        </li>
      ))}
    </ul>
  );
}

function ExpiringWidget({ data }: { data: unknown }) {
  const d = data as { count?: number; items?: Array<{ customerName: string; endDate: string }> };
  return (
    <div className="space-y-2">
      <p className="text-2xl font-bold nums dark:text-white">{toArabicDigits(d?.count ?? 0)}</p>
      <ul className="space-y-1 text-sm text-muted-foreground dark:text-white/75">
        {(d?.items ?? []).slice(0, 5).map((s, i) => (
          <li key={i}>{s.customerName} — {toArabicDigits(s.endDate)}</li>
        ))}
      </ul>
      <Link to="/club/subscriptions/expired" className="text-xs text-primary hover:underline">{uiStatic('عرض الكل')}</Link>
    </div>
  );
}

function OutstandingWidget({ data }: { data: unknown }) {
  const d = data as { count?: number; totalOutstanding?: number };
  return (
    <div>
      <p className="text-2xl font-bold nums dark:text-white">{toArabicDigits(d?.totalOutstanding?.toFixed(0) ?? '0')}</p>
      <p className="text-sm text-muted-foreground dark:text-white/75">{toArabicDigits(d?.count ?? 0)} {uiStatic('اشتراك بمستحقات')}</p>
      <Link to="/club/subscriptions/outstanding" className="text-xs text-primary hover:underline">{uiStatic('تحصيل')}</Link>
    </div>
  );
}

function ClubKpisWidget({ data }: { data: unknown }) {
  const d = data as { totalMembers?: number; checkInsToday?: number; totalSubscriptions?: number };
  return (
    <div className="grid grid-cols-3 gap-2 text-center text-sm">
      <div><p className="nums text-xl font-bold dark:text-white">{toArabicDigits(d?.totalMembers ?? 0)}</p><p className="text-muted-foreground dark:text-white/75">{uiStatic('أعضاء')}</p></div>
      <div><p className="nums text-xl font-bold dark:text-white">{toArabicDigits(d?.checkInsToday ?? 0)}</p><p className="text-muted-foreground dark:text-white/75">{uiStatic('دخول اليوم')}</p></div>
      <div><p className="nums text-xl font-bold dark:text-white">{toArabicDigits(d?.totalSubscriptions ?? 0)}</p><p className="text-muted-foreground dark:text-white/75">{uiStatic('اشتراكات')}</p></div>
    </div>
  );
}

function TreasuryWidget({ data }: { data: unknown }) {
  const d = data as {
    total?: number;
    incomeTotal?: number;
    expensesTotal?: number;
    netTotal?: number;
    receiptCount?: number;
    expenseCount?: number;
    userScoped?: boolean;
    collectorName?: string;
  };
  const net = d?.netTotal ?? d?.total ?? 0;
  return (
    <div className="space-y-2">
      <div>
        <p className={cn(
          'text-2xl font-bold nums',
          net < 0 ? 'text-destructive' : 'dark:text-white',
        )}>
          {toArabicDigits(net.toFixed(0))}
        </p>
        <p className="text-xs font-medium text-muted-foreground dark:text-white/75">{uiStatic('صافي اليوم')}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-emerald-500/10 px-2 py-1.5">
          <p className="text-muted-foreground dark:text-white/70">{uiStatic('الداخل')}</p>
          <p className="nums font-semibold text-emerald-700 dark:text-emerald-300">
            {toArabicDigits((d?.incomeTotal ?? d?.total ?? 0).toFixed(0))}
          </p>
        </div>
        <div className="rounded-lg bg-destructive/10 px-2 py-1.5">
          <p className="text-muted-foreground dark:text-white/70">{uiStatic('المصروفات')}</p>
          <p className="nums font-semibold text-destructive">
            {toArabicDigits((d?.expensesTotal ?? 0).toFixed(0))}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground dark:text-white/70">
        {toArabicDigits(d?.receiptCount ?? 0)} {uiStatic('إيصال')} · {toArabicDigits(d?.expenseCount ?? 0)} {uiStatic('مصروف')}
      </p>
      {d?.userScoped ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground dark:text-white/75">
          <LockKeyhole className="size-3.5 text-primary" />
          <span className="truncate">{d.collectorName ?? '—'}</span>
        </p>
      ) : null}
    </div>
  );
}

function PendingTasksWidget({ data }: { data: unknown }) {
  const d = data as { count?: number; items?: Array<{ title: string; due_date?: string | null }> };
  return (
    <div className="space-y-2">
      <p className="text-2xl font-bold nums">{toArabicDigits(d?.count ?? 0)}</p>
      <ul className="text-sm text-muted-foreground">
        {(d?.items ?? []).slice(0, 4).map((t, i) => (
          <li key={i} className="truncate">{t.title}</li>
        ))}
      </ul>
      <Link to="/settings/automation" className="text-xs text-primary hover:underline">{uiStatic('المهام')}</Link>
    </div>
  );
}

const WIDGET_TITLES: Record<string, string> = {
  recent_checkins: uiStatic('آخر الداخلين'),
  pending_tasks: uiStatic('مهام معلقة'),
  expiring_subscriptions: uiStatic('اشتراكات تنتهي قريباً'),
  outstanding_balances: uiStatic('مستحقات'),
  club_kpis: uiStatic('مؤشرات النادي'),
  pending_renewals: uiStatic('تجديدات معلقة'),
  attendance_rate: uiStatic('نسبة الحضور'),
  treasury_today: uiStatic('صافي خزينة اليوم'),
  today_sales: uiStatic('مبيعات اليوم'),
  pos_shift: uiStatic('وردية POS'),
};

/** Accent colour per widget so the KPI row reads as distinct, colourful tiles. */
const WIDGET_TONES: Record<string, string> = {
  treasury_today: '#2FBF87',
  today_sales: '#2FBF87',
  outstanding_balances: '#E5736B',
  club_kpis: '#F7CE1B',
  recent_checkins: '#F7CE1B',
  attendance_rate: '#38BDF8',
  expiring_subscriptions: '#E8A44B',
  pending_renewals: '#E8A44B',
  pending_tasks: '#8B5CF6',
  pos_shift: '#8B5CF6',
};

function renderWidget(key: string, data: unknown) {
  switch (key) {
    case 'recent_checkins':
      return <RecentCheckinsWidget data={data} />;
    case 'expiring_subscriptions':
    case 'pending_renewals':
      return <ExpiringWidget data={data} />;
    case 'outstanding_balances':
      return <OutstandingWidget data={data} />;
    case 'club_kpis':
      return <ClubKpisWidget data={data} />;
    case 'treasury_today':
      return <TreasuryWidget data={data} />;
    case 'pending_tasks':
      return <PendingTasksWidget data={data} />;
    case 'attendance_rate': {
      const d = data as { rate?: number };
      return <p className="text-2xl font-bold nums dark:text-white">{toArabicDigits(d?.rate ?? 0)}%</p>;
    }
    case 'today_sales': {
      const d = data as { total?: number; count?: number };
      return (
        <div>
          <p className="text-2xl font-bold nums">{toArabicDigits(d?.total?.toFixed(0) ?? '0')}</p>
          <p className="text-sm text-muted-foreground">{toArabicDigits(d?.count ?? 0)} {uiStatic('فاتورة')}</p>
        </div>
      );
    }
    default:
      return null;
  }
}

export function WorkspaceWidgets({ className, branchId }: { className?: string; branchId?: string }) {
  const { ui } = useLocale();
  const { data, isLoading } = useQuery({
    queryKey: ['me', 'workspace', 'widgets', branchId || 'all'],
    queryFn: async () => (await api.get<WorkspaceWidgetsResponse>('/me/workspace/widgets', {
      params: branchId ? { branchId } : undefined,
    })).data,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className={className}>
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <WidgetSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const widgets = data?.config.widgets ?? [];
  const payload = data?.data ?? {};

  const visible = widgets.filter((k) => renderWidget(k, payload[k]) != null);
  if (!visible.length) return null;

  return (
    <div className={className}>
      <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:grid lg:grid-cols-4 lg:overflow-visible lg:snap-none">
        {visible.map((key) => {
          const tone = WIDGET_TONES[key] ?? '#6FB7E6';
          return (
            <Card
              key={key}
              className="group relative min-w-[220px] shrink-0 snap-start overflow-hidden lg:min-w-0"
              style={{ borderColor: withAlpha(tone, 0.32) }}
            >
              {/* Full-card colour — evenly tinted with the widget's tone, no glow */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.13] transition-opacity duration-300 group-hover:opacity-[0.18] dark:opacity-[0.24] dark:group-hover:opacity-[0.30]"
                style={{ backgroundColor: tone }}
              />
              <CardHeader className="relative pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold dark:text-white">
                  <span className="size-2 rounded-full" style={{ backgroundColor: tone }} />
                  {WIDGET_TITLES[key] ?? key}
                </CardTitle>
              </CardHeader>
              <CardContent className="relative dark:text-white">{renderWidget(key, payload[key])}</CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
