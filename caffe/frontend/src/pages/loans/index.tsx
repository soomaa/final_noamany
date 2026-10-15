import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { DataTable } from '@/components/common/data-table';
import { DateText, Money } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { ListStatusTabs } from '@/components/common/list-status-tabs';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { api, apiError } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface LoanRow {
  id: number;
  employeeName?: string;
  amount?: number;
  remaining?: number;
  installments?: number;
  status?: string;
  createdAt?: string;
}

const LOAN_STATUS_TABS = [
  { value: '', label: uiStatic('كل الطلبات') },
  { value: 'incoming', label: uiStatic('الواردة') },
  { value: 'approved', label: uiStatic('المقبولة') },
  { value: 'rejected', label: uiStatic('المرفوضة') },
];

export function LoansPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<LoanRow>('loans', params);
  const { data: empOptions = [] } = useEmployeeOptions();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ empId: '', amount: '', installments: '12', reason: '' });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/loans/${id}`),
    { success: ui('تم حذف السلفة'), invalidate: ['loans'] },
  );

  const handleDelete = async (row: LoanRow) => {
    const ok = await confirm({
      title: ui('حذف السلفة'),
      description: `${ui('هل تريد حذف سلفة «')}${row.employeeName ?? ui('الموظف')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<LoanRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    {
      accessorKey: 'amount',
      header: ui('المبلغ'),
      cell: ({ getValue }) => <Money value={getValue() as number | undefined} />,
    },
    {
      accessorKey: 'remaining',
      header: ui('المتبقي'),
      cell: ({ getValue }) => <Money value={getValue() as number | undefined} />,
    },
    {
      accessorKey: 'installments',
      header: ui('الأقساط'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const s = getValue() as string | undefined;
        const key = s === 'paid' ? 'paid' : s === 'approved' ? 'approved' : 'pending';
        return <StatusBadge status={key} />;
      },
    },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('السلف')} />
        <NotImplementedState title={ui('السلف قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('السلف')}
        description={ui('إدارة سلف وقروض الموظفين')}
        actions={
          <Button variant="brand" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> {ui('سلفة جديدة')}
          </Button>
        }
      />
      <ListStatusTabs tabs={LOAN_STATUS_TABS} />
      <FilterBar searchPlaceholder={ui('بحث في السلف…')} />
      <DataTable
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
        emptyTitle={ui('لا توجد سلف')}
      />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ui('سلفة جديدة')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{ui('الموظف')}</Label>
              <div className="mt-1.5"><Combobox value={createForm.empId} onValueChange={(v) => setCreateForm((f) => ({ ...f, empId: v }))} options={empOptions} placeholder={ui('اختر الموظف…')} /></div>
            </div>
            <div><Label>{ui('المبلغ')}</Label><Input className="mt-1.5 nums" value={createForm.amount} onChange={(e) => setCreateForm((f) => ({ ...f, amount: e.target.value }))} /></div>
            <div><Label>{ui('عدد الأقساط')}</Label><Input className="mt-1.5 nums" value={createForm.installments} onChange={(e) => setCreateForm((f) => ({ ...f, installments: e.target.value }))} /></div>
            <div><Label>{ui('السبب')}</Label><Input className="mt-1.5" value={createForm.reason} onChange={(e) => setCreateForm((f) => ({ ...f, reason: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={async () => {
              try {
                await api.post('/loans', {
                  empId: Number(createForm.empId),
                  amount: Number(createForm.amount),
                  installments: Number(createForm.installments),
                  reason: createForm.reason,
                  deductionStartDate: new Date().toISOString().slice(0, 10),
                });
                toast.success(ui('تم إنشاء السلفة'));
                setCreateOpen(false);
                void refetch();
              } catch (e) {
                toast.error(apiError(e));
              }
            }}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
