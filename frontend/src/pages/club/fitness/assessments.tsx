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
import { Textarea } from '@/components/ui/textarea';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { PhysicalAssessmentRow } from '@/types/fitness';
import { RowActions, jsonArrayToLines, linesToJsonArray, memberColumnDef } from './shared';

export function FitnessAssessmentsPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<PhysicalAssessmentRow>(
    'club-physical-assessments',
    params,
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    memberId: '',
    assessDate: localToday(),
    assessor: '',
    scoresText: '',
    notes: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-physical-assessments/${id}`),
    { success: ft('common.success'), invalidate: ['club-physical-assessments'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({
      memberId: '',
      assessDate: localToday(),
      assessor: '',
      scoresText: '',
      notes: '',
    });
    setOpen(true);
  };

  const openEdit = (row: PhysicalAssessmentRow) => {
    setEditId(row.id);
    setForm({
      memberId: String(row.memberId),
      assessDate: row.assessDate,
      assessor: row.assessor ?? '',
      scoresText: jsonArrayToLines(row.scoresJson),
      notes: row.notes ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.memberId || !form.assessDate) {
      toast.error(ft('common.member'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        memberId: Number(form.memberId),
        assessDate: form.assessDate,
        assessor: form.assessor || undefined,
        scoresJson: linesToJsonArray(form.scoresText),
        notes: form.notes || undefined,
      };
      if (editId) await api.put(`/club-physical-assessments/${editId}`, payload);
      else await api.post('/club-physical-assessments', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<PhysicalAssessmentRow>[]>(
    () => [
      memberColumnDef<PhysicalAssessmentRow>(ft('common.member')),
      {
        accessorKey: 'assessDate',
        header: ft('common.date'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      { accessorKey: 'assessor', header: ft('assessments.assessor'), cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
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
        title={ft('assessments.title')}
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
              <Input type="date" className="nums" value={form.assessDate} onChange={(e) => setForm((f) => ({ ...f, assessDate: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('assessments.assessor')}</Label>
              <Input value={form.assessor} onChange={(e) => setForm((f) => ({ ...f, assessor: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('assessments.scores')}</Label>
              <Textarea
                rows={4}
                value={form.scoresText}
                onChange={(e) => setForm((f) => ({ ...f, scoresText: e.target.value }))}
              />
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
