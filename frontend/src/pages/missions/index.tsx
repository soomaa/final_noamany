import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus, Trash2, X } from 'lucide-react';
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
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface MissionRow {
  id: number;
  employeeName?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

export function MissionsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('leaves.missions:create');
  const canApprove = can('leaves.missions:approve');
  const canReject = can('leaves.missions:reject');
  const canDelete = can('leaves.missions:delete');
  const { data: employees = [] } = useEmployeeOptions(canCreate);
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<MissionRow>('missions', params);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ empId: '', destination: '', startDate: '', endDate: '', purpose: '' });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/missions/${id}`),
    { success: ui('تم حذف المأمورية'), invalidate: ['missions'] },
  );

  const handleDelete = async (row: MissionRow) => {
    if (!canDelete) return;
    const ok = await confirm({
      title: ui('حذف المأمورية'),
      description: `${ui('هل تريد حذف مأمورية «')}${row.employeeName ?? ui('الموظف')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const openForm = () => {
    if (!canCreate) return;
    setForm({ empId: '', destination: '', startDate: '', endDate: '', purpose: '' });
    setOpen(true);
  };

  const save = async () => {
    if (!canCreate) return;
    if (!form.empId || !form.destination.trim() || !form.startDate || !form.endDate) return;
    setSaving(true);
    try {
      await api.post('/missions', {
        empId: Number(form.empId),
        destination: form.destination.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        ...(form.purpose.trim() ? { purpose: form.purpose.trim() } : {}),
      });
      toast.success(ui('تم حفظ المأمورية'));
      setOpen(false);
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row: MissionRow, action: 'approve' | 'reject') => {
    if (action === 'approve' ? !canApprove : !canReject) return;
    await api.patch(`/missions/${row.id}/${action}`);
    toast.success(action === 'approve' ? ui('تم اعتماد المأمورية') : ui('تم رفض المأمورية'));
    await refetch();
  };

  const columns: ColumnDef<MissionRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'destination', header: ui('الوجهة') },
    {
      accessorKey: 'startDate',
      header: ui('من'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'endDate',
      header: ui('إلى'),
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
          {row.original.status !== 'approved' && canApprove ? <Button permissionResource="leaves.missions" permissionAction="approve" variant="ghost" size="icon" aria-label={ui('اعتماد')} onClick={() => void changeStatus(row.original, 'approve')}><Check className="size-4 text-emerald-600" /></Button> : null}
          {row.original.status !== 'rejected' && canReject ? <Button permissionResource="leaves.missions" permissionAction="reject" variant="ghost" size="icon" aria-label={ui('رفض')} onClick={() => void changeStatus(row.original, 'reject')}><X className="size-4 text-amber-600" /></Button> : null}
          {canDelete ? <Button permissionResource="leaves.missions" permissionAction="delete" variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}><Trash2 className="size-4 text-destructive" /></Button> : null}
        </div>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('المأموريات')} />
        <NotImplementedState title={ui('المأموريات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('المأموريات')}
        description={ui('إدارة مأموريات العمل والانتدابات')}
        actions={
          canCreate ? <Button permissionResource="leaves.missions" permissionAction="create" variant="brand" size="sm" onClick={() => openForm()}>
            <Plus className="size-4" /> {ui('مأمورية جديدة')}
          </Button> : null
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في المأموريات…')} />
      <DataTable
        exportSource={{ resource: 'missions', params }}
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
        emptyTitle={ui('لا توجد مأموريات')}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ui('مأمورية جديدة')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>{ui('الموظف')}</Label><select className="h-10 rounded-md border bg-background px-3" value={form.empId} onChange={(event) => setForm((current) => ({ ...current, empId: event.target.value }))}><option value="">{ui('اختر الموظف')}</option>{employees.map((employee) => <option key={employee.value} value={employee.value}>{employee.label}</option>)}</select></div>
            <div className="grid gap-1.5"><Label>{ui('الوجهة')}</Label><Input value={form.destination} onChange={(event) => setForm((current) => ({ ...current, destination: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>{ui('من')}</Label><Input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>{ui('إلى')}</Label><Input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>{ui('الغرض')}</Label><Input value={form.purpose} onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button permissionAction={null} variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button><Button permissionResource="leaves.missions" permissionAction="create" disabled={saving} onClick={() => void save()}>{ui('حفظ')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
