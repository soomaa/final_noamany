import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText, Money } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface SalaryIncreaseRow {
  id: number;
  employeeId: number;
  employeeCode: number;
  employeeName: string;
  value: number;
  date: string;
}

function emptyForm() {
  return { employeeId: '', value: '', date: new Date().toISOString().slice(0, 10) };
}

export function SalaryIncreasesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<SalaryIncreaseRow>('payroll/salary-increases', params);
  const { data: employeeOptions = [] } = useEmployeeOptions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/payroll/salary-increases/${id}`),
    { success: ui('تم حذف زيادة الراتب'), invalidate: ['payroll/salary-increases'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (row: SalaryIncreaseRow) => {
    setEditId(row.id);
    setForm({ employeeId: String(row.employeeId), value: String(row.value), date: row.date });
    setDialogOpen(true);
  };

  const save = async () => {
    const value = Number(form.value);
    if (!form.employeeId || !form.date || !Number.isFinite(value) || value <= 0) {
      toast.error(ui('يرجى اختيار الموظف والتاريخ وإدخال مقدار زيادة صحيح'));
      return;
    }
    setSaving(true);
    try {
      const payload = { employeeId: Number(form.employeeId), value, date: form.date };
      if (editId != null) await api.patch(`/payroll/salary-increases/${editId}`, payload);
      else await api.post('/payroll/salary-increases', payload);
      toast.success(editId != null ? ui('تم تعديل زيادة الراتب') : ui('تمت إضافة زيادة الراتب'));
      setDialogOpen(false);
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: SalaryIncreaseRow) => {
    const ok = await confirm({
      title: ui('حذف زيادة الراتب'),
      description: `${ui('سيتم حذف زيادة الموظف')} «${row.employeeName}» ${ui('بقيمة')} ${row.value}.`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns = useMemo<ColumnDef<SalaryIncreaseRow>[]>(() => [
    { accessorKey: 'id', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    { accessorKey: 'date', header: ui('تاريخ الزيادة'), cell: ({ getValue }) => <DateText value={getValue() as string} /> },
    { accessorKey: 'employeeCode', header: ui('كود الموظف'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span> },
    { accessorKey: 'employeeName', header: ui('اسم الموظف') },
    { accessorKey: 'value', header: ui('مقدار الزيادة'), cell: ({ getValue }) => <Money value={getValue() as number} /> },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}><Pencil className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void remove(row.original)}><Trash2 className="size-4 text-destructive" /></Button>
        </div>
      ),
    },
  ], [params.page, params.pageSize, ui]);

  return (
    <div>
      <PageHeader
        title={ui('إضافة زيادة راتب')}
        description={ui('تسجيل الزيادات الدائمة على رواتب الموظفين؛ وتدخل تلقائيًا في كل مسير راتب لاحق.')}
        actions={<Button variant="brand" size="sm" onClick={openCreate}><Plus className="size-4" />{ui('إضافة زيادة')}</Button>}
      />
      <FilterBar searchPlaceholder={ui('بحث باسم الموظف أو الكود…')} />
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
        emptyTitle={ui('لا توجد زيادات رواتب مسجلة')}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editId != null ? ui('تعديل زيادة راتب') : ui('إضافة زيادة راتب')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{ui('اسم الموظف')}</Label>
              <Combobox value={form.employeeId} onValueChange={(employeeId) => setForm((current) => ({ ...current, employeeId }))} options={employeeOptions} placeholder={ui('اختر الموظف…')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="increase-date">{ui('تاريخ الزيادة')}</Label><Input id="increase-date" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="increase-value">{ui('مقدار الزيادة')}</Label><Input id="increase-value" type="number" min="0.01" step="1" className="nums" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>{ui('إلغاء')}</Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>{saving ? ui('جارٍ الحفظ…') : ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
