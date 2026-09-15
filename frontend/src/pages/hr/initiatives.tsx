import type { ColumnDef } from '@tanstack/react-table';
import { Check, Lightbulb, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge, type StatusKey } from '@/components/common/status-badge';
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
import { Textarea } from '@/components/ui/textarea';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

type InitiativeStatus = 'approved' | 'rejected' | 'pending';

interface InitiativeRow {
  id: number;
  employeeName?: string;
  empId?: number | null;
  title?: string | null;
  notes?: string | null;
  forMonth?: number | null;
  forYear?: number | null;
  date?: string | null;
  status: InitiativeStatus;
}

const STATUS_LABEL: Record<InitiativeStatus, { key: StatusKey; label: string }> = {
  approved: { key: 'approved', label: uiStatic('معتمدة') },
  rejected: { key: 'rejected', label: uiStatic('مرفوضة') },
  pending: { key: 'pending', label: uiStatic('قيد المراجعة') },
};

export function InitiativesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<InitiativeRow>(
    'initiatives',
    params,
  );
  const { data: empOptions = [] } = useEmployeeOptions();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    empId: '',
    title: '',
    notes: '',
    forMonth: '',
    forYear: '',
  });

  const [rejectId, setRejectId] = useState<number | null>(null);
  const [radNotes, setRadNotes] = useState('');

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/initiatives/${id}`),
    { success: ui('تم حذف المبادرة'), invalidate: ['initiatives'] },
  );

  const approveMutation = useMutationWithToast(
    (id: number) => api.post(`/initiatives/${id}/approve`),
    { success: ui('تم اعتماد المبادرة'), invalidate: ['initiatives'] },
  );

  const stats = useMemo(
    () => [
      {
        title: ui('المبادرات'),
        value: toArabicDigits(data?.total ?? 0),
        icon: <Lightbulb className="size-5" />,
      },
    ],
    [data],
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ empId: '', title: '', notes: '', forMonth: '', forYear: '' });
    setFormOpen(true);
  };

  const openEdit = (row: InitiativeRow) => {
    setEditId(row.id);
    setForm({
      empId: row.empId != null ? String(row.empId) : '',
      title: row.title ?? '',
      notes: row.notes ?? '',
      forMonth: row.forMonth != null ? String(row.forMonth) : '',
      forYear: row.forYear != null ? String(row.forYear) : '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.empId || !form.title.trim()) {
      toast.error(ui('الموظف وعنوان المبادرة مطلوبان'));
      return;
    }
    try {
      const payload = {
        empId: parseInt(form.empId, 10),
        title: form.title.trim(),
        notes: form.notes.trim() || undefined,
        forMonth: form.forMonth ? parseInt(form.forMonth, 10) : undefined,
        forYear: form.forYear ? parseInt(form.forYear, 10) : undefined,
      };
      if (editId) await api.patch(`/initiatives/${editId}`, payload);
      else await api.post('/initiatives', payload);
      toast.success(ui('تم حفظ المبادرة'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const submitReject = async () => {
    if (rejectId == null) return;
    try {
      await api.post(`/initiatives/${rejectId}/reject`, {
        radNotes: radNotes.trim() || undefined,
      });
      toast.success(ui('تم رفض المبادرة'));
      setRejectId(null);
      setRadNotes('');
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: ColumnDef<InitiativeRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'title', header: ui('المبادرة') },
    {
      accessorKey: 'date',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const v = (getValue() as InitiativeStatus) ?? 'pending';
        const cfg = STATUS_LABEL[v];
        return <StatusBadge status={cfg.key} label={cfg.label} />;
      },
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => {
        const isPending = row.original.status === 'pending';
        return (
          <div className="flex gap-1">
            {isPending && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={ui('اعتماد')}
                  onClick={async () => {
                    const ok = await confirm({
                      title: ui('اعتماد المبادرة'),
                      description: ui('هل تريد اعتماد هذه المبادرة؟'),
                      confirmLabel: ui('اعتماد'),
                    });
                    if (ok) approveMutation.mutate(row.original.id);
                  }}
                >
                  <Check className="size-4 text-success" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={ui('رفض')}
                  onClick={() => {
                    setRejectId(row.original.id);
                    setRadNotes('');
                  }}
                >
                  <X className="size-4 text-destructive" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={ui('تعديل')}
              onClick={() => openEdit(row.original)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={ui('حذف')}
              onClick={async () => {
                const ok = await confirm({
                  title: ui('حذف المبادرة'),
                  description: ui('هل تريد حذف هذه المبادرة؟'),
                  confirmLabel: ui('حذف'),
                  variant: 'destructive',
                });
                if (ok) deleteMutation.mutate(row.original.id);
              }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('المبادرات')}
        description={ui('مبادرات الموظفين واعتمادها')}
        searchPlaceholder={ui('بحث في المبادرات…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('مبادرة جديدة')}
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
          emptyTitle={ui('لا توجد مبادرات')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل مبادرة') : ui('مبادرة جديدة')}</DialogTitle>
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
              <Label htmlFor="initiative-title">{ui('عنوان المبادرة')}</Label>
              <Input
                id="initiative-title"
                className="mt-1.5"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="initiative-notes">{ui('التفاصيل')}</Label>
              <Textarea
                id="initiative-notes"
                className="mt-1.5"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="initiative-month">{ui('عن شهر')}</Label>
                <Input
                  id="initiative-month"
                  type="number"
                  min={1}
                  max={12}
                  className="mt-1.5 nums"
                  value={form.forMonth}
                  onChange={(e) => setForm((f) => ({ ...f, forMonth: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="initiative-year">{ui('عن سنة')}</Label>
                <Input
                  id="initiative-year"
                  type="number"
                  className="mt-1.5 nums"
                  value={form.forYear}
                  onChange={(e) => setForm((f) => ({ ...f, forYear: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectId != null} onOpenChange={(open) => !open && setRejectId(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('رفض المبادرة')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reject-notes">{ui('سبب الرفض')}</Label>
              <Textarea
                id="reject-notes"
                className="mt-1.5"
                rows={3}
                value={radNotes}
                onChange={(e) => setRadNotes(e.target.value)}
                placeholder={ui('اكتب سبب رفض المبادرة…')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>
              {ui('إلغاء')}
            </Button>
            <Button variant="destructive" onClick={() => void submitReject()}>
              {ui('رفض')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
