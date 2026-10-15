import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, CalendarClock, CheckCircle2, Eye, FileUser, Pencil, Plus, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { StatusBadge, type StatusKey } from '@/components/common/status-badge';
import { ListPageShell } from '@/components/common/list-page-shell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { isNonNegativeMoney, isScoreOutOf100 } from '@/lib/hr-validation';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { DeptNode, JobTitle } from '@/types/org';
import { uiStatic } from '@/lib/ui-static';

interface JobRequestRow {
  id: number;
  title?: string;
  employeeName?: string;
  numForJob?: number | string;
  createdAt?: string;
}

interface ApplicationRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
  jobRequestId?: number;
  status?: string;
  convertedEmployeeId?: number | null;
}

interface ApplicationDetail extends ApplicationRow {
  name?: string | null;
  national_num?: string | null;
  mob?: string | null;
  email?: string | null;
  interview_date?: string | null;
  total_degree?: string | null;
  do_interview?: number | null;
}

interface JobOfferDetail {
  salaray?: string | null;
  contract_peroid?: string | null;
  contract_type_fk?: string | null;
  demo_days?: string | null;
  yearly_vacation?: string | null;
  notes?: string | null;
}

const PIPELINE_LABELS: Record<string, { label: string; badge: StatusKey }> = {
  applied: { label: uiStatic('متقدم جديد'), badge: 'info' },
  interview_scheduled: { label: uiStatic('مقابلة محددة'), badge: 'pending' },
  interviewed: { label: uiStatic('تمت المقابلة'), badge: 'info' },
  offered: { label: uiStatic('عرض عمل'), badge: 'pending' },
  accepted: { label: uiStatic('العرض مقبول'), badge: 'approved' },
  rejected: { label: uiStatic('مرفوض'), badge: 'rejected' },
  converted: { label: uiStatic('تم التعيين'), badge: 'active' },
};

interface JobRequestDetail {
  id: number;
  depId?: number | null;
  jobTitleId?: number | null;
  numForJob?: number | null;
}

function flattenDeptOptions(nodes: DeptNode[], depth = 0): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const pad = depth > 0 ? '— '.repeat(depth) : '';
  for (const n of nodes) {
    out.push({ value: String(n.id), label: `${pad}${n.title ?? '—'}` });
    if (n.children?.length) out.push(...flattenDeptOptions(n.children, depth + 1));
  }
  return out;
}

