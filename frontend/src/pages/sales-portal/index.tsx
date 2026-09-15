import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Phone,
  Search,
  UsersRound,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { usePersistentScanner } from '@/components/club/persistent-scanner';
import { EmptyState, ErrorState } from '@/components/common/states';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney, formatNum } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { adjacentClient, swipeDirection } from './client-navigation';
import type { PortalSummary, SalesLead, SalesRenewalRow } from './portal-types';
import { SalesReminders } from './sales-reminders';
import {
  buildSalesPortalMetrics,
  clampSalesPage,
  draftForLead,
  leadPipelineStages,
  salesLeadActivityOptions,
  salesPortalRoutes,
  salesWorkspaceTabFromPath,
  sortSalesRenewalRows,
  toSalesDialLink,
  validateSalesLeadActivity,
  type SalesLeadActivityType,
  type SalesLeadUiDraft,
  type SalesWorkspaceTab,
} from './sales-workspace-model';

type LeadResponse = { data: SalesLead[]; total: number; page: number; pageSize: number };
type RenewalWindow = 'all' | 'renewed' | 'expired' | '5' | '7' | '14';
type RenewalResponse = {
  data: SalesRenewalRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: { expired: number; dueSoon: number; total: number };
};
type LeadDetails = SalesLead & {
  interestedProgramLabel?: string | null;
  notes?: string | null;
  followUps?: Array<{
    id: number;
    note: string;
    status?: string | null;
    activityType: string;
    answered: boolean | null;
    interests?: string | null;
    nextFollowUpAt?: string | null;
    nextCallAt?: string | null;
    createdByName: string | null;
    createdAt: string;
  }>;
};

const tabLabels: Record<SalesWorkspaceTab, string> = {
  today: 'اليوم',
  reminders: 'التنبيهات',
  leads: 'العملاء المحتملون',
  renewals: 'متابعة التجديدات',
  results: 'النتائج والعضويات',
};

const stageLabels: Record<string, string> = {
  all: 'الكل',
  new: 'جديد',
  inProgress: 'قيد المتابعة',
  followLater: 'متابعة لاحقًا',
  qualified: 'مؤهل',
  converted: 'تم الاشتراك',
  lost: 'غير مؤهل',
};

export function SalesPortalPage() {
  const { ui } = useLocale();
  const { pathname, search } = useLocation();
  const activeTab = salesWorkspaceTabFromPath(pathname, search);
  const scanner = usePersistentScanner();
  const portal = useQuery({
    queryKey: ['sales-portal'],
    queryFn: async () => (await api.get<PortalSummary>('/club-members/sales-portal')).data,
    refetchInterval: 15_000,
  });

  return (
    <main className="space-y-5 pb-8">
      <PageHeader
        title={ui('مساحة المبيعات')}
        description={ui('تابع العملاء المسندين لك، وسجل نتائج التواصل والتجديد من مساحة واحدة.')}
      />
      {scanner.available ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => scanner.setOpen(true)}>
            <Search className="size-4" />
            {ui('مسح كارت العضو — معاينة فقط')}
          </Button>
          <p className="text-xs text-muted-foreground">{ui('لا يتم تسجيل حضور أو بيع من الماسح في هذه المساحة.')}</p>
        </div>
      ) : null}
      <SalesWorkspaceTabs value={activeTab} />
      {portal.isLoading ? <PortalLoading /> : null}
      {portal.isError ? <ErrorState onRetry={() => void portal.refetch()} /> : null}
      {portal.data ? <PortalContent data={portal.data} activeTab={activeTab} /> : null}
    </main>
  );
}

function SalesWorkspaceTabs({ value }: { value: SalesWorkspaceTab }) {
  const { ui } = useLocale();
  return (
    <nav
      aria-label={ui('أقسام مساحة المبيعات')}
      className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1.5 sm:grid-cols-5"
    >
      {(Object.keys(tabLabels) as SalesWorkspaceTab[]).map((tab) => (
        <Link
          key={tab}
          to={salesPortalRoutes[tab]}
          aria-current={value === tab ? 'page' : undefined}
          className={cn(
            'flex min-h-12 items-center justify-center rounded-[10px] px-2 text-center text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm',
            value === tab
              ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70'
              : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
          )}
        >
          {ui(tabLabels[tab])}
        </Link>
      ))}
    </nav>
  );
}

function PortalLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="جاري تحميل مساحة المبيعات">
      <span className="sr-only">جاري تحميل مساحة المبيعات</span>
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}

function PortalContent({ data, activeTab }: { data: PortalSummary; activeTab: SalesWorkspaceTab }) {
  const [selected, setSelected] = useState<SalesLead | null>(null);
  const visited = useRef(new Set<SalesWorkspaceTab>());
  visited.current.add(activeTab);
  return (
    <>
      {visited.current.has('today') ? <div hidden={activeTab !== 'today'}><TodayPanel active={activeTab === 'today'} data={data} onSelect={setSelected} /></div> : null}
      {visited.current.has('reminders') ? <div hidden={activeTab !== 'reminders'}><SalesReminders active={activeTab === 'reminders'} onSelect={setSelected} /></div> : null}
      {visited.current.has('leads') ? <div hidden={activeTab !== 'leads'}><LeadsPanel active={activeTab === 'leads'} /></div> : null}
      {visited.current.has('renewals') ? <div hidden={activeTab !== 'renewals'}><RenewalsPanel active={activeTab === 'renewals'} /></div> : null}
      {visited.current.has('results') ? <div hidden={activeTab !== 'results'}><ResultsPanel data={data} /></div> : null}
      <LeadDetailDialog lead={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  );
}

function TodayPanel({ active, data, onSelect }: { active: boolean; data: PortalSummary; onSelect: (lead: SalesLead) => void }) {
  const { ui } = useLocale();
  const metrics = buildSalesPortalMetrics(data);
  const labels = {
    assignedLeads: 'عملاء مسندون',
    overdueLeads: 'متأخرون',
    conversionRate: 'نسبة التحويل',
    closedDeals: 'اشتراكات مكتملة',
  } as const;
  const leadQuery = useQuery({
    queryKey: ['sales-portal', 'today'],
    enabled: active,
    queryFn: async () => (await api.get<LeadResponse>('/club-leads/mine', { params: { page: 1, pageSize: 7, status: 'following' } })).data,
    refetchInterval: 15_000,
  });
  const pipeline = [
    ['جديد', data.pipeline.new],
    ['قيد المتابعة', data.pipeline.inProgress],
    ['متابعة لاحقًا', data.pipeline.followLater],
    ['مؤهل', data.pipeline.qualified],
    ['تم الاشتراك', data.pipeline.converted],
    ['غير مؤهل', data.pipeline.lost],
  ] as const;
  return (
    <section className="space-y-4">
      <div className="grid gap-px overflow-hidden rounded-xl border bg-border/60 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.key} className="bg-card px-5 py-4">
            <p className="text-xs font-semibold text-muted-foreground">{ui(labels[metric.key])}</p>
            <p className={cn('nums mt-1 text-2xl font-bold tabular-nums', metric.key === 'overdueLeads' && metric.value > 0 && 'text-destructive')}>
              {formatNum(metric.value)}{metric.key === 'conversionRate' ? '%' : ''}
            </p>
          </div>
        ))}
      </div>
      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-label={ui('مسار العملاء اليوم')}>
        <h2 className="text-base font-bold">{ui('مسار العملاء اليوم')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {pipeline.map(([label, value]) => (
            <div key={label} className="rounded-[10px] bg-muted/45 px-3 py-3">
              <p className="text-xs text-muted-foreground">{ui(label)}</p>
              <p className="nums mt-1 text-lg font-bold">{formatNum(value)}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-3 border-b p-5">
          <div><h2 className="text-lg font-bold">{ui('أولوية اليوم')}</h2><p className="mt-1 text-sm text-muted-foreground">{ui('سبع حالات فقط لتبقى المتابعة مركزة.')}</p></div>
          <UsersRound className="size-5 text-primary" />
        </div>
        {leadQuery.isLoading ? <RowsLoading /> : leadQuery.isError ? <ErrorState inline onRetry={() => void leadQuery.refetch()} /> : !leadQuery.data?.data.length ? <EmptyState title={ui('لا توجد متابعة مطلوبة الآن')} description={ui('ستظهر الحالات المسندة إليك هنا تلقائيًا.')} /> : <LeadRows rows={leadQuery.data.data} onSelect={onSelect} />}
      </section>
    </section>
  );
}

function LeadsPanel({ active }: { active: boolean }) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SalesLead | null>(null);
  const [moving, setMoving] = useState(false);
  const selectedIndex = useRef(0);
  const movingRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const getPage = async (targetPage: number) => (await api.get<LeadResponse>('/club-leads/mine', {
    params: { page: targetPage, pageSize: 50, status: status || 'following', search: debounced || undefined },
  })).data;
  const query = useQuery({
    queryKey: ['sales-portal', 'leads', status, debounced, page],
    enabled: active,
    queryFn: () => getPage(page),
    refetchInterval: 15_000,
  });
  const rows = query.data?.data ?? [];
  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 50));
  useEffect(() => {
    if (!selected && query.data) setPage((current) => clampSalesPage(current, query.data.total, query.data.pageSize));
  }, [query.data, selected]);

  const select = (lead: SalesLead | null) => {
    selectedIndex.current = Math.max(0, rows.findIndex((row) => row.id === lead?.id));
    setSelected(lead);
  };
  const destination = (direction: -1 | 1) => adjacentClient(rows.map((row) => row.id), selected?.id, selectedIndex.current, page, pages, direction);
  const move = async (direction: -1 | 1) => {
    const target = destination(direction);
    if (!target || movingRef.current) return;
    movingRef.current = true;
    setMoving(true);
    try {
      const response = target.page === page ? query.data : await getPage(target.page);
      if (response && target.page !== page) qc.setQueryData(['sales-portal', 'leads', status, debounced, target.page], response);
      const items = response?.data ?? [];
      const index = target.index < 0 ? items.length - 1 : target.index;
      if (!items[index]) throw new Error(ui('تغيرت قائمة العملاء؛ أعد تحميل القائمة'));
      selectedIndex.current = index;
      setPage(target.page);
      setSelected(items[index]);
    } catch (cause) {
      toast.error(apiError(cause));
    } finally {
      movingRef.current = false;
      setMoving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ui('بحث بالاسم أو الموبايل…')} aria-label={ui('بحث في العملاء المحتملين')} />
        <div role="tablist" aria-label={ui('مراحل متابعة العملاء')} className="flex gap-2 overflow-x-auto pb-1">
          {leadPipelineStages.map((stage) => (
            <Button key={stage.key} type="button" size="sm" variant={status === stage.status ? 'default' : 'outline'} onClick={() => { setStatus(stage.status); setPage(1); }}>
              {ui(stageLabels[stage.key])}
            </Button>
          ))}
        </div>
      </div>
      {query.isLoading ? <RowsLoading /> : query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : !rows.length ? <EmptyState title={ui('لا توجد نتائج')} description={ui('غيّر البحث أو مرحلة المتابعة.')} /> : (
        <>
          <section className="overflow-hidden rounded-xl border bg-card"><LeadRows rows={rows} onSelect={select} /></section>
          <Pager page={page} pages={pages} busy={query.isFetching} onChange={setPage} />
        </>
      )}
      <LeadDetailDialog
        lead={selected}
        moving={moving}
        onOpenChange={(open) => !open && select(null)}
        onNext={destination(1) ? () => void move(1) : undefined}
        onPrevious={destination(-1) ? () => void move(-1) : undefined}
        position={selected ? (page - 1) * (query.data?.pageSize ?? 50) + selectedIndex.current + 1 : undefined}
        total={query.data?.total}
      />
    </section>
  );
}

