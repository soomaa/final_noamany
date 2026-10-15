import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
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
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<MissionRow>('missions', params);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/missions/${id}`),
    { success: ui('تم حذف المأمورية'), invalidate: ['missions'] },
  );

  const handleDelete = async (row: MissionRow) => {
    const ok = await confirm({
      title: ui('حذف المأمورية'),
      description: `${ui('هل تريد حذف مأمورية «')}${row.employeeName ?? ui('الموظف')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
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
        <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
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
          <Button variant="brand" size="sm">
            <Plus className="size-4" /> {ui('مأمورية جديدة')}
          </Button>
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في المأموريات…')} />
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
        emptyTitle={ui('لا توجد مأموريات')}
      />
    </div>
  );
}
