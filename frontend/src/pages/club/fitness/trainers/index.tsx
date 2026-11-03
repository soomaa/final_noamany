import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/common/combobox';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList, useArrayResource } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubTrainerRow } from '@/types/fitness';
import { RowActions } from '../shared';

export function FitnessTrainersPage() {
  const ft = useFitnessT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubTrainerRow>('club-trainers', params);
  const { data: employees } = useArrayResource<{ id: number; employee: string }>('employees/pos-options');
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
    isActive: true,
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/club-trainers/${id}`),
    { success: ft('common.success'), invalidate: ['club-trainers'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', employeeId: '', email: '', phone: '', specialization: '', experience: '', bio: '', isActive: true });
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
      isActive: row.isActive,
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
      // Empty strings / null clear a field on edit (e.g. removing the employee link).
      const payload = {
        name: form.name.trim(),
        employeeId: form.employeeId ? Number(form.employeeId) : null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        specialization: form.specialization.trim() || null,
        experience: form.experience.trim() || null,
        bio: form.bio.trim() || null,
        isActive: form.isActive,
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
      { accessorKey: 'phone', header: 'الهاتف', cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      }},
      {
        id: 'link',
        header: 'النوع',
        cell: ({ row }) => (row.original.employeeId ? 'موظف' : 'كابتن خارجي'),
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
              <Combobox
                value={form.employeeId}
                onValueChange={(v) => setForm((f) => ({ ...f, employeeId: v }))}
                options={[
                  { value: '', label: 'بدون ربط (كابتن خارجي)' },
                  ...(employees ?? []).map((e) => ({ value: String(e.id), label: e.employee })),
                ]}
                placeholder="اختر موظفاً…"
                searchPlaceholder="بحث عن موظف…"
              />
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
              <Label>نبذة</Label>
              <Textarea rows={3} value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>البريد الإلكتروني</Label>
              <Input dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>الهاتف</Label>
              <Input className="nums" dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <label className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm">
                <span className="font-medium">نشط</span>
                <span className="block text-xs text-muted-foreground">المدرب غير النشط لا يظهر عند جدولة الحصص ولا في التارجت والتقييم.</span>
              </span>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
            </label>
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
