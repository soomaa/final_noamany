import type { ColumnDef } from '@tanstack/react-table';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { MapModal } from '@/components/common/map-modal';
import { PageHeader } from '@/components/common/page-header';
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
import { api, apiError } from '@/lib/api';
import { clientPaginate, isNotImplemented, useArrayResource, useMutationWithToast } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import type { Branch } from '@/types/org';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export function OrgBranchesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: branches, isLoading, isError, error, refetch } = useArrayResource<Branch>('branches');
  const [mapRow, setMapRow] = useState<Branch | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', lat: '', lng: '', distance: '100' });

  const paged = useMemo(
    () =>
      clientPaginate(branches ?? [], params, {
        search: (row, q) => (row.name ?? '').toLowerCase().includes(q),
      }),
    [branches, params],
  );

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/branches/${id}`),
    { success: ui('تم حذف الفرع'), invalidate: ['branches'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', lat: '', lng: '', distance: '100' });
    setFormOpen(true);
  };

  const openEdit = (row: Branch) => {
    setEditId(row.id);
    setForm({ name: row.name ?? '', lat: row.lat ?? '', lng: row.lng ?? '', distance: String(row.distance ?? 100) });
    setFormOpen(true);
  };

  const saveBranch = async () => {
    try {
      const payload = {
        name: form.name,
        lat: form.lat || undefined,
        lng: form.lng || undefined,
        distance: parseInt(form.distance, 10) || 100,
        parentId: 0,
      };
      if (editId) await api.patch(`/branches/${editId}`, payload);
      else await api.post('/branches', payload);
      toast.success(ui('تم حفظ الفرع'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const handleDelete = async (row: Branch) => {
    const ok = await confirm({
      title: ui('حذف الفرع'),
      description: `${ui('هل تريد حذف «')}${row.name ?? ui('هذا الفرع')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<Branch>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'name', header: ui('الاسم'), cell: ({ getValue }) => getValue() ?? '—' },
    {
      accessorKey: 'lat',
      header: ui('الموقع'),
      cell: ({ row }) =>
        row.original.lat != null ? (
          <Button variant="link" size="sm" className="h-auto p-0 nums" onClick={() => setMapRow(row.original)}>
            <MapPin className="size-3.5" />
            {toArabicDigits(String(row.original.lat))}, {toArabicDigits(String(row.original.lng))}
          </Button>
        ) : (
          '—'
        ),
    },
    {
      accessorKey: 'distance',
      header: ui('المسافة (متر)'),
      cell: ({ getValue }) => <span className="nums">{toArabicDigits(Number(getValue()) || 100)}</span>,
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
    return (
      <div>
        <PageHeader title={ui('إدارة الفروع')} />
        <NotImplementedState title={ui('الفروع قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('إدارة الفروع')}
        description={ui('فروع المنشأة مع إحداثيات الموقع الجغرافي للسياج')}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('فرع جديد')}
          </Button>
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في الفروع…')} />
      <DataTable
        columns={columns}
        data={paged.data}
        total={paged.total}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(p) => setParams({ page: p })}
        onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        search={params.search}
        onSearchChange={(s) => setParams({ search: s, page: 1 })}
        emptyTitle={ui('لا توجد فروع')}
      />

      <MapModal open={!!mapRow} onOpenChange={(o) => !o && setMapRow(null)} lat={mapRow?.lat} lng={mapRow?.lng} employeeName={mapRow?.name ?? undefined} />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editId ? ui('تعديل فرع') : ui('فرع جديد')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="branch-name">{ui('الاسم')}</Label><Input id="branch-name" className="mt-1.5" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="branch-lat">{ui('خط العرض')}</Label><Input id="branch-lat" className="mt-1.5 nums" value={form.lat} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))} /></div>
              <div><Label htmlFor="branch-lng">{ui('خط الطول')}</Label><Input id="branch-lng" className="mt-1.5 nums" value={form.lng} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))} /></div>
            </div>
            <div>
              <Label htmlFor="branch-distance">{ui('المسافة (متر)')}</Label>
              <Input
                id="branch-distance"
                type="number"
                min={1}
                className="mt-1.5 nums"
                value={form.distance}
                onChange={(e) => setForm((f) => ({ ...f, distance: e.target.value }))}
              />
            </div>
            {form.lat && form.lng && (
              <iframe
                title={ui('معاينة الموقع')}
                src={`https://maps.google.com/maps?q=${form.lat},${form.lng}&hl=ar&z=14&output=embed`}
                className="h-40 w-full rounded-lg border"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void saveBranch()}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
