import type { ColumnDef } from '@tanstack/react-table';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/use-permission';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface PenaltyRow {
  id: number;
  employeeName?: string;
  title?: string;
  amount?: number;
  date?: string;
  status?: string;
}

export function PenaltiesPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('finance.penalties:create');
  const canUpdate = can('finance.penalties:update');
  const canDelete = can('finance.penalties:delete');
  const canApprove = can('finance.penalties:approve');
  const canReject = can('finance.penalties:reject');
  const { data: employees = [] } = useEmployeeOptions(canCreate);
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<PenaltyRow>('penalties', params);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PenaltyRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ empId: '', title: '', amount: '', date: '' });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/penalties/${id}`),
    { success: ui('تم حذف الجزاء'), invalidate: ['penalties'] },
  );

  const handleDelete = async (row: PenaltyRow) => {
    if (!canDelete) return;
    const ok = await confirm({
      title: ui('حذف الجزاء'),
      description: `${ui('هل تريد حذف جزاء «')}${row.employeeName ?? ui('الموظف')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const openForm = (row?: PenaltyRow) => {
    if (row ? !canUpdate : !canCreate) return;
    setEditing(row ?? null);
    setForm({ empId: '', title: row?.title ?? '', amount: row?.amount != null ? String(row.amount) : '', date: row?.date ?? '' });
    setOpen(true);
  };

  const save = async () => {
    if (editing ? !canUpdate : !canCreate) return;
    if (!editing && !form.empId) return;
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = { ...(!editing ? { empId: Number(form.empId) } : {}), title: form.title.trim(), amount: form.amount || '0', date: form.date || undefined };
      if (editing) await api.patch(`/penalties/${editing.id}`, payload);
      else await api.post('/penalties', payload);
      toast.success(ui('تم حفظ الجزاء'));
      setOpen(false);
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row: PenaltyRow, action: 'approve' | 'reject') => {
    if (action === 'approve' ? !canApprove : !canReject) return;
    await api.patch(`/penalties/${row.id}/${action}`);
    toast.success(action === 'approve' ? ui('تم اعتماد الجزاء') : ui('تم رفض الجزاء'));
    await refetch();
  };

  const columns: ColumnDef<PenaltyRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'title', header: ui('الجزاء') },
    {
      accessorKey: 'amount',
      header: ui('القيمة'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'date',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const s = getValue() as string | undefined;
        const key = s === 'approved' ? 'approved' : s === 'rejected' ? 'rejected' : 'pending';
        return <StatusBadge status={key} />;
      },
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          {canUpdate ? <Button permissionResource="finance.penalties" permissionAction="update" variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openForm(row.original)}><Pencil className="size-4" /></Button> : null}
          {row.original.status !== 'approved' && canApprove ? <Button permissionResource="finance.penalties" permissionAction="approve" variant="ghost" size="icon" aria-label={ui('اعتماد')} onClick={() => void changeStatus(row.original, 'approve')}><Check className="size-4 text-emerald-600" /></Button> : null}
          {row.original.status !== 'rejected' && canReject ? <Button permissionResource="finance.penalties" permissionAction="reject" variant="ghost" size="icon" aria-label={ui('رفض')} onClick={() => void changeStatus(row.original, 'reject')}><X className="size-4 text-amber-600" /></Button> : null}
          {canDelete ? <Button permissionResource="finance.penalties" permissionAction="delete" variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}><Trash2 className="size-4 text-destructive" /></Button> : null}
        </div>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('الجزاءات')} />
        <NotImplementedState title={ui('الجزاءات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('الجزاءات')}
        description={ui('تسجيل ومتابعة جزاءات الموظفين')}
        actions={
          canCreate ? <Button permissionResource="finance.penalties" permissionAction="create" variant="brand" size="sm" onClick={() => openForm()}>
            <Plus className="size-4" /> {ui('جزاء جديد')}
          </Button> : null
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في الجزاءات…')} />
      <DataTable
        exportSource={{ resource: 'penalties', params }}
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(p) => setParams({ page: p })}
        onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        search={params.search}
        onSearchChange={(s) => setParams({ search: s, page: 1 })}
        emptyTitle={ui('لا توجد جزاءات')}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editing ? ui('تعديل الجزاء') : ui('جزاء جديد')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            {!editing ? <div className="grid gap-1.5"><Label>{ui('الموظف')}</Label><select className="h-10 rounded-md border bg-background px-3" value={form.empId} onChange={(event) => setForm((current) => ({ ...current, empId: event.target.value }))}><option value="">{ui('اختر الموظف')}</option>{employees.map((employee) => <option key={employee.value} value={employee.value}>{employee.label}</option>)}</select></div> : null}
            <div className="grid gap-1.5"><Label>{ui('الجزاء')}</Label><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>{ui('القيمة')}</Label><Input type="number" min={0} value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>{ui('التاريخ')}</Label><Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button permissionAction={null} variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button><Button permissionResource="finance.penalties" permissionAction={editing ? 'update' : 'create'} disabled={saving} onClick={() => void save()}>{ui('حفظ')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