function RenewalsPanel({ active }: { active: boolean }) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [window, setWindow] = useState<RenewalWindow>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SalesLead | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const selectedIndex = useRef(0);
  const openingRef = useRef(false);
  const movingRef = useRef(false);
  useEffect(() => {
    const timer = globalThis.window.setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 250);
    return () => globalThis.window.clearTimeout(timer);
  }, [search]);
  const getPage = async (targetPage: number) => (await api.get<RenewalResponse>('/club-members/sales-renewals', {
    params: { window, search: debounced || undefined, page: targetPage, pageSize: 25 },
  })).data;
  const query = useQuery({
    queryKey: ['sales-portal', 'renewals', window, debounced, page],
    enabled: active,
    queryFn: () => getPage(page),
    refetchInterval: 15_000,
  });
  const rows = useMemo(() => sortSalesRenewalRows(query.data?.data ?? []), [query.data]);
  const pages = Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 25)));
  useEffect(() => {
    if (query.data) setPage((current) => clampSalesPage(current, query.data.total, query.data.pageSize));
  }, [query.data]);
  const ensureFollowUp = async (row: SalesRenewalRow) => {
    if (openingRef.current) return null;
    openingRef.current = true;
    setOpening(row.memberId);
    try {
      return (await api.post<SalesLead>(`/club-leads/renewal/${row.memberId}/ensure`)).data;
    } catch (cause) {
      toast.error(apiError(cause));
      return null;
    } finally {
      openingRef.current = false;
      setOpening(null);
    }
  };
  const openFollowUp = async (row: SalesRenewalRow) => {
    const lead = await ensureFollowUp(row);
    if (!lead) return;
    selectedIndex.current = Math.max(0, rows.findIndex((item) => item.memberId === row.memberId));
    setSelectedMemberId(row.memberId);
    setSelected(lead);
  };
  const destination = (direction: -1 | 1) => adjacentClient(
    rows.map((row) => row.memberId),
    selectedMemberId ?? undefined,
    selectedIndex.current,
    page,
    pages,
    direction,
  );
  const move = async (direction: -1 | 1) => {
    const target = destination(direction);
    if (!target || movingRef.current || openingRef.current) return;
    movingRef.current = true;
    setMoving(true);
    try {
      const response = target.page === page ? query.data : await getPage(target.page);
      if (response && target.page !== page) {
        qc.setQueryData(['sales-portal', 'renewals', window, debounced, target.page], response);
      }
      const items = sortSalesRenewalRows(response?.data ?? []);
      const index = target.index < 0 ? items.length - 1 : target.index;
      const row = items[index];
      if (!row) throw new Error(ui('تغيرت قائمة التجديدات؛ أعد تحميل القائمة'));
      const lead = await ensureFollowUp(row);
      if (!lead) return;
      selectedIndex.current = index;
      setPage(target.page);
      setSelectedMemberId(row.memberId);
      setSelected(lead);
    } catch (cause) {
      toast.error(apiError(cause));
    } finally {
      movingRef.current = false;
      setMoving(false);
    }
  };
  const filters: Array<{ value: RenewalWindow; label: string }> = [
    { value: 'all', label: 'بحاجة للمتابعة' },
    { value: 'renewed', label: 'تم التجديد' },
    { value: 'expired', label: 'منتهي' },
    { value: '5', label: 'خلال 5 أيام' },
    { value: '7', label: 'خلال 7 أيام' },
    { value: '14', label: 'خلال 14 يومًا' },
  ];
  return (
    <section className="space-y-4">
      <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-3"><CalendarClock className="mt-0.5 size-5 text-primary" /><div><h2 className="font-bold">{ui('متابعة التجديدات')}</h2><p className="mt-1 text-sm text-muted-foreground">{ui('اشتراكات عملائك فقط؛ المتأخرة أولًا ثم الأقرب للانتهاء.')}</p></div></div>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ui('بحث بالاسم، الموبايل أو كود العضو…')} aria-label={ui('بحث في تجديدات العملاء')} />
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label={ui('فلترة حسب موعد الانتهاء')}>
          {filters.map((filter) => <Button key={filter.value} size="sm" variant={window === filter.value ? 'default' : 'outline'} onClick={() => { setWindow(filter.value); setPage(1); }}>{ui(filter.label)}</Button>)}
        </div>
      </div>
      {query.isLoading ? <RowsLoading /> : query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : !rows.length ? <EmptyState title={ui('لا توجد تجديدات تحتاج متابعة')} /> : (
        <><section className="overflow-hidden rounded-xl border bg-card"><RenewalRows rows={rows} opening={opening} onSelect={openFollowUp} /></section><Pager page={page} pages={pages} busy={query.isFetching} onChange={setPage} /></>
      )}
      <LeadDetailDialog
        lead={selected}
        moving={moving}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setSelectedMemberId(null);
          }
        }}
        onNext={destination(1) ? () => void move(1) : undefined}
        onPrevious={destination(-1) ? () => void move(-1) : undefined}
        position={selectedMemberId == null ? undefined : (page - 1) * (query.data?.pageSize ?? 25) + selectedIndex.current + 1}
        total={query.data?.total}
      />
    </section>
  );
}

