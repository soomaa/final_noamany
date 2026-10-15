import { useLocale } from '@/store/locale';
import { UploadField } from '@/components/employees/upload-fields';
import { catalogImageUrl } from '@/lib/catalog-image';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import type { ClubEquipmentRow, ClubFacilityRow } from '@/types/fitness';
import { RowActions, SELECT_CLS, useFitnessResourceList } from '../shared';

export function FitnessEquipmentPage() {
  const ft = useFitnessT();
  const { locale } = useLocale();
  const { can } = usePermission();
  const canCreate = can('club.fitness.equipment:create');
  const canUpdate = can('club.fitness.equipment:update');
  const canDelete = can('club.fitness.equipment:delete');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubEquipmentRow>('club-equipment', params);
  const { data: branches } = useBranches();
  const { items: facilities } = useFitnessResourceList<ClubFacilityRow>('club-facilities');
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));
  const filters: FilterField[] = [
    { key: 'branch', label: ft('common.branch'), type: 'select', options: branchOptions },
  ];

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    imageUrl: '',
    serialNumber: '',
    branchId: '',
    facilityId: '',
    purchaseDate: '',
    notes: '',
    status: 'available',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-equipment/${id}`),
    { success: ft('common.success'), invalidate: ['club-equipment'] },
  );

  const openCreate = () => {
    if (!canCreate) return;
    setEditId(null);
    setForm({
      name: '',
    imageUrl: '',
      serialNumber: '',
      branchId: branches?.[0] ? String(branches[0].id) : '',
      facilityId: '',
      purchaseDate: '',
      notes: '',
      status: 'available',
    });
    setOpen(true);
  };

  const openEdit = (row: ClubEquipmentRow) => {
    if (!canUpdate) return;
    setEditId(row.id);
    setForm({
      name: row.name,
      imageUrl: row.imageUrl ?? '',
      serialNumber: row.serialNumber ?? '',
      branchId: String(row.branchId),
      facilityId: row.facilityId ? String(row.facilityId) : '',
      purchaseDate: row.purchaseDate ?? '',
      notes: row.notes ?? '',
      status: row.status,
    });
    setOpen(true);
  };

  const save = async () => {
    if (editId ? !canUpdate : !canCreate) return;
    if (!form.name.trim() || !form.branchId) {
      toast.error(ft('common.name'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        imageUrl: form.imageUrl || null,
        serialNumber: form.serialNumber || undefined,
        branchId: Number(form.branchId),
        facilityId: form.facilityId ? Number(form.facilityId) : undefined,
        purchaseDate: form.purchaseDate || undefined,
        notes: form.notes || undefined,
        status: form.status,
      };
      if (editId) await api.put(`/club-equipment/${editId}`, payload);
      else await api.post('/club-equipment', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<ClubEquipmentRow>[]>(
    () => [
      { accessorKey: 'name', header: ft('common.name'), cell: ({ row }) => <div className="flex items-center gap-3">{catalogImageUrl(row.original.imageUrl) && <img src={catalogImageUrl(row.original.imageUrl)!} alt="" className="size-12 rounded-lg object-cover" />}<span>{row.original.name}</span></div> },
      { accessorKey: 'serialNumber', header: ft('equipment.serial'), cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
      {
        accessorKey: 'facility',
        header: ft('facilities.title'),
        cell: ({ row }) => row.original.facility?.name ?? '—',
      },
      { accessorKey: 'status', header: ft('common.status') },
      {
        id: 'actions',
        header: ft('common.actions'),
        cell: ({ row }) => !canUpdate && !canDelete ? null : (
          <RowActions
            editLabel={ft('common.edit')}
            deleteLabel={ft('common.delete')}
            onEdit={canUpdate ? () => openEdit(row.original) : undefined}
            onDelete={canDelete ? () =>
              void confirm({ title: ft('common.confirmDelete'), variant: 'destructive' }).then((ok) => {
                if (ok && canDelete) deleteMutation.mutate(row.original.id);
              })
            : undefined}
          />
        ),
      },
    ],
    [ft, canUpdate, canDelete, deleteMutation],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ft('equipment.title')}
        actions={canCreate ? (
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('equipment.newEquipment')}
          </Button>
        ) : undefined}
      />
      <FilterBar fields={filters} />
      <DataTable
        exportSource={{ resource: 'club-equipment', params }}
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ft('common.noData')}
      />
      <Dialog open={open && (editId ? canUpdate : canCreate)} onOpenChange={setOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ft('common.edit') : ft('equipment.newEquipment')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <UploadField category="equipment-image" value={form.imageUrl} accept="image/jpeg,image/png,image/webp" label={locale === 'ar' ? 'صورة الجهاز' : 'Equipment photo'} onChange={value => setForm(f => ({...f, imageUrl: value ?? ''}))} />
            <div className="grid gap-2">
              <Label>{ft('common.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('equipment.serial')}</Label>
              <Input value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.branch')}</Label>
              <select className={SELECT_CLS} value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                {branchOptions.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ft('facilities.title')}</Label>
              <select className={SELECT_CLS} value={form.facilityId} onChange={(e) => setForm((f) => ({ ...f, facilityId: e.target.value }))}>
                <option value="">—</option>
                {(facilities ?? []).map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ft('common.cancel')}</Button>
            <Button variant="brand" permissionAction={editId ? 'update' : 'create'} onClick={() => void save()} disabled={saving}>{ft('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
