import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Money } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface PayComponentRow {
  id: number;
  title?: string;
  type?: string;
  category?: 'earning' | 'allowance' | 'deduction';
  amount?: number;
  isActive?: boolean;
}

export function PayComponentsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('payroll.pay_components:create');
  const canUpdate = can('payroll.pay_components:update');
  const canDelete = can('payroll.pay_components:delete');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<PayComponentRow>('payroll/components', params);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PayComponentRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'allowance' as 'earning' | 'allowance' | 'deduction', amount: '' });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/payroll/components/${id}`),
    { success: ui('تم حذف المكون'), invalidate: ['payroll/components'] },
  );

  const handleDelete = async (row: PayComponentRow) => {
    if (!canDelete) return;
    const ok = await confirm({
      title: ui('حذف مكون الراتب'),
      description: `${ui('هل تريد حذف «')}${row.title ?? ui('هذا المكون')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const openForm = (row?: PayComponentRow) => {
    if (row ? !canUpdate : !canCreate) return;
    setEditing(row ?? null);
    setForm({ title: row?.title ?? '', category: row?.category ?? 'allowance', amount: row?.amount != null ? String(row.amount) : '' });
    setOpen(true);
  };

  const save = async () => {
    if (editing ? !canUpdate : !canCreate) return;
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = { title: form.title.trim(), category: form.category, amount: Number(form.amount) || 0 };
      if (editing) await api.patch(`/payroll/components/${editing.id}`, payload);
      else await api.post('/payroll/components', payload);
      toast.success(ui('تم حفظ مكون الراتب'));
      setOpen(false);
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<PayComponentRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('المكون') },
    { accessorKey: 'type', header: ui('النوع') },
    {
      accessorKey: 'amount',
      header: ui('القيمة'),
      cell: ({ getValue }) => <Money value={getValue() as number | undefined} />,
    },
    {
      accessorKey: 'isActive',
      header: ui('الحالة'),
      cell: ({ getValue }) => <StatusBadge status={getValue() ? 'active' : 'suspended'} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => !canUpdate && !canDelete ? null : (
        <div className="flex gap-1">
          {canUpdate ? <Button permissionResource="payroll.pay_components" permissionAction="update" variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openForm(row.original)}>
            <Pencil className="size-4" />
          </Button> : null}
          {canDelete ? <Button permissionResource="payroll.pay_components" permissionAction="delete" variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
            <Trash2 className="size-4 text-destructive" />
          </Button> : null}
        </div>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('مكونات الراتب')} />
        <NotImplementedState title={ui('مكونات الراتب قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('مكونات الراتب')}
        description={ui('إدارة البدلات والاستقطاعات ومكونات الراتب')}
        actions={
          canCreate ? <Button permissionResource="payroll.pay_components" permissionAction="create" variant="brand" size="sm" onClick={() => openForm()}>
            <Plus className="size-4" /> {ui('مكون جديد')}
          </Button> : null
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في المكونات…')} />
      <DataTable
        exportSource={{ resource: 'payroll/components', params }}
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
        emptyTitle={ui('لا توجد مكونات راتب')}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editing ? ui('تعديل مكون الراتب') : ui('مكون راتب جديد')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>{ui('المكون')}</Label><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>{ui('النوع')}</Label><select className="h-10 rounded-md border bg-background px-3" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as typeof current.category }))}><option value="earning">{ui('استحقاق')}</option><option value="allowance">{ui('بدل')}</option><option value="deduction">{ui('استقطاع')}</option></select></div>
            <div className="grid gap-1.5"><Label>{ui('القيمة')}</Label><Input type="number" min={0} value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button permissionAction={null} variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button><Button permissionResource="payroll.pay_components" permissionAction={editing ? 'update' : 'create'} disabled={saving} onClick={() => void save()}>{ui('حفظ')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
