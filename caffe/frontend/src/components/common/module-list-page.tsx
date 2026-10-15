import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { NotImplementedState } from '@/components/common/states';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface ModuleRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
}

interface ModuleListPageProps {
  title: string;
  description?: string;
  apiKey: string;
  searchPlaceholder?: string;
}

export function ModuleListPage({ title, description, apiKey, searchPlaceholder }: ModuleListPageProps) {
  const { ui, t, locale } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ModuleRow>(apiKey, params);

  const columns: ColumnDef<ModuleRow>[] = [
    {
      accessorKey: 'id',
      header: t('table.index'),
      cell: ({ row }) => formatDigits((params.page - 1) * params.pageSize + row.index + 1, locale),
    },
    { accessorKey: 'title', header: ui('العنوان') },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    {
      accessorKey: 'createdAt',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <NotImplementedState title={ui(`${title} — قيد الإعداد على الخادم`)} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={title} description={description} />
      <FilterBar searchPlaceholder={searchPlaceholder ?? ui(`بحث في ${title}…`)} />
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
        emptyTitle={ui(`لا توجد بيانات في ${title}`)}
      />
    </div>
  );
}
