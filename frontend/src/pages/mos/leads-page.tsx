import { formatDisplayNumber } from '@/lib/number-display';
import type { ColumnDef } from '@tanstack/react-table';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileSpreadsheet,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Shuffle,
  Trash2,
  Upload,
} from 'lucide-react';
import { type ChangeEvent, type ReactNode, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { LeadFeedbackDialog } from '@/components/club/lead-feedback-dialog';
import { LeadFormDialog, type LeadFormValues } from '@/components/club/lead-form-dialog';
import { MaskedPhone } from '@/components/club/masked-phone';
import { RenewalCandidatesPanel } from '@/components/club/renewal-candidates-panel';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { SelectField } from '@/components/common/select-field';
import { PermissionButton as Button } from '@/components/club/permission-button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useClubT } from '@/hooks/use-club-t';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { useKnowledgeSources } from '@/lib/use-knowledge-sources';
import { formatNum } from '@/lib/formatters';
import { useListQuery } from '@/lib/use-list-query';
import { cn } from '@/lib/utils';
import { ClubCustomerSourcesPage } from '@/pages/club/customer-sources';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { SELECT_CLS } from '../club/fitness/shared';
import { canEditLead, editableLeadStatuses } from './lead-conversion';
import { LeadHistory, activityLabel, formatWhen } from './lead-history';

/** One row of `GET /club-leads`, as EMS's lead service maps it. */
type LeadRow = {
  id: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  sourceId: number | null;
  /** EMS source key + label (e.g. staff_invitation → «دعوة موظف»). */
  source?: string;
  sourceLabel?: string;
  /** «دعوة بكود موظف»: the employee whose code brought this guest. */
  invitedByName?: string | null;
  assignedToId: number | null;
  assignedToName: string | null;
  status: string;
  followUpAt: string | null;
  notes: string | null;
  branchId: number | null;
  /** Handed over and not yet opened by its new owner. */
  handoverPending?: boolean;
  followUps?: Array<{
    activityType: string;
    note: string;
    createdByName: string | null;
    createdAt: string;
  }>;
};

type LeadPage = { data: LeadRow[]; total: number };

/**
 * «مصدر المعرفة», falling back to the system source for leads the system writes (a guest
 * through an employee's invitation code shows «دعوة موظف — <employee>»).
 */
function LeadSourceCell({ lead, name }: { lead: LeadRow; name: string }) {
  if (lead.sourceId != null || lead.source !== 'staff_invitation') return <>{name}</>;
  return (
    <span>
      {lead.sourceLabel ?? 'دعوة موظف'}
      {lead.invitedByName ? <span className="block text-xs text-muted-foreground">{lead.invitedByName}</span> : null}
    </span>
  );
}

/**
 * Every state offered as a filter card (FIT90's pipeline). `closes` marks the ones that leave
 * the working list: the default "All" view hides them, and each stays one card away.
 */
const PIPELINE = [
  { key: 'new', ar: 'جديد', en: 'New', closes: false },
  { key: 'contacted', ar: 'تم التواصل', en: 'Contacted', closes: false },
  { key: 'no_answer', ar: 'لم يرد', en: 'No answer', closes: false },
  { key: 'unreachable', ar: 'تعذّر الوصول', en: 'Unreachable', closes: false },
  { key: 'follow_up', ar: 'متابعة', en: 'Follow up', closes: false },
  { key: 'visit_arranged', ar: 'زيارة محددة', en: 'Visit arranged', closes: false },
  { key: 'qualified', ar: 'مؤهل', en: 'Qualified', closes: false },
  { key: 'membership_done', ar: 'تم الاشتراك', en: 'Membership done', closes: true },
  { key: 'lost', ar: 'غير مهتم', en: 'Not interested', closes: true },
  { key: 'converted', ar: 'تم التحويل', en: 'Converted', closes: true },
] as const;

type Tab = 'pipeline' | 'sources' | 'renewals';

async function downloadBlob(path: string, filename: string) {
  const { data } = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold">{children}</dd>
    </div>
  );
}

