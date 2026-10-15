import type { ColumnDef } from '@tanstack/react-table';
import { Download, FileSpreadsheet, MoreHorizontal, Package, Plus, Upload, UserPlus, Users } from 'lucide-react';
import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MaskedPhone } from '@/components/club/masked-phone';
import { SalesPipelineTabs } from '@/components/club/sales-pipeline-tabs';
import { DataTable } from '@/components/common/data-table';
import { Combobox } from '@/components/common/combobox';
import {
  DialogFormGrid,
  DialogFormSection,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
  FORM_DIALOG_CONTENT_CLASS,
} from '@/components/common/dialog-form-layout';
import { FieldWrapper } from '@/components/common/form-fields';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { formatDateTime } from '@/lib/formatters';
import { useListQuery } from '@/lib/use-list-query';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface LeadMetaOption {
  value: string;
  label: string;
}

interface LeadPackageOption {
  id: number;
  name: string;
  isLinkedToSessions: boolean;
  applyToAllBranches: boolean;
  branchId: number | null;
  branchIds: number[];
  isActive: boolean;
}

interface SalesRepOption {
  id: number;
  name: string;
  branchId: number | null;
}

interface LeadRow {
  id: number;
  fullName: string;
  phone: string;
  source: string;
  sourceLabel: string;
  facebookProfileUrl: string | null;
  interestedProgram: string | null;
  interestedProgramLabel: string | null;
  subscriptionTypeId: number | null;
  status: string;
  statusLabel: string;
  assignedToId: number | null;
  assignedToName: string | null;
  assignmentMode: string | null;
  notes: string | null;
  branchId: number;
  followUps: Array<{ id: number; note: string; createdAt: string }>;
}

const emptyForm = {
  fullName: '',
  phone: '',
  source: 'walk_in',
  facebookProfileUrl: '',
  subscriptionTypeId: '',
  status: 'new',
  assignedToId: '',
  notes: '',
  branchId: '',
};

function packageBranchIds(type: LeadPackageOption): number[] {
  if (type.branchIds?.length) return type.branchIds;
  return type.branchId ? [type.branchId] : [];
}

