import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
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

interface LeaveTypeRow {
  id: number;
  title?: string;
  maxDays?: number;
  isPaid?: boolean;
  isActive?: boolean;
}

export function LeaveTypesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<LeaveTypeRow>('leaves/types', params);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/leaves/types/${id}`),
    { success: ui('تم حذف نوع الإجازة'), invalidate: ['leaves/types'] },
  );

  const handleDelete = async (row: LeaveTypeRow) => {
    const ok = await confirm({
      title: ui('حذف نوع الإجازة'),
      description: `${ui('هل تريد حذف «')}${row.title ?? ui('هذا النوع')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<LeaveTypeRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('النوع') },
    {
      accessorKey: 'maxDays',
      header: ui('الحد الأقصى (يوم)'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'isPaid',
      header: ui('مدفوعة'),
      cell: ({ getValue }) => <StatusBadge status={getValue() ? 'active' : 'info'} label={getValue() ? ui('نعم') : ui('لا')} />,
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
        <PageHeader title={ui('أنواع الإجازات')} />
        <NotImplementedState title={ui('أنواع الإجازات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('أنواع الإجازات')}
        description={ui('تعريف أنواع الإجازات وحدودها')}
        actions={
          <Button variant="brand" size="sm">
            <Plus className="size-4" /> {ui('نوع جديد')}
          </Button>
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في أنواع الإجازات…')} />
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
        emptyTitle={ui('لا توجد أنواع إجازات')}
      />
    </div>
  );
}
