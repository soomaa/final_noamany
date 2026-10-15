import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface ArchiveRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
}

export function ArchivePage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ArchiveRow>('termination/archive', params);
  const { data: empOptions = [] } = useEmployeeOptions();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ empId: '', fromDate: '', toDate: '' });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/termination/archive/${id}`),
    { success: ui('تم حذف السجل'), invalidate: ['termination/archive'] },
  );

  const stats = useMemo(
    () => [{ title: ui('سجلات طي القيد'), value: toArabicDigits(data?.total ?? 0), icon: <Archive className="size-5" /> }],
    [data],
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ empId: '', fromDate: '', toDate: '' });
    setFormOpen(true);
  };

  const openEdit = async (row: ArchiveRow) => {
    setEditId(row.id);
    setForm({ empId: '', fromDate: row.title ?? '', toDate: row.createdAt ?? '' });
    setFormOpen(true);
    try {
      const { data: detail } = await api.get<{ empId?: number; fromDate?: string; toDate?: string }>(`/termination/archive/${row.id}`);
      setForm({
        empId: detail.empId != null ? String(detail.empId) : '',
        fromDate: detail.fromDate ?? row.title ?? '',
        toDate: detail.toDate ?? row.createdAt ?? '',
      });
    } catch {
      /* keep list row values */
    }
  };

  const save = async () => {
    if (!form.empId || !form.fromDate || !form.toDate) {
      toast.error(ui('يرجى تعبئة جميع الحقول المطلوبة'));
      return;
    }
    try {
      const payload = {
        empId: parseInt(form.empId, 10),
        fromDate: form.fromDate,
        toDate: form.toDate,
      };
      if (editId) await api.patch(`/termination/archive/${editId}`, payload);
      else await api.post('/termination/archive', payload);
      toast.success(editId ? ui('تم تحديث السجل') : ui('تم إضافة السجل'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: ColumnDef<ArchiveRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    {
      accessorKey: 'title',
      header: ui('من تاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'createdAt',
      header: ui('إلى تاريخ'),
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
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('حذف')}
            onClick={async () => {
              const ok = await confirm({
                title: ui('حذف سجل طي القيد'),
                description: ui('هل تريد حذف هذا السجل؟'),
                confirmLabel: ui('حذف'),
                variant: 'destructive',
              });
              if (ok) deleteMutation.mutate(row.original.id);
            }}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('طي القيد')}
        description={ui('أرشيف وطي قيد الموظفين')}
        searchPlaceholder={ui('بحث في طي القيد…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('سجل جديد')}
          </Button>
        }
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
          emptyTitle={ui('لا توجد سجلات')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل سجل طي القيد') : ui('سجل طي قيد جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{ui('الموظف')}</Label>
              <div className="mt-1.5">
                <Combobox
                  value={form.empId}
                  onValueChange={(empId) => setForm((f) => ({ ...f, empId }))}
                  options={empOptions}
                  placeholder={ui('اختر الموظف…')}
                  searchPlaceholder={ui('بحث في الموظفين…')}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="arch-from">{ui('من تاريخ')}</Label>
              <Input id="arch-from" type="date" className="mt-1.5" value={form.fromDate} onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="arch-to">{ui('إلى تاريخ')}</Label>
              <Input id="arch-to" type="date" className="mt-1.5" value={form.toDate} onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void save()}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
