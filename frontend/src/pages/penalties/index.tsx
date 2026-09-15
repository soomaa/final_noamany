import type { ColumnDef } from '@tanstack/react-table';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText, Money } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { ListStatusTabs } from '@/components/common/list-status-tabs';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface PenaltyRow {
  id: number;
  empId?: number;
  employeeName?: string;
  title?: string;
  amount?: number;
  date?: string;
  month?: number;
  year?: number;
  gezaType?: number;
  status?: string;
}

interface PenaltyForm {
  empId: string;
  gezaType: string;
  amount: string;
  date: string;
  title: string;
}

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
const emptyForm = (): PenaltyForm => ({
  empId: '',
  gezaType: '',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  title: '',
});

export function PenaltiesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<PenaltyRow>('penalties', params);
  const { data: employeeOptions = [] } = useEmployeeOptions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PenaltyRow | null>(null);
  const [form, setForm] = useState<PenaltyForm>(emptyForm);

  const statusTabs = [
    { value: '', label: ui('كل الجزاءات') },
    { value: 'pending', label: ui('قيد المراجعة') },
    { value: 'approved', label: ui('المقبولة') },
    { value: 'rejected', label: ui('المرفوضة') },
  ];
  const penaltyTypes = [
    { value: '1', label: ui('يوم') },
    { value: '2', label: ui('مبلغ') },
  ];

  const remove = useMutationWithToast((id: number) => api.delete(`/penalties/${id}`), {
    success: ui('تم حذف الجزاء'),
    invalidate: ['penalties'],
  });
  const approve = useMutationWithToast((id: number) => api.patch(`/penalties/${id}/approve`), {
    success: ui('تم اعتماد الجزاء'),
    invalidate: ['penalties'],
  });
  const reject = useMutationWithToast((id: number) => api.patch(`/penalties/${id}/reject`), {
    success: ui('تم رفض الجزاء'),
    invalidate: ['penalties'],
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };
  const openEdit = (row: PenaltyRow) => {
    setEditing(row);
    setForm({
      empId: String(row.empId ?? ''),
      gezaType: String(row.gezaType ?? ''),
      amount: String(row.amount ?? ''),
      date: row.date ?? new Date().toISOString().slice(0, 10),
      title: row.title ?? '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    const amount = Number(form.amount);
    if (!form.empId || !form.gezaType || !form.date || !form.amount || !Number.isFinite(amount) || amount < 0) {
      toast.error(ui('يرجى استكمال التاريخ والموظف ونوع الجزاء والقيمة الصحيحة'));
      return;
    }
    const payload = {
      empId: Number(form.empId),
      gezaType: Number(form.gezaType),
      amount: String(amount),
      date: form.date,
      title: form.title.trim(),
    };
    try {
      if (editing) {
        await api.patch(`/penalties/${editing.id}`, payload);
        toast.success(ui('تم تعديل الجزاء'));
      } else {
        await api.post('/penalties', payload);
        toast.success(ui('تم تسجيل الجزاء وهو قيد الانتظار'));
      }
      setDialogOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const handleDelete = async (row: PenaltyRow) => {
    if (await confirm({
      title: ui('حذف الجزاء'),
      description: `${ui('هل تريد حذف جزاء')} «${row.employeeName ?? ui('الموظف')}»؟`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    })) remove.mutate(row.id);
  };

  const columns: ColumnDef<PenaltyRow>[] = [
    { id: 'sequence', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    { accessorKey: 'date', header: ui('التاريخ'), cell: ({ getValue }) => <DateText value={getValue() as string | undefined} /> },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'month', header: ui('خلال شهر'), cell: ({ getValue }) => ui(MONTHS[(Number(getValue()) || 1) - 1] ?? '—') },
    { accessorKey: 'gezaType', header: ui('نوع الجزاء'), cell: ({ getValue }) => Number(getValue()) === 1 ? ui('يوم') : ui('مبلغ') },
    { accessorKey: 'amount', header: ui('قيمة الجزاء'), cell: ({ row, getValue }) => row.original.gezaType === 1 ? `${toArabicDigits(getValue() as number)} ${ui('يوم')}` : <Money value={getValue() as number | undefined} /> },
    { accessorKey: 'title', header: ui('التفاصيل'), cell: ({ getValue }) => (getValue() as string) || '—' },
    { accessorKey: 'status', header: ui('الحالة'), cell: ({ getValue }) => {
      const status = getValue() as string | undefined;
      return <StatusBadge status={status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'} />;
    } },
    { id: 'actions', header: ui('الإجراءات'), cell: ({ row }) => {
      const penalty = row.original;
      const pending = penalty.status !== 'approved' && penalty.status !== 'rejected';
      return <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(penalty)}><Pencil className="size-4" /></Button>
        <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(penalty)}><Trash2 className="size-4 text-destructive" /></Button>
        {pending && <Button variant="ghost" size="icon" aria-label={ui('اعتماد')} onClick={() => approve.mutate(penalty.id)}><Check className="size-4 text-emerald-500" /></Button>}
        {pending && <Button variant="ghost" size="icon" aria-label={ui('رفض')} onClick={() => reject.mutate(penalty.id)}><X className="size-4 text-amber-500" /></Button>}
      </div>;
    } },
  ];

  if (isError && isNotImplemented(error)) {
    return <div><PageHeader title={ui('الجزاءات')} /><NotImplementedState title={ui('الجزاءات قيد الإعداد على الخادم')} /></div>;
  }

  return <div>
    <PageHeader
      title={ui('الجزاءات')}
      description={ui('تسجيل ومتابعة جزاءات الموظفين')}
      actions={<Button variant="brand" size="sm" onClick={openCreate}><Plus className="size-4" /> {ui('طلب جزاء')}</Button>}
    />
    <ListStatusTabs tabs={statusTabs} />
    <FilterBar searchPlaceholder={ui('بحث باسم الموظف أو التفاصيل…')} />
    <DataTable
      columns={columns}
      data={data?.data ?? []}
      total={data?.total ?? 0}
      page={params.page}
      pageSize={params.pageSize}
      onPageChange={(page) => setParams({ page })}
      onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      search={params.search}
      onSearchChange={(search) => setParams({ search, page: 1 })}
      emptyTitle={ui('لا توجد جزاءات')}
    />

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-2xl" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{editing ? ui('تعديل الجزاء') : ui('طلب جزاء لموظف')}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>{ui('تاريخ الجزاء')}</Label><Input type="date" className="mt-1.5 nums" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></div>
          <div><Label>{ui('الموظف')}</Label><div className="mt-1.5"><Combobox value={form.empId} onValueChange={(empId) => setForm((current) => ({ ...current, empId }))} options={employeeOptions} placeholder={ui('اختر الموظف…')} searchPlaceholder={ui('بحث بالاسم أو الكود…')} /></div></div>
          <div><Label>{ui('نوع الجزاء')}</Label><div className="mt-1.5"><Combobox value={form.gezaType} onValueChange={(gezaType) => setForm((current) => ({ ...current, gezaType }))} options={penaltyTypes} placeholder={ui('اختر النوع…')} /></div></div>
          <div><Label>{form.gezaType === '1' ? ui('عدد الأيام') : ui('قيمة الجزاء')}</Label><Input type="number" min="0" step="any" className="mt-1.5 nums" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></div>
          <div className="sm:col-span-2"><Label>{ui('التفاصيل')}</Label><Textarea className="mt-1.5" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>{ui('إلغاء')}</Button><Button variant="brand" onClick={() => void save()}>{ui('حفظ')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
