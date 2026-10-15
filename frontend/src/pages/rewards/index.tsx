import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { DateText, Money } from '@/components/common/formatters';
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

interface RewardRow {
  id: number;
  employeeName?: string;
  title?: string;
  amount?: number;
  date?: string;
  status?: string;
}

export function RewardsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('finance.rewards:create');
  const canDelete = can('finance.rewards:delete');
  const canApprove = can('finance.rewards:approve');
  const canReject = can('finance.rewards:reject');
  const { data: employees = [] } = useEmployeeOptions(canCreate);
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<RewardRow>('rewards', params);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ empId: '', title: '', amount: '', date: '' });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/rewards/${id}`),
    { success: ui('تم حذف المكافأة'), invalidate: ['rewards'] },
  );

  const handleDelete = async (row: RewardRow) => {
    if (!canDelete) return;
    const ok = await confirm({
      title: ui('حذف المكافأة'),
      description: `${ui('هل تريد حذف مكافأة «')}${row.employeeName ?? ui('الموظف')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const openForm = () => {
    if (!canCreate) return;
    setForm({ empId: '', title: '', amount: '', date: '' });
    setOpen(true);
  };

  const save = async () => {
    if (!canCreate) return;
    if (!form.empId || !form.title.trim()) return;
    setSaving(true);
    try {
      await api.post('/rewards', {
        title: form.title.trim(),
        date: form.date || undefined,
        details: [{ empCode: Number(form.empId), value: form.amount ? Math.round(Number(form.amount)) : 0 }],
      });
      toast.success(ui('تم الحفظ'));
      setOpen(false);
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row: RewardRow, action: 'approve' | 'reject') => {
    if (action === 'approve' ? !canApprove : !canReject) return;
    await api.patch(`/rewards/${row.id}/${action}`);
    toast.success(action === 'approve' ? ui('تم الاعتماد') : ui('تم الرفض'));
    await refetch();
  };

  const columns: ColumnDef<RewardRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'title', header: ui('المكافأة') },
    {
      accessorKey: 'amount',
      header: ui('القيمة'),
      cell: ({ getValue }) => <Money value={getValue() as number | undefined} />,
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
          {row.original.status !== 'approved' && canApprove ? (
            <Button permissionResource="finance.rewards" permissionAction="approve" variant="ghost" size="icon" aria-label={ui('اعتماد')} onClick={() => void changeStatus(row.original, 'approve')}>
              <Check className="size-4 text-emerald-600" />
            </Button>
          ) : null}
          {row.original.status !== 'rejected' && canReject ? (
            <Button permissionResource="finance.rewards" permissionAction="reject" variant="ghost" size="icon" aria-label={ui('رفض')} onClick={() => void changeStatus(row.original, 'reject')}>
              <X className="size-4 text-amber-600" />
            </Button>
          ) : null}
          {canDelete ? (
            <Button permissionResource="finance.rewards" permissionAction="delete" variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('المكافآت')} />
        <NotImplementedState title={ui('المكافآت قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('المكافآت')}
        description={ui('تسجيل ومتابعة مكافآت الموظفين')}
        actions={
          canCreate ? (
            <Button permissionResource="finance.rewards" permissionAction="create" variant="brand" size="sm" onClick={openForm}>
              <Plus className="size-4" /> {ui('مكافأة جديدة')}
            </Button>
          ) : null
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في المكافآت…')} />
      <DataTable
        exportSource={{ resource: 'rewards', params }}
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
        emptyTitle={ui('لا توجد مكافآت')}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ui('مكافأة جديدة')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{ui('الموظف')}</Label>
              <select className="h-10 rounded-md border bg-background px-3" value={form.empId} onChange={(event) => setForm((current) => ({ ...current, empId: event.target.value }))}>
                <option value="">{ui('اختر الموظف')}</option>
                {employees.map((employee) => <option key={employee.value} value={employee.value}>{employee.label}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5"><Label>{ui('المكافأة')}</Label><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>{ui('القيمة')}</Label><Input type="number" min={0} value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>{ui('التاريخ')}</Label><Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button permissionAction={null} variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button>
            <Button permissionResource="finance.rewards" permissionAction="create" disabled={saving} onClick={() => void save()}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
