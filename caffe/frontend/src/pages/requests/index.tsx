import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Inbox, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { getRequestTypes } from '@/lib/i18n-constants';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface RequestRow {
  id: number;
  type?: string;
  typeLabel?: string;
  employeeName?: string;
  title?: string;
  createdAt?: string;
  status?: string;
}

export function RequestsPage() {
  const { t, ui } = useLocale();
  const requestTypes = useMemo(() => getRequestTypes(t), [t]);
  const requestTypeMap = useMemo(
    () => Object.fromEntries(requestTypes.map((item) => [item.key, item])),
    [requestTypes],
  );
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<RequestRow>('requests', params);

  const columns: ColumnDef<RequestRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      accessorKey: 'type',
      header: ui('النوع'),
      cell: ({ row }) =>
        row.original.typeLabel ??
        (row.original.type && row.original.type in requestTypeMap
          ? requestTypeMap[row.original.type].label
          : row.original.type ?? '—'),
    },
    {
      accessorKey: 'employeeName',
      header: ui('الموظف'),
      cell: ({ row }) => (
        <Link to={`/requests/${row.original.id}`} className="font-medium text-primary hover:underline">
          {row.original.employeeName ?? '—'}
        </Link>
      ),
    },
    { accessorKey: 'title', header: ui('العنوان') },
    {
      accessorKey: 'createdAt',
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
      id: 'view',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/requests/${row.original.id}`}>{ui('عرض')}</Link>
        </Button>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('طلبات الموظفين')} />
        <NotImplementedState title={ui('صندوق الطلبات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('طلبات الموظفين')}
        description={ui('إجازة · إذن · سلفة · قرض · بدل · تعريف مرتب · استقالة · نقل · ترقية · تعديل بيانات')}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="brand">
                <Plus className="size-4" /> {ui('طلب جديد')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              {requestTypes.map((item) => (
                <DropdownMenuItem key={item.key} asChild>
                  <Link to={item.path}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <FilterBar
        searchPlaceholder={ui('بحث في الطلبات…')}
        extra={
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Inbox className="size-4" />
            <span className="nums">{toArabicDigits(data?.total ?? 0)}</span>
          </div>
        }
        fields={[
          {
            key: 'type',
            label: ui('النوع'),
            type: 'select',
            options: requestTypes.map((item) => ({ value: item.key, label: item.label })),
          },
          {
            key: 'status',
            label: ui('الحالة'),
            type: 'select',
            options: [
              { value: 'pending', label: ui('قيد الانتظار') },
              { value: 'approved', label: ui('معتمد') },
              { value: 'rejected', label: ui('مرفوض') },
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
        emptyTitle={ui('لا توجد طلبات')}
        emptyAction={
          <Button asChild>
            <Link to="/requests/new/leave">{ui('تقديم طلب إجازة')}</Link>
          </Button>
        }
      />
    </div>
  );
}
