import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays, ChevronDown, Clock, DoorOpen, Inbox, Plus, Timer, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { RequestStatusChip } from '@/components/requests/request-flow';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { getRequestTypes, type RequestTypeKey } from '@/lib/i18n-constants';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

/** The everyday requests get their own buttons; the rest sit under «طلب آخر». */
const COMMON_TYPES: { key: RequestTypeKey; icon: LucideIcon }[] = [
  { key: 'leave', icon: CalendarDays },
  { key: 'permission', icon: DoorOpen },
  { key: 'overtime', icon: Timer },
];

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
  const filteredType = params.filters.type ? requestTypeMap[params.filters.type] : undefined;

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
      cell: ({ getValue }) => <RequestStatusChip status={getValue() as string | undefined} />,
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
        description={ui('إجازة · إذن · ساعات إضافية · سلفة · قرض · بدل · تعريف مرتب · استقالة · نقل · ترقية · تعديل بيانات')}
        actions={
          <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/requests/inbox"><Inbox className="size-4" /> {ui('بانتظار الموافقة')}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/requests/overtime"><Clock className="size-4" /> {ui('طلبات الساعات الإضافية')}</Link>
          </Button>
          </div>
        }
      />
      {/* New request: the three everyday types up front, the rest under «طلب آخر». */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{ui('طلب جديد')}:</span>
        {COMMON_TYPES.map(({ key, icon: Icon }) => requestTypeMap[key] && (
          <Button key={key} variant="brand" size="sm" asChild>
            <Link to={requestTypeMap[key].path}><Icon className="size-4" /> {requestTypeMap[key].label}</Link>
          </Button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="size-4" /> {ui('طلب آخر')} <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            {requestTypes.filter((item) => !COMMON_TYPES.some((c) => c.key === item.key)).map((item) => (
              <DropdownMenuItem key={item.key} asChild>
                <Link to={item.path}>{item.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <FilterBar
        hideSearch
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
              { value: 'pending', label: ui('قيد المراجعة') },
              { value: 'approved', label: ui('موافق') },
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
        searchPlaceholder={ui('بحث في الطلبات…')}
        emptyTitle={ui('لا توجد طلبات')}
        emptyAction={
          filteredType ? (
            <Button asChild>
              <Link to={filteredType.path}>{filteredType.label}</Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
