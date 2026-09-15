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
import type { ExerciseRow } from '@/types/fitness';
import { RowActions, SELECT_CLS } from './shared';

export function FitnessStrengthPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ExerciseRow>('club-exercises', params);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: '',
    muscleGroup: '',
    setsDefault: '',
    repsDefault: '',
    difficulty: 'medium',
    description: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-exercises/${id}`),
    { success: ft('common.success'), invalidate: ['club-exercises'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', category: '', muscleGroup: '', setsDefault: '', repsDefault: '', difficulty: 'medium', description: '' });
    setOpen(true);
  };

  const openEdit = (row: ExerciseRow) => {
    setEditId(row.id);
    setForm({
      name: row.name,
      category: row.category ?? '',
      muscleGroup: row.muscleGroup ?? '',
      setsDefault: row.setsDefault != null ? String(row.setsDefault) : '',
      repsDefault: row.repsDefault != null ? String(row.repsDefault) : '',
      difficulty: row.difficulty,
      description: row.description ?? '',
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
      const payload = {
        name: form.name.trim(),
        category: form.category || undefined,
        muscleGroup: form.muscleGroup || undefined,
        setsDefault: form.setsDefault ? Number(form.setsDefault) : undefined,
        repsDefault: form.repsDefault ? Number(form.repsDefault) : undefined,
        difficulty: form.difficulty,
        description: form.description || undefined,
      };
      if (editId) await api.put(`/club-exercises/${editId}`, payload);
      else await api.post('/club-exercises', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<ExerciseRow>[]>(
    () => [
      { accessorKey: 'name', header: ft('common.name') },
      { accessorKey: 'category', header: ft('strength.title'), cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
      { accessorKey: 'muscleGroup', header: ft('strength.muscle'), cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
      {
        accessorKey: 'setsDefault',
        header: ft('strength.sets'),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
        },
      },
      {
        accessorKey: 'repsDefault',
        header: ft('strength.reps'),
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
        title={ft('strength.title')}
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
              <Label>{ft('strength.muscle')}</Label>
              <Input value={form.muscleGroup} onChange={(e) => setForm((f) => ({ ...f, muscleGroup: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{ft('strength.sets')}</Label>
                <Input className="nums" value={form.setsDefault} onChange={(e) => setForm((f) => ({ ...f, setsDefault: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{ft('strength.reps')}</Label>
                <Input className="nums" value={form.repsDefault} onChange={(e) => setForm((f) => ({ ...f, repsDefault: e.target.value }))} />
              </div>
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
