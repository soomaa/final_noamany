import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList, useArrayResource } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubTrainerRow } from '@/types/fitness';
import { RowActions } from '../shared';
import { profilePath } from './trainer-workspace-model';

export function FitnessTrainersPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubTrainerRow>('club-trainers', params);
  const { data: employees } = useArrayResource<{ id: number; name: string }>('employees');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    employeeId: '',
    email: '',
    phone: '',
    specialization: '',
    experience: '',
    bio: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-trainers/${id}`),
    { success: ft('common.success'), invalidate: ['club-trainers'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', employeeId: '', email: '', phone: '', specialization: '', experience: '', bio: '' });
    setOpen(true);
  };

  const openEdit = (row: ClubTrainerRow) => {
    setEditId(row.id);
    setForm({
      name: row.name,
      employeeId: row.employeeId != null ? String(row.employeeId) : '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      specialization: row.specialization ?? '',
      experience: row.experience ?? '',
      bio: row.bio ?? '',
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
        employeeId: form.employeeId ? Number(form.employeeId) : undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        specialization: form.specialization || undefined,
        experience: form.experience || undefined,
        bio: form.bio || undefined,
      };
      if (editId) await api.put(`/club-trainers/${editId}`, payload);
      else await api.post('/club-trainers', payload);
      toast.success(ft('common.success'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<ClubTrainerRow>[]>(
    () => [
      { accessorKey: 'name', header: ft('common.name') },
      { accessorKey: 'specialization', header: ft('trainers.specialization'), cell: ({ getValue }) => (getValue() as string | null) ?? '—' },
      { accessorKey: 'phone', header: ft('common.search'), cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      }},
      {
        accessorKey: 'ratingAvg',
        header: ft('trainers.rating'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'isActive',
        header: ft('common.status'),
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'suspended'} />,
      },
      {
        id: 'actions',
        header: ft('common.actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" aria-label="عرض ملف المدرب">
              <Link to={profilePath(row.original.id)}><Eye className="size-4" />عرض الملف</Link>
            </Button>
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
          </div>
        ),
      },
    ],
    [ft],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ft('trainers.title')}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> {ft('trainers.newTrainer')}
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
            <DialogTitle>{editId ? ft('common.edit') : ft('trainers.newTrainer')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>{ft('common.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('trainers.employee')}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.employeeId}
                onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
              >
                <option value="">—</option>
                {(employees ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ft('trainers.specialization')}</Label>
              <Input value={form.specialization} onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{ft('trainers.experience')}</Label>
              <Input value={form.experience} onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Phone</Label>
              <Input className="nums" dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
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
