import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { ListStatusTabs } from '@/components/common/list-status-tabs';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';
import { usePermission } from '@/hooks/use-permission';

interface LeaveRow {
  id: number;
  employeeName?: string;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  status?: string;
}

const LEAVE_STATUS_TABS = [
  { value: '', label: uiStatic('كل الطلبات') },
  { value: 'incoming', label: uiStatic('الواردة') },
  { value: 'approved', label: uiStatic('المقبولة') },
  { value: 'rejected', label: uiStatic('المرفوضة') },
  { value: 'pending', label: uiStatic('قيد الانتظار') },
];

export function LeavesPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('leaves.list:create');
  const canApprove = can('leaves.list:approve');
  const canReject = can('leaves.list:reject');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<LeaveRow>('leaves', params);

  const approveMutation = useMutationWithToast(
    (id: number) => api.post(`/leaves/${id}/approve`),
    { success: ui('تم اعتماد الإجازة'), invalidate: ['leaves'] },
  );

  const rejectMutation = useMutationWithToast(
    (id: number) => api.post(`/leaves/${id}/reject`),
    { success: ui('تم رفض الإجازة'), invalidate: ['leaves'] },
  );

  const handleApprove = async (row: LeaveRow) => {
    const ok = await confirm({
      title: ui('اعتماد الإجازة'),
      description: `${ui('هل تريد اعتماد إجازة «')}${row.employeeName ?? ui('الموظف')}${ui('»؟')}`,
      confirmLabel: ui('اعتماد'),
    });
    if (ok) approveMutation.mutate(row.id);
  };

  const handleReject = async (row: LeaveRow) => {
    const ok = await confirm({
      title: ui('رفض الإجازة'),
      description: `${ui('هل تريد رفض إجازة «')}${row.employeeName ?? ui('الموظف')}${ui('»؟')}`,
      confirmLabel: ui('رفض'),
      variant: 'destructive',
    });
    if (ok) rejectMutation.mutate(row.id);
  };

  const columns: ColumnDef<LeaveRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    { accessorKey: 'leaveType', header: ui('نوع الإجازة') },
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
      accessorKey: 'days',
      header: ui('الأيام'),
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
        const key = s === 'approved' ? 'approved' : s === 'rejected' ? 'rejected' : 'pending';
        return <StatusBadge status={key} />;
      },
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => {
        const pending = row.original.status === 'pending' || !row.original.status;
        if (!pending || (!canApprove && !canReject)) return '—';
        return (
          <div className="flex gap-1">
            {canApprove ? <Button
              variant="outline"
              size="sm"
              disabled={approveMutation.isPending}
              onClick={() => void handleApprove(row.original)}
            >
              <Check className="size-4 text-success" /> {ui('اعتماد')}
            </Button> : null}
            {canReject ? <Button
              variant="outline"
              size="sm"
              disabled={rejectMutation.isPending}
              onClick={() => void handleReject(row.original)}
            >
              <X className="size-4 text-destructive" /> {ui('رفض')}
            </Button> : null}
          </div>
        );
      },
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('الإجازات')} />
        <NotImplementedState title={ui('الإجازات قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('الإجازات')}
        description={ui('متابعة واعتماد طلبات الإجازات')}
        actions={canCreate ? (
          <Button variant="brand" size="sm" asChild>
            <Link to="/leaves/new">
              <Plus className="size-4" /> {ui('طلب إجازة')}
            </Link>
          </Button>
        ) : undefined}
      />
      <ListStatusTabs tabs={LEAVE_STATUS_TABS} />
      <FilterBar
        searchPlaceholder={ui('بحث في الإجازات…')}
        fields={[
          {
            key: 'status',
            label: ui('الحالة'),
            type: 'select',
            options: [
              { value: 'pending', label: ui('قيد الانتظار') },
              { value: 'incoming', label: ui('واردة') },
              { value: 'approved', label: ui('معتمد') },
              { value: 'rejected', label: ui('مرفوض') },
            ],
          },
        ]}
      />
      <DataTable
        exportSource={{ resource: 'leaves', params }}
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
        emptyTitle={ui('لا توجد طلبات إجازة')}
      />
    </div>
  );
}