async function downloadBlob(path: string, filename: string) {
  const { data } = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ClubLeadsPage() {
  const { ui } = useLocale();
  const ct = useClubT();
  const { can } = usePermission();
  const canManageLeads = can('club.leads:update');
  const canImport = can('club.leads:create');
  const canExport = can('club.leads:export');
  const canCreate = canImport;
  const canUpdate = can('club.leads:update') || can('sales.portal:update');
  const qc = useQueryClient();
  const { data: branches } = useBranches();
  const { params, setParams } = useListQuery();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [initialStatus, setInitialStatus] = useState('new');
  const [followUps, setFollowUps] = useState<LeadRow['followUps']>([]);
  const [followNote, setFollowNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { data: reps } = useQuery({
    queryKey: ['employees-sales-reps'],
    queryFn: async () => (await api.get<SalesRepOption[]>('/employees/sales-reps')).data,
    enabled: canManageLeads,
  });
  const { data: meta } = useQuery({
    queryKey: ['club-leads-meta'],
    queryFn: async () => (await api.get<{ sources: LeadMetaOption[]; statuses: LeadMetaOption[] }>('/club-leads/meta')).data,
  });
  const { data: packages } = useQuery({
    queryKey: ['club-leads-packages'],
    queryFn: async () => (await api.get<LeadPackageOption[]>('/club-leads/packages')).data,
  });

  const sources = meta?.sources ?? [];
  const statuses = meta?.statuses ?? [];
  const branchNameById = useMemo(
    () => new Map((branches ?? []).map((branch) => [branch.id, branch.name ?? `#${branch.id}`])),
    [branches],
  );
  const eligibleSalesReps = useMemo(() => {
    const branchId = Number(form.branchId);
    return (reps ?? []).filter((rep) => !branchId || rep.branchId == null || rep.branchId === branchId);
  }, [form.branchId, reps]);

  const packageOptions = useMemo(() => {
    return (packages ?? [])
      .filter((type) => type.isActive !== false)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      .map((type) => {
        const sessions = Boolean(type.isLinkedToSessions);
        const kind = sessions ? ct('packages.kindSessions') : ct('packages.kindSubscription');
        const ids = packageBranchIds(type);
        const branchLabel = type.applyToAllBranches
          ? ui('كل الفروع')
          : ids.map((id) => branchNameById.get(id)).filter(Boolean).join(' · ');
        return {
          value: String(type.id),
          label: type.name,
          badge: kind,
          badgeClassName: sessions
            ? 'bg-primary/15 text-foreground'
            : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
          description: branchLabel || undefined,
          searchText: `${kind} ${branchLabel}`,
        };
      });
  }, [branchNameById, ct, packages, ui]);

  const listQuery = useMemo(() => ({
    page: params.page,
    pageSize: params.pageSize,
    search: params.search,
    status: params.filters.status || 'all',
    source: params.filters.source || 'all',
    branchId: params.filters.branch || undefined,
    scope: params.filters.assignment || undefined,
  }), [params]);
  const list = useQuery({
    queryKey: ['club-leads', listQuery],
    queryFn: async () => (await api.get<{ data: LeadRow[]; total: number }>('/club-leads', { params: listQuery })).data,
  });

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm, branchId: branches?.[0] ? String(branches[0].id) : '' });
    setInitialStatus('new');
    setFollowUps([]);
    setFollowNote('');
    setOpen(true);
  };
  const openEdit = (row: LeadRow) => {
    setEditId(row.id);
    setForm({
      fullName: row.fullName,
      phone: row.phone,
      source: row.source,
      facebookProfileUrl: row.facebookProfileUrl ?? '',
      subscriptionTypeId: row.subscriptionTypeId ? String(row.subscriptionTypeId) : '',
      status: row.status,
      assignedToId: row.assignedToId ? String(row.assignedToId) : '',
      notes: row.notes ?? '',
      branchId: String(row.branchId),
    });
    setInitialStatus(row.status);
    setFollowUps(row.followUps ?? []);
    setFollowNote('');
    setOpen(true);
  };

  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post<{ imported: number; errors: string[] }>('/club-leads/import', body);
      toast.success(`${ui('تم استيراد')} ${toArabicDigits(data.imported)}`);
      if (data.errors.length) toast.error(data.errors.slice(0, 3).join(' · '));
      await qc.invalidateQueries({ queryKey: ['club-leads'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const save = async () => {
    if (!canCreate && !canUpdate) return;
    if (form.fullName.trim().length < 2 || form.phone.trim().length < 6 || !form.branchId) {
      toast.error(ui('أدخل الاسم والهاتف واختر الفرع'));
      return;
    }
    if (editId && form.status !== initialStatus && followNote.trim().length < 2) {
      toast.error(ui('أضف ملاحظة متابعة لتغيير الحالة'));
      return;
    }
    setSaving(true);
    try {
      const selectedPackage = (packages ?? []).find((type) => String(type.id) === form.subscriptionTypeId);
      const payload = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        source: form.source,
        facebookProfileUrl: form.facebookProfileUrl.trim() || undefined,
        subscriptionTypeId: form.subscriptionTypeId ? Number(form.subscriptionTypeId) : null,
        interestedProgram: selectedPackage?.name ?? null,
        assignedToId: form.assignedToId ? Number(form.assignedToId) : null,
        notes: form.notes,
        branchId: Number(form.branchId),
      };
      if (editId) await api.put(`/club-leads/${editId}`, payload);
      else await api.post('/club-leads', payload);
      if (editId && followNote.trim()) {
        await api.post(`/club-leads/${editId}/follow-up`, { note: followNote.trim(), status: form.status });
      }
      toast.success(ui('تم الحفظ'));
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ['club-leads'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const distributeUnassigned = async () => {
    const ok = await confirm({
      title: ui('توزيع العملاء غير المعيّنين'),
      description: ui('سيتم توزيع العملاء المحتملين غير المعيّنين بالتساوي على أخصائيي المبيعات النشطين. العملاء المعيّنون يدويًا لن يتغيروا.'),
      confirmLabel: ui('توزيع الآن'),
    });
    if (!ok) return;
    setDistributing(true);
    try {
      const { data } = await api.post<{ distributed: number; skipped: number }>('/club-leads/distribute-unassigned', null, {
        params: params.filters.branch ? { branchId: params.filters.branch } : undefined,
      });
      if (!data.distributed) {
        toast.message(ui('لا يوجد عملاء محتملون غير معيّنين'));
      } else {
        toast.success(`${ui('تم توزيع')} ${toArabicDigits(data.distributed)} ${ui('عميلًا')}`);
      }
      await qc.invalidateQueries({ queryKey: ['club-leads'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setDistributing(false);
    }
  };

  const columns = useMemo<ColumnDef<LeadRow>[]>(() => [
    { accessorKey: 'fullName', header: ui('الاسم') },
    { accessorKey: 'phone', header: ui('الهاتف'), cell: ({ row }) => <MaskedPhone value={row.original.phone} leadId={row.original.id} /> },
    { accessorKey: 'sourceLabel', header: ui('المصدر') },
    {
      accessorKey: 'interestedProgramLabel',
      header: ui('البرنامج المهتم'),
      cell: ({ getValue }) => getValue() ?? '—',
    },
    {
      accessorKey: 'statusLabel',
      header: ui('الحالة'),
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status === 'converted' ? 'active' : row.original.status === 'lost' ? 'expired' : 'pending'}
          label={row.original.statusLabel}
        />
      ),
    },
    { accessorKey: 'assignedToName', header: ui('أخصائي المبيعات'), cell: ({ getValue }) => getValue() ?? ui('غير معيّن') },
    {
      id: 'actions',
      header: ui('إجراءات'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          {canUpdate ? <Button size="sm" variant="outline" onClick={() => openEdit(row.original)}>{ui('متابعة')}</Button> : null}
        </div>
      ),
    },
  ], [canUpdate, ui]);

  const filterSelectClass = 'h-10 rounded-md border border-input bg-background px-3 text-sm';

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('العملاء المحتملون')}
        description={ui(canManageLeads ? ui('أدخل العملاء المحتملين ووزّعهم على فريق المبيعات لمتابعتهم') : ui('تابع العملاء المسندين لك وسجّل نتيجة كل تواصل'))}
        actions={(
          <>
            <input ref={importInputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => void importExcel(event)} />
            {canManageLeads ? (
              <Button variant="outline" disabled={distributing} onClick={() => void distributeUnassigned()}>
                <Users className="size-4" /> {distributing ? ui('جارٍ التوزيع…') : ui('توزيع غير المعيّنين')}
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
            {canCreate ? <Button variant="brand" onClick={openCreate}><Plus className="size-4" /> {ui('عميل جديد')}</Button> : null}
          </>
        )}
      />

      <SalesPipelineTabs
        value={params.filters.status ?? ''}
        onChange={(status) => setParams({ filters: { ...params.filters, status }, page: 1 })}
      />

      <div className="surface-card flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <Input className="min-w-[15rem] flex-1" placeholder={ui('بحث بالاسم أو الهاتف')} value={params.search} onChange={(e) => setParams({ search: e.target.value, page: 1 })} />
        <select className={filterSelectClass} value={params.filters.source ?? ''} onChange={(e) => setParams({ filters: { ...params.filters, source: e.target.value }, page: 1 })}>
          <option value="">{ui('كل المصادر')}</option>
          {sources.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        {canManageLeads ? (
          <select className={filterSelectClass} value={params.filters.assignment ?? ''} onChange={(e) => setParams({ filters: { ...params.filters, assignment: e.target.value }, page: 1 })}>
            <option value="">{ui('كل الإسناد')}</option>
            <option value="unassigned">{ui('غير معيّن')}</option>
          </select>
        ) : null}
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
        onRetry={() => void list.refetch()}
        emptyTitle={ui('لا يوجد عملاء محتملون')}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={cn(FORM_DIALOG_CONTENT_CLASS, 'sm:max-w-[min(96vw,52rem)]')} aria-describedby="lead-form-desc">
          <FormDialogHeader>
            <DialogTitle>{editId ? ui('متابعة العميل المحتمل') : ui('إضافة عميل محتمل')}</DialogTitle>
            <DialogDescription id="lead-form-desc">
              {editId
                ? ui('حدّث بيانات المتابعة أو أضف ملاحظة.')
                : ui(canManageLeads
                  ? ui('أدخل بيانات العميل وباقة الاهتمام. يمكنك تعيين أخصائي المبيعات من هنا.')
                  : ui('أدخل بيانات العميل وباقة الاهتمام وسيُسند إلى حسابك تلقائيًا.'))}
            </DialogDescription>
          </FormDialogHeader>

          {editId ? (
            <div className="shrink-0 border-b bg-muted/20 px-6 py-3 sm:px-8">
              <SalesPipelineTabs
                value={form.status}
                onChange={(status) => setForm((current) => ({ ...current, status }))}
                includeAll={false}
              />
            </div>
          ) : null}

          <FormDialogBody>
            <DialogFormSection title={ui('بيانات العميل')} icon={UserPlus}>
              <DialogFormGrid>
                <FieldWrapper label={ui('الاسم الكامل')} required>
                  <Input
                    value={form.fullName}
                    onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                    autoComplete="name"
                  />
                </FieldWrapper>
                <FieldWrapper label={ui('الهاتف')} required>
                  <Input
                    className="nums"
                    dir="ltr"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label={ui('المصدر')} required>
                  <Combobox
                    value={form.source}
                    onValueChange={(source) => setForm((f) => ({ ...f, source }))}
                    options={sources}
                    placeholder={ui('اختر المصدر')}
                    searchPlaceholder={ui('بحث في المصادر…')}
                    emptyText={ui('لا توجد مصادر')}
                  />
                </FieldWrapper>
                <FieldWrapper label={ui('الفرع')} required>
                  <Combobox
                    value={form.branchId}
                    onValueChange={(branchId) => setForm((current) => {
                      const selectedRep = (reps ?? []).find((rep) => String(rep.id) === current.assignedToId);
                      const selectedRepMatchesBranch = !selectedRep
                        || selectedRep.branchId == null
                        || selectedRep.branchId === Number(branchId);
                      return {
                        ...current,
                        branchId,
                        assignedToId: selectedRepMatchesBranch ? current.assignedToId : '',
                      };
                    })}
                    options={(branches ?? []).map((branch) => ({ value: String(branch.id), label: branch.name ?? `#${branch.id}` }))}
                    placeholder={ui('اختر الفرع')}
                    searchPlaceholder={ui('بحث في الفروع…')}
                    emptyText={ui('لا توجد فروع')}
                  />
                </FieldWrapper>
                {form.source === 'facebook_campaign' ? (
                  <FieldWrapper label={ui('رابط بروفايل فيسبوك')} required className="sm:col-span-2">
                    <Input
                      dir="ltr"
                      value={form.facebookProfileUrl}
                      onChange={(e) => setForm((f) => ({ ...f, facebookProfileUrl: e.target.value }))}
                      placeholder="https://facebook.com/…"
                    />
                  </FieldWrapper>
                ) : null}
              </DialogFormGrid>
            </DialogFormSection>

            <DialogFormSection title={ui(editId ? ui('الاهتمام والمتابعة') : ui('الاهتمام والإسناد'))} icon={Package}>
              <DialogFormGrid>
                <FieldWrapper label={ui('البرنامج المهتم')} className="sm:col-span-2">
                  {packageOptions.length ? (
                    <Combobox
                      value={form.subscriptionTypeId}
                      onValueChange={(subscriptionTypeId) => setForm((f) => ({ ...f, subscriptionTypeId }))}
                      options={packageOptions}
                      placeholder={ui('ابحث عن باقة اشتراك أو حصص')}
                      searchPlaceholder={ui('اكتب اسم الباقة أو النوع…')}
                      emptyText={ui('لا توجد باقات مطابقة')}
                    />
                  ) : (
                    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                      {ui('لا توجد باقات نشطة. أضف اشتراكًا أو حصصًا من إعدادات الباقات أولًا.')}
                    </p>
                  )}
                </FieldWrapper>
                {canManageLeads ? (
                  <FieldWrapper
                    label={ui('أخصائي المبيعات')}
                    hint={ui('اختر مسؤولًا من نفس الفرع، أو اتركه غير معيّن ثم استخدم التوزيع التلقائي.')}
                  >
                    <Combobox
                      value={form.assignedToId}
                      onValueChange={(assignedToId) => setForm((f) => ({ ...f, assignedToId }))}
                      options={[
                        { value: '', label: ui('غير معيّن') },
                        ...eligibleSalesReps.map((rep) => ({ value: String(rep.id), label: rep.name })),
                      ]}
                      placeholder={ui('غير معيّن')}
                      searchPlaceholder={ui('بحث في أخصائيي المبيعات…')}
                      emptyText={ui('لا يوجد أخصائيو مبيعات')}
                    />
                  </FieldWrapper>
                ) : null}
                <FieldWrapper label={ui('ملاحظات')} className="sm:col-span-2">
                  <Textarea
                    rows={3}
                    className="resize-none"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </FieldWrapper>
                {editId ? (
                  <FieldWrapper label={ui('إضافة متابعة')} hint={form.status !== initialStatus ? ui('اكتب نتيجة التواصل لحفظ تغيير المرحلة.') : undefined} className="sm:col-span-2">
                    <Textarea
                      rows={3}
                      className="resize-none"
                      value={followNote}
                      onChange={(e) => setFollowNote(e.target.value)}
                    />
                  </FieldWrapper>
                ) : null}
                {editId && followUps.length ? (
                  <div className="sm:col-span-2">
                    <h4 className="text-sm font-semibold">{ui('سجل المتابعة')}</h4>
                    <div className="mt-2 divide-y rounded-xl border bg-background">
                      {followUps.slice(0, 5).map((followUp) => (
                        <div key={followUp.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                          <p className="text-sm">{followUp.note}</p>
                          <time className="nums text-xs text-muted-foreground">{formatDateTime(followUp.createdAt)}</time>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </DialogFormGrid>
            </DialogFormSection>
          </FormDialogBody>

          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button>
            <Button type="button" variant="brand" disabled={saving} onClick={() => void save()}>
              {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
            </Button>
          </FormDialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
