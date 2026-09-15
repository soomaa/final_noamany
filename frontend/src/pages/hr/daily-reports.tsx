import type { ColumnDef } from '@tanstack/react-table';
import { Check, FileText, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
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

interface DailyReportRow {
  id: number;
  employeeName?: string;
  empId?: number | null;
  title?: string | null;
  status?: string | null;
  notes?: string | null;
  forMonth?: number | null;
  forYear?: number | null;
  suspend?: number | null;
  radNotes?: string | null;
  sendDate?: string | null;
  sendTime?: string | null;
}

const STATUS_OPTIONS = [
  { value: 'inprogress', label: uiStatic('قيد التنفيذ') },
  { value: 'done', label: uiStatic('منجز') },
];

const emptyForm = {
  empId: '',
  title: '',
  notes: '',
  status: 'inprogress',
  forMonth: '',
  forYear: '',
};

export function DailyReportsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<DailyReportRow>(
    'hr/daily-reports',
    params,
  );
  const { data: empOptions = [] } = useEmployeeOptions();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/hr/daily-reports/${id}`),
    { success: ui('تم حذف التقرير'), invalidate: ['hr/daily-reports'] },
  );

  const approveMutation = useMutationWithToast(
    (id: number) => api.post(`/hr/daily-reports/${id}/approve`),
    { success: ui('تم اعتماد التقرير'), invalidate: ['hr/daily-reports'] },
  );

  const stats = useMemo(
    () => [
      {
        title: ui('التقارير اليومية'),
        value: toArabicDigits(data?.total ?? 0),
        icon: <FileText className="size-5" />,
      },
    ],
    [data],
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setFormOpen(true);
  };

  const openEdit = (row: DailyReportRow) => {
    setEditId(row.id);
    setForm({
      empId: row.empId != null ? String(row.empId) : '',
      title: row.title ?? '',
      notes: row.notes ?? '',
      status: row.status ?? 'inprogress',
      forMonth: row.forMonth != null ? String(row.forMonth) : '',
      forYear: row.forYear != null ? String(row.forYear) : '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.empId || !form.title.trim()) {
      toast.error(ui('الموظف وعنوان التقرير مطلوبان'));
      return;
    }
    try {
      const payload = {
        empId: parseInt(form.empId, 10),
        title: form.title,
        notes: form.notes || undefined,
        status: form.status,
        forMonth: form.forMonth ? parseInt(form.forMonth, 10) : undefined,
        forYear: form.forYear ? parseInt(form.forYear, 10) : undefined,
      };
      if (editId) await api.patch(`/hr/daily-reports/${editId}`, payload);
      else await api.post('/hr/daily-reports', payload);
      toast.success(ui('تم حفظ التقرير'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const openReject = (id: number) => {
    setRejectId(id);
    setRejectNotes('');
    setRejectOpen(true);
  };

  const submitReject = async () => {
    if (rejectId == null) return;
    try {
      await api.post(`/hr/daily-reports/${rejectId}/reject`, { radNotes: rejectNotes || undefined });
      toast.success(ui('تم رفض التقرير'));
      setRejectOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: ColumnDef<DailyReportRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'title', header: ui('العنوان') },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const v = getValue() as string | undefined;
        return v === 'done' ? (
          <StatusBadge status="approved" label={ui('منجز')} />
        ) : (
          <StatusBadge status="pending" label={ui('قيد التنفيذ')} />
        );
      },
    },
    {
      accessorKey: 'sendDate',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('اعتماد')}
            onClick={async () => {
              const ok = await confirm({
                title: ui('اعتماد التقرير'),
                description: ui('هل تريد اعتماد هذا التقرير؟'),
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
            onClick={() => openReject(row.original.id)}
          >
            <X className="size-4 text-destructive" />
          </Button>
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
                title: ui('حذف التقرير'),
                description: ui('هل تريد حذف هذا التقرير؟'),
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
        title={ui('التقارير اليومية')}
        description={ui('تقارير الأداء اليومية للموظفين')}
        searchPlaceholder={ui('بحث في العناوين والملاحظات…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('تقرير جديد')}
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
          emptyTitle={ui('لا توجد تقارير')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل تقرير') : ui('تقرير جديد')}</DialogTitle>
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
              <Label htmlFor="report-title">{ui('العنوان')}</Label>
              <Input
                id="report-title"
                className="mt-1.5"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="report-notes">{ui('الملاحظات')}</Label>
              <Textarea
                id="report-notes"
                className="mt-1.5"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>{ui('الحالة')}</Label>
                <div className="mt-1.5">
                  <Combobox
                    value={form.status}
                    onValueChange={(status) => setForm((f) => ({ ...f, status }))}
                    options={STATUS_OPTIONS}
                    placeholder={ui('الحالة…')}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="report-month">{ui('الشهر')}</Label>
                <Input
                  id="report-month"
                  type="number"
                  className="mt-1.5 nums"
                  value={form.forMonth}
                  onChange={(e) => setForm((f) => ({ ...f, forMonth: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="report-year">{ui('السنة')}</Label>
                <Input
                  id="report-year"
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

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('رفض التقرير')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reject-notes">{ui('سبب الرفض')}</Label>
              <Textarea
                id="reject-notes"
                className="mt-1.5"
                rows={3}
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
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