/** One state as a small card — the count dominates, the label explains it. */
function StateCard({ label, count, active, muted, locale, onClick }: {
  label: string;
  count: number;
  active: boolean;
  muted?: boolean;
  locale: 'ar' | 'en';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-w-[5.75rem] rounded-xl border px-2.5 py-2 text-center transition',
        active
          ? 'border-primary bg-primary/10 shadow-sm'
          : muted
            ? 'border-dashed border-border bg-muted/20 hover:bg-muted/50'
            : 'bg-card hover:bg-muted/50',
      )}
    >
      <span className={cn('nums block text-lg font-bold leading-tight', active ? 'text-primary' : count === 0 ? 'text-muted-foreground/50' : '')}>
        {formatNum(count, locale)}
      </span>
      <span className={cn('mt-0.5 block truncate text-[11px] font-medium', active ? 'text-primary' : 'text-muted-foreground')}>
        {label}
      </span>
    </button>
  );
}

/**
 * Potential members (`/mos/potential-members`) — FIT90's screen, running on EMS's `/club-leads`.
 *
 * Three tabs: the pipeline itself; «مصادر المعرفة», the list the form's knowledge-source select is
 * built from; and expired subscriptions waiting to be turned into renewal follow-ups. EMS's Excel
 * import/export sit in the header, beside the random distribution of unassigned leads.
 */
