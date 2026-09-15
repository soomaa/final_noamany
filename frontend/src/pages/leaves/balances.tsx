import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { NotImplementedState } from '@/components/common/states';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface LeaveBalanceRow {
  id: number;
  employeeName?: string;
  empCode?: string;
  leaveType?: string;
  total?: number;
  used?: number;
  remaining?: number;
}

export function LeaveBalancesPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<LeaveBalanceRow>('leaves/balances', params);

  const columns: ColumnDef<LeaveBalanceRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      accessorKey: 'empCode',
      header: ui('كود الموظف'),
      cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string ?? '—')}</span>,
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'leaveType', header: ui('نوع الإجازة') },
    {
      accessorKey: 'total',
      header: ui('الإجمالي'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'used',
      header: ui('المستخدم'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'remaining',
      header: ui('المتبقي'),
      cell: ({ getValue }) => {
        const v = getValue() as number | undefined;
        return v != null ? (
          <span className={`nums font-medium ${v <= 0 ? 'text-destructive' : ''}`}>{toArabicDigits(v)}</span>
        ) : (
          '—'
        );
      },
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('أرصدة الإجازات')} />
        <NotImplementedState title={ui('أرصدة الإجازات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={ui('أرصدة الإجازات')} description={ui('عرض أرصدة الإجازات لكل موظف')} />
      <FilterBar searchPlaceholder={ui('بحث بالاسم أو الكود…')} />
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
        emptyTitle={ui('لا توجد أرصدة إجازات')}
      />
    </div>
  );
}
