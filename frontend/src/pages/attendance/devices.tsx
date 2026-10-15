import type { ColumnDef } from '@tanstack/react-table';
import { Copy, Info, KeyRound, Plus, Trash2, Wifi } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
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
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface DeviceRow {
  id: number;
  title?: string;
  ip?: string;
  branchTitle?: string;
  lastSync?: string;
  status?: string;
  ingestConfigured?: boolean;
}

export function AttendanceDevicesPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('attendance.devices:create');
  const canExecute = can('attendance.devices:execute');
  const canConfigure = can('attendance.devices:configure');
  const canDelete = can('attendance.devices:delete');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<DeviceRow>('attendance/devices', params);
  const { data: branches } = useBranches();
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', ip: '', branchId: '' });
  const [saving, setSaving] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<{ deviceId: number; value: string } | null>(null);

  const createDevice = async () => {
    if (!canCreate) return;
    if (!form.title.trim()) {
      toast.error(ui('اسم الجهاز مطلوب'));
      return;
    }
    if (!form.ip.trim()) {
      toast.error(ui('عنوان IP مطلوب'));
      return;
    }
    setSaving(true);
    try {
      const { data: created } = await api.post<{ id: number; ingestKey: string }>('/attendance/devices', {
        title: form.title.trim(),
        ip: form.ip.trim(),
        branchId: form.branchId ? Number(form.branchId) : undefined,
      });
      toast.success(ui('تم إضافة الجهاز'));
      setGeneratedKey({ deviceId: created.id, value: created.ingestKey });
      setDialogOpen(false);
      setForm({ title: '', ip: '', branchId: '' });
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const rotateIngestKey = async (row: DeviceRow) => {
    if (!canConfigure) return;
    const ok = await confirm({
      title: ui('تدوير مفتاح استيراد الجهاز'),
      description: ui('سيتوقف المفتاح السابق فورًا، ويجب تحديث برنامج الجهاز بالمفتاح الجديد.'),
      confirmLabel: ui('تدوير المفتاح'),
    });
    if (!ok) return;
    try {
      const { data: rotated } = await api.post<{ id: number; ingestKey: string }>(
        `/attendance/devices/${row.id}/rotate-ingest-key`,
      );
      setGeneratedKey({ deviceId: rotated.id, value: rotated.ingestKey });
      toast.success(ui('تم تدوير المفتاح'));
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const connectivityMutation = useMutationWithToast(
    (id: number) => api.post(`/attendance/devices/${id}/connectivity-check`),
    { success: ui('الجهاز متصل وجاهز للـprovider'), invalidate: ['attendance/devices'] },
  );

  const connectivityAllMutation = useMutationWithToast(
    () => api.post('/attendance/devices/connectivity-check-all'),
    { success: ui('اكتمل اختبار اتصال الأجهزة'), invalidate: ['attendance/devices'] },
  );

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/attendance/devices/${id}`),
    { success: ui('تم حذف الجهاز'), invalidate: ['attendance/devices'] },
  );

  const handleDelete = async (row: DeviceRow) => {
    if (!canDelete) return;
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
    { accessorKey: 'lastSync', header: ui('آخر مزامنة فعلية'), cell: ({ getValue }) => getValue() ?? '—' },
    {
      accessorKey: 'ingestConfigured',
      header: ui('الاستيراد'),
      cell: ({ getValue }) => (
        <StatusBadge
          status={getValue() ? 'active' : 'pending'}
          label={getValue() ? ui('مهيأ') : ui('غير مهيأ')}
        />
      ),
    },
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
      cell: ({ row }) => (canExecute || canConfigure || canDelete) ? (
        <div className="flex gap-1">
          {canExecute && <Button
            variant="outline"
            size="sm"
            disabled={connectivityMutation.isPending}
            onClick={() => connectivityMutation.mutate(row.original.id)}
          >
            <Wifi className="size-4" /> {ui('اختبار اتصال')}
          </Button>}
          {canConfigure && <Button
            permissionResource="attendance.devices"
            permissionAction="configure"
            variant="ghost"
            size="icon"
            aria-label={ui('تدوير مفتاح الاستيراد')}
            onClick={() => void rotateIngestKey(row.original)}
          >
            <KeyRound className="size-4" />
          </Button>}
          {canDelete && <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>}
        </div>
      ) : null,
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('أجهزة البصمة')} />
        <NotImplementedState title={ui('أجهزة البصمة قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <>
    <div>
      <PageHeader
        title={ui('أجهزة البصمة')}
        description={ui('إدارة الاتصال والاستيراد الفعلي الآمن لأحداث أجهزة البصمة')}
        actions={
          <div className="flex gap-2">
            {canExecute && <Button
              variant="outline"
              size="sm"
              disabled={connectivityAllMutation.isPending}
              onClick={() => connectivityAllMutation.mutate(undefined as never)}
            >
              <Wifi className="size-4" /> {ui('اختبار الكل')}
            </Button>}
            {canCreate && <Button variant="brand" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" /> {ui('جهاز جديد')}
            </Button>}
          </div>
        }
      />
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-sky-200/70 bg-sky-50/70 px-4 py-3 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>{ui('اختبار الاتصال لا يستورد بصمات. برنامج الجهاز يرسل الأحداث إلى endpoint الاستيراد بمفتاحه؛ كل event يُحفظ في ledger لمنع التكرار، وآخر مزامنة يتقدم بعد استيراد ناجح فقط.')}</p>
      </div>
      <FilterBar searchPlaceholder={ui('بحث في الأجهزة…')} />
      <DataTable
        exportSource={{ resource: 'attendance/devices', params }}
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
            <Label>{ui('عنوان IP')}<span className="text-destructive"> *</span></Label>
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
          {canCreate && <Button permissionAction="create" variant="brand" onClick={() => void createDevice()} disabled={saving}>
            {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={generatedKey != null} onOpenChange={(open) => !open && setGeneratedKey(null)}>
      <DialogContent size="md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{ui('مفتاح استيراد جهاز الحضور')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-warning" />
            <p>{ui('انسخ المفتاح الآن واحفظه في secret store لبرنامج الجهاز. لن يعرضه النظام مرة أخرى، ولا يجب وضعه في ملفات المصدر أو الرسائل.')}</p>
          </div>
          <div className="flex gap-2" dir="ltr">
            <Input readOnly className="font-mono text-xs" value={generatedKey?.value ?? ''} aria-label={ui('مفتاح استيراد الجهاز')} />
            <Button
              permissionAction={null}
              variant="outline"
              size="icon"
              aria-label={ui('نسخ المفتاح')}
              onClick={() => {
                if (!generatedKey) return;
                void navigator.clipboard.writeText(generatedKey.value).then(
                  () => toast.success(ui('تم نسخ المفتاح')),
                  () => toast.error(ui('تعذّر نسخ المفتاح؛ حدده وانسخه يدويًا')),
                );
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button permissionAction={null} onClick={() => setGeneratedKey(null)}>{ui('تم الحفظ بأمان')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
