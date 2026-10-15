import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
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
import type { ClubSpaServiceRow } from '@/types/fitness';
import { RowActions, SELECT_CLS } from '../shared';
import { usePermission } from '@/hooks/use-permission';

export function FitnessSpaServicesPage() {
  const ft = useFitnessT();
  const { can } = usePermission();
  const canCreate = can('club.fitness.spa_services:create');
  const canUpdate = can('club.fitness.spa_services:update');
  const canDelete = can('club.fitness.spa_services:delete');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubSpaServiceRow>('club-spa-services', params);
  const { data: branches } = useBranches();
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    duration: '60',
    price: '',
    branchId: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-spa-services/${id}`),
    { success: ft('common.success'), invalidate: ['club-spa-services'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({
      name: '',
      description: '',
      duration: '60',
      price: '',
      branchId: branches?.[0] ? String(branches[0].id) : '',
    });
    setOpen(true);
  };

  const openEdit = (row: ClubSpaServiceRow) => {
    setEditId(row.id);
    setForm({
      name: row.name,
      description: row.description ?? '',
      duration: String(row.duration),
      price: String(row.price),
      branchId: row.branchId != null ? String(row.branchId) : '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (editId ? !canUpdate : !canCreate) return;
    if (!form.name.trim() || !form.price) {
      toast.error(ft('common.name'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description || undefined,
        duration: Number(form.duration),
        price: Number(form.price),
        branchId: form.branchId ? Number(form.branchId) : undefined,
      };
      if (editId) await api.put(`/club-spa-services/${editId}`, payload);
      else await api.post('/club-spa-services', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<ClubSpaServiceRow>[]>(
    () => [
      { accessorKey: 'name', header: ft('common.name') },
      {
        accessorKey: 'duration',
        header: ft('spaServices.duration'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'price',
        header: ft('common.price'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
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
        title={ft('spaServices.title')}
        actions={canCreate ? (
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('spaServices.newService')}
          </Button>
        ) : undefined}
      />
      <DataTable
        exportSource={{ resource: 'club-spa-services', params }}
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
            <DialogTitle>{editId ? ft('common.edit') : ft('spaServices.newService')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('common.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('spaServices.duration')}</Label>
                <Input className="nums" value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('common.price')}</Label>
                <Input className="nums" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.branch')}</Label>
              <select className={SELECT_CLS} value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
                <option value="">—</option>
                {branchOptions.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ft('common.cancel')}</Button>
            {(editId ? canUpdate : canCreate) ? <Button permissionAction={editId ? 'update' : 'create'} variant="brand" onClick={() => void save()} disabled={saving}>{ft('common.save')}</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
