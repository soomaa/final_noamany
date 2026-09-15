import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Check, Eye, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { EmployeeListItem } from '@/types/employees';

interface RewardDetail {
  id: number;
  employeeId?: number | null;
  empCode?: number | null;
  employeeName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  administration?: string | null;
  value: number;
  option?: string | null;
}

interface RewardRow {
  id: number;
  mokafaRkm: number;
  date?: string;
  month?: number;
  recipientType?: number;
  totalValue?: number;
  employeeCount?: number;
  title?: string;
  value?: number;
  option?: string | null;
  employeeIds?: number[];
  details?: RewardDetail[];
  status?: string;
}

interface RewardForm {
  date: string;
  month: string;
  title: string;
  option: string;
  value: string;
  recipientType: string;
  employeeIds: number[];
}

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const emptyForm = (): RewardForm => {
  const today = new Date();
  return {
    date: today.toISOString().slice(0, 10),
    month: String(today.getMonth() + 1),
    title: '',
    option: '',
    value: '',
    recipientType: '',
    employeeIds: [],
  };
};

export function RewardsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<RewardRow>('rewards', params);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailsRow, setDetailsRow] = useState<RewardRow | null>(null);
  const [editing, setEditing] = useState<RewardRow | null>(null);
  const [form, setForm] = useState<RewardForm>(emptyForm);
  const [employeeSearch, setEmployeeSearch] = useState('');

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'reward-options'],
    queryFn: () => fetchAllReportRows<EmployeeListItem>('/employees', { status: 1 }, 200),
    staleTime: 60_000,
  });
  const { data: nextNumber, refetch: refetchNextNumber } = useQuery({
    queryKey: ['rewards', 'next-number'],
    queryFn: async () => (await api.get<{ value: number }>('/rewards/next-number')).data.value,
  });

  const filteredEmployees = useMemo(() => {
    const search = employeeSearch.trim().toLocaleLowerCase('ar');
    if (!search) return employees;
    return employees.filter((employee) =>
      `${employee.employee} ${employee.emp_code}`.toLocaleLowerCase('ar').includes(search),
    );
  }, [employeeSearch, employees]);

  const statusTabs = [
    { value: '', label: ui('كل المكافآت') },
    { value: 'pending', label: ui('قيد المراجعة') },
    { value: 'approved', label: ui('المقبولة') },
    { value: 'rejected', label: ui('المرفوضة') },
  ];
  const monthOptions = MONTHS.map((label, index) => ({ value: String(index + 1), label: ui(label) }));
  const optionOptions = [
    { value: 'rateb', label: ui('مع الراتب') },
    { value: 'alone', label: ui('كشف منفصل') },
  ];
  const recipientOptions = [
    { value: '2', label: ui('بعض الموظفين') },
    { value: '3', label: ui('كل الموظفين') },
  ];

  const remove = useMutationWithToast((id: number) => api.delete(`/rewards/${id}`), {
    success: ui('تم حذف المكافأة'),
    invalidate: ['rewards'],
  });
  const approve = useMutationWithToast((id: number) => api.patch(`/rewards/${id}/approve`), {
    success: ui('تم اعتماد المكافأة'),
    invalidate: ['rewards'],
  });
  const reject = useMutationWithToast((id: number) => api.patch(`/rewards/${id}/reject`), {
    success: ui('تم رفض المكافأة'),
    invalidate: ['rewards'],
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setEmployeeSearch('');
    void refetchNextNumber();
    setDialogOpen(true);
  };

  const openEdit = (row: RewardRow) => {
    setEditing(row);
    setForm({
      date: row.date ?? new Date().toISOString().slice(0, 10),
      month: String(row.month ?? new Date().getMonth() + 1),
      title: row.title ?? '',
      option: row.option ?? '',
      value: String(row.value ?? ''),
      recipientType: String(row.recipientType ?? 2),
      employeeIds: row.employeeIds ?? [],
    });
    setEmployeeSearch('');
    setDialogOpen(true);
  };

  const toggleEmployee = (employeeId: number, checked: boolean) => {
    setForm((current) => ({
      ...current,
      employeeIds: checked
        ? [...new Set([...current.employeeIds, employeeId])]
        : current.employeeIds.filter((id) => id !== employeeId),
    }));
  };

  const save = async () => {
    const value = Number(form.value);
    if (!form.date || !form.month || !form.option || !form.recipientType || !form.value || !Number.isFinite(value) || value < 0) {
      toast.error(ui('يرجى استكمال تاريخ المكافأة والشهر والفئة والقيمة والموظفين'));
      return;
    }
    if (form.recipientType === '2' && form.employeeIds.length === 0) {
      toast.error(ui('يرجى اختيار موظف واحد على الأقل'));
      return;
    }

    const payload = {
      title: form.title.trim(),
      date: form.date,
      month: Number(form.month),
      option: form.option,
      value,
      recipientType: Number(form.recipientType),
      employeeIds: form.recipientType === '2' ? form.employeeIds : [],
    };
    try {
      if (editing) {
        await api.patch(`/rewards/${editing.mokafaRkm}`, payload);
        toast.success(ui('تم تعديل المكافأة'));
      } else {
        await api.post('/rewards', payload);
        toast.success(ui('تم تسجيل المكافأة'));
      }
      setDialogOpen(false);
      await Promise.all([refetch(), refetchNextNumber()]);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const handleDelete = async (row: RewardRow) => {
    if (await confirm({
      title: ui('حذف المكافأة'),
      description: `${ui('هل تريد حذف طلب المكافأة رقم')} ${toArabicDigits(row.mokafaRkm)}؟`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    })) remove.mutate(row.mokafaRkm);
  };

  const columns: ColumnDef<RewardRow>[] = [
    { id: 'sequence', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    { accessorKey: 'mokafaRkm', header: ui('رقم المكافأة'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
    { accessorKey: 'date', header: ui('تاريخ المكافأة'), cell: ({ getValue }) => <DateText value={getValue() as string | undefined} /> },
    { accessorKey: 'month', header: ui('خلال شهر'), cell: ({ getValue }) => ui(MONTHS[(Number(getValue()) || 1) - 1] ?? '—') },
    { accessorKey: 'recipientType', header: ui('مكافأة إلى'), cell: ({ getValue }) => Number(getValue()) === 3 ? ui('كل الموظفين') : ui('بعض الموظفين') },
    { accessorKey: 'totalValue', header: ui('إجمالي القيمة'), cell: ({ getValue }) => <Money value={getValue() as number | undefined} /> },
    { accessorKey: 'title', header: ui('عبارة عن'), cell: ({ getValue }) => (getValue() as string) || '—' },
    { accessorKey: 'status', header: ui('الحالة'), cell: ({ getValue }) => {
      const status = getValue() as string | undefined;
      return <StatusBadge status={status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'} />;
    } },
    { id: 'actions', header: ui('الإجراءات'), cell: ({ row }) => {
      const reward = row.original;
      const pending = reward.status !== 'approved' && reward.status !== 'rejected';
      return <div className="flex flex-wrap gap-1">
        {pending && <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(reward)}><Pencil className="size-4" /></Button>}
        <Button variant="ghost" size="icon" aria-label={ui('التفاصيل')} onClick={() => setDetailsRow(reward)}><Eye className="size-4 text-sky-500" /></Button>
        {pending && <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(reward)}><Trash2 className="size-4 text-destructive" /></Button>}
        {pending && <Button variant="ghost" size="icon" aria-label={ui('اعتماد')} onClick={() => approve.mutate(reward.mokafaRkm)}><Check className="size-4 text-emerald-500" /></Button>}
        {pending && <Button variant="ghost" size="icon" aria-label={ui('رفض')} onClick={() => reject.mutate(reward.mokafaRkm)}><X className="size-4 text-amber-500" /></Button>}
      </div>;
    } },
  ];

  if (isError && isNotImplemented(error)) {
    return <div><PageHeader title={ui('المكافآت')} /><NotImplementedState title={ui('المكافآت قيد الإعداد على الخادم')} /></div>;
  }

  return <div>
    <PageHeader
      title={ui('المكافآت')}
      description={ui('تسجيل ومتابعة طلبات صرف مكافآت الموظفين')}
      actions={<Button variant="brand" size="sm" onClick={openCreate}><Plus className="size-4" /> {ui('طلب صرف مكافأة')}</Button>}
    />
    <ListStatusTabs tabs={statusTabs} />
    <FilterBar searchPlaceholder={ui('بحث برقم المكافأة أو البيان…')} />
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
      emptyTitle={ui('لا توجد مكافآت')}
    />

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{editing ? ui('تعديل طلب المكافأة') : ui('طلب صرف مكافأة')}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>{ui('رقم المكافأة')}</Label><Input className="mt-1.5 nums" value={toArabicDigits(editing?.mokafaRkm ?? nextNumber ?? '')} readOnly /></div>
          <div><Label>{ui('تاريخ المكافأة')}</Label><Input type="date" className="mt-1.5 nums" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></div>
          <div><Label>{ui('خلال شهر')}</Label><div className="mt-1.5"><Combobox value={form.month} onValueChange={(month) => setForm((current) => ({ ...current, month }))} options={monthOptions} placeholder={ui('اختر الشهر…')} /></div></div>
          <div><Label>{ui('الفئة')}</Label><div className="mt-1.5"><Combobox value={form.option} onValueChange={(option) => setForm((current) => ({ ...current, option }))} options={optionOptions} placeholder={ui('اختر طريقة الصرف…')} /></div></div>
          <div className="sm:col-span-2"><Label>{ui('عبارة عن')}</Label><Input className="mt-1.5" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
          <div><Label>{ui('قيمة المكافأة لكل موظف')}</Label><Input type="number" min="0" step="any" className="mt-1.5 nums" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} /></div>
          <div><Label>{ui('مكافأة إلى')}</Label><div className="mt-1.5"><Combobox value={form.recipientType} onValueChange={(recipientType) => setForm((current) => ({ ...current, recipientType, employeeIds: recipientType === '3' ? [] : current.employeeIds }))} options={recipientOptions} placeholder={ui('اختر الموظفين…')} /></div></div>

          {form.recipientType === '2' && <div className="sm:col-span-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Label>{ui('الموظفون')} ({toArabicDigits(form.employeeIds.length)})</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, employeeIds: current.employeeIds.length === employees.length ? [] : employees.map((employee) => employee.id) }))}>
                {form.employeeIds.length === employees.length ? ui('إلغاء تحديد الكل') : ui('تحديد الكل')}
              </Button>
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <Input value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder={ui('بحث بالاسم أو الكود…')} />
              <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pe-1 sm:grid-cols-2">
                {filteredEmployees.map((employee) => <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted/50">
                  <Checkbox checked={form.employeeIds.includes(employee.id)} onCheckedChange={(checked) => toggleEmployee(employee.id, checked === true)} />
                  <span className="min-w-0 truncate">{employee.employee} ({toArabicDigits(employee.emp_code)})</span>
                </label>)}
              </div>
            </div>
          </div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>{ui('إلغاء')}</Button><Button variant="brand" onClick={() => void save()}>{ui('حفظ')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!detailsRow} onOpenChange={(open) => { if (!open) setDetailsRow(null); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{ui('تفاصيل المكافأة رقم')} {toArabicDigits(detailsRow?.mokafaRkm ?? '')}</DialogTitle></DialogHeader>
        {detailsRow && <div className="space-y-4">
          <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-3">
            <div><span className="text-muted-foreground">{ui('التاريخ')}:</span> <DateText value={detailsRow.date} /></div>
            <div><span className="text-muted-foreground">{ui('خلال شهر')}:</span> {ui(MONTHS[(detailsRow.month ?? 1) - 1] ?? '—')}</div>
            <div><span className="text-muted-foreground">{ui('الفئة')}:</span> {detailsRow.option === 'alone' ? ui('كشف منفصل') : ui('مع الراتب')}</div>
            <div className="sm:col-span-2"><span className="text-muted-foreground">{ui('عبارة عن')}:</span> {detailsRow.title || '—'}</div>
            <div><span className="text-muted-foreground">{ui('إجمالي القيمة')}:</span> <Money value={detailsRow.totalValue} /></div>
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-sm font-semibold"><span>{ui('الموظف')}</span><span>{ui('الكود')}</span><span>{ui('القيمة')}</span></div>
            {(detailsRow.details ?? []).map((detail) => <div key={detail.id} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b px-3 py-2 text-sm last:border-b-0">
              <span>{detail.employeeName || '—'}</span><span className="nums">{toArabicDigits(detail.empCode ?? '')}</span><Money value={detail.value} />
            </div>)}
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
