import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Time12Input } from '@/components/common/time-12-input';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
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
import { api, apiError } from '@/lib/api';
import { formatTime } from '@/lib/formatters';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface ShiftRow {
  id: number;
  title?: string;
  hdoorFromTime?: string;
  hdoorToTime?: string;
  hdoorKhasmFrom?: string;
  ensrafFromTime?: string;
  ensrafToTime?: string;
  ensrafKhasmFrom?: string;
}

interface ShiftForm {
  title: string;
  hdoorFromTime: string;
  hdoorToTime: string;
  hdoorKhasmFrom: string;
  ensrafFromTime: string;
  ensrafToTime: string;
  ensrafKhasmFrom: string;
}

const EMPTY_FORM: ShiftForm = {
  title: '',
  hdoorFromTime: '',
  hdoorToTime: '',
  hdoorKhasmFrom: '',
  ensrafFromTime: '',
  ensrafToTime: '',
  ensrafKhasmFrom: '',
};

/** Backend may contain legacy "h:i A" values; normalize them before the 12-hour editor. */
function toInputTime(raw?: string): string {
  if (!raw) return '';
  const ampm = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12;
    if (/[Pp]/.test(ampm[3])) h += 12;
    return `${String(h).padStart(2, '0')}:${ampm[2]}`;
  }
  const hm = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  return hm ? `${hm[1].padStart(2, '0')}:${hm[2]}` : '';
}

const TIME_FIELDS: { key: keyof Omit<ShiftForm, 'title'>; label: string }[] = [
  { key: 'hdoorFromTime', label: uiStatic('بداية الحضور') },
  { key: 'hdoorToTime', label: uiStatic('نهاية الحضور') },
  { key: 'hdoorKhasmFrom', label: uiStatic('بداية الخصم (تأخير)') },
  { key: 'ensrafFromTime', label: uiStatic('بداية الانصراف') },
  { key: 'ensrafToTime', label: uiStatic('نهاية الانصراف') },
  { key: 'ensrafKhasmFrom', label: uiStatic('احتساب الإضافي') },
];

export function AttendanceSettingsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ShiftRow>('attendance/shifts', params);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ShiftForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/attendance/shifts/${id}`),
    { success: ui('تم حذف الوردية'), invalidate: ['attendance/shifts'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: ShiftRow) => {
    setEditId(row.id);
    setForm({
      title: row.title ?? '',
      hdoorFromTime: toInputTime(row.hdoorFromTime),
      hdoorToTime: toInputTime(row.hdoorToTime),
      hdoorKhasmFrom: toInputTime(row.hdoorKhasmFrom),
      ensrafFromTime: toInputTime(row.ensrafFromTime),
      ensrafToTime: toInputTime(row.ensrafToTime),
      ensrafKhasmFrom: toInputTime(row.ensrafKhasmFrom),
    });
    setDialogOpen(true);
  };

  const saveShift = async () => {
    const missing = TIME_FIELDS.find((f) => !form[f.key]);
    if (missing) {
      toast.error(`${missing.label} ${ui('حقل مطلوب')}`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title || undefined,
        hdoorFromTime: form.hdoorFromTime,
        hdoorToTime: form.hdoorToTime,
        hdoorKhasmFrom: form.hdoorKhasmFrom,
        ensrafFromTime: form.ensrafFromTime,
        ensrafToTime: form.ensrafToTime,
        ensrafKhasmFrom: form.ensrafKhasmFrom,
      };
      if (editId != null) {
        await api.put(`/attendance/shifts/${editId}`, payload);
        toast.success(ui('تم تحديث الوردية'));
      } else {
        await api.post('/attendance/shifts', payload);
        toast.success(ui('تم إضافة الوردية'));
      }
      setDialogOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: ShiftRow) => {
    const ok = await confirm({
      title: ui('حذف الوردية؟'),
      description: row.title ? `${ui('هل تريد حذف «')}${row.title}${ui('»؟')}` : undefined,
      variant: 'destructive',
      confirmLabel: ui('حذف'),
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const timeCell = (v?: string) => <span className="nums">{v ? formatTime(v) : '—'}</span>;

  const columns: ColumnDef<ShiftRow>[] = [
    { accessorKey: 'id', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    { accessorKey: 'title', header: ui('الوردية'), cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'hdoorFromTime', header: ui('بداية الحضور'), cell: ({ getValue }) => timeCell(getValue() as string) },
    { accessorKey: 'hdoorToTime', header: ui('نهاية الحضور'), cell: ({ getValue }) => timeCell(getValue() as string) },
    { accessorKey: 'hdoorKhasmFrom', header: ui('بداية الخصم'), cell: ({ getValue }) => timeCell(getValue() as string) },
    { accessorKey: 'ensrafFromTime', header: ui('بداية الانصراف'), cell: ({ getValue }) => timeCell(getValue() as string) },
    { accessorKey: 'ensrafToTime', header: ui('نهاية الانصراف'), cell: ({ getValue }) => timeCell(getValue() as string) },
    { accessorKey: 'ensrafKhasmFrom', header: ui('احتساب الإضافي'), cell: ({ getValue }) => timeCell(getValue() as string) },
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
    <div className="space-y-6">
      <PageHeader
        title={ui('إعدادات الدوام')}
        description={ui('الورديات')}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('وردية جديدة')}
          </Button>
        }
      />

      <FilterBar searchPlaceholder={ui('بحث في الورديات…')} />
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
        emptyTitle={ui('لا توجد ورديات')}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editId != null ? ui('تعديل الوردية') : ui('وردية جديدة')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{ui('اسم الوردية')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={ui('الدوام الصباحي')}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {TIME_FIELDS.map((f) => (
                <div key={f.key} className="space-y-2">
                  <Label>
                    {f.label}
                    <span className="text-destructive"> *</span>
                  </Label>
                  <Time12Input value={form[f.key]} onValueChange={(value) => setForm((prev) => ({ ...prev, [f.key]: value }))} />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {ui('إلغاء')}
            </Button>
            <Button variant="brand" onClick={() => void saveShift()} disabled={saving}>
              {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