export function JobRequestsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const navigate = useNavigate();
  const canCreate = can('affairs.job_requests:create');
  const canUpdate = can('affairs.job_requests:update');
  const canApprove = can('affairs.job_requests:approve');
  const [tab, setTab] = useState<'requests' | 'applications'>('requests');
  const { params, setParams } = useListQuery();

  const requests = usePaginatedList<JobRequestRow>('hr/job-requests', params, tab === 'requests');
  const applications = usePaginatedList<ApplicationRow>(
    'hr/job-requests/applications',
    params,
    tab === 'applications',
  );

  const active = tab === 'requests' ? requests : applications;

  const [requestOpen, setRequestOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingRequest, setSavingRequest] = useState(false);
  const [requestForm, setRequestForm] = useState({ jobTitleId: '', depId: '', numForJob: '1' });

  const [appOpen, setAppOpen] = useState(false);
  const [savingApp, setSavingApp] = useState(false);
  const [appForm, setAppForm] = useState({
    name: '',
    nationalNum: '',
    mob: '',
    email: '',
    jobRequestIdFk: '',
  });
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineDetail, setPipelineDetail] = useState<ApplicationDetail | null>(null);
  const [pipelineForm, setPipelineForm] = useState({
    interviewDate: '',
    interviewTotal: '',
    salary: '',
    contractPeriod: '',
    contractType: '',
    demoDays: '',
    yearlyVacation: '',
    notes: '',
  });

  const lookupsEnabled = requestOpen || appOpen;
  const { data: deptTree = [] } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: async () => {
      const { data: tree } = await api.get<DeptNode[]>('/departments/tree');
      return tree;
    },
    enabled: lookupsEnabled,
    staleTime: 60_000,
  });
  const { data: jobTitles = [] } = useQuery({
    queryKey: ['departments', 'job-titles'],
    queryFn: async () => {
      const { data: jobs } = await api.get<JobTitle[]>('/departments/job-titles');
      return jobs;
    },
    enabled: lookupsEnabled,
    staleTime: 60_000,
  });
  const { data: requestChoices = [] } = useQuery({
    queryKey: ['hr/job-requests', 'select'],
    queryFn: async () => {
      const { data } = await api.get<{ data: JobRequestRow[] }>('/hr/job-requests', { params: { page: 1, pageSize: 100 } });
      return data.data ?? [];
    },
    enabled: appOpen,
  });

  const deptOptions = useMemo(() => flattenDeptOptions(deptTree), [deptTree]);
  const jobTitleOptions = useMemo(
    () => jobTitles.map((job) => ({ value: String(job.id), label: job.name ?? '—' })),
    [jobTitles],
  );
  const requestOptions = useMemo(
    () => requestChoices.map((row) => ({ value: String(row.id), label: row.title ?? `#${row.id}` })),
    [requestChoices],
  );

  const stats = useMemo(() => {
    if (tab === 'requests') {
      return [
        { title: ui('طلبات الاحتياج'), value: toArabicDigits(requests.data?.total ?? 0), icon: <Briefcase className="size-5" /> },
      ];
    }
    return [
      { title: ui('طلبات المتقدمين'), value: toArabicDigits(applications.data?.total ?? 0), icon: <FileUser className="size-5" /> },
    ];
  }, [tab, requests.data?.total, applications.data?.total]);

  const openCreateRequest = () => {
    if (!canCreate) return;
    setEditingId(null);
    setRequestForm({ jobTitleId: '', depId: '', numForJob: '1' });
    setRequestOpen(true);
  };

  const openEditRequest = async (row: JobRequestRow) => {
    if (!canUpdate) return;
    setEditingId(row.id);
    setRequestForm({
      jobTitleId: '',
      depId: '',
      numForJob: row.numForJob != null ? String(row.numForJob) : row.employeeName ?? '1',
    });
    setRequestOpen(true);
    try {
      const { data: detail } = await api.get<JobRequestDetail>(`/hr/job-requests/${row.id}`);
      setRequestForm({
        jobTitleId: detail.jobTitleId != null ? String(detail.jobTitleId) : '',
        depId: detail.depId != null ? String(detail.depId) : '',
        numForJob: detail.numForJob != null ? String(detail.numForJob) : row.numForJob != null ? String(row.numForJob) : '1',
      });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const saveRequest = async () => {
    if (editingId ? !canUpdate : !canCreate) return;
    const numForJob = parseInt(requestForm.numForJob, 10);
    if (!Number.isFinite(numForJob) || numForJob < 1) {
      toast.error(ui('عدد الشواغر مطلوب'));
      return;
    }
    setSavingRequest(true);
    try {
      const payload = {
        jobTitleId: requestForm.jobTitleId ? Number(requestForm.jobTitleId) : undefined,
        depId: requestForm.depId ? Number(requestForm.depId) : undefined,
        numForJob,
      };
      if (editingId) await api.patch(`/hr/job-requests/${editingId}`, payload);
      else await api.post('/hr/job-requests', payload);
      toast.success(editingId ? ui('تم تحديث طلب الاحتياج') : ui('تم إنشاء طلب الاحتياج'));
      setRequestOpen(false);
      await requests.refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingRequest(false);
    }
  };

  const openCreateApp = () => {
    if (!canCreate) return;
    setAppForm({ name: '', nationalNum: '', mob: '', email: '', jobRequestIdFk: '' });
    setAppOpen(true);
  };

  const saveApplication = async () => {
    if (!canCreate) return;
    if (!appForm.name.trim() || !appForm.nationalNum.trim()) {
      toast.error(ui('الاسم ورقم الهوية مطلوبان'));
      return;
    }
    setSavingApp(true);
    try {
      await api.post('/hr/job-requests/applications', {
        name: appForm.name.trim(),
        nationalNum: appForm.nationalNum.trim(),
        mob: appForm.mob.trim() || undefined,
        email: appForm.email.trim() || undefined,
        jobRequestIdFk: appForm.jobRequestIdFk ? Number(appForm.jobRequestIdFk) : undefined,
      });
      toast.success(ui('تم تسجيل طلب المتقدم'));
      setAppOpen(false);
      await applications.refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingApp(false);
    }
  };

  const loadPipeline = async (id: number) => {
    const [{ data: detail }, { data: offer }] = await Promise.all([
      api.get<ApplicationDetail>(`/hr/job-requests/applications/${id}`),
      api.get<JobOfferDetail | null>(`/hr/job-requests/applications/${id}/offer`),
    ]);
    setPipelineDetail(detail);
    setPipelineForm({
      interviewDate: detail.interview_date ?? '',
      interviewTotal: detail.total_degree ?? '',
      salary: offer?.salaray ?? '',
      contractPeriod: offer?.contract_peroid ?? '',
      contractType: offer?.contract_type_fk ?? '',
      demoDays: offer?.demo_days ?? '',
      yearlyVacation: offer?.yearly_vacation ?? '',
      notes: offer?.notes ?? '',
    });
  };

  const openPipeline = async (row: ApplicationRow) => {
    if (!canUpdate && !canApprove) return;
    setPipelineOpen(true);
    setPipelineDetail({ ...row, name: row.employeeName });
    setPipelineBusy(true);
    try {
      await loadPipeline(row.id);
    } catch (error) {
      toast.error(apiError(error));
      setPipelineOpen(false);
    } finally {
      setPipelineBusy(false);
    }
  };

  const runPipelineAction = async (action: () => Promise<unknown>, success: string) => {
    if (!pipelineDetail) return;
    setPipelineBusy(true);
    try {
      await action();
      toast.success(ui(success));
      await Promise.all([loadPipeline(pipelineDetail.id), applications.refetch()]);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setPipelineBusy(false);
    }
  };

  const saveInterviewDate = () => {
    if (!pipelineDetail || !pipelineForm.interviewDate) {
      toast.error(ui('موعد المقابلة مطلوب'));
      return;
    }
    void runPipelineAction(
      () => api.patch(`/hr/job-requests/applications/${pipelineDetail.id}/interview-date`, {
        interviewDate: pipelineForm.interviewDate,
      }),
      ui('تم تحديد موعد المقابلة'),
    );
  };

  const saveInterview = () => {
    if (!pipelineDetail || !isScoreOutOf100(pipelineForm.interviewTotal)) {
      toast.error(ui('تقييم المقابلة يجب أن يكون رقمًا من 0 إلى 100'));
      return;
    }
    void runPipelineAction(
      () => api.post(`/hr/job-requests/applications/${pipelineDetail.id}/interview`, {
        degrees: [],
        total: pipelineForm.interviewTotal.trim(),
      }),
      ui('تم حفظ تقييم المقابلة'),
    );
  };

  const saveOffer = () => {
    if (!pipelineDetail || !isNonNegativeMoney(pipelineForm.salary)) {
      toast.error(ui('الراتب المقترح يجب أن يكون رقمًا موجبًا بصيغة صحيحة'));
      return;
    }
    void runPipelineAction(
      () => api.post(`/hr/job-requests/applications/${pipelineDetail.id}/offer`, {
        salary: pipelineForm.salary.trim(),
        contractPeroid: pipelineForm.contractPeriod.trim() || undefined,
        contractTypeFk: pipelineForm.contractType.trim() || undefined,
        demoDays: pipelineForm.demoDays.trim() || undefined,
        yearlyVacation: pipelineForm.yearlyVacation.trim() || undefined,
        notes: pipelineForm.notes.trim() || undefined,
      }),
      ui('تم حفظ عرض العمل'),
    );
  };

  const acceptOffer = () => {
    if (!pipelineDetail) return;
    void runPipelineAction(
      () => api.post(`/hr/job-requests/applications/${pipelineDetail.id}/accept`),
      ui('تم قبول عرض العمل وأصبح المتقدم جاهزًا للتعيين'),
    );
  };

  const requestColumns: ColumnDef<JobRequestRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('المسمى / الطلب') },
    {
      accessorKey: 'numForJob',
      header: ui('العدد المطلوب'),
      cell: ({ row, getValue }) => {
        const raw = getValue() as number | string | undefined;
        const fallback = row.original.employeeName;
        const shown = raw != null && raw !== '' ? raw : fallback;
        return <span className="nums">{shown != null && shown !== '' ? toArabicDigits(shown) : '—'}</span>;
      },
    },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) =>
        canUpdate ? (
          <Button
            permissionResource="affairs.job_requests"
            permissionAction="update"
            variant="ghost"
            size="icon"
            aria-label={ui('تعديل')}
            onClick={() => void openEditRequest(row.original)}
          >
            <Pencil className="size-4" />
          </Button>
        ) : null,
    },
  ];

  const applicationColumns: ColumnDef<ApplicationRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('المتقدم') },
    { accessorKey: 'title', header: ui('الوظيفة') },
    {
      accessorKey: 'jobRequestId',
      header: ui('رقم الطلب'),
      cell: ({ getValue }) => <span className="nums">{getValue() != null ? formatDigits(getValue() as number) : '—'}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'status',
      header: ui('مرحلة التوظيف'),
      cell: ({ getValue }) => {
        const value = String(getValue() ?? 'applied');
        const meta = PIPELINE_LABELS[value] ?? PIPELINE_LABELS.applied;
        return <StatusBadge status={meta.badge} label={ui(meta.label)} />;
      },
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (canUpdate || canApprove) ? (
        <Button
          permissionAction={null}
          variant="ghost"
          size="icon"
          aria-label={ui('إدارة مسار التوظيف')}
          onClick={() => void openPipeline(row.original)}
        >
          <Eye className="size-4" />
        </Button>
      ) : null,
    },
  ];

  return (
    <>
    <ListPageShell
      title={ui('طلبات التوظيف')}
      description={ui('احتياج وظيفي وطلبات المتقدمين')}
      searchPlaceholder={tab === 'requests' ? ui('بحث في الطلبات…') : ui('بحث في المتقدمين…')}
      stats={stats}
      statsLoading={active.isLoading}
      isError={active.isError}
      error={active.error}
      actions={
        canCreate ? (
          <Button
            permissionResource="affairs.job_requests"
            permissionAction="create"
            variant="brand"
            size="sm"
            onClick={tab === 'requests' ? openCreateRequest : openCreateApp}
          >
            <Plus className="size-4" /> {tab === 'requests' ? ui('طلب احتياج جديد') : ui('طلب متقدم جديد')}
          </Button>
        ) : undefined
      }
    >
      <Tabs value={tab} onValueChange={(v) => { setTab(v as 'requests' | 'applications'); setParams({ page: 1 }); }}>
        <TabsList>
          <TabsTrigger value="requests" className="gap-2">
            <Briefcase className="size-4" /> {ui('الاحتياج الوظيفي')}
          </TabsTrigger>
          <TabsTrigger value="applications" className="gap-2">
            <Users className="size-4" /> {ui('طلبات المتقدمين')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          <DataTable
            exportSource={{ resource: 'hr/job-requests', params }}
            columns={requestColumns}
            data={requests.data?.data ?? []}
            total={requests.data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(p) => setParams({ page: p })}
            onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
            isLoading={requests.isLoading}
            isError={requests.isError}
            onRetry={() => void requests.refetch()}
            search={params.search}
            onSearchChange={(s) => setParams({ search: s, page: 1 })}
            emptyTitle={ui('لا توجد طلبات احتياج')}
          />
        </TabsContent>

        <TabsContent value="applications" className="mt-4">
          <DataTable
            exportSource={{ resource: 'hr/job-requests/applications', params }}
            columns={applicationColumns}
            data={applications.data?.data ?? []}
            total={applications.data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(p) => setParams({ page: p })}
            onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
            isLoading={applications.isLoading}
            isError={applications.isError}
            onRetry={() => void applications.refetch()}
            search={params.search}
            onSearchChange={(s) => setParams({ search: s, page: 1 })}
            emptyTitle={ui('لا توجد طلبات متقدمين')}
          />
        </TabsContent>
      </Tabs>
    </ListPageShell>

      <Dialog open={requestOpen && (editingId ? canUpdate : canCreate)} onOpenChange={setRequestOpen}>
        <DialogContent aria-describedby={undefined} size="md">
          <DialogHeader>
            <DialogTitle>{editingId ? ui('تعديل طلب الاحتياج') : ui('طلب احتياج جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{ui('المسمى الوظيفي')}</Label>
              <Combobox
                options={jobTitleOptions}
                value={requestForm.jobTitleId}
                onValueChange={(jobTitleId) => setRequestForm((current) => ({ ...current, jobTitleId }))}
                placeholder={ui('اختر المسمى')}
                searchPlaceholder={ui('بحث في المسميات…')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{ui('الإدارة')}</Label>
              <Combobox
                options={deptOptions}
                value={requestForm.depId}
                onValueChange={(depId) => setRequestForm((current) => ({ ...current, depId }))}
                placeholder={ui('اختر الإدارة')}
                searchPlaceholder={ui('بحث في الإدارات…')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="job-num">{ui('العدد المطلوب')}</Label>
              <Input
                id="job-num"
                type="number"
                min={1}
                className="nums"
                value={requestForm.numForJob}
                onChange={(event) => setRequestForm((current) => ({ ...current, numForJob: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button permissionAction={null} variant="outline" onClick={() => setRequestOpen(false)}>{ui('إلغاء')}</Button>
            <Button
              permissionResource="affairs.job_requests"
              permissionAction={editingId ? 'update' : 'create'}
              disabled={savingRequest}
              onClick={() => void saveRequest()}
            >
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={appOpen && canCreate} onOpenChange={setAppOpen}>
        <DialogContent aria-describedby={undefined} size="md">
          <DialogHeader>
            <DialogTitle>{ui('طلب متقدم جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="app-name">{ui('اسم المتقدم')}</Label>
              <Input id="app-name" value={appForm.name} onChange={(event) => setAppForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="app-nid">{ui('رقم الهوية')}</Label>
              <Input id="app-nid" className="nums" value={appForm.nationalNum} onChange={(event) => setAppForm((current) => ({ ...current, nationalNum: event.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="app-mob">{ui('الجوال')}</Label>
              <Input id="app-mob" className="nums" value={appForm.mob} onChange={(event) => setAppForm((current) => ({ ...current, mob: event.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="app-email">{ui('البريد الإلكتروني')}</Label>
              <Input id="app-email" type="email" value={appForm.email} onChange={(event) => setAppForm((current) => ({ ...current, email: event.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>{ui('طلب الاحتياج')}</Label>
              <Combobox
                options={requestOptions}
                value={appForm.jobRequestIdFk}
                onValueChange={(jobRequestIdFk) => setAppForm((current) => ({ ...current, jobRequestIdFk }))}
                placeholder={ui('اختياري')}
                searchPlaceholder={ui('بحث في الطلبات…')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button permissionAction={null} variant="outline" onClick={() => setAppOpen(false)}>{ui('إلغاء')}</Button>
            <Button
              permissionResource="affairs.job_requests"
              permissionAction="create"
              disabled={savingApp}
              onClick={() => void saveApplication()}
            >
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pipelineOpen} onOpenChange={setPipelineOpen}>
        <DialogContent aria-describedby={undefined} size="xl">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-3">
              <DialogTitle>{ui('مسار توظيف المتقدم')}</DialogTitle>
              {pipelineDetail ? (() => {
                const meta = PIPELINE_LABELS[pipelineDetail.status ?? 'applied'] ?? PIPELINE_LABELS.applied;
                return <StatusBadge status={meta.badge} label={ui(meta.label)} />;
              })() : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {pipelineDetail?.name ?? pipelineDetail?.employeeName ?? ui('جارٍ تحميل بيانات المتقدم…')}
              {pipelineDetail?.national_num ? ` · ${pipelineDetail.national_num}` : ''}
            </p>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-3" aria-busy={pipelineBusy}>
            <section className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="mb-4 flex items-center gap-2">
                <CalendarClock className="size-5 text-primary" />
                <h3 className="font-semibold">{ui('1. المقابلة')}</h3>
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pipeline-interview-date">{ui('موعد المقابلة')}</Label>
                  <Input
                    id="pipeline-interview-date"
                    type="date"
                    className="nums"
                    value={pipelineForm.interviewDate}
                    onChange={(event) => setPipelineForm((current) => ({ ...current, interviewDate: event.target.value }))}
                  />
                </div>
                {canUpdate ? (
                  <Button permissionResource="affairs.job_requests" permissionAction="update" variant="outline" disabled={pipelineBusy} onClick={saveInterviewDate}>
                    {ui('حفظ الموعد')}
                  </Button>
                ) : null}
                <div className="grid gap-1.5 border-t border-border/50 pt-3">
                  <Label htmlFor="pipeline-interview-total">{ui('التقييم الإجمالي')}</Label>
                  <Input
                    id="pipeline-interview-total"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    className="nums"
                    placeholder={ui('مثال: 85')}
                    value={pipelineForm.interviewTotal}
                    onChange={(event) => setPipelineForm((current) => ({ ...current, interviewTotal: event.target.value }))}
                  />
                </div>
                {canUpdate ? (
                  <Button permissionResource="affairs.job_requests" permissionAction="update" disabled={pipelineBusy} onClick={saveInterview}>
                    <CheckCircle2 className="size-4" /> {ui('إتمام المقابلة')}
                  </Button>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border border-border/60 bg-muted/20 p-4 lg:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <Briefcase className="size-5 text-primary" />
                <h3 className="font-semibold">{ui('2. عرض العمل')}</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="pipeline-salary">{ui('الراتب المقترح')}</Label>
                  <Input id="pipeline-salary" type="number" inputMode="decimal" min="0" step="0.01" className="nums" value={pipelineForm.salary} onChange={(event) => setPipelineForm((current) => ({ ...current, salary: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pipeline-contract-period">{ui('مدة العقد')}</Label>
                  <Input id="pipeline-contract-period" value={pipelineForm.contractPeriod} onChange={(event) => setPipelineForm((current) => ({ ...current, contractPeriod: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pipeline-contract-type">{ui('مرجع نوع العقد')}</Label>
                  <Input id="pipeline-contract-type" value={pipelineForm.contractType} onChange={(event) => setPipelineForm((current) => ({ ...current, contractType: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pipeline-demo-days">{ui('أيام التجربة')}</Label>
                  <Input id="pipeline-demo-days" inputMode="numeric" className="nums" value={pipelineForm.demoDays} onChange={(event) => setPipelineForm((current) => ({ ...current, demoDays: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pipeline-vacation">{ui('الإجازة السنوية')}</Label>
                  <Input id="pipeline-vacation" inputMode="numeric" className="nums" value={pipelineForm.yearlyVacation} onChange={(event) => setPipelineForm((current) => ({ ...current, yearlyVacation: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="pipeline-notes">{ui('ملاحظات العرض')}</Label>
                  <Input id="pipeline-notes" value={pipelineForm.notes} onChange={(event) => setPipelineForm((current) => ({ ...current, notes: event.target.value }))} />
                </div>
              </div>
              {canUpdate ? (
                <Button className="mt-4" permissionResource="affairs.job_requests" permissionAction="update" variant="outline" disabled={pipelineBusy} onClick={saveOffer}>
                  {ui('حفظ عرض العمل')}
                </Button>
              ) : null}
            </section>
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {canApprove && pipelineDetail && !['accepted', 'converted'].includes(pipelineDetail.status ?? '') ? (
                <Button permissionResource="affairs.job_requests" permissionAction="approve" disabled={pipelineBusy} onClick={acceptOffer}>
                  <CheckCircle2 className="size-4" /> {ui('اعتماد قبول العرض')}
                </Button>
              ) : null}
              {canApprove && pipelineDetail?.status === 'accepted' ? (
                <Button permissionResource="affairs.job_requests" permissionAction="approve" variant="brand" disabled={pipelineBusy} onClick={() => navigate(`/employees/new?recruitmentApplicationId=${pipelineDetail.id}`)}>
                  <UserPlus className="size-4" /> {ui('بدء التعيين ببيانات المتقدم')}
                </Button>
              ) : null}
              {pipelineDetail?.status === 'converted' && pipelineDetail.convertedEmployeeId ? (
                <Button permissionAction={null} variant="outline" onClick={() => navigate(`/employees/${pipelineDetail.convertedEmployeeId}`)}>
                  <UserPlus className="size-4" /> {ui('فتح ملف الموظف')}
                </Button>
              ) : null}
            </div>
            <Button permissionAction={null} variant="outline" onClick={() => setPipelineOpen(false)}>{ui('إغلاق')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