function ResultsPanel({ data }: { data: PortalSummary }) {
  const { ui } = useLocale();
  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Result label={ui('إيرادك المسجل')} value={formatMoney(data.performance.actualRevenue)} icon={BarChart3} />
        <Result label={ui('العمولة المستحقة')} value={formatMoney(data.performance.commissionDue)} icon={CheckCircle2} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b p-5"><h2 className="font-bold">{ui('ترتيب فريق المبيعات')}</h2><p className="mt-1 text-sm text-muted-foreground">{ui('حسب نسبة تحقيق التارجت.')}</p></div>
          {!data.leaderboard.length ? <EmptyState compact title={ui('لا يوجد ترتيب حاليًا')} /> : <ol className="divide-y">{data.leaderboard.map((row) => <li key={row.employeeId} className="flex min-h-14 items-center gap-3 px-5 py-3"><span className="nums grid size-8 place-items-center rounded-lg bg-muted font-bold">{formatNum(row.rank)}</span><span className="min-w-0 flex-1 truncate font-semibold">{row.name}{row.isCurrent ? <small className="ms-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs">{ui('أنت')}</small> : null}</span><span className="nums font-bold">{formatNum(row.achievementPct)}%</span></li>)}</ol>}
        </section>
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b p-5"><h2 className="font-bold">{ui('أحدث العضويات')}</h2><p className="mt-1 text-sm text-muted-foreground">{ui('الأعضاء المسجلون ضمن نطاقك الحالي.')}</p></div>
          {!data.recentMembers.length ? <EmptyState compact title={ui('لا توجد عضويات حديثة')} /> : <ol className="divide-y">{data.recentMembers.map((member) => <li key={member.id} className="flex items-center justify-between gap-3 px-5 py-3"><span className="min-w-0"><b className="block truncate">{member.name}</b><small className="nums text-muted-foreground">{member.memberCode} · {formatDate(member.createdAt)}</small></span><span className="text-xs font-semibold">{ui(member.isActive ? 'نشط' : 'غير نشط')}</span></li>)}</ol>}
        </section>
      </div>
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-5"><h2 className="font-bold">{ui('الاشتراكات المكتملة')}</h2></div>
        {!data.closedDeals.length ? <EmptyState compact title={ui('لا توجد اشتراكات مكتملة في الفترة')} /> : <ol className="divide-y">{data.closedDeals.map((deal) => <li key={deal.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><span><b className="block">{deal.customerName || deal.subscriptionNumber}</b><small className="text-muted-foreground">{deal.subscriptionType || ui('اشتراك')} · {formatDate(deal.registrationDate)}</small></span><strong className="nums">{formatMoney(deal.paidAmount)}</strong></li>)}</ol>}
      </section>
    </section>
  );
}

