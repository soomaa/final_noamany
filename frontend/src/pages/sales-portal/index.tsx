import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Handshake,
  MessageCircle,
  MessageSquareText,
  Phone,
  Search,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { MemberAvatar } from '@/components/club/member-avatar';
import { MemberProfileSheet } from '@/components/club/member-profile-sheet';
import { usePersistentScanner } from '@/components/club/persistent-scanner';
import { SalesPipelineTabs } from '@/components/club/sales-pipeline-tabs';
import { SalesLeaderboardPanel } from '@/components/club/sales-leaderboard-panel';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState } from '@/components/common/states';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney, formatNum } from '@/lib/formatters';
import { toDialLink, toWhatsAppLink } from '@/lib/contact-links';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import {
  leadDecisionStatuses,
  followUpStatusForLead,
  salesLeadActivityOptions,
  salesPortalRoutes,
  salesWorkspaceTabFromPath,
  validateSalesLeadActivity,
  type SalesLeadActivityType,
  type SalesWorkspaceTab,
} from './sales-workspace-model';
import { adjacentClient, swipeDirection } from './client-navigation';
import { SalesReminders } from './sales-reminders';
import { SalesRenewals } from './sales-renewals';
import { MaskedPhone } from '@/components/club/masked-phone';
import { uiStatic } from '@/lib/ui-static';

interface SalesPortalResponse {
  specialist: { employeeId: number; name: string | null; branchId: number };
  statistics: {
    totalAssigned: number;
    registeredToday: number;
    registeredThisMonth: number;
    activeMembers: number;
  };
  performance: {
    periodStart: string;
    periodEnd: string;
    target: number;
    actualRevenue: number;
    achievementPct: number;
    commissionPercent: number;
    commissionDue: number;
    assignedLeads: number;
    overdueLeads: number;
    convertedLeads: number;
    conversionRate: number;
    averageResponseHours: number | null;
    closedDeals: number;
  };
  pipeline: { new: number; inProgress: number; followLater: number; qualified: number; converted: number; lost: number };
  leaderboard: Array<{
    rank: number;
    employeeId: number;
    name: string;
    achievementPct: number;
    isCurrent: boolean;
  }>;
  closedDeals: Array<{
    id: number;
    subscriptionNumber: string;
    customerName: string | null;
    paidAmount: number;
    registrationDate: string;
    subscriptionType: string | null;
  }>;
  recentMembers: Array<{
    id: number;
    memberCode: string;
    name: string;
    phone: string | null;
    isActive: boolean;
    createdAt: string;
  }>;
}

export interface SalesLead {
  id: number;
  fullName: string;
  phone: string;
  status: string;
  statusLabel: string;
  sourceLabel: string;
  lastContactedAt?: string | null;
  createdAt?: string;
  branchId: number;
  convertedMemberId?: number | null;
  profilePicture?: string | null;
  subscription?: {
    subscriptionNumber: string;
    packageName: string | null;
    paidAmount: number;
    startDate: string;
    endDate: string;
  } | null;
}

interface SalesLeadDetails extends SalesLead {
  interestedProgramLabel?: string | null;
  notes?: string | null;
  nextFollowUpAt?: string | null;
  nextCallAt?: string | null;
  followUps: Array<{
    id: number;
    note: string;
    status: string | null;
    activityType: string;
    answered: boolean | null;
    interests: string | null;
    nextFollowUpAt: string | null;
    nextCallAt?: string | null;
    createdByName: string | null;
    createdAt: string;
  }>;
}

const tabLabels: Record<SalesWorkspaceTab, string> = {
  today: uiStatic('اليوم'),
  leads: uiStatic('العملاء المحتملون'),
  renewals: uiStatic('التجديدات'),
  results: uiStatic('النتائج والعضويات'),
  reminders: uiStatic('التنبيهات'),
};

export function SalesPortalPage() {
  const { ui } = useLocale();
  const scanner = usePersistentScanner();
  const { pathname } = useLocation();
  const activeTab = salesWorkspaceTabFromPath(pathname);
  const portal = useQuery({
    queryKey: ['sales-portal'],
    // Slow enough that the workspace stops visibly re-rendering under the user.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: async () => (await api.get<SalesPortalResponse>('/club-members/sales-portal')).data,
  });

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={ui('مساحة المبيعات')}
        description={ui('تابع العملاء المسندين لك وسجّل كل تواصل؛ التأهيل يتم تلقائيًا من الاستقبال عند تسجيل العضو.')}
      />

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline"><Link to="/sales-portal/calls">{uiStatic('سجل المكالمات')}</Link></Button>
        <Button variant="outline" onClick={() => scanner.setOpen(true)}>
          <Search className="size-4" />
          {ui('مسح كارت عضو')}
        </Button>
      </div>

      <SalesWorkspaceTabs value={activeTab} />

      {portal.isLoading ? <SalesPortalLoading /> : null}
      {portal.isError ? <ErrorState onRetry={() => void portal.refetch()} /> : null}
      {portal.data ? <SalesPortalContent data={portal.data} activeTab={activeTab} /> : null}
    </div>
  );
}

