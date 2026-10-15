import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
import { Money } from '@/components/common/formatters';
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

interface PayComponentRow {
  id: number;
  title?: string;
  type?: string;
  amount?: number;
  isActive?: boolean;
}

export function PayComponentsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<PayComponentRow>('payroll/components', params);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/payroll/components/${id}`),
    { success: ui('تم حذف المكون'), invalidate: ['payroll/components'] },
  );

  const handleDelete = async (row: PayComponentRow) => {
    const ok = await confirm({
      title: ui('حذف مكون الراتب'),
      description: `${ui('هل تريد حذف «')}${row.title ?? ui('هذا المكون')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
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
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')}>
            <Pencil className="size-4" />
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
          <Button variant="brand" size="sm">
            <Plus className="size-4" /> {ui('مكون جديد')}
          </Button>
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في المكونات…')} />
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
        emptyTitle={ui('لا توجد مكونات راتب')}
      />
    </div>
  );
}
