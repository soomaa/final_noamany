import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
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
  const { can } = usePermission();
  const canConfigure = can('leaves.balances:configure');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<LeaveBalanceRow>('leaves/balances', params);
  const [carrying, setCarrying] = useState(false);

  const handleCarryOver = async () => {
    if (!canConfigure) return;
    const year = new Date().getFullYear();
    const ok = await confirm({
      title: ui('ترحيل الأرصدة'),
      description: `${ui('هل تريد ترحيل أرصدة الإجازات لعام ')}${toArabicDigits(year)}${ui('؟')}`,
      confirmLabel: ui('ترحيل'),
    });
    if (!ok) return;
    setCarrying(true);
    try {
      await api.post('/leaves/carry-over', { year });
      toast.success(ui('تم ترحيل الأرصدة'));
      await refetch();
    } finally {
      setCarrying(false);
    }
  };

  const columns: ColumnDef<LeaveBalanceRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      accessorKey: 'empCode',
      header: ui('كود الموظف'),
      cell: ({ getValue }) => <span className="nums">{formatDigits(getValue() as string ?? '—')}</span>,
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
      <PageHeader
        title={ui('أرصدة الإجازات')}
        description={ui('عرض أرصدة الإجازات لكل موظف')}
        actions={
          canConfigure ? (
            <Button permissionResource="leaves.balances" permissionAction="configure" variant="brand" size="sm" disabled={carrying} onClick={() => void handleCarryOver()}>
              {ui('ترحيل الأرصدة')}
            </Button>
          ) : null
        }
      />
      <FilterBar searchPlaceholder={ui('بحث بالاسم أو الكود…')} />
      <DataTable
        exportSource={{ resource: 'leaves/balances', params }}
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
