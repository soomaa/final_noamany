import { useLocation } from 'react-router-dom';
import { TrainingJourneyPage } from './training/journey';
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
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { WorkoutProgramRow } from '@/types/fitness';
import { RowActions, SELECT_CLS, memberColumnDef } from './shared';
import { usePermission } from '@/hooks/use-permission';

export function FitnessProgramsPage() {
  return new URLSearchParams(useLocation().search).has("legacy") ? <LegacyFitnessProgramsPage /> : <TrainingJourneyPage />;
}

function LegacyFitnessProgramsPage() {
  const ft = useFitnessT();
  const { can } = usePermission();
  const canCreate = can('club.fitness.programs:create');
  const canUpdate = can('club.fitness.programs:update');
  const canDelete = can('club.fitness.programs:delete');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<WorkoutProgramRow>(
    'club-workout-programs',
    params,
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    goal: '',
    difficulty: 'medium',
    durationWeeks: '',
    description: '',
    memberId: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-workout-programs/${id}`),
    { success: ft('common.success'), invalidate: ['club-workout-programs'] },
  );

  const openCreate = () => {
    if (!canCreate) return;
    setEditId(null);
    setForm({ name: '', goal: '', difficulty: 'medium', durationWeeks: '', description: '', memberId: '' });
    setOpen(true);
  };

  const openEdit = (row: WorkoutProgramRow) => {
    if (!canUpdate) return;
    setEditId(row.id);
    setForm({
      name: row.name,
      goal: row.goal ?? '',
      difficulty: row.difficulty,
      durationWeeks: row.durationWeeks != null ? String(row.durationWeeks) : '',
      description: row.description ?? '',
      memberId: row.memberId != null ? String(row.memberId) : '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (editId ? !canUpdate : !canCreate) return;
    if (!form.name.trim()) {
      toast.error(ft('common.name'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        goal: form.goal || undefined,
        difficulty: form.difficulty,
        durationWeeks: form.durationWeeks ? Number(form.durationWeeks) : undefined,
        description: form.description || undefined,
        memberId: form.memberId ? Number(form.memberId) : undefined,
      };
      if (editId) await api.put(`/club-workout-programs/${editId}`, payload);
      else await api.post('/club-workout-programs', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<WorkoutProgramRow>[]>(
    () => [
      { accessorKey: 'name', header: ft('common.name') },
      memberColumnDef<WorkoutProgramRow>(ft('common.member')),
      { accessorKey: 'goal', header: ft('programs.goal'), cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
      { accessorKey: 'difficulty', header: ft('programs.difficulty') },
      {
        accessorKey: 'durationWeeks',
        header: ft('programs.duration'),
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
            onEdit={canUpdate ? () => openEdit(row.original) : undefined}
            onDelete={canDelete ? () =>
              void confirm({ title: ft('common.confirmDelete'), variant: 'destructive' }).then((ok) => {
                if (ok) deleteMutation.mutate(row.original.id);
              })
            : undefined}
          />
        ),
      },
    ],
    [canDelete, canUpdate, ft],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ft('programs.title')}
        actions={
          canCreate ? <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('common.add')}
          </Button> : null
        }
      />
      <DataTable
        exportSource={{ resource: 'club-workout-programs', params }}
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
            <DialogTitle>{editId ? ft('common.edit') : ft('common.add')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('common.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('programs.goal')}</Label>
              <Input value={form.goal} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('programs.difficulty')}</Label>
              <select
                className={SELECT_CLS}
                value={form.difficulty}
                onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}
              >
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ft('programs.duration')}</Label>
              <Input
                className="nums"
                value={form.durationWeeks}
                onChange={(e) => setForm((f) => ({ ...f, durationWeeks: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.memberCode')}</Label>
              <Input
                className="nums"
                value={form.memberId}
                onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.description')}</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{ft('common.cancel')}</Button>
            <Button permissionAction={editId ? 'update' : 'create'} variant="brand" onClick={() => void save()} disabled={saving}>{ft('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
