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
import { toArabicDigits } from '@/lib/utils';
import type { ClubFacilityRow } from '@/types/fitness';
import { RowActions, SELECT_CLS } from '../shared';

export function FitnessFacilitiesPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubFacilityRow>('club-facilities', params);
  const { data: branches } = useBranches();
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));
  const filters: FilterField[] = [
    { key: 'branch', label: ft('common.branch'), type: 'select', options: branchOptions },
  ];

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    branchId: '',
    facilityType: 'general',
    capacity: '',
    description: '',
    status: 'available',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-facilities/${id}`),
    { success: ft('common.success'), invalidate: ['club-facilities'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({
      name: '',
      branchId: branches?.[0] ? String(branches[0].id) : '',
      facilityType: 'general',
      capacity: '',
      description: '',
      status: 'available',
    });
    setOpen(true);
  };

  const openEdit = (row: ClubFacilityRow) => {
    setEditId(row.id);
    setForm({
      name: row.name,
      branchId: String(row.branchId),
      facilityType: row.facilityType,
      capacity: row.capacity != null ? String(row.capacity) : '',
      description: row.description ?? '',
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
        branchId: Number(form.branchId),
        facilityType: form.facilityType,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        description: form.description || undefined,
        status: form.status,
      };
      if (editId) await api.put(`/club-facilities/${editId}`, payload);
      else await api.post('/club-facilities', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<ClubFacilityRow>[]>(
    () => [
      { accessorKey: 'name', header: ft('common.name') },
      { accessorKey: 'facilityType', header: ft('facilities.type') },
      {
        accessorKey: 'capacity',
        header: ft('common.capacity'),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
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
        title={ft('facilities.title')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('facilities.newFacility')}
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
            <DialogTitle>{editId ? ft('common.edit') : ft('facilities.newFacility')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('common.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
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
              <Label>{ft('facilities.type')}</Label>
              <Input value={form.facilityType} onChange={(e) => setForm((f) => ({ ...f, facilityType: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.capacity')}</Label>
              <Input className="nums" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
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
