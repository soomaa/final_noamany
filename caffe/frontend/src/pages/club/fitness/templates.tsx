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
import type { WorkoutTemplateRow } from '@/types/fitness';
import { RowActions, jsonArrayToLines, linesToJsonArray, useFitnessResourceList, SELECT_CLS } from './shared';

export function FitnessTemplatesPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<WorkoutTemplateRow>(
    'club-workout-templates',
    params,
  );
  const { items: exercises } = useFitnessResourceList<{ id: number; name: string; muscleGroup?: string | null }>('club-exercises');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', selectedExerciseIds: [] as number[] });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-workout-templates/${id}`),
    { success: ft('common.success'), invalidate: ['club-workout-templates'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', description: '', selectedExerciseIds: [] });
    setOpen(true);
  };

  const openEdit = (row: WorkoutTemplateRow) => {
    setEditId(row.id);
    const names = linesToJsonArray(jsonArrayToLines(row.exercisesJson));
    const ids = (exercises ?? [])
      .filter((ex) => names.includes(ex.name))
      .map((ex) => ex.id);
    setForm({
      name: row.name,
      description: row.description ?? '',
      selectedExerciseIds: ids,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(ft('common.name'));
      return;
    }
    setSaving(true);
    try {
      const selectedNames = (exercises ?? [])
        .filter((ex) => form.selectedExerciseIds.includes(ex.id))
        .map((ex) => ex.name);
      const payload = {
        name: form.name.trim(),
        description: form.description || undefined,
        exercisesJson: selectedNames,
      };
      if (editId) await api.put(`/club-workout-templates/${editId}`, payload);
      else await api.post('/club-workout-templates', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<WorkoutTemplateRow>[]>(
    () => [
      { accessorKey: 'name', header: ft('common.name') },
      {
        accessorKey: 'exercisesJson',
        header: ft('templates.exercises'),
        cell: ({ getValue }) => {
          const lines = jsonArrayToLines(getValue());
          const count = lines ? lines.split('\n').length : 0;
          return <span className="nums">{count}</span>;
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
        title={ft('templates.title')}
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
              <Label>{ft('common.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('common.description')}</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('templates.exercises')}</Label>
              <select
                className={SELECT_CLS}
                value=""
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (!id || form.selectedExerciseIds.includes(id)) return;
                  setForm((f) => ({ ...f, selectedExerciseIds: [...f.selectedExerciseIds, id] }));
                }}
              >
                <option value="">{ft('templates.pickExercise')}</option>
                {(exercises ?? []).map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.name}{ex.muscleGroup ? ` (${ex.muscleGroup})` : ''}</option>
                ))}
              </select>
              <ul className="space-y-1 text-sm">
                {form.selectedExerciseIds.map((id) => {
                  const ex = (exercises ?? []).find((e) => e.id === id);
                  return (
                    <li key={id} className="flex items-center justify-between rounded border px-2 py-1">
                      <span>{ex?.name ?? id}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setForm((f) => ({ ...f, selectedExerciseIds: f.selectedExerciseIds.filter((x) => x !== id) }))}
                      >
                        ×
                      </Button>
                    </li>
                  );
                })}
              </ul>
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
