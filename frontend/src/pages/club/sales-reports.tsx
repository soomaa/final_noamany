import { formatDisplayNumber } from '@/lib/number-display';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, Download, LayoutDashboard, Settings2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { SalesPipelineTabs } from '@/components/club/sales-pipeline-tabs';
import { SalesRepSettingsDialog } from '@/components/club/sales-rep-settings-dialog';
import { SalesDefaultsCard } from '@/components/club/sales-defaults-card';
import {
  SalesLeaderboardPanel,
  SalesRepCards,
  SalesTeamSummaryStrip,
} from '@/components/club/sales-team-board';
import { TeamPerformanceDialog } from '@/components/club/team-performance-dialog';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, apiError } from '@/lib/api';
import { formatNum, localToday } from '@/lib/formatters';
import type { SalesDashboardKpis, SalesRepPerformance } from '@/lib/sales-commission';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';
import {
  changeSalesAdminSection,
  initialSalesTeamView,
  mergeSalesAdminPerformance,
  profileOpenIntent,
  salesAdminRouteForSection,
  salesAdminSectionFromPath,
  type SalesAdminSection,
} from './sales-team-view-model';

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

async function download(path: string, filename: string, params: Record<string, string>) {
  const { data } = await api.get(path, { params, responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface DashboardPayload {
  kpis: SalesDashboardKpis;
  table: SalesRepPerformance[];
  pipeline: { new: number; inProgress: number; followLater: number; qualified: number; converted: number; lost: number };
}

interface SalesReportRow {
  salesRepId: number;
  name: string;
  subscriptions: number;
  revenue: number;
  target: number;
  achievementPct: number;
  commissionPercent: number;
  commissionDue: number;
}

export function ClubSalesReportsPage() {
  const { ui } = useLocale();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(() => localToday());
  const [viewState, setViewState] = useState(() => ({
    ...initialSalesTeamView,
    adminSection: salesAdminSectionFromPath(pathname),
    profileMode: salesAdminSectionFromPath(pathname) === 'settings' ? 'settings' as const : 'performance' as const,
  }));
  const params = useMemo(() => ({ dateFrom, dateTo, range: 'custom' as const }), [dateFrom, dateTo]);

  const overview = useQuery({
    queryKey: ['club-sales-dashboard', params],
    queryFn: async () => (await api.get<DashboardPayload>('/club-sales-dashboard', { params })).data,
    retry: false,
  });
  const sales = useQuery({
    queryKey: ['club-sales-reports-reps', params],
    queryFn: async () => (await api.get<{ rows: SalesReportRow[] }>('/club-sales-reports/sales-reps', { params })).data,
  });

  const cards: SalesRepPerformance[] = mergeSalesAdminPerformance(
    overview.data?.table ?? [],
    sales.data?.rows ?? [],
  );
  const selectedName = viewState.profileId == null
    ? ''
    : cards.find((row) => row.salesRepId === viewState.profileId)?.name ?? '';
  const closeProfile = () => setViewState((current) => ({ ...current, profileId: null }));

  const fallbackKpis = useMemo(() => {
    if (overview.data?.kpis) return overview.data.kpis;
    const rows = sales.data?.rows ?? [];
    if (!rows.length) return undefined;
    const totalSales = rows.reduce((sum, row) => sum + row.revenue, 0);
    const teamTarget = rows.reduce((sum, row) => sum + row.target, 0);
    return {
      totalSales,
      teamTarget,
      achievementPct: teamTarget ? Math.round((totalSales / teamTarget) * 1000) / 10 : 0,
      conversionRate: 0,
      assignedLeads: rows.reduce((sum, row) => sum + row.subscriptions, 0),
      overdueLeads: 0,
      totalLeads: rows.reduce((sum, row) => sum + row.subscriptions, 0),
    };
  }, [overview.data?.kpis, sales.data?.rows]);

  const selectSection = (section: SalesAdminSection) => {
    setViewState((current) => changeSalesAdminSection(current, section));
    navigate(salesAdminRouteForSection(section));
  };
  const openProfile = (row: SalesRepPerformance) => {
    setViewState((current) => profileOpenIntent(current, row.salesRepId));
  };
  const leaderboardRows = [...cards]
    .sort((a, b) => b.achievementPct - a.achievementPct || a.name.localeCompare(b.name, 'ar'))
    .map((row, index) => ({
      rank: index + 1,
      employeeId: row.salesRepId,
      name: row.name,
      achievementPct: row.achievementPct,
      actual: row.actual,
      commissionPercent: row.commissionPercent,
      commissionDue: row.commissionDue,
    }));
  const loading = overview.isLoading || sales.isLoading;
  const error = overview.isError || sales.isError;

  useEffect(() => {
    const section = salesAdminSectionFromPath(pathname);
    setViewState((current) => current.adminSection === section ? current : changeSalesAdminSection(current, section));
  }, [pathname]);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={ui('إدارة المبيعات')}
        description={ui('راقب النتائج، تابع الفريق، واضبط التارجت والعمولة.')}
        actions={(
          <>
            <Input aria-label={ui('من تاريخ')} type="date" className="w-40 nums" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <Input aria-label={ui('إلى تاريخ')} type="date" className="w-40 nums" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            <Button
              variant="outline"
              onClick={() => download('/club-sales-reports/sales-reps/export', 'sales-reps.xlsx', params).catch((error) => toast.error(apiError(error)))}
            >
              <Download className="size-4" /> Excel
            </Button>
          </>
        )}
      />

      <SalesAdminTabs value={viewState.adminSection} onChange={selectSection} />

      {viewState.adminSection === 'overview' ? (
        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.55fr)] xl:items-start">
            <SalesFunnelOverview
              pipeline={overview.data?.pipeline}
              loading={overview.isLoading}
              onSelect={(status) => navigate(status ? `/club/leads?status=${status}` : '/club/leads')}
            />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <AdminAlertCard
                  icon={AlertTriangle}
                  label={ui('متابعات متأخرة')}
                  value={fallbackKpis?.overdueLeads ?? 0}
                  alert
                />
                <AdminAlertCard
                  icon={BadgeCheck}
                  label={ui('عملاء مؤهلون')}
                  value={overview.data?.pipeline.qualified ?? 0}
                />
              </div>
              {sales.isError ? (
                <ErrorState inline onRetry={() => void sales.refetch()} />
              ) : (
                <SalesLeaderboardPanel
                  rows={leaderboardRows}
                  loading={loading}
                  showFinancials
                  onSelect={(row) => {
                    const selected = cards.find((card) => card.salesRepId === row.employeeId);
                    if (selected) openProfile(selected);
                  }}
                />
              )}
            </div>
          </div>
          <SalesTeamSummaryStrip kpis={fallbackKpis} loading={loading} />
        </div>
      ) : null}

      {viewState.adminSection === 'team' ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight">{ui('فريق المبيعات')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{ui('اختر أخصائيًا لعرض العملاء والتحويلات والاشتراكات.')}</p>
          </div>
          <SalesRepCards
            rows={cards}
            loading={loading}
            error={error}
            onRetry={() => { void overview.refetch(); void sales.refetch(); }}
            onSelect={openProfile}
            profileMode="performance"
          />
        </section>
      ) : null}

      {viewState.adminSection === 'settings' ? (
        <section className="space-y-3">
          <SalesDefaultsCard />
          <div>
            <h2 className="text-lg font-bold tracking-tight">{ui('التارجت والعمولة')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{ui('اختر أخصائيًا لتعديل الهدف وشرائح العمولة.')}</p>
          </div>
          <SalesRepCards
            rows={cards}
            loading={loading}
            error={error}
            onRetry={() => { void overview.refetch(); void sales.refetch(); }}
            onSelect={openProfile}
            profileMode="settings"
          />
        </section>
      ) : null}

      <SalesRepSettingsDialog
        open={viewState.profileMode === 'settings' && viewState.profileId != null}
        onOpenChange={(open) => !open && closeProfile()}
        salesRepId={viewState.profileId}
        performance={cards.find((row) => row.salesRepId === viewState.profileId)}
      />
      <TeamPerformanceDialog
        open={viewState.profileMode === 'performance' && viewState.profileId != null}
        onOpenChange={(open) => !open && closeProfile()}
        teamKind="sales"
        profileId={viewState.profileId}
        profileName={selectedName}
        params={params}
      />
    </div>
  );
}

