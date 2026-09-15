import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Plus, Printer, Scale, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Money } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export interface AdministrativeDecisionRow {
  id: number;
  empName: string | null;
  edaraId: number;
  edaraName: string | null;
  qsmId: number;
  qsmName: string | null;
  directManagerId: number;
  directManagerName: string | null;
  jobTitleId: number;
  jobTitleName: string | null;
  salary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  totalSalary: number;
  workDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  createdAt: string | null;
  publisherName: string | null;
}

interface LookupItem { id: number; title: string | null }
interface DepartmentLookup extends LookupItem { parentId: number }
interface DecisionLookups { departments: DepartmentLookup[]; jobTitles: LookupItem[] }

const emptyForm = () => ({
  empName: '', edaraId: '', qsmId: '', directManagerId: '', jobTitleId: '',
  salary: '', housingAllowance: '', transportAllowance: '', otherAllowance: '',
  workDate: '', periodFrom: '', periodTo: '',
});

export function AdministrativeDecisionsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<AdministrativeDecisionRow>(
    'hr/administrative-decisions', params,
  );
  const { data: lookups } = useQuery({
    queryKey: ['hr/administrative-decisions', 'lookups'],
    queryFn: async () => (await api.get<DecisionLookups>('/hr/administrative-decisions/lookups')).data,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<AdministrativeDecisionRow | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const departments = useMemo(
    () => lookups?.departments.filter((item) => item.parentId === 0) ?? [],
    [lookups],
  );
  const sections = useMemo(
    () => lookups?.departments.filter((item) => item.parentId === Number(form.edaraId)) ?? [],
    [form.edaraId, lookups],
  );

  const remove = useMutationWithToast(
    (id: number) => api.delete(`/hr/administrative-decisions/${id}`),
    { success: ui('تم حذف القرار الإداري'), invalidate: ['hr/administrative-decisions'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (row: AdministrativeDecisionRow) => {
    setEditId(row.id);
    setForm({
      empName: row.empName ?? '', edaraId: String(row.edaraId || ''), qsmId: String(row.qsmId || ''),
      directManagerId: String(row.directManagerId || ''), jobTitleId: String(row.jobTitleId || ''),
      salary: String(row.salary), housingAllowance: String(row.housingAllowance),
      transportAllowance: String(row.transportAllowance), otherAllowance: String(row.otherAllowance),
      workDate: row.workDate ?? '', periodFrom: row.periodFrom ?? '', periodTo: row.periodTo ?? '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.empName.trim() || !form.edaraId || !form.jobTitleId || !form.workDate || !form.periodFrom || !form.periodTo) {
      toast.error(ui('يرجى تعبئة جميع الحقول المطلوبة'));
      return;
    }
    if (form.periodTo < form.periodFrom) {
      toast.error(ui('تاريخ نهاية الفترة التجريبية يجب ألا يسبق تاريخ بدايتها'));
      return;
    }
    const payload = {
      empName: form.empName.trim(),
      edaraId: Number(form.edaraId),
      qsmId: form.qsmId ? Number(form.qsmId) : undefined,
      directManagerId: form.directManagerId ? Number(form.directManagerId) : undefined,
      jobTitleId: Number(form.jobTitleId),
      salary: Number(form.salary) || 0,
      housingAllowance: Number(form.housingAllowance) || 0,
      transportAllowance: Number(form.transportAllowance) || 0,
      otherAllowance: Number(form.otherAllowance) || 0,
      workDate: form.workDate,
      periodFrom: form.periodFrom,
      periodTo: form.periodTo,
    };
    setSaving(true);
    try {
      if (editId) await api.patch(`/hr/administrative-decisions/${editId}`, payload);
      else await api.post('/hr/administrative-decisions', payload);
      toast.success(ui('تم حفظ القرار الإداري'));
      setFormOpen(false);
      void refetch();
    } catch (cause) {
      toast.error(apiError(cause));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: AdministrativeDecisionRow) => {
    const approved = await confirm({
      title: ui('حذف القرار الإداري'),
      description: `${ui('هل تريد حذف قرار تعيين')} ${row.empName ?? ''}؟`,
      confirmLabel: ui('حذف'), variant: 'destructive',
    });
    if (approved) remove.mutate(row.id);
  };

  const columns: ColumnDef<AdministrativeDecisionRow>[] = [
    { id: 'rowNo', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    { accessorKey: 'empName', header: ui('اسم الموظف') },
    { accessorKey: 'edaraName', header: ui('الإدارة') },
    { accessorKey: 'jobTitleName', header: ui('المسمى الوظيفي') },
    { accessorKey: 'totalSalary', header: ui('إجمالي الراتب'), cell: ({ getValue }) => <Money value={getValue() as number} /> },
    { accessorKey: 'periodTo', header: ui('نهاية الفترة التجريبية') },
    {
      id: 'actions', header: ui('الإجراءات'), cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('التفاصيل')} onClick={() => setDetail(row.original)}><Eye className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label={ui('طباعة')} onClick={() => window.open(`/hr/administrative-decisions/${row.original.id}/print`, '_blank', 'noopener,noreferrer')}><Printer className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}><Pencil className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}><Trash2 className="size-4 text-destructive" /></Button>
        </div>
      ),
    },
  ];

  const numberField = (key: 'salary' | 'housingAllowance' | 'transportAllowance' | 'otherAllowance', label: string) => (
    <div><Label htmlFor={`decision-${key}`}>{ui(label)}</Label><Input id={`decision-${key}`} type="number" min={0} className="mt-1.5 nums" value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></div>
  );

  return (
    <>
      <ListPageShell
        title={ui('القرارات الإدارية')}
        description={ui('قرارات التعيين المؤقت والفترة التجريبية وفق النظام القديم')}
        searchPlaceholder={ui('بحث في القرارات الإدارية…')}
        isError={isError} error={error}
        actions={<Button variant="brand" size="sm" onClick={openCreate}><Plus className="size-4" /> {ui('قرار جديد')}</Button>}
        stats={[{ title: ui('إجمالي القرارات'), value: data?.total ?? 0, icon: <Scale className="size-5" /> }]}
        statsLoading={isLoading}
      >
        <DataTable columns={columns} data={data?.data ?? []} total={data?.total ?? 0} page={params.page} pageSize={params.pageSize}
          onPageChange={(page) => setParams({ page })} onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
          isLoading={isLoading} isError={isError} onRetry={() => void refetch()} search={params.search}
          onSearchChange={(search) => setParams({ search, page: 1 })} emptyTitle={ui('لا توجد قرارات إدارية')} />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editId ? ui('تعديل القرار الإداري') : ui('قرار تعيين مؤقت جديد')}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-3">
            <div><Label htmlFor="decision-name">{ui('اسم الموظف')}</Label><Input id="decision-name" className="mt-1.5" value={form.empName} onChange={(event) => setForm((current) => ({ ...current, empName: event.target.value }))} /></div>
            <div><Label htmlFor="decision-department">{ui('الإدارة')}</Label><select id="decision-department" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3" value={form.edaraId} onChange={(event) => setForm((current) => ({ ...current, edaraId: event.target.value, qsmId: '' }))}><option value="">{ui('اختر…')}</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
            <div><Label htmlFor="decision-section">{ui('القسم')}</Label><select id="decision-section" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3" value={form.qsmId} onChange={(event) => setForm((current) => ({ ...current, qsmId: event.target.value }))}><option value="">{ui('بدون قسم')}</option>{sections.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
            <div><Label htmlFor="decision-job-title">{ui('المسمى الوظيفي')}</Label><select id="decision-job-title" className="mt-1.5 h-10 w-full rounded-md border bg-background px-3" value={form.jobTitleId} onChange={(event) => setForm((current) => ({ ...current, jobTitleId: event.target.value }))}><option value="">{ui('اختر…')}</option>{lookups?.jobTitles.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
            {numberField('salary', 'الراتب الأساسي')}
            {numberField('housingAllowance', 'بدل السكن')}
            {numberField('transportAllowance', 'بدل المواصلات')}
            {numberField('otherAllowance', 'بدلات أخرى')}
            <div><Label>{ui('إجمالي الراتب')}</Label><Input readOnly className="mt-1.5 nums" value={(Number(form.salary) || 0) + (Number(form.housingAllowance) || 0) + (Number(form.transportAllowance) || 0) + (Number(form.otherAllowance) || 0)} /></div>
            <div><Label htmlFor="decision-work-date">{ui('تاريخ مباشرة العمل')}</Label><Input id="decision-work-date" type="date" className="mt-1.5" value={form.workDate} onChange={(event) => setForm((current) => ({ ...current, workDate: event.target.value }))} /></div>
            <div><Label htmlFor="decision-from">{ui('الفترة التجريبية من')}</Label><Input id="decision-from" type="date" className="mt-1.5" value={form.periodFrom} onChange={(event) => setForm((current) => ({ ...current, periodFrom: event.target.value }))} /></div>
            <div><Label htmlFor="decision-to">{ui('الفترة التجريبية إلى')}</Label><Input id="decision-to" type="date" className="mt-1.5" value={form.periodTo} onChange={(event) => setForm((current) => ({ ...current, periodTo: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button><Button onClick={() => void save()} disabled={saving}>{ui('حفظ')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detail != null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent size="lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ui('تفاصيل القرار الإداري')}</DialogTitle></DialogHeader>
          {detail ? <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
            <Detail label={ui('اسم الموظف')} value={detail.empName} /><Detail label={ui('الإدارة')} value={detail.edaraName} />
            <Detail label={ui('القسم')} value={detail.qsmName} /><Detail label={ui('المسمى الوظيفي')} value={detail.jobTitleName} />
            <Detail label={ui('الراتب الأساسي')} value={detail.salary} /><Detail label={ui('إجمالي الراتب')} value={detail.totalSalary} />
            <Detail label={ui('تاريخ مباشرة العمل')} value={detail.workDate} /><Detail label={ui('الفترة التجريبية')} value={`${detail.periodFrom ?? '—'} — ${detail.periodTo ?? '—'}`} />
          </div> : null}
          <DialogFooter><Button variant="outline" onClick={() => setDetail(null)}>{ui('إغلاق')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | number | null }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-medium nums">{value ?? '—'}</div></div>;
}
