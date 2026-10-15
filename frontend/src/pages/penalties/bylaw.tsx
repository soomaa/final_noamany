import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface BylawRow {
  id: number;
  title?: string;
  description?: string;
  penaltyDays?: number;
  penaltyAmount?: number;
}

export function PenaltiesBylawPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('finance.penalties_bylaw:create');
  const canUpdate = can('finance.penalties_bylaw:update');
  const canDelete = can('finance.penalties_bylaw:delete');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<BylawRow>('penalties/bylaw', params);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BylawRow | null>(null);
  const [form, setForm] = useState({ title: '', description: '', penaltyDays: '', penaltyAmount: '' });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/penalties/bylaw/${id}`),
    { success: ui('تم حذف البند'), invalidate: ['penalties/bylaw'] },
  );

  const handleDelete = async (row: BylawRow) => {
    if (!canDelete) return;
    const ok = await confirm({
      title: ui('حذف بند اللائحة'),
      description: `${ui('هل تريد حذف «')}${row.title ?? ui('هذا البند')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const openForm = (row?: BylawRow) => {
    if (row ? !canUpdate : !canCreate) return;
    setEditing(row ?? null);
    setForm({
      title: row?.title ?? '',
      description: row?.description ?? '',
      penaltyDays: row?.penaltyDays != null ? String(row.penaltyDays) : '',
      penaltyAmount: row?.penaltyAmount != null ? String(row.penaltyAmount) : '',
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (editing ? !canUpdate : !canCreate) return;
    if (!form.title.trim()) return;
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      deductionDays: form.penaltyDays ? Number(form.penaltyDays) : undefined,
      deductionAmount: form.penaltyAmount ? Number(form.penaltyAmount) : undefined,
    };
    if (editing) await api.patch(`/penalties/bylaw/${editing.id}`, payload);
    else await api.post('/penalties/bylaw', payload);
    setDialogOpen(false);
    await refetch();
  };

  const columns: ColumnDef<BylawRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('البند') },
    { accessorKey: 'description', header: ui('الوصف') },
    {
      accessorKey: 'penaltyDays',
      header: ui('أيام الجزاء'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'penaltyAmount',
      header: ui('قيمة الجزاء'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => !canUpdate && !canDelete ? null : (
        <div className="flex gap-1">
          {canUpdate ? <Button permissionResource="finance.penalties_bylaw" permissionAction="update" variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openForm(row.original)}><Pencil className="size-4" /></Button> : null}
          {canDelete ? <Button permissionResource="finance.penalties_bylaw" permissionAction="delete" variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}><Trash2 className="size-4 text-destructive" /></Button> : null}
        </div>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('لائحة الجزاءات')} />
        <NotImplementedState title={ui('لائحة الجزاءات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('لائحة الجزاءات')}
        description={ui('تعريف بنود لائحة الجزاءات والعقوبات')}
        actions={
          canCreate ? <Button permissionResource="finance.penalties_bylaw" permissionAction="create" variant="brand" size="sm" onClick={() => openForm()}>
            <Plus className="size-4" /> {ui('بند جديد')}
          </Button> : null
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في اللائحة…')} />
      <DataTable
        exportSource={{ resource: 'penalties/bylaw', params }}
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
        emptyTitle={ui('لا توجد بنود في اللائحة')}
      />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editing ? ui('تعديل بند اللائحة') : ui('إضافة بند جديد')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>{ui('البند')}</Label><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>{ui('الوصف')}</Label><Input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>{ui('أيام الجزاء')}</Label><Input type="number" min={0} value={form.penaltyDays} onChange={(event) => setForm((current) => ({ ...current, penaltyDays: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>{ui('قيمة الجزاء')}</Label><Input type="number" min={0} value={form.penaltyAmount} onChange={(event) => setForm((current) => ({ ...current, penaltyAmount: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button permissionAction={null} variant="outline" onClick={() => setDialogOpen(false)}>{ui('إلغاء')}</Button><Button permissionResource="finance.penalties_bylaw" permissionAction={editing ? 'update' : 'create'} onClick={() => void save()}>{ui('حفظ')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
