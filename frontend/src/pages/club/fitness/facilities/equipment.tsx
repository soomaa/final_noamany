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
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import type { ClubEquipmentRow, ClubFacilityRow } from '@/types/fitness';
import { RowActions, SELECT_CLS, useFitnessResourceList } from '../shared';

export function FitnessEquipmentPage() {
  const ft = useFitnessT();
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
    setEditId(null);
    setForm({
      name: '',
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
    setEditId(row.id);
    setForm({
      name: row.name,
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
    if (!form.name.trim() || !form.branchId) {
      toast.error(ft('common.name'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
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
      { accessorKey: 'name', header: ft('common.name') },
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
        cell: ({ row }) => (
          <RowActions
            editLabel={ft('common.edit')}
            deleteLabel={ft('common.delete')}
            onEdit={() => openEdit(row.original)}
            onDelete={() =>
              void confirm({ title: ft('common.confirmDelete'), variant: 'destructive' }).then((ok) => {
                if (ok) deleteMutation.mutate(row.original.id);
              })
            }
          />
        ),
      },
    ],
    [ft],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ft('equipment.title')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('equipment.newEquipment')}
          </Button>
        }
      />
      <FilterBar fields={filters} />
      <DataTable
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ft('common.edit') : ft('equipment.newEquipment')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
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
            <Button variant="brand" onClick={() => void save()} disabled={saving}>{ft('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
