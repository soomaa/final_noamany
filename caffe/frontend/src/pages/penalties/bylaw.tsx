import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface BylawRow {
  id: number;
  title?: string;
  description?: string;
  penaltyDays?: number;
  penaltyAmount?: number;
}

export function PenaltiesBylawPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<BylawRow>('penalties/bylaw', params);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/penalties/bylaw/${id}`),
    { success: ui('تم حذف البند'), invalidate: ['penalties/bylaw'] },
  );

  const handleDelete = async (row: BylawRow) => {
    const ok = await confirm({
      title: ui('حذف بند اللائحة'),
      description: `${ui('هل تريد حذف «')}${row.title ?? ui('هذا البند')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<BylawRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('البند') },
    { accessorKey: 'description', header: ui('الوصف') },
    {
      accessorKey: 'penaltyDays',
      header: ui('أيام الجزاء'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'penaltyAmount',
      header: ui('قيمة الجزاء'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
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
        <PageHeader title={ui('لائحة الجزاءات')} />
        <NotImplementedState title={ui('لائحة الجزاءات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('لائحة الجزاءات')}
        description={ui('تعريف بنود لائحة الجزاءات والعقوبات')}
        actions={
          <Button variant="brand" size="sm">
            <Plus className="size-4" /> {ui('بند جديد')}
          </Button>
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في اللائحة…')} />
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
        emptyTitle={ui('لا توجد بنود في اللائحة')}
      />
    </div>
  );
}
