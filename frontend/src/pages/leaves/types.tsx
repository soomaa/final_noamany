import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { usePermission } from '@/hooks/use-permission';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface LeaveTypeRow {
  id: number;
  title?: string;
  maxDays?: number;
  isPaid?: boolean;
  isActive?: boolean;
}

export function LeaveTypesPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('leaves.types:create');
  const canUpdate = can('leaves.types:update');
  const canDelete = can('leaves.types:delete');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<LeaveTypeRow>('leaves/types', params);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveTypeRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', maxDays: '', isPaid: true, isActive: true });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/leaves/types/${id}`),
    { success: ui('تم حذف نوع الإجازة'), invalidate: ['leaves/types'] },
  );

  const handleDelete = async (row: LeaveTypeRow) => {
    if (!canDelete) return;
    const ok = await confirm({
      title: ui('حذف نوع الإجازة'),
      description: `${ui('هل تريد حذف «')}${row.title ?? ui('هذا النوع')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const openForm = (row?: LeaveTypeRow) => {
    if (row ? !canUpdate : !canCreate) return;
    setEditing(row ?? null);
    setForm({
      title: row?.title ?? '',
      maxDays: row?.maxDays != null ? String(row.maxDays) : '',
      isPaid: row?.isPaid ?? true,
      isActive: row?.isActive ?? true,
    });
    setOpen(true);
  };

  const save = async () => {
    if (editing ? !canUpdate : !canCreate) return;
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        maxDays: Number(form.maxDays) || 0,
        isPaid: form.isPaid,
        isActive: form.isActive,
      };
      if (editing) await api.patch(`/leaves/types/${editing.id}`, payload);
      else await api.post('/leaves/types', payload);
      toast.success(ui('تم حفظ نوع الإجازة'));
      setOpen(false);
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<LeaveTypeRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('النوع') },
    {
      accessorKey: 'maxDays',
      header: ui('الحد الأقصى (يوم)'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'isPaid',
      header: ui('مدفوعة'),
      cell: ({ getValue }) => <StatusBadge status={getValue() ? 'active' : 'info'} label={getValue() ? ui('نعم') : ui('لا')} />,
    },
    {
      accessorKey: 'isActive',
      header: ui('الحالة'),
      cell: ({ getValue }) => <StatusBadge status={getValue() ? 'active' : 'suspended'} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (canUpdate || canDelete) ? (
        <div className="flex gap-1">
          {canUpdate ? <Button permissionResource="leaves.types" permissionAction="update" variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openForm(row.original)}>
            <Pencil className="size-4" />
          </Button> : null}
          {canDelete ? <Button permissionResource="leaves.types" permissionAction="delete" variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
            <Trash2 className="size-4 text-destructive" />
          </Button> : null}
        </div>
      ) : null,
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('أنواع الإجازات')} />
        <NotImplementedState title={ui('أنواع الإجازات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('أنواع الإجازات')}
        description={ui('تعريف أنواع الإجازات وحدودها')}
        actions={
          canCreate ? <Button permissionResource="leaves.types" permissionAction="create" variant="brand" size="sm" onClick={() => openForm()}>
            <Plus className="size-4" /> {ui('نوع جديد')}
          </Button> : null
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في أنواع الإجازات…')} />
      <DataTable
        exportSource={{ resource: 'leaves/types', params }}
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
        emptyTitle={ui('لا توجد أنواع إجازات')}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editing ? ui('تعديل نوع الإجازة') : ui('نوع إجازة جديد')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>{ui('النوع')}</Label><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>{ui('الحد الأقصى (يوم)')}</Label><Input type="number" min={0} value={form.maxDays} onChange={(event) => setForm((current) => ({ ...current, maxDays: event.target.value }))} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPaid} onChange={(event) => setForm((current) => ({ ...current, isPaid: event.target.checked }))} /><span>{ui('مدفوعة')}</span></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /><span>{ui('نشط')}</span></label>
          </div>
          <DialogFooter><Button permissionAction={null} variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button><Button permissionResource="leaves.types" permissionAction={editing ? 'update' : 'create'} disabled={saving} onClick={() => void save()}>{ui('حفظ')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