function LeadRows({ rows, onSelect }: { rows: SalesLead[]; onSelect: (lead: SalesLead) => void }) {
  const { ui } = useLocale();
  return (
    <ol className="divide-y">
      {rows.map((lead) => (
        <li key={lead.id} className="flex flex-wrap items-center gap-3 p-4 sm:px-5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><UsersRound className="size-5" /></span>
          <button type="button" onClick={() => onSelect(lead)} className="min-h-12 min-w-0 flex-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="block truncate font-bold">{lead.fullName}</span><bdi dir="ltr" className="block text-xs text-muted-foreground">{lead.phone}</bdi>
          </button>
          <div className="text-start text-xs text-muted-foreground"><p>{lead.statusLabel || ui(stageLabels[lead.status] || lead.status)}</p><p>{lead.nextFollowUpAt || lead.nextCallAt ? formatDateTime(lead.nextFollowUpAt ?? lead.nextCallAt) : ui('لا يوجد موعد')}</p></div>
          <Button type="button" variant="outline" onClick={() => onSelect(lead)}>{ui('فتح الملف')}</Button>
        </li>
      ))}
    </ol>
  );
}

function RenewalRows({ rows, opening, onSelect }: { rows: SalesRenewalRow[]; opening: number | null; onSelect: (row: SalesRenewalRow) => void }) {
  const { ui } = useLocale();
  return <ol className="divide-y">{rows.map((row) => <li key={row.memberId} className="flex flex-wrap items-center gap-3 p-4 sm:px-5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><UsersRound className="size-5" /></span><div className="min-w-0 flex-1"><b className="block truncate">{row.memberName}</b><p className="nums text-xs text-muted-foreground">{row.memberCode}{row.phone ? <> · <bdi dir="ltr">{row.phone}</bdi></> : null}</p></div><div className="text-xs"><p className={cn('font-bold', row.daysRemaining < 0 && 'text-destructive')}>{row.daysRemaining < 0 ? `${formatNum(Math.abs(row.daysRemaining))} ${ui('يومًا بعد الانتهاء')}` : `${formatNum(row.daysRemaining)} ${ui('يومًا متبقيًا')}`}</p><p className="text-muted-foreground">{row.subscriptionType}</p></div><Button variant="outline" disabled={opening != null} onClick={() => void onSelect(row)}>{ui(opening === row.memberId ? 'جارٍ الفتح…' : 'فتح المتابعة')}</Button></li>)}</ol>;
}

function RowsLoading() {
  return <div className="space-y-3 p-5" role="status"><span className="sr-only">جاري التحميل</span>{[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 rounded-lg" />)}</div>;
}

function Pager({ page, pages, busy, onChange }: { page: number; pages: number; busy: boolean; onChange: (page: number) => void }) {
  const { ui } = useLocale();
  return <div className="flex items-center justify-between gap-3"><p className="nums text-sm text-muted-foreground">{ui('صفحة')} {formatNum(page)} {ui('من')} {formatNum(pages)}</p><div className="flex gap-2"><Button variant="outline" disabled={page <= 1 || busy} onClick={() => onChange(page - 1)}>{ui('السابق')}</Button><Button variant="outline" disabled={page >= pages || busy} onClick={() => onChange(page + 1)}>{ui('التالي')}</Button></div></div>;
}

function Result({ label, value, icon: Icon }: { label: string; value: string; icon: typeof BarChart3 }) {
  return <div className="rounded-xl border bg-card p-5"><Icon className="size-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="nums mt-1 text-2xl font-bold">{value}</p></div>;
}

function LeadDetailDialog({ lead, onOpenChange, onNext, onPrevious, position, total, moving = false }: {
  lead: SalesLead | null;
  onOpenChange: (open: boolean) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  position?: number;
  total?: number;
  moving?: boolean;
}) {
  const { dir, ui } = useLocale();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, Partial<SalesLeadUiDraft>>>({});
  const [saving, setSaving] = useState(false);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const draft = draftForLead(drafts, lead);
  const details = useQuery({
    queryKey: ['club-lead', lead?.id],
    enabled: lead != null,
    retry: false,
    queryFn: async () => (await api.get<LeadDetails>(`/club-leads/${lead!.id}`)).data,
  });
  const currentLead: LeadDetails | null = details.data ?? lead;
  const receptionOwned = currentLead?.status === 'qualified';
  const renewalFollowUp = currentLead?.status === 'converted';
  const setField = <K extends keyof SalesLeadUiDraft>(key: K, value: SalesLeadUiDraft[K]) => {
    if (!lead) return;
    setDrafts((current) => ({ ...current, [lead.id]: { ...draftForLead(current, lead), [key]: value, dirty: true } }));
  };
  const save = async () => {
    if (!lead || receptionOwned) return;
    const error = validateSalesLeadActivity(draft);
    if (error) {
      toast.error(ui(error === 'answer_required' ? 'حدد هل تم الرد على الاتصال' : error === 'notes_required' ? 'أضف نتيجة التواصل أولًا' : 'حدد موعد المتابعة القادم'));
      return;
    }
    setSaving(true);
    try {
      await api.post(`/club-leads/${lead.id}/follow-up`, {
        activityType: draft.activityType,
        ...(draft.activityType === 'call' ? { answered: draft.answered } : {}),
        note: draft.note.trim() || undefined,
        interests: draft.interests.trim() || undefined,
        status: draft.status,
        nextFollowUpAt: draft.nextFollowUpAt ? new Date(draft.nextFollowUpAt).toISOString() : undefined,
        nextCallAt: draft.nextCallAt ? new Date(draft.nextCallAt).toISOString() : undefined,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['sales-portal'] }),
        qc.invalidateQueries({ queryKey: ['club-lead', lead.id] }),
      ]);
      setDrafts((current) => ({ ...current, [lead.id]: { ...draftForLead({}, lead), status: draft.status } }));
      toast.success(ui('تم حفظ المتابعة'));
    } catch (cause) {
      toast.error(apiError(cause));
    } finally {
      setSaving(false);
    }
  };
  const dialLink = toSalesDialLink(currentLead?.phone);
  return (
    <Dialog open={Boolean(lead)} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        dir={dir}
        className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto p-4 sm:p-6"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={(event) => {
          pointer.current = null;
          if (event.pointerType !== 'touch' || !event.isPrimary || saving || moving || (event.target as HTMLElement).closest('input,textarea,button,a,select,[contenteditable="true"]')) return;
          pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = pointer.current;
          pointer.current = null;
          if (!start || start.id !== event.pointerId || saving || moving) return;
          const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y, dir);
          if (direction === 1) onNext?.();
          if (direction === -1) onPrevious?.();
        }}
        onPointerCancel={() => { pointer.current = null; }}
      >
        <DialogHeader>
          <DialogTitle>{currentLead?.fullName || ui('ملف العميل')}</DialogTitle>
          <DialogDescription>{ui(renewalFollowUp ? 'سجل تواصل تجديد العضوية دون تغيير حالة العضوية.' : 'بيانات العميل ونتيجة التواصل التالية.')}</DialogDescription>
        </DialogHeader>
        {(onPrevious || onNext) ? <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/45 p-2"><Button type="button" size="icon" variant="outline" className="size-12" aria-label={ui('العميل السابق')} disabled={!onPrevious || saving || moving} onClick={onPrevious}>{dir === 'rtl' ? <ChevronRight /> : <ChevronLeft />}</Button><p className="nums text-sm text-muted-foreground" aria-live="polite">{position ? `${ui('العميل')} ${formatNum(position)}${total ? ` ${ui('من')} ${formatNum(total)}` : ''}` : ''}</p><Button type="button" size="icon" variant="outline" className="size-12" aria-label={ui('العميل التالي')} disabled={!onNext || saving || moving} onClick={onNext}>{dir === 'rtl' ? <ChevronLeft /> : <ChevronRight />}</Button></div> : null}
        {details.isLoading ? <RowsLoading /> : details.isError ? <ErrorState inline onRetry={() => void details.refetch()} /> : currentLead ? (
          <div className="space-y-4">
            <section className="rounded-xl bg-muted/60 p-4"><p className="font-bold">{currentLead.statusLabel || ui(stageLabels[currentLead.status] || currentLead.status)}</p><p className="mt-2"><bdi dir="ltr">{currentLead.phone}</bdi></p><div className="mt-3 flex flex-wrap gap-2">{dialLink ? <Button asChild variant="brand"><a href={dialLink}><Phone className="size-4" />{ui('اتصال')}</a></Button> : null}</div>{currentLead.subscription ? <dl className="mt-4 grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">{ui('آخر باقة مسجلة')}</dt><dd className="font-bold">{currentLead.subscription.packageName || '—'}</dd></div><div><dt className="text-xs text-muted-foreground">{ui('المبلغ المدفوع فعلًا')}</dt><dd className="nums font-bold">{formatMoney(currentLead.subscription.paidAmount)}</dd></div><div><dt className="text-xs text-muted-foreground">{ui('تاريخ البدء')}</dt><dd className="nums font-bold">{formatDate(currentLead.subscription.startDate)}</dd></div><div><dt className="text-xs text-muted-foreground">{ui('تاريخ الانتهاء')}</dt><dd className="nums font-bold">{formatDate(currentLead.subscription.endDate)}</dd></div></dl> : null}</section>
            <section className="overflow-hidden rounded-xl border bg-card">
              <div className="border-b px-4 py-3">
                <h3 className="font-bold">{ui('سجل نشاط العميل')}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{ui('كل الاتصالات والمحادثات والمقابلات بترتيبها الزمني.')}</p>
              </div>
              {currentLead.followUps?.length ? (
                <ol className="max-h-72 divide-y overflow-y-auto">
                  {currentLead.followUps.map((item) => (
                    <li key={item.id} className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <b className="text-sm">{ui(item.activityType === 'call' ? 'اتصال هاتفي' : item.activityType === 'meeting' ? 'مقابلة شخصية' : item.activityType === 'conversation' ? 'محادثة' : 'متابعة')}</b>
                        <time className="nums text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.note}</p>
                      {item.interests ? <p className="mt-2 rounded-lg bg-muted/45 px-3 py-2 text-xs"><b>{ui('الاهتمامات:')}</b> {item.interests}</p> : null}
                      {item.nextFollowUpAt ? <p className="nums mt-2 text-xs text-muted-foreground">{ui('المتابعة القادمة:')} {formatDateTime(item.nextFollowUpAt)}</p> : null}
                      {item.createdByName ? <p className="mt-1 text-xs text-muted-foreground">{ui('سجّلها')} {item.createdByName}</p> : null}
                    </li>
                  ))}
                </ol>
              ) : <EmptyState compact title={ui('لم يتم تسجيل نشاط بعد')} />}
            </section>
            {receptionOwned ? <p className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">{ui('هذه الحالة مؤهلة من الاستقبال وهي للعرض فقط؛ لا يستطيع مسؤول المبيعات تغييرها.')}</p> : (
              <section className="space-y-4">
                <fieldset><legend className="mb-2 text-sm font-bold">{ui('نوع التواصل')}</legend><div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{salesLeadActivityOptions.map((option) => <Button key={option.type} type="button" variant={draft.activityType === option.type ? 'default' : 'outline'} onClick={() => { setField('activityType', option.type as SalesLeadActivityType); setField('answered', undefined); }}>{ui(option.label)}</Button>)}</div></fieldset>
                {draft.activityType === 'call' ? <fieldset><legend className="mb-2 text-sm font-bold">{ui('هل تم الرد؟')}</legend><div className="grid grid-cols-2 gap-2"><Button type="button" variant={draft.answered === true ? 'default' : 'outline'} onClick={() => setField('answered', true)}>{ui('تم الرد')}</Button><Button type="button" variant={draft.answered === false ? 'default' : 'outline'} onClick={() => setField('answered', false)}>{ui('لم يتم الرد')}</Button></div></fieldset> : null}
                {(draft.activityType !== 'call' || draft.answered === true) ? <><div className="grid gap-2"><Label htmlFor={`salesLeadNote-${lead?.id}`}>{ui('نتيجة التواصل')}</Label><Textarea id={`salesLeadNote-${lead?.id}`} value={draft.note} onChange={(event) => setField('note', event.target.value)} placeholder={ui('اكتب ملخص المكالمة…')} maxLength={1000} /></div><div className="grid gap-2"><Label htmlFor={`salesLeadInterests-${lead?.id}`}>{ui('اهتمامات العميل')}</Label><Textarea id={`salesLeadInterests-${lead?.id}`} value={draft.interests} onChange={(event) => setField('interests', event.target.value)} maxLength={500} /></div></> : null}
                {!renewalFollowUp ? <div className="grid gap-2"><Label htmlFor={`salesLeadStatus-${lead?.id}`}>{ui('القرار')}</Label><select id={`salesLeadStatus-${lead?.id}`} value={draft.status} onChange={(event) => setField('status', event.target.value)} className="h-11 rounded-md border bg-card px-3">{['in_progress', 'follow_later', 'lost'].map((value) => <option key={value} value={value}>{ui(stageLabels[value])}</option>)}</select></div> : <p className="rounded-[10px] border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold">{ui('متابعة تجديد لعضو حالي — تسجيل النشاط لا يغيّر حالة العضوية.')}</p>}
                <div className="grid gap-2"><Label htmlFor={`salesLeadFollowUp-${lead?.id}`}>{ui('موعد المتابعة القادمة')}{draft.status === 'follow_later' ? ' *' : ''}</Label><Input id={`salesLeadFollowUp-${lead?.id}`} type="datetime-local" value={draft.nextFollowUpAt} onChange={(event) => setField('nextFollowUpAt', event.target.value)} /></div>
              </section>
            )}
          </div>
        ) : null}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{ui('إلغاء')}</Button>{!receptionOwned ? <Button disabled={saving || details.isLoading || details.isError} onClick={() => void save()}>{ui(saving ? 'جارٍ الحفظ…' : 'حفظ المتابعة')}</Button> : null}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
