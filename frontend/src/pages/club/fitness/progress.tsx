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
import type { MemberProgressRow } from '@/types/fitness';
import { RowActions, memberColumnDef } from './shared';

export function FitnessProgressPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<MemberProgressRow>(
    'club-member-progress',
    params,
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    memberId: '',
    recordDate: localToday(),
    weight: '',
    bodyFat: '',
    muscleMass: '',
    goals: '',
    notes: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-member-progress/${id}`),
    { success: ft('common.success'), invalidate: ['club-member-progress'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({
      memberId: '',
      recordDate: localToday(),
      weight: '',
      bodyFat: '',
      muscleMass: '',
      goals: '',
      notes: '',
    });
    setOpen(true);
  };

  const openEdit = (row: MemberProgressRow) => {
    setEditId(row.id);
    setForm({
      memberId: String(row.memberId),
      recordDate: row.recordDate,
      weight: row.weight != null ? String(row.weight) : '',
      bodyFat: row.bodyFat != null ? String(row.bodyFat) : '',
      muscleMass: row.muscleMass != null ? String(row.muscleMass) : '',
      goals: row.goals ?? '',
      notes: row.notes ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.memberId || !form.recordDate) {
      toast.error(ft('common.member'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        memberId: Number(form.memberId),
        recordDate: form.recordDate,
        weight: form.weight ? Number(form.weight) : undefined,
        bodyFat: form.bodyFat ? Number(form.bodyFat) : undefined,
        muscleMass: form.muscleMass ? Number(form.muscleMass) : undefined,
        goals: form.goals || undefined,
        notes: form.notes || undefined,
      };
      if (editId) await api.put(`/club-member-progress/${editId}`, payload);
      else await api.post('/club-member-progress', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<MemberProgressRow>[]>(
    () => [
      memberColumnDef<MemberProgressRow>(ft('common.member')),
      {
        accessorKey: 'recordDate',
        header: ft('common.date'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      {
        accessorKey: 'weight',
        header: ft('progress.weight'),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
      {
        accessorKey: 'bodyFat',
        header: ft('progress.bodyFat'),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
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
        title={ft('progress.title')}
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
            <DialogTitle>{editId ? ft('common.edit') : ft('common.add')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('common.memberCode')}</Label>
              <Input className="nums" value={form.memberId} onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.date')}</Label>
              <Input type="date" className="nums" value={form.recordDate} onChange={(e) => setForm((f) => ({ ...f, recordDate: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>{ft('progress.weight')}</Label>
                <Input className="nums" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('progress.bodyFat')}</Label>
                <Input className="nums" value={form.bodyFat} onChange={(e) => setForm((f) => ({ ...f, bodyFat: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('inbody.muscleMass')}</Label>
                <Input className="nums" value={form.muscleMass} onChange={(e) => setForm((f) => ({ ...f, muscleMass: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ft('progress.goals')}</Label>
              <Input value={form.goals} onChange={(e) => setForm((f) => ({ ...f, goals: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.notes')}</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
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