export function MosLeadsPage() {
  const ct = useClubT();
  const { isRtl, locale, ui } = useLocale();
  const { user } = useAuth();
  const { can } = usePermission();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = (['sources', 'renewals'] as const).find((value) => value === searchParams.get('tab')) ?? 'pipeline';
  const setTab = (value: Tab) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    if (value === 'pipeline') next.delete('tab'); else next.set('tab', value);
    return next;
  }, { replace: true });

  const canCreate = can('club.leads:create') || can('sales.portal:create');
  const canManage = can('club.leads:update');
  const canDelete = can('club.leads:delete');
  const canExport = can('club.leads:export');
  const canImport = can('club.leads:create');
  const canManageSources = can('club.subscriptions.customer_sources:view');
  /** A rep only ever sees their own pipeline; the server enforces it, the UI stops offering more. */
  const lockSalesRep = Boolean(user?.isSalesRep);
  const selfEmployeeId = user?.employeeId ?? user?.emp_code ?? undefined;

  const { params, setParams } = useListQuery({ pageSize: 10 });
  const hasFilters = (['status', 'assignedTo', 'sourceId', 'dateFrom', 'dateTo'] as const)
    .some((key) => (params.filters[key] ?? '') !== '');
  const assignedFilter = params.filters.assignedTo ?? '';
  const scopeParams = assignedFilter === 'none'
    ? { scope: 'unassigned' }
    : assignedFilter ? { assignedToId: assignedFilter } : {};

  const list = useQuery({
    queryKey: ['club-leads', 'potential-members', params],
    queryFn: async () => (await api.get<LeadPage>('/club-leads', {
      params: {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        // "All" is the working list; the closed states are reached through their own card.
        status: params.filters.status || 'open',
        sourceId: params.filters.sourceId || undefined,
        dateFrom: params.filters.dateFrom || undefined,
        dateTo: params.filters.dateTo || undefined,
        ...scopeParams,
      },
    })).data,
    placeholderData: keepPreviousData,
    enabled: tab === 'pipeline',
  });

  const { data: leadStats } = useQuery({
    queryKey: ['club-leads', 'statistics', assignedFilter, params.filters.sourceId ?? ''],
    queryFn: async () => (await api.get<{ total: number; byStatus: Record<string, number> }>('/club-leads/statistics', {
      params: { sourceId: params.filters.sourceId || undefined, ...scopeParams },
    })).data,
    enabled: tab === 'pipeline',
  });

  const { data: salesReps } = useQuery({
    queryKey: ['employees', 'sales-reps'],
    queryFn: async () => (await api.get<Array<{ id: number; name: string | null }>>('/employees/sales-reps')).data,
  });
  const knowledgeSources = useKnowledgeSources();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formInitial, setFormInitial] = useState<Partial<LeadFormValues>>({});
  const [detailsLead, setDetailsLead] = useState<LeadRow | null>(null);
  const [feedbackLead, setFeedbackLead] = useState<LeadRow | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['club-leads'] });

  const statusLabel = (status?: string | null) => {
    const item = PIPELINE.find((option) => option.key === (status ?? 'new'));
    return item ? (isRtl ? item.ar : item.en) : (status ?? '—');
  };
  const sourceName = (id: number | null | undefined) => knowledgeSources.find((source) => source.id === id)?.name ?? '—';

  const openLeadCount = useMemo(() => {
    const by = leadStats?.byStatus ?? {};
    return PIPELINE.filter((p) => !p.closes).reduce((sum, p) => sum + (by[p.key] ?? 0), 0);
  }, [leadStats]);

  const openCreate = () => {
    setEditId(null);
    setFormInitial(selfEmployeeId && lockSalesRep ? { assignedTo: String(selfEmployeeId) } : {});
    setFormOpen(true);
  };

  const openEdit = (lead: LeadRow) => {
    setEditId(lead.id);
    setFormInitial({
      name: lead.fullName,
      phone: lead.phone ?? '',
      email: lead.email ?? '',
      // A rep opening an unassigned lead claims it; someone else's lead is left alone.
      assignedTo: lead.assignedToId != null
        ? String(lead.assignedToId)
        : lockSalesRep && selfEmployeeId ? String(selfEmployeeId) : '',
      sourceId: lead.sourceId != null ? String(lead.sourceId) : '',
      status: lead.status ?? 'new',
      followUpAt: lead.followUpAt ?? '',
      notes: lead.notes ?? '',
      branchId: lead.branchId != null ? String(lead.branchId) : '',
    });
    setFormOpen(true);
  };

  const openDetails = (lead: LeadRow) => {
    setDetailsLead(lead);
    // Opening the lead is what acknowledges a handover; refresh so the badge clears.
    if (lead.handoverPending) void api.get(`/club-leads/${lead.id}`).then(refresh).catch(() => undefined);
  };

  const removeLead = async (lead: LeadRow) => {
    const ok = await confirm({
      title: ui('حذف العميل المحتمل'),
      description: ui('سيُحذف العميل وسجل متابعاته. لا يمكن التراجع عن هذا الإجراء.'),
      confirmLabel: ct('common.delete'),
      variant: 'destructive',
      rows: [{ label: ct('members.name'), after: `${lead.fullName}${lead.phone ? ` — ${lead.phone}` : ''}` }],
    });
    if (!ok) return;
    try {
      await api.delete(`/club-leads/${lead.id}`);
      toast.success(ui('تم حذف العميل المحتمل'));
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  /** Every open lead with no owner goes to a randomly drawn active rep covering its branch. */
  const distributeRandomly = async () => {
    const unassigned = await api.get<LeadPage>('/club-leads', { params: { scope: 'unassigned', status: 'open', page: 1, pageSize: 1 } })
      .then((res) => res.data.total)
      .catch(() => null);
    if (unassigned === 0) {
      toast.message(ui('لا يوجد عملاء محتملون غير مسندين'));
      return;
    }
    const ok = await confirm({
      title: ui('توزيع عشوائي على المبيعات'),
      description: unassigned != null
        ? `${formatNum(unassigned, locale)} ${ui('عميل محتمل غير مسند — سيتم توزيعهم عشوائيًا على أخصائيي المبيعات النشطين الذين يغطون فرع كل عميل. العملاء المسندون لن يتغيروا.')}`
        : ui('سيتم توزيع العملاء المحتملين غير المسندين عشوائيًا على أخصائيي المبيعات النشطين. العملاء المسندون لن يتغيروا.'),
      confirmLabel: ui('توزيع الآن'),
    });
    if (!ok) return;
    setDistributing(true);
    try {
      const { data } = await api.post<{
        distributed: number;
        skipped: number;
        byRep: Array<{ id: number; name: string; count: number }>;
      }>('/club-leads/distribute-unassigned', null, { params: { mode: 'random' } });
      if (!data.distributed) {
        toast.message(ui('لا يوجد أخصائي مبيعات نشط يغطي فروع هؤلاء العملاء'));
      } else {
        const breakdown = data.byRep.map((rep) => `${rep.name}: ${formatNum(rep.count, locale)}`).join(' · ');
        toast.success(`${ui('تم توزيع')} ${formatNum(data.distributed, locale)} ${ui('عميل')}`, { description: breakdown });
        if (data.skipped) toast.warning(`${formatNum(data.skipped, locale)} ${ui('عميل لا يوجد أخصائي يغطي فرعه')}`);
      }
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setDistributing(false);
    }
  };

  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post<{ imported: number; errors: string[] }>('/club-leads/import', body);
      toast.success(`${ui('تم استيراد')} ${formatNum(data.imported, locale)}`);
      if (data.errors.length) toast.error(data.errors.slice(0, 3).join(' · '));
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const columns = useMemo<ColumnDef<LeadRow, unknown>[]>(() => [
    {
      id: 'index',
      header: '#',
      cell: ({ row }) => <span className="nums">{formatDisplayNumber((params.page - 1) * params.pageSize + row.index + 1)}</span>,
    },
    {
      accessorKey: 'fullName',
      header: ct('common.name'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button type="button" className="text-start font-medium text-primary hover:underline" onClick={() => openDetails(row.original)}>
            {row.original.fullName}
          </button>
          {row.original.handoverPending && row.original.assignedToId === selfEmployeeId ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {isRtl ? 'محوّل إليك' : 'Transferred to you'}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: ct('common.phone'),
      cell: ({ row }) => <MaskedPhone value={row.original.phone} leadId={row.original.id} />,
    },
    {
      accessorKey: 'email',
      header: isRtl ? 'البريد الإلكتروني' : 'Email',
      cell: ({ getValue }) => <span dir="ltr">{String(getValue() ?? '—')}</span>,
    },
    {
      accessorKey: 'assignedToName',
      header: isRtl ? 'أخصائي المبيعات' : 'Sales rep',
      cell: ({ row }) => row.original.assignedToName ?? <span className="text-muted-foreground">{isRtl ? 'غير مسند' : 'Unassigned'}</span>,
    },
    {
      accessorKey: 'sourceId',
      header: isRtl ? 'مصدر المعرفة' : 'Knowledge source',
      cell: ({ row }) => <LeadSourceCell lead={row.original} name={sourceName(row.original.sourceId)} />,
    },
    {
      accessorKey: 'status',
      header: ct('common.status'),
      cell: ({ row }) => <span>{statusLabel(row.original.status)}</span>,
    },
    {
      accessorKey: 'followUpAt',
      header: isRtl ? 'المتابعة' : 'Follow-up',
      cell: ({ getValue }) => <span className="nums">{String(getValue() ?? '—')}</span>,
    },
    {
      accessorKey: 'notes',
      header: ct('common.notes'),
      cell: ({ row }) => {
        const text = row.original.notes?.trim();
        if (!text) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="min-w-44 max-w-72">
            <p className="line-clamp-2 whitespace-pre-wrap text-xs leading-5" title={text}>{text}</p>
          </div>
        );
      },
    },
    {
      id: 'lastActivity',
      header: isRtl ? 'آخر إجراء' : 'Last action',
      cell: ({ row }) => {
        const last = row.original.followUps?.[0];
        if (!last) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="min-w-40 leading-tight">
            <span className="block text-xs font-medium">{ui(activityLabel(last.activityType))}</span>
            <span className="block truncate text-xs text-muted-foreground" title={last.note}>{last.note}</span>
            <span className="nums block text-xs text-muted-foreground">{formatWhen(last.createdAt)}</span>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: ct('common.actions'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {canEditLead(row.original) && (
            <Button variant="ghost" size="sm" onClick={() => { setFeedbackLead(row.original); setFeedbackOpen(true); }}>
              <MessageSquarePlus className="size-4" /> {isRtl ? 'نتيجة التواصل' : 'Feedback'}
            </Button>
          )}
          {canEditLead(row.original) && (
            <Button variant="ghost" size="sm" onClick={() => openEdit(row.original)}>
              <Pencil className="size-4" /> {ct('common.edit')}
            </Button>
          )}
          {canDelete && (
            <Button
              permissionAction="delete"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => void removeLead(row.original)}
            >
              <Trash2 className="size-4" /> {ct('common.delete')}
            </Button>
          )}
        </div>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [ct, knowledgeSources, isRtl, params.page, params.pageSize, selfEmployeeId, canDelete, ui]);

  const tabs: Array<{ value: Tab; label: string; show: boolean }> = [
    { value: 'pipeline', label: isRtl ? 'العملاء المحتملين' : 'Potential members', show: true },
    { value: 'sources', label: isRtl ? 'مصادر المعرفة' : 'Knowledge sources', show: canManageSources },
    { value: 'renewals', label: isRtl ? 'اشتراكات منتهية' : 'Expired subscriptions', show: canImport },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRtl ? 'العملاء المحتملين' : 'Potential members'}
        description={isRtl
          ? 'متابعة الأعضاء المحتملين خلال مراحل التواصل والتحويل إلى عضوية.'
          : 'Track potential members through your sales pipeline.'}
        actions={tab === 'pipeline' ? (
          <>
            <input ref={importInputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => void importExcel(event)} />
            {canManage && !lockSalesRep ? (
              <Button permissionAction="update" variant="outline" disabled={distributing} onClick={() => void distributeRandomly()}>
                <Shuffle className="size-4" /> {distributing ? ui('جارٍ التوزيع…') : ui('توزيع عشوائي على المبيعات')}
              </Button>
            ) : null}
            {canImport || canExport ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" aria-label={ui('خيارات Excel')}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canImport ? <DropdownMenuItem onSelect={() => void downloadBlob('/club-leads/template', 'leads-template.xlsx')}><Download />{ui('تحميل قالب Excel')}</DropdownMenuItem> : null}
                  {canImport ? <DropdownMenuItem disabled={importing} onSelect={() => importInputRef.current?.click()}><Upload />{importing ? ui('جارٍ الرفع…') : ui('رفع Excel')}</DropdownMenuItem> : null}
                  {canExport ? <DropdownMenuItem onSelect={() => void downloadBlob('/club-leads/export', 'leads.xlsx')}><FileSpreadsheet />{ui('تصدير Excel')}</DropdownMenuItem> : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {canCreate ? (
              <Button permissionAction="create" variant="brand" onClick={openCreate}>
                <Plus className="size-4" /> {ct('common.add')}
              </Button>
            ) : null}
          </>
        ) : undefined}
      />

      {tabs.filter((item) => item.show).length > 1 ? (
        <div className="flex w-full gap-1 rounded-xl bg-muted/45 p-1.5" role="tablist">
          {tabs.filter((item) => item.show).map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => setTab(item.value)}
              className={cn(
                'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
                tab === item.value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'sources' ? <ClubCustomerSourcesPage embedded /> : null}
      {tab === 'renewals' ? <RenewalCandidatesPanel onConverted={() => void refresh()} /> : null}

      {tab === 'pipeline' ? (
        <>
          <div className="hidden flex-wrap items-stretch justify-center gap-2 lg:flex">
            <StateCard
              label={isRtl ? 'الكل' : 'All'}
              count={openLeadCount}
              active={!params.filters.status}
              locale={locale}
              onClick={() => setParams({ filters: { status: '' }, page: 1 })}
            />
            {PIPELINE.filter((p) => p.key !== 'converted').map((item) => (
              <StateCard
                key={item.key}
                label={isRtl ? item.ar : item.en}
                count={leadStats?.byStatus?.[item.key] ?? 0}
                muted={item.closes}
                active={params.filters.status === item.key}
                locale={locale}
                onClick={() => setParams({ filters: { status: item.key }, page: 1 })}
              />
            ))}
          </div>

          <DataTable
            columns={columns}
            data={list.data?.data ?? []}
            total={list.data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(page) => setParams({ page })}
            onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
            isLoading={list.isLoading}
            isError={list.isError}
            errorMessage={apiError(list.error)}
            onRetry={() => void list.refetch()}
            search={params.search}
            onSearchChange={(search) => setParams({ search, page: 1 })}
            toolbar={
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <SelectField
                  className="h-9 min-w-[8rem] flex-1 lg:hidden"
                  value={params.filters.status ?? ''}
                  onChange={(value) => setParams({ filters: { status: value }, page: 1 })}
                  aria-label={ct('common.status')}
                >
                  <option value="">{isRtl ? 'كل الحالات' : 'All statuses'}</option>
                  {editableLeadStatuses(PIPELINE).map((item) => (
                    <option key={item.key} value={item.key}>{isRtl ? item.ar : item.en}</option>
                  ))}
                </SelectField>

                {!lockSalesRep && (
                  <SelectField
                    className="h-9 min-w-[9rem] flex-1"
                    value={assignedFilter}
                    onChange={(value) => setParams({ filters: { assignedTo: value }, page: 1 })}
                    aria-label={isRtl ? 'أخصائي المبيعات' : 'Sales rep'}
                  >
                    <option value="">{isRtl ? 'كل المناديب' : 'All sales reps'}</option>
                    <option value="none">{isRtl ? 'بدون مندوب' : 'Unassigned'}</option>
                    {salesReps?.map((employee) => (
                      <option key={employee.id} value={String(employee.id)}>{employee.name}</option>
                    ))}
                  </SelectField>
                )}

                <SelectField
                  className="h-9 min-w-[9rem] flex-1"
                  value={params.filters.sourceId ?? ''}
                  onChange={(value) => setParams({ filters: { sourceId: value }, page: 1 })}
                  aria-label={isRtl ? 'مصدر المعرفة' : 'Knowledge source'}
                >
                  <option value="">{isRtl ? 'كل المصادر' : 'All sources'}</option>
                  {knowledgeSources.map((source) => (
                    <option key={source.id} value={String(source.id)}>{source.name}</option>
                  ))}
                </SelectField>

                {([
                  ['dateFrom', isRtl ? 'من' : 'From', isRtl ? 'من تاريخ التسجيل' : 'Registered from'],
                  ['dateTo', isRtl ? 'إلى' : 'To', isRtl ? 'إلى تاريخ التسجيل' : 'Registered to'],
                ] as const).map(([key, word, hint]) => (
                  <label key={key} className="flex h-9 items-center gap-1.5" title={hint}>
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground">{word}</span>
                    <input
                      type="date"
                      className={`${SELECT_CLS} h-9 min-w-[8.5rem] flex-1`}
                      value={params.filters[key] ?? ''}
                      max={key === 'dateFrom' ? params.filters.dateTo || undefined : undefined}
                      min={key === 'dateTo' ? params.filters.dateFrom || undefined : undefined}
                      onChange={(e) => setParams({ filters: { [key]: e.target.value }, page: 1 })}
                      aria-label={hint}
                    />
                  </label>
                ))}

                {hasFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={() => setParams({ filters: { status: '', assignedTo: '', sourceId: '', dateFrom: '', dateTo: '' }, page: 1 })}
                  >
                    {isRtl ? 'مسح الفلاتر' : 'Clear filters'}
                  </Button>
                )}
              </div>
            }
            emptyTitle={isRtl ? 'لا توجد بيانات' : 'No data'}
            enableExport={false}
          />
        </>
      ) : null}

      <Dialog open={detailsLead != null} onOpenChange={(o) => !o && setDetailsLead(null)}>
        <DialogContent size="xl" className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailsLead?.fullName ?? (isRtl ? 'السجل' : 'History')}</DialogTitle>
          </DialogHeader>
          <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <section className="rounded-xl border bg-muted/15 p-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label={ct('common.phone')}>
                  <MaskedPhone value={detailsLead?.phone} leadId={detailsLead?.id ?? null} />
                </Field>
                <Field label={isRtl ? 'البريد الإلكتروني' : 'Email'}>
                  <span dir="ltr" className="break-all">{detailsLead?.email || '—'}</span>
                </Field>
                <Field label={isRtl ? 'أخصائي المبيعات' : 'Sales rep'}>{detailsLead?.assignedToName ?? '—'}</Field>
                <Field label={isRtl ? 'مصدر المعرفة' : 'Knowledge source'}>{detailsLead ? <LeadSourceCell lead={detailsLead} name={sourceName(detailsLead.sourceId)} /> : '—'}</Field>
                {detailsLead?.invitedByName ? (
                  <Field label={isRtl ? 'جاي من خلال' : 'Invited by'}>{detailsLead.invitedByName}</Field>
                ) : null}
                <Field label={ct('common.status')}>{statusLabel(detailsLead?.status)}</Field>
                <Field label={isRtl ? 'المتابعة' : 'Follow-up'}>
                  <span className="nums">{detailsLead?.followUpAt || '—'}</span>
                </Field>
              </dl>
              {detailsLead?.notes ? (
                <div className="mt-4 border-t pt-3">
                  <p className="text-xs text-muted-foreground">{ct('common.notes')}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{detailsLead.notes}</p>
                </div>
              ) : null}
            </section>
            {detailsLead != null && <LeadHistory leadId={detailsLead.id} />}
          </div>
          <DialogFooter>
            {detailsLead != null && canEditLead(detailsLead) && (
              <Button variant="outline" onClick={() => { const lead = detailsLead; setDetailsLead(null); openEdit(lead); }}>
                <Pencil className="size-4" /> {ct('common.edit')}
              </Button>
            )}
            <Button variant="brand" onClick={() => setDetailsLead(null)}>{ct('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LeadFeedbackDialog
        leadId={feedbackLead?.id ?? null}
        leadName={feedbackLead?.fullName}
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        onSaved={() => void refresh()}
      />

      <LeadFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editId={editId}
        initial={formInitial}
        onSaved={async () => { await refresh(); }}
      />
    </div>
  );
}
