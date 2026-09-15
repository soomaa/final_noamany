import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
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

interface MissionRow {
  id: number;
  name: string;
  missionDate: string;
  employeeId: number;
  employeeName: string;
  details: string;
}

interface MissionForm {
  name: string;
  missionDate: string;
  empId: string;
  details: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (): MissionForm => ({ name: '', missionDate: today(), empId: '', details: '' });

export function MissionsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<MissionRow>('missions', params);
  const { data: employeeOptions = [] } = useEmployeeOptions();

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<MissionForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (row: MissionRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      missionDate: row.missionDate,
      empId: String(row.employeeId),
      details: row.details,
    });
    setFormOpen(true);
  };

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/missions/${id}`),
    { success: ui('تم حذف المهمة'), invalidate: ['missions'] },
  );

  const save = async () => {
    if (!form.name.trim() || !form.missionDate || !form.empId || !form.details.trim()) {
      toast.error(ui('اسم المهمة والتاريخ والموظف وتفاصيل المهمة حقول مطلوبة'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        missionDate: form.missionDate,
        empId: Number(form.empId),
        details: form.details.trim(),
      };
      if (editingId) await api.patch(`/missions/${editingId}`, payload);
      else await api.post('/missions', payload);
      toast.success(editingId ? ui('تم تعديل المهمة') : ui('تمت إضافة المهمة'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: MissionRow) => {
    const ok = await confirm({
      title: ui('حذف المهمة'),
      description: `${ui('هل تريد حذف مهمة «')}${row.name}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<MissionRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      accessorKey: 'missionDate',
      header: ui('تاريخ المهمة'),
      cell: ({ getValue }) => <DateText value={getValue() as string} />,
    },
    { accessorKey: 'name', header: ui('اسم المهمة') },
    { accessorKey: 'employeeName', header: ui('اسم الموظف') },
    {
      accessorKey: 'details',
      header: ui('تفاصيل المهمة'),
      cell: ({ getValue }) => <div className="max-w-md whitespace-pre-wrap">{getValue() as string}</div>,
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

  if (isError && isNotImplemented(error)) {
    return <div><PageHeader title={ui('مهام العمل')} /><NotImplementedState title={ui('مهام العمل قيد الإعداد على الخادم')} /></div>;
  }

  return (
    <>
      <PageHeader
        title={ui('مهام العمل')}
        description={ui('إضافة ومتابعة مهام الموظفين')}
        actions={<Button variant="brand" size="sm" onClick={openCreate}><Plus className="size-4" /> {ui('إضافة مهمة عمل')}</Button>}
      />
      <FilterBar searchPlaceholder={ui('بحث باسم المهمة أو الموظف أو تفاصيل المهمة…')} />
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
        emptyTitle={ui('لا توجد مهام عمل')}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-5xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editingId ? ui('تعديل مهمة عمل') : ui('إضافة مهمة عمل')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="mission-name">{ui('اسم المهمة *')}</Label>
                <Input id="mission-name" value={form.name} onChange={(e) => setForm((old) => ({ ...old, name: e.target.value }))} />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="mission-date">{ui('تاريخ المهمة *')}</Label>
                <Input id="mission-date" type="date" value={form.missionDate} onChange={(e) => setForm((old) => ({ ...old, missionDate: e.target.value }))} />
              </div>
              <div className="min-w-0 space-y-2">
                <Label>{ui('اسم الموظف *')}</Label>
                <Combobox options={employeeOptions} value={form.empId} onValueChange={(empId) => setForm((old) => ({ ...old, empId }))} placeholder={ui('اختر الموظف')} searchPlaceholder={ui('بحث في الموظفين…')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mission-details">{ui('تفاصيل المهمة *')}</Label>
              <Textarea
                id="mission-details"
                className="min-h-40 resize-y"
                value={form.details}
                onChange={(e) => setForm((old) => ({ ...old, details: e.target.value }))}
                placeholder={ui('اكتب تفاصيل المهمة…')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>{ui('إلغاء')}</Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>{saving ? ui('جارٍ الحفظ…') : ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
