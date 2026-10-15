import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm, confirmWithPreview } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface WeeklyLeaveRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
  empId?: number;
}

const OFF_DAYS = [
  { value: 'Sunday', label: uiStatic('الأحد') },
  { value: 'Monday', label: uiStatic('الإثنين') },
  { value: 'Tuesday', label: uiStatic('الثلاثاء') },
  { value: 'Wednesday', label: uiStatic('الأربعاء') },
  { value: 'Thursday', label: uiStatic('الخميس') },
  { value: 'Friday', label: uiStatic('الجمعة') },
  { value: 'Saturday', label: uiStatic('السبت') },
] as const;

const OFF_DAY_LABELS = Object.fromEntries(OFF_DAYS.map((d) => [d.value, d.label]));

export function WeeklyLeavesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<WeeklyLeaveRow>('weekly-leaves', params);
  const { data: employeeOptions = [] } = useEmployeeOptions();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ empId: '', offDay: '' });
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/weekly-leaves/${id}`),
    { success: ui('تم حذف الإجازة الأسبوعية'), invalidate: ['weekly-leaves'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ empId: '', offDay: '' });
    setFormOpen(true);
  };

  const openEdit = (row: WeeklyLeaveRow) => {
    setEditId(row.id);
    setForm({
      empId: row.empId != null ? String(row.empId) : '',
      offDay: row.title ?? '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.empId || !form.offDay) {
      toast.error(ui('يرجى اختيار الموظف ويوم الإجازة'));
      return;
    }
    setSaving(true);
    try {
      const payload = { empId: Number(form.empId), offDay: form.offDay };
      const commit = async () => {
        if (editId) await api.patch(`/weekly-leaves/${editId}`, payload);
        else await api.post('/weekly-leaves', payload);
        toast.success(editId ? ui('تم تحديث الإجازة الأسبوعية') : ui('تم إضافة الإجازة الأسبوعية'));
        setFormOpen(false);
        void refetch();
      };
      if (!editId) {
        await confirmWithPreview(
          { title: ui('إضافة إجازة أسبوعية'), confirmLabel: ui('حفظ') },
          async () => {
            const { data } = await api.post('/weekly-leaves?dryRun=true', payload);
            return { rows: (data as { rows?: { label: string; before?: string; after?: string }[] }).rows, warning: (data as { warning?: string }).warning };
          },
          commit,
        );
      } else {
        await commit();
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: WeeklyLeaveRow) => {
    const ok = await confirm({
      title: ui('حذف الإجازة الأسبوعية'),
      description: `${ui('هل تريد حذف إجازة «')}${row.employeeName ?? ui('الموظف')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<WeeklyLeaveRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف'), cell: ({ getValue }) => getValue() ?? '—' },
    {
      accessorKey: 'title',
      header: ui('يوم الإجازة'),
      cell: ({ getValue }) => OFF_DAY_LABELS[getValue() as string] ?? (getValue() as string) ?? '—',
    },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('إجازات الموظفين الأسبوعية')}
        description={ui('متابعة أيام الإجازة الأسبوعية لكل موظف')}
        searchPlaceholder={ui('بحث بالموظف أو يوم الإجازة…')}
        isError={isError}
        error={error}
        notImplementedTitle={ui('إجازات الموظفين الأسبوعية — قيد الإعداد على الخادم')}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('إجازة أسبوعية جديدة')}
          </Button>
        }
        stats={[
          {
            title: ui('إجمالي السجلات'),
            value: data?.total ?? 0,
            subtitle: ui('موظفون لديهم يوم إجازة أسبوعي'),
            icon: <CalendarDays className="size-5" />,
          },
        ]}
        statsLoading={isLoading}
      >
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          total={data?.total ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={(p) => setParams({ page: p })}
          onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          search={params.search}
          onSearchChange={(s) => setParams({ search: s, page: 1 })}
          emptyTitle={ui('لا توجد إجازات أسبوعية')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل إجازة أسبوعية') : ui('إجازة أسبوعية جديدة')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="wl-emp">{ui('الموظف')}</Label>
              <Combobox
                id="wl-emp"
                className="mt-1.5"
                value={form.empId}
                onValueChange={(v) => setForm((f) => ({ ...f, empId: v }))}
                options={employeeOptions}
                placeholder={ui('اختر الموظف…')}
                searchPlaceholder={ui('بحث بالاسم أو الكود…')}
              />
            </div>
            <div>
              <Label htmlFor="wl-day">{ui('يوم الإجازة')}</Label>
              <Select value={form.offDay} onValueChange={(v) => setForm((f) => ({ ...f, offDay: v }))}>
                <SelectTrigger id="wl-day" className="mt-1.5">
                  <SelectValue placeholder={ui('اختر اليوم…')} />
                </SelectTrigger>
                <SelectContent>
                  {OFF_DAYS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
