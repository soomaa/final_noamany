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
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubEquipmentMaintenanceRow, ClubEquipmentRow } from '@/types/fitness';
import { RowActions, SELECT_CLS, useFitnessResourceList } from '../shared';

export function FitnessMaintenancePage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubEquipmentMaintenanceRow>(
    'club-equipment-maintenance',
    params,
  );
  const { items: equipment } = useFitnessResourceList<ClubEquipmentRow>('club-equipment');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    equipmentId: '',
    scheduledDate: localToday(),
    completedDate: '',
    description: '',
    cost: '',
    status: 'scheduled',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-equipment-maintenance/${id}`),
    { success: ft('common.success'), invalidate: ['club-equipment-maintenance'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({
      equipmentId: equipment?.[0] ? String(equipment[0].id) : '',
      scheduledDate: localToday(),
      completedDate: '',
      description: '',
      cost: '',
      status: 'scheduled',
    });
    setOpen(true);
  };

  const openEdit = (row: ClubEquipmentMaintenanceRow) => {
    setEditId(row.id);
    setForm({
      equipmentId: String(row.equipmentId),
      scheduledDate: row.scheduledDate,
      completedDate: row.completedDate ?? '',
      description: row.description ?? '',
      cost: row.cost != null ? String(row.cost) : '',
      status: row.status,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.equipmentId || !form.scheduledDate) {
      toast.error(ft('maintenance.scheduled'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        equipmentId: Number(form.equipmentId),
        scheduledDate: form.scheduledDate,
        completedDate: form.completedDate || undefined,
        description: form.description || undefined,
        cost: form.cost ? Number(form.cost) : undefined,
        status: form.status,
      };
      if (editId) await api.put(`/club-equipment-maintenance/${editId}`, payload);
      else await api.post('/club-equipment-maintenance', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<ClubEquipmentMaintenanceRow>[]>(
    () => [
      {
        accessorKey: 'equipment',
        header: ft('equipment.title'),
        cell: ({ row }) => row.original.equipment?.name ?? `#${row.original.equipmentId}`,
      },
      {
        accessorKey: 'scheduledDate',
        header: ft('maintenance.scheduled'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      {
        accessorKey: 'cost',
        header: ft('maintenance.cost'),
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
        title={ft('maintenance.title')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('common.add')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ft('common.noData')}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ft('common.edit') : ft('common.add')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('equipment.title')}</Label>
              <select className={SELECT_CLS} value={form.equipmentId} onChange={(e) => setForm((f) => ({ ...f, equipmentId: e.target.value }))}>
                {(equipment ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ft('maintenance.scheduled')}</Label>
              <Input type="date" className="nums" value={form.scheduledDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('maintenance.completed')}</Label>
              <Input type="date" className="nums" value={form.completedDate} onChange={(e) => setForm((f) => ({ ...f, completedDate: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.status')}</Label>
              <select className={SELECT_CLS} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="scheduled">{ft('maintenance.scheduled')}</option>
                <option value="completed">{ft('maintenance.completed')}</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ft('maintenance.cost')}</Label>
              <Input className="nums" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.description')}</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
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
