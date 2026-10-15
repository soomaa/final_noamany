import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { DateText, Money } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface PayrollRunRow {
  id: number;
  title?: string;
  month?: string;
  year?: number;
  totalAmount?: number;
  status?: string;
  createdAt?: string;
}

export function PayrollRunsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<PayrollRunRow>('payroll/runs', params);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/payroll/runs/${id}`),
    { success: ui('تم حذف المسيرة'), invalidate: ['payroll/runs'] },
  );

  const handleDelete = async (row: PayrollRunRow) => {
    const ok = await confirm({
      title: ui('حذف مسيرة الرواتب'),
      description: `${ui('هل تريد حذف مسيرة «')}${row.title ?? row.month ?? ui('هذه المسيرة')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<PayrollRunRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      accessorKey: 'title',
      header: ui('المسيرة'),
      cell: ({ row }) => (
        <Link to={`/payroll/runs/${row.original.id}`} className="font-medium text-primary hover:underline">
          {row.original.title ?? row.original.month ?? `${ui('مسيرة')} ${toArabicDigits(row.original.id)}`}
        </Link>
      ),
    },
    {
      accessorKey: 'month',
      header: ui('الشهر'),
      cell: ({ row }) => {
        const m = row.original.month;
        const y = row.original.year;
        if (m && y) return <span className="nums">{m} {toArabicDigits(y)}</span>;
        return m ?? '—';
      },
    },
    {
      accessorKey: 'totalAmount',
      header: ui('الإجمالي'),
      cell: ({ getValue }) => <Money value={getValue() as number | undefined} />,
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
      header: ui('تاريخ الإنشاء'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/payroll/runs/${row.original.id}`}>
              <Eye className="size-4" /> {ui('عرض')}
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('مسيرات الرواتب')} />
        <NotImplementedState title={ui('مسيرات الرواتب قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('مسيرات الرواتب')}
        description={ui('إنشاء ومراجعة مسيرات الرواتب الشهرية')}
        actions={
          <Button variant="brand" size="sm">
            <Plus className="size-4" /> {ui('مسيرة جديدة')}
          </Button>
        }
      />
      <FilterBar
        searchPlaceholder={ui('بحث في المسيرات…')}
        fields={[
          {
            key: 'status',
            label: ui('الحالة'),
            type: 'select',
            options: [
              { value: 'pending', label: ui('قيد الانتظار') },
              { value: 'approved', label: ui('معتمد') },
              { value: 'paid', label: ui('مدفوع') },
            ],
          },
        ]}
      />
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
        emptyTitle={ui('لا توجد مسيرات رواتب')}
      />
    </div>
  );
}
