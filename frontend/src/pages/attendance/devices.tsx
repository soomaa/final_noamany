import type { ColumnDef } from '@tanstack/react-table';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
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
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface DeviceRow {
  id: number;
  title?: string;
  ip?: string;
  branchTitle?: string;
  lastSync?: string;
  status?: string;
}

export function AttendanceDevicesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<DeviceRow>('attendance/devices', params);
  const { data: branches } = useBranches();
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', ip: '', branchId: '' });
  const [saving, setSaving] = useState(false);

  const createDevice = async () => {
    if (!form.title.trim()) {
      toast.error(ui('اسم الجهاز مطلوب'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/attendance/devices', {
        title: form.title.trim(),
        ip: form.ip.trim() || undefined,
        branchId: form.branchId ? Number(form.branchId) : undefined,
      });
      toast.success(ui('تم إضافة الجهاز'));
      setDialogOpen(false);
      setForm({ title: '', ip: '', branchId: '' });
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const syncMutation = useMutationWithToast(
    (id: number) => api.post(`/attendance/devices/${id}/sync`),
    { success: ui('تمت مزامنة الجهاز'), invalidate: ['attendance/devices'] },
  );

  const syncAllMutation = useMutationWithToast(
    () => api.post('/attendance/devices/sync-all'),
    { success: ui('تمت مزامنة جميع الأجهزة'), invalidate: ['attendance/devices'] },
  );

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/attendance/devices/${id}`),
    { success: ui('تم حذف الجهاز'), invalidate: ['attendance/devices'] },
  );

  const handleDelete = async (row: DeviceRow) => {
    const ok = await confirm({
      title: ui('حذف جهاز البصمة'),
      description: `${ui('هل تريد حذف «')}${row.title ?? ui('هذا الجهاز')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<DeviceRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('الجهاز') },
    { accessorKey: 'ip', header: ui('عنوان IP'), cell: ({ getValue }) => <span className="nums">{String(getValue() ?? '—')}</span> },
    { accessorKey: 'branchTitle', header: ui('الفرع') },
    { accessorKey: 'lastSync', header: ui('آخر مزامنة'), cell: ({ getValue }) => getValue() ?? '—' },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const s = getValue() as string | undefined;
        return <StatusBadge status={s === 'online' ? 'active' : s === 'offline' ? 'suspended' : 'pending'} />;
      },
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate(row.original.id)}
          >
            <RefreshCw className="size-4" /> {ui('مزامنة')}
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
    <div>
      <PageHeader
        title={ui('أجهزة البصمة')}
        description={ui('إدارة أجهزة الحضور والانصراف ومزامنتها')}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={syncAllMutation.isPending}
              onClick={() => syncAllMutation.mutate(undefined as never)}
            >
              <RefreshCw className="size-4" /> {ui('مزامنة الكل')}
            </Button>
            <Button variant="brand" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" /> {ui('جهاز جديد')}
            </Button>
          </div>
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في الأجهزة…')} />
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
        emptyTitle={ui('لا توجد أجهزة بصمة')}
      />
    </div>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{ui('جهاز بصمة جديد')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{ui('اسم الجهاز')}<span className="text-destructive"> *</span></Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={ui('جهاز البصمة الرئيسي')}
            />
          </div>
          <div className="space-y-2">
            <Label>{ui('عنوان IP')}</Label>
            <Input
              className="nums"
              dir="ltr"
              value={form.ip}
              onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))}
              placeholder="192.168.1.10"
            />
          </div>
          <div className="space-y-2">
            <Label>{ui('الفرع')}</Label>
            <Combobox
              options={branchOptions}
              value={form.branchId}
              onValueChange={(v: string) => setForm((f) => ({ ...f, branchId: v }))}
              placeholder={ui('اختر الفرع')}
              searchPlaceholder={ui('بحث في الفروع…')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
            {ui('إلغاء')}
          </Button>
          <Button variant="brand" onClick={() => void createDevice()} disabled={saving}>
            {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