function SalesWorkspaceTabs({ value }: { value: SalesWorkspaceTab }) {
  const { ui } = useLocale();
  return (
    <div className="flex justify-center">
      <nav aria-label={ui('أقسام مساحة المبيعات')} className="grid w-full max-w-4xl grid-cols-2 gap-1 rounded-xl bg-muted/55 p-1.5 sm:grid-cols-5">
        {(Object.keys(tabLabels) as SalesWorkspaceTab[]).map((tab) => (
          <Link
            key={tab}
            to={salesPortalRoutes[tab]}
            aria-current={value === tab ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center justify-center rounded-[10px] px-1 text-center text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-3 sm:text-sm',
              value === tab ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
            )}
          >
            {ui(tabLabels[tab])}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function SalesPortalLoading() {
  const { ui } = useLocale();
  return (
    <div className="space-y-4" aria-label={ui('جاري تحميل مساحة المبيعات')}>
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

function SalesPortalContent({ data, activeTab }: { data: SalesPortalResponse; activeTab: SalesWorkspaceTab }) {
  const queryClient = useQueryClient();
  const { ui } = useLocale();
  const [selectedLead, setSelectedLead] = useState<SalesLead | null>(null);
  const selectedPosition = useRef(0);
  const movingRef = useRef(false);
  const [moving, setMoving] = useState(false);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const statusParam = activeTab === 'leads' ? status || 'following' : 'following';
  const searchParam = activeTab === 'leads' ? debouncedSearch : '';
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => globalThis.clearTimeout(timer);
  }, [search]);
  const getPage = async (targetPage: number) =>
    (await api.get<{ data: SalesLead[]; total: number; pageSize: number }>('/club-leads/mine', {
      params: { page: targetPage, pageSize: 50, status: statusParam, search: searchParam || undefined },
    })).data;
  const leads = useQuery({
    queryKey: ['club-leads-mine', statusParam, searchParam, page],
    queryFn: () => getPage(page),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    // Keep the current rows on screen while a new page/filter loads.
    placeholderData: (previous: { data: SalesLead[]; total: number; pageSize: number } | undefined) => previous,
    enabled: activeTab === 'today' || activeTab === 'leads',
  });

  if ((activeTab === 'today' || activeTab === 'leads') && leads.isError) {
    return <ErrorState inline onRetry={() => void leads.refetch()} />;
  }

  const leadRows = leads.data?.data ?? [];
  const pages = Math.max(1, Math.ceil((leads.data?.total ?? 0) / (leads.data?.pageSize ?? 50)));
  const selectLead = (lead: SalesLead | null) => {
    selectedPosition.current = Math.max(0, leadRows.findIndex((row) => row.id === lead?.id));
    setSelectedLead(lead);
  };
  const destination = (direction: -1 | 1) => adjacentClient(
    leadRows.map((lead) => lead.id),
    selectedLead?.id,
    selectedPosition.current,
    page,
    pages,
    direction,
  );
  const move = async (direction: -1 | 1) => {
    const target = destination(direction);
    if (!target || movingRef.current) return;
    movingRef.current = true;
    setMoving(true);
    try {
      const response = target.page === page ? leads.data : await getPage(target.page);
      if (response && target.page !== page) {
        queryClient.setQueryData(['club-leads-mine', statusParam, searchParam, target.page], response);
      }
      const rows = response?.data ?? [];
      const index = target.index < 0 ? rows.length - 1 : target.index;
      if (rows[index]) {
        selectedPosition.current = index;
        setPage(target.page);
        setSelectedLead(rows[index]);
      } else {
        toast.info(ui('تغيرت قائمة العملاء؛ أعد تحميل القائمة'));
      }
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      movingRef.current = false;
      setMoving(false);
    }
  };
  const selectedIndex = selectedLead ? leadRows.findIndex((lead) => lead.id === selectedLead.id) : -1;

  return (
    <>
      {activeTab === 'leads' ? (
        <div className="space-y-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={ui('بحث في جميع العملاء')}
            placeholder={ui('بحث بالاسم أو الموبايل…')}
          />
          <SalesLeadsView
            data={data}
            leads={leadRows}
            loading={leads.isLoading}
            onSelect={selectLead}
            status={status}
            onStatusChange={(value) => { setStatus(value); setPage(1); }}
            offset={(page - 1) * (leads.data?.pageSize ?? 50)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3" aria-live="polite">
            <p className="nums text-sm text-muted-foreground">
              {ui('إجمالي العملاء')}: {formatNum(leads.data?.total ?? 0)} · {ui('صفحة')} {formatNum(page)} {ui('من')} {formatNum(pages)}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 1 || leads.isFetching} onClick={() => setPage(page - 1)}>{ui('السابق')}</Button>
              <Button variant="outline" disabled={page >= pages || leads.isFetching} onClick={() => setPage(page + 1)}>{ui('التالي')}</Button>
            </div>
          </div>
        </div>
      ) : null}
      {activeTab === 'renewals' ? <SalesRenewals active onSelect={setSelectedLead} /> : null}
      {activeTab === 'results' ? <SalesResultsView data={data} /> : null}
      {activeTab === 'reminders' ? <SalesReminders active onSelect={selectLead} /> : null}
      {activeTab === 'today' ? <SalesTodayView data={data} leads={leadRows} loading={leads.isLoading} onSelect={selectLead} /> : null}
      <SalesLeadFollowUpDialog
        lead={selectedLead}
        onOpenChange={(open) => !open && selectLead(null)}
        onPrevious={destination(-1) ? () => void move(-1) : undefined}
        onNext={destination(1) ? () => void move(1) : undefined}
        position={selectedIndex >= 0 ? (page - 1) * (leads.data?.pageSize ?? 50) + selectedIndex + 1 : undefined}
        total={selectedIndex >= 0 ? leads.data?.total : undefined}
        moving={moving}
      />
    </>
  );
}

function SalesTargetOverview({ data }: { data: SalesPortalResponse }) {
  const { ui } = useLocale();
  const progress = Math.max(0, Math.min(100, data.performance.achievementPct));
  return (
    <section className="surface-card grid gap-5 rounded-xl border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold">{ui('أهلًا')} {data.specialist.name || ui('أخصائي المبيعات')}</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            <CalendarDays className="size-3.5" />
            <span className="nums">{formatDate(data.performance.periodStart)} – {formatDate(data.performance.periodEnd)}</span>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
          <strong className="nums text-3xl font-bold tracking-tight tabular-nums">{formatMoney(data.performance.actualRevenue)}</strong>
          <span className="pb-1 text-sm text-muted-foreground">{ui('من')} {formatMoney(data.performance.target)}</span>
        </div>
        <div
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={ui('نسبة تحقيق التارجت')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <dl className="grid min-w-0 grid-cols-2 gap-3 border-t pt-4 lg:border-s lg:border-t-0 lg:ps-5 lg:pt-0">
        <div className="rounded-[10px] bg-muted/45 px-3 py-3"><dt className="text-xs font-semibold text-muted-foreground">{ui('تحقيق التارجت')}</dt><dd className="nums mt-1 text-xl font-bold">{formatNum(data.performance.achievementPct)}%</dd></div>
        <div className="rounded-[10px] bg-muted/45 px-3 py-3"><dt className="text-xs font-semibold text-muted-foreground">{ui('عمولتك المستحقة')}</dt><dd className="nums mt-1 text-xl font-bold">{formatMoney(data.performance.commissionDue)}</dd></div>
      </dl>
    </section>
  );
}

function SalesTodayView({ data, leads, loading, onSelect }: { data: SalesPortalResponse; leads: SalesLead[]; loading: boolean; onSelect: (lead: SalesLead) => void }) {
  const { ui } = useLocale();
  const metrics = [
    { label: uiStatic('العملاء المسندون'), value: formatNum(data.performance.assignedLeads), icon: Users, tone: 'bg-primary/15 text-foreground' },
    { label: uiStatic('متابعات متأخرة'), value: formatNum(data.performance.overdueLeads), icon: Clock3, tone: 'bg-destructive/10 text-destructive', alert: data.performance.overdueLeads > 0 },
    { label: uiStatic('نسبة التحويل'), value: `${formatNum(data.performance.conversionRate)}%`, icon: TrendingUp, tone: 'bg-muted text-foreground' },
    { label: uiStatic('اشتراكات مكتملة'), value: formatNum(data.performance.closedDeals), icon: Handshake, tone: 'bg-primary/15 text-foreground' },
  ];

  return (
    <div className="space-y-4">
      <SalesTargetOverview data={data} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.55fr)] xl:items-start">
        <SalesActivityHub data={data} leads={leads} loading={loading} onSelect={onSelect} />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <SalesAlertCard icon={AlertTriangle} label={ui('متابعات متأخرة')} value={data.performance.overdueLeads} alert />
            <SalesAlertCard icon={BadgeCheck} label={ui('عملاء مؤهلون')} value={data.pipeline.qualified} />
          </div>
          <SalesLeaderboardPanel rows={data.leaderboard ?? []} />
        </div>
      </div>

      <section aria-label={ui('مؤشرات المبيعات')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="surface-card min-h-28 rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold text-muted-foreground">{ui(metric.label)}</p>
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-[10px]', metric.tone)}><Icon className="size-4" /></span>
              </div>
              <p className={cn('nums mt-4 text-2xl font-bold tabular-nums', metric.alert && 'text-destructive')}>{metric.value}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function SalesAlertCard({ icon: Icon, label, value, alert = false }: { icon: typeof AlertTriangle; label: string; value: number; alert?: boolean }) {
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

function SalesActivityHub({ data, leads, loading, onSelect }: { data: SalesPortalResponse; leads: SalesLead[]; loading: boolean; onSelect: (lead: SalesLead) => void }) {
  const { ui } = useLocale();
  const [status, setStatus] = useState('new');
  const stages = [
    { value: 'new', label: uiStatic('جدد'), count: data.pipeline.new },
    { value: 'in_progress', label: uiStatic('قيد المتابعة'), count: data.pipeline.inProgress },
    { value: 'follow_later', label: uiStatic('متابعة لاحقًا'), count: data.pipeline.followLater },
  ];
  const visible = leads.filter((lead) => lead.status === status).slice(0, 7);

  return (
    <section className="surface-card min-h-[30rem] overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-bold">{ui('مركز المتابعات')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{ui('تابع عملاءك وسجّل نتيجة التواصل')}</p>
        </div>
        <span className="grid size-9 place-items-center rounded-[10px] bg-primary/15"><MessageSquareText className="size-4" /></span>
      </div>
      <div className="p-4 sm:p-5">
        <div role="tablist" aria-label={ui('حالة المتابعات')} className="grid grid-cols-3 gap-1 rounded-xl bg-muted/55 p-1.5 sm:gap-2">
          {stages.map((stage) => (
            <button
              key={stage.value}
              type="button"
              role="tab"
              id={`sales-activity-tab-${stage.value}`}
              aria-controls="sales-activity-panel"
              aria-selected={status === stage.value}
              onClick={() => setStatus(stage.value)}
              className={cn(
                'flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[10px] px-1 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-2 sm:px-3 sm:text-sm',
                status === stage.value ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
              )}
            >
              <span>{ui(stage.label)}</span>
              <span className={cn('nums rounded-full px-2 py-0.5 text-xs', status === stage.value ? 'bg-primary text-primary-foreground' : 'bg-background')}>{formatNum(stage.count)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="border-y bg-muted/20 px-5 py-2.5 text-xs font-bold text-muted-foreground">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4"><span>{ui('العميل')}</span><span>{ui('الحالة')}</span></div>
      </div>
      <div id="sales-activity-panel" role="tabpanel" aria-labelledby={`sales-activity-tab-${status}`}>
        {loading ? <div className="space-y-2 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : <LeadList leads={visible} onSelect={onSelect} />}
      </div>
      <div className="border-t px-5 py-3 text-end">
        <Button asChild size="sm" variant="ghost"><Link to={salesPortalRoutes.leads}>{ui('فتح كل المتابعات')}<ArrowLeft className="size-4" /></Link></Button>
      </div>
    </section>
  );
}

function SalesLeadsView({ data, leads, loading, onSelect, status, onStatusChange, offset = 0 }: { data: SalesPortalResponse; leads: SalesLead[]; loading: boolean; onSelect: (lead: SalesLead) => void; status: string; onStatusChange: (value: string) => void; offset?: number }) {
  const { ui } = useLocale();
  const counts = {
    '': data.performance.assignedLeads,
    new: data.pipeline.new,
    in_progress: data.pipeline.inProgress,
    follow_later: data.pipeline.followLater,
    qualified: data.pipeline.qualified,
    converted: data.pipeline.converted,
    lost: data.pipeline.lost,
  };
  return (
    <section className="surface-card rounded-xl border bg-card">
      <div className="border-b px-5 py-4">
        <h2 className="font-bold">{ui('العملاء المحتملون')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{ui('اختَر المرحلة ثم اضغط على العميل لتسجيل نتيجة المكالمة.')}</p>
      </div>
      <div className="p-4 sm:p-5">
        <SalesPipelineTabs value={status} onChange={onStatusChange} counts={counts} />
      </div>
      {loading ? <div className="space-y-2 px-5 pb-5"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : <LeadList leads={leads} onSelect={onSelect} offset={offset} />}
    </section>
  );
}

function LeadList({ leads, onSelect, offset = 0 }: { leads: SalesLead[]; onSelect: (lead: SalesLead) => void; offset?: number }) {
  const { ui } = useLocale();
  if (!leads.length) return <EmptyState compact title={ui('لا يوجد عملاء في هذه المرحلة')} />;
  return (
    <div className="divide-y">
      {leads.map((lead, index) => (
        <button key={lead.id} type="button" onClick={() => onSelect(lead)} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-start transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <div className="flex min-w-0 items-center gap-3">
            <MemberAvatar name={lead.fullName} profilePicture={lead.profilePicture} size="md" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{formatNum(offset + index + 1)}. {lead.fullName}</p>
              <p className="nums mt-0.5 text-xs text-muted-foreground" dir="ltr"><MaskedPhone value={lead.phone} leadId={lead.id} /></p>
              {lead.subscription ? <p className="mt-1 truncate text-xs text-muted-foreground">{lead.subscription.packageName || ui('اشتراك')} · {formatMoney(lead.subscription.paidAmount)}</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-3"><span className="hidden text-xs text-muted-foreground sm:inline">{lead.sourceLabel}</span><StatusBadge status={lead.status === 'converted' ? 'active' : lead.status === 'lost' ? 'expired' : 'pending'} label={lead.statusLabel} /></div>
        </button>
      ))}
    </div>
  );
}

function DealsList({ deals }: { deals: SalesPortalResponse['closedDeals'] }) {
  const { ui } = useLocale();
  return (
    <section className="surface-card rounded-xl border bg-card">
      <div className="border-b px-5 py-4"><h2 className="font-bold">{ui('آخر الصفقات')}</h2><p className="mt-0.5 text-xs text-muted-foreground">{ui('الاشتراكات المسجلة باسمك')}</p></div>
      {!deals.length ? <EmptyState compact title={ui('لا توجد صفقات هذا الشهر')} /> : (
        <div className="divide-y">
          {deals.map((deal) => (
            <div key={deal.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0"><p className="truncate font-semibold">{deal.customerName || deal.subscriptionNumber}</p><p className="mt-0.5 text-xs text-muted-foreground">{deal.subscriptionType || ui('اشتراك')} · {formatDate(deal.registrationDate)}</p></div>
              <b className="nums shrink-0 text-sm text-foreground">{formatMoney(deal.paidAmount)}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SalesResultsView({ data }: { data: SalesPortalResponse }) {
  const { ui } = useLocale();
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <DealsList deals={data.closedDeals} />
      <section className="surface-card rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="font-bold">{ui('أحدث الأعضاء')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{ui('الأعضاء الذين أكمل الاستقبال تسجيلهم وتطابق رقمهم مع عملائك المحتملين.')}</p>
        </div>
        {!data.recentMembers.length ? <EmptyState compact title={ui('لا يوجد أعضاء مسندون لك بعد')} /> : (
          <div className="divide-y">
            {data.recentMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0"><p className="truncate font-semibold">{member.name}</p><p className="nums mt-0.5 text-xs text-muted-foreground">{member.memberCode} · {formatDateTime(member.createdAt)}</p></div>
                <StatusBadge status={member.isActive ? 'active' : 'suspended'} label={member.isActive ? ui('نشط') : ui('غير نشط')} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SalesLeadFollowUpDialog({
  lead,
  onOpenChange,
  onPrevious,
  onNext,
  position,
  total,
  moving = false,
}: {
  lead: SalesLead | null;
  onOpenChange: (open: boolean) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position?: number;
  total?: number;
  moving?: boolean;
}) {
  const { dir, ui } = useLocale();
  const qc = useQueryClient();
  const [activityType, setActivityType] = useState<SalesLeadActivityType>('call');
  const [answered, setAnswered] = useState<boolean | undefined>(undefined);
  const [status, setStatus] = useState('new');
  const [note, setNote] = useState('');
  const [interests, setInterests] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const [nextCallAt, setNextCallAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const details = useQuery({
    queryKey: ['club-lead', lead?.id],
    queryFn: async () => (await api.get<SalesLeadDetails>(`/club-leads/${lead!.id}`)).data,
    enabled: lead != null,
    retry: false,
  });

  useEffect(() => {
    if (!lead) return;
    setActivityType('call');
    setAnswered(undefined);
    setStatus(followUpStatusForLead(lead.status));
    setNote('');
    setInterests('');
    setNextFollowUpAt('');
    setNextCallAt('');
  }, [lead]);

  const currentLead = details.data ?? lead;
  const isReceptionOwnedState = currentLead?.status === 'qualified';
  const isRenewalFollowUp = currentLead?.status === 'converted';

  const copyPhone = async () => {
    if (!currentLead?.phone) return;
    try {
      await navigator.clipboard.writeText(currentLead.phone);
      toast.success(ui('تم نسخ رقم الموبايل'));
    } catch {
      toast.error(ui('تعذر نسخ الرقم. حدده وانسخه يدويًا.'));
    }
  };

  const save = async () => {
    if (!lead || isReceptionOwnedState) return;
    const validation = validateSalesLeadActivity({
      activityType,
      answered,
      note,
      interests,
      status,
      nextFollowUpAt,
    });
    if (validation === 'answer_required') return void toast.error(ui('حدد هل تم الرد على الاتصال أم لا'));
    if (validation === 'notes_required') return void toast.error(ui('اكتب ملاحظات المتابعة'));
    if (validation === 'next_follow_up_required') return void toast.error(ui('حدد موعد المتابعة القادمة'));
    setSaving(true);
    try {
      await api.post(`/club-leads/${lead.id}/follow-up`, {
        activityType,
        ...(activityType === 'call' ? { answered } : {}),
        note: note.trim() || undefined,
        interests: interests.trim() || undefined,
        status,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : undefined,
        nextCallAt: nextCallAt ? new Date(nextCallAt).toISOString() : undefined,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['club-leads-mine'] }),
        qc.invalidateQueries({ queryKey: ['sales-portal'] }),
        qc.invalidateQueries({ queryKey: ['club-lead', lead.id] }),
        qc.invalidateQueries({ queryKey: ['club-sales-dashboard'] }),
        qc.invalidateQueries({ queryKey: ['sales-reminders'] }),
        qc.invalidateQueries({ queryKey: ['sales-renewals'] }),
      ]);
      setAnswered(undefined);
      setNote('');
      setInterests('');
      setNextFollowUpAt('');
      setNextCallAt('');
      toast.success(ui('تم حفظ النشاط في ملف العميل'));
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={lead != null} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        dir={dir}
        aria-describedby="sales-lead-follow-up-desc"
        onTouchStart={(event) => setTouchStart({ x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY })}
        onTouchEnd={(event) => {
          if (!touchStart) return;
          const direction = swipeDirection(event.changedTouches[0].clientX - touchStart.x, event.changedTouches[0].clientY - touchStart.y, dir);
          setTouchStart(null);
          if (direction === -1) onPrevious?.();
          if (direction === 1) onNext?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>{ui(isRenewalFollowUp ? uiStatic('ملف متابعة التجديد') : uiStatic('ملف العميل المحتمل'))}</DialogTitle>
          <DialogDescription id="sales-lead-follow-up-desc">
            {ui('بيانات العميل، إجراءات المتابعة الداخلية، والسجل الكامل للنشاط.')}
          </DialogDescription>
        </DialogHeader>

        {details.isLoading ? <PerformanceLeadLoading /> : null}
        {details.isError ? <ErrorState inline onRetry={() => void details.refetch()} /> : null}
        {currentLead && !details.isLoading && !details.isError ? (
          <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="space-y-4">
              <section className="rounded-xl border bg-muted/15 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <MemberAvatar name={currentLead.fullName} profilePicture={currentLead.profilePicture} size="lg" />
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-bold">{currentLead.fullName}</h3>
                      <StatusBadge
                        status={currentLead.status === 'converted' ? 'active' : currentLead.status === 'lost' ? 'expired' : 'pending'}
                        label={currentLead.statusLabel}
                      />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {currentLead.sourceLabel}
                      {details.data?.interestedProgramLabel ? ` · ${details.data.interestedProgramLabel}` : ''}
                    </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {toDialLink(currentLead.phone) ? <Button asChild variant="brand"><a href={toDialLink(currentLead.phone)!}><Phone className="size-4" />{ui('اتصال')}</a></Button> : null}
                    {toWhatsAppLink(currentLead.phone) ? <Button asChild variant="outline"><a href={toWhatsAppLink(currentLead.phone)!} target="_blank" rel="noreferrer"><MessageCircle className="size-4" />{ui('واتساب')}</a></Button> : null}
                    <Button type="button" variant="outline" onClick={() => void copyPhone()}><Copy className="size-4" />{ui('نسخ الرقم')}</Button>
                    {currentLead.convertedMemberId ? <Button type="button" variant="ghost" onClick={() => setProfileOpen(true)}>{ui('ملف العضو')}</Button> : null}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-[10px] border bg-card px-4 py-3">
                  <span className="text-xs font-semibold text-muted-foreground">{ui('رقم الموبايل')}</span>
                  <MaskedPhone value={currentLead.phone} leadId={currentLead.id} className="text-base font-bold" />
                </div>
                {details.data?.notes ? <p className="mt-3 rounded-[10px] bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">{details.data.notes}</p> : null}
              </section>

              {currentLead.subscription ? (
                <section className="rounded-xl border bg-card p-4 sm:p-5" aria-label={ui('بيانات الاشتراك الحالي')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h3 className="font-bold">{ui('الاشتراك الحالي')}</h3><p className="nums mt-1 text-xs text-muted-foreground">{currentLead.subscription.subscriptionNumber}</p></div>
                    <strong className="nums text-lg">{formatMoney(currentLead.subscription.paidAmount)}</strong>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">{ui('الباقة')}</dt><dd className="mt-1 font-semibold">{currentLead.subscription.packageName || ui('غير محددة')}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{ui('الفترة')}</dt><dd className="nums mt-1 font-semibold">{formatDate(currentLead.subscription.startDate)} – {formatDate(currentLead.subscription.endDate)}</dd></div>
                  </dl>
                </section>
              ) : null}

              {isReceptionOwnedState ? (
                <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm leading-6 text-success">
                  <div className="flex items-start gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0" /><p><b>{ui('تم التأهيل من الاستقبال.')}</b> {ui('هذه الحالة للعرض فقط ولا يستطيع مسؤول المبيعات تغييرها.')}</p></div>
                </div>
              ) : (
                <section className="rounded-xl border bg-card p-4 sm:p-5">
                  <div>
                    <h3 className="font-bold">{ui('سجّل نتيجة المتابعة')}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{ui('كل إجراء يُحفظ داخليًا ويظهر للإدارة في سجل الأداء.')}</p>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {salesLeadActivityOptions.map((option) => {
                      const Icon = option.type === 'call' ? Phone : option.type === 'conversation' ? MessageSquareText : Users;
                      return (
                        <button
                          key={option.type}
                          type="button"
                          aria-pressed={activityType === option.type}
                          onClick={() => { setActivityType(option.type); setAnswered(undefined); }}
                          className={cn(
                            'flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border px-3 py-3 text-center text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            activityType === option.type ? 'border-primary bg-primary/10 text-foreground' : 'bg-background text-muted-foreground hover:bg-muted/35 hover:text-foreground',
                          )}
                        >
                          <Icon className="size-5" />
                          {ui(option.label)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5 space-y-4 border-t pt-5">
                    {activityType === 'call' ? (
                      <fieldset>
                        <legend className="mb-2 text-sm font-bold">{ui('هل تم الرد؟')} <span className="text-destructive">*</span></legend>
                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" variant={answered === true ? 'brand' : 'outline'} onClick={() => setAnswered(true)}><CheckCircle2 className="size-4" />{ui('تم الرد')}</Button>
                          <Button type="button" variant={answered === false ? 'brand' : 'outline'} onClick={() => setAnswered(false)}><XCircle className="size-4" />{ui('لم يتم الرد')}</Button>
                        </div>
                      </fieldset>
                    ) : null}

                    {(activityType !== 'call' || answered === true) ? (
                      <>
                        <div>
                          <label htmlFor="sales-follow-up-note" className="mb-2 block text-sm font-bold">{ui(activityType === 'meeting' ? uiStatic('ملاحظات المقابلة') : activityType === 'conversation' ? uiStatic('نتيجة المحادثة') : uiStatic('ملاحظات المكالمة'))} <span className="text-destructive">*</span></label>
                          <Textarea id="sales-follow-up-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={ui('اكتب ملخصًا واضحًا لما تم والخطوة التالية…')} rows={4} maxLength={1000} />
                        </div>
                        <div>
                          <label htmlFor="sales-lead-interests" className="mb-2 block text-sm font-bold">{ui('اهتمامات العميل')}</label>
                          <Textarea id="sales-lead-interests" value={interests} onChange={(event) => setInterests(event.target.value)} placeholder={ui('الباقة أو الخدمة التي يهتم بها العميل…')} rows={2} maxLength={500} />
                        </div>
                      </>
                    ) : null}

                    {isRenewalFollowUp ? (
                      <div className="rounded-[10px] border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">{ui('سيُحفظ النشاط كتحديث تجديد مع الإبقاء على حالة العضو المحوّل.')}</div>
                    ) : (
                      <div>
                        <p className="mb-2 text-sm font-bold">{ui('حالة المتابعة')}</p>
                        <SalesPipelineTabs value={status} onChange={setStatus} includeAll={false} stages={leadDecisionStatuses.filter((stage) => stage.status !== 'new')} />
                      </div>
                    )}
                    <div>
                      <label htmlFor="sales-next-call" className="mb-2 block text-sm font-bold">{ui('موعد الاتصال القادم')} <span className="font-normal text-muted-foreground">({ui('اختياري')})</span></label>
                      <Input id="sales-next-call" type="datetime-local" value={nextCallAt} onChange={(event) => setNextCallAt(event.target.value)} />
                    </div>
                    <div>
                      <label htmlFor="sales-next-follow-up" className="mb-2 block text-sm font-bold">
                        {ui('موعد المتابعة القادمة')} {status === 'follow_later' ? <span className="text-destructive">*</span> : <span className="font-normal text-muted-foreground">({ui('اختياري')})</span>}
                      </label>
                      <Input id="sales-next-follow-up" type="datetime-local" value={nextFollowUpAt} onChange={(event) => setNextFollowUpAt(event.target.value)} />
                    </div>
                    <Button type="button" variant="brand" className="w-full" disabled={saving} onClick={() => void save()}>
                      {saving ? ui('جارٍ الحفظ…') : ui('حفظ النشاط')}
                    </Button>
                  </div>
                </section>
              )}
            </div>

            <LeadActivityTimeline lead={details.data} />
          </div>
        ) : null}

        <DialogFooter>
          {position != null && total != null ? <span className="nums me-auto self-center text-xs text-muted-foreground">{formatNum(position)} / {formatNum(total)}</span> : null}
          <Button type="button" variant="ghost" disabled={!onPrevious || moving} onClick={onPrevious}><ChevronRight className="size-4" />{ui('السابق')}</Button>
          <Button type="button" variant="ghost" disabled={!onNext || moving} onClick={onNext}>{ui('التالي')}<ChevronLeft className="size-4" /></Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{ui('إغلاق')}</Button>
        </DialogFooter>
      </DialogContent>
      {currentLead?.convertedMemberId ? (
        <MemberProfileSheet
          open={profileOpen}
          onOpenChange={setProfileOpen}
          member={{
            id: currentLead.convertedMemberId,
            name: currentLead.fullName,
            phone: currentLead.phone,
            branchId: currentLead.branchId,
            memberCode: '',
            profilePicture: currentLead.profilePicture ?? null,
          }}
        />
      ) : null}
    </Dialog>
  );
}

function PerformanceLeadLoading() {
  return <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72 rounded-xl" /><Skeleton className="h-72 rounded-xl" /></div>;
}

const activityLabels: Record<string, string> = {
  call: uiStatic('اتصال هاتفي'),
  conversation: uiStatic('محادثة'),
  meeting: uiStatic('مقابلة شخصية'),
  system: uiStatic('تحديث من النظام'),
  note: uiStatic('ملاحظة'),
};

function LeadActivityTimeline({ lead }: { lead?: SalesLeadDetails }) {
  const { ui } = useLocale();
  if (!lead) return <Skeleton className="h-72 rounded-xl" />;
  return (
    <section className="min-h-0 overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-4 py-4 sm:px-5">
        <h3 className="font-bold">{ui('سجل نشاط العميل')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{ui('كل الاتصالات والمحادثات والمقابلات بترتيبها الزمني')}</p>
      </div>
      {!lead.followUps.length ? <EmptyState compact title={ui('لم يتم تسجيل نشاط بعد')} /> : (
        <div className="max-h-[42rem] divide-y overflow-y-auto">
          {lead.followUps.map((item) => {
            const Icon = item.activityType === 'call' ? Phone : item.activityType === 'conversation' ? MessageSquareText : item.activityType === 'meeting' ? Users : BadgeCheck;
            return (
              <article key={item.id} className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/12 text-foreground"><Icon className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold">{ui(activityLabels[item.activityType] ?? ui('متابعة'))}</h4>
                        {item.activityType === 'call' && item.answered != null ? (
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', item.answered ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>{ui(item.answered ? ui('تم الرد') : ui('لم يتم الرد'))}</span>
                        ) : null}
                      </div>
                      <time className="nums text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.note}</p>
                    {item.interests ? <p className="mt-2 rounded-[8px] bg-muted/35 px-3 py-2 text-xs leading-5"><b>{ui('الاهتمامات:')}</b> {item.interests}</p> : null}
                    {item.nextFollowUpAt ? <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><CalendarDays className="size-3.5" />{ui('المتابعة القادمة:')} <span className="nums">{formatDateTime(item.nextFollowUpAt)}</span></p> : null}
                    {item.createdByName ? <p className="mt-2 text-[11px] text-muted-foreground">{ui('سجّلها')} {item.createdByName}</p> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