function AdminAlertCard({ icon: Icon, label, value, alert = false }: { icon: typeof AlertTriangle; label: string; value: number; alert?: boolean }) {
  return (
    <div className="surface-card min-h-28 rounded-xl border bg-card p-4 text-center">
      <span className={cn('mx-auto grid size-8 place-items-center rounded-[10px]', alert ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
        <Icon className="size-4" />
      </span>
      <p className="mt-2 text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn('nums mt-1 text-2xl font-bold tabular-nums', alert && value > 0 && 'text-destructive')}>{formatNum(value)}</p>
    </div>
  );
}

function SalesFunnelOverview({
  pipeline,
  loading,
  onSelect,
}: {
  pipeline?: DashboardPayload['pipeline'];
  loading: boolean;
  onSelect: (status: string) => void;
}) {
  const { ui } = useLocale();
  if (loading) return <div className="h-32 animate-pulse rounded-xl bg-muted/55" aria-label={ui('جاري تحميل مسار المبيعات')} />;
  const counts = pipeline ? {
    '': pipeline.new + pipeline.inProgress + pipeline.followLater + pipeline.qualified + pipeline.converted + pipeline.lost,
    new: pipeline.new,
    in_progress: pipeline.inProgress,
    follow_later: pipeline.followLater,
    qualified: pipeline.qualified,
    converted: pipeline.converted,
    lost: pipeline.lost,
  } : undefined;

  return (
    <section className="surface-card min-h-[28rem] rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold tracking-tight">{ui('مركز نشاط المبيعات')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{ui('حركة العملاء من الاستلام حتى الاشتراك.')}</p>
      </div>
      <SalesPipelineTabs value="" onChange={onSelect} counts={counts} />
      {pipeline ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: uiStatic('جدد'), value: pipeline.new, status: 'new' },
            { label: uiStatic('قيد المتابعة'), value: pipeline.inProgress, status: 'in_progress' },
            { label: uiStatic('متابعة لاحقًا'), value: pipeline.followLater, status: 'follow_later' },
            { label: uiStatic('مؤهلون'), value: pipeline.qualified, status: 'qualified' },
            { label: uiStatic('تم الاشتراك'), value: pipeline.converted, status: 'converted' },
            { label: uiStatic('غير مؤهلين'), value: pipeline.lost, status: 'lost' },
          ].map((stage) => (
            <button
              key={stage.status}
              type="button"
              onClick={() => onSelect(stage.status)}
              className="rounded-xl border bg-muted/20 px-4 py-5 text-center transition-colors hover:border-primary/35 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="nums block text-3xl font-bold tabular-nums">{formatDisplayNumber(stage.value)}</span>
              <span className="mt-2 block text-xs font-semibold text-muted-foreground">{ui(stage.label)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SalesAdminTabs({ value, onChange }: { value: SalesAdminSection; onChange: (value: SalesAdminSection) => void }) {
  const { ui } = useLocale();
  const options = [
    { value: 'overview' as const, label: uiStatic('نظرة عامة'), icon: LayoutDashboard },
    { value: 'team' as const, label: uiStatic('فريق المبيعات'), icon: Users },
    { value: 'settings' as const, label: uiStatic('التارجت والعمولة'), icon: Settings2 },
  ];
  return (
    <div className="flex justify-center">
      <div role="tablist" aria-label={ui('أقسام إدارة المبيعات')} className="grid w-full max-w-3xl grid-cols-3 gap-1 rounded-xl bg-muted/55 p-1.5">
        {options.map((option) => {
          const active = value === option.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[10px] px-1 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:gap-2 sm:px-3 sm:text-sm',
                active ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
              )}
            >
              <Icon className={cn('size-4', active && 'text-primary')} />
              <span>{ui(option.label)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
