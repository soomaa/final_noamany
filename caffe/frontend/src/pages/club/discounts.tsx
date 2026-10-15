import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { useClubT } from '@/hooks/use-club-t';
import { toArabicDigits } from '@/lib/utils';
import type { ClubSubscriptionListItem } from '@/types/club';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';

export function ClubDiscountsPage() {
  const ct = useClubT();
  const { params, setParams } = useListQuery({ filters: { hasDiscount: 'true' } });
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubSubscriptionListItem>(
    'club-subscriptions',
    params,
  );

  const columns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(
    () => [
      { accessorKey: 'subscriptionNumber', header: ct('subscriptions.subNumber') },
      { accessorKey: 'customerName', header: ct('common.customer') },
      {
        accessorKey: 'subscriptionValue',
        header: ct('subscriptions.value'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'discountValue',
        header: ct('subscriptions.discountValue'),
        cell: ({ getValue }) => <span className="nums text-green-600">-{toArabicDigits(getValue() as number)}</span>,
      },
      {
        id: 'net',
        header: ct('subscriptions.netValue'),
        cell: ({ row }) => (
          <span className="nums font-medium">
            {toArabicDigits(row.original.subscriptionValue - (row.original.discountValue ?? 0))}
          </span>
        ),
      },
      {
        accessorKey: 'remainingAmount',
        header: ct('subscriptions.remaining'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'status',
        header: ct('common.status'),
        cell: ({ row }) => {
          const map = { active: 'active', expired: 'expired', upcoming: 'pending' } as const;
          return <StatusBadge status={map[row.original.status]} />;
        },
      },
    ],
    [ct],
  );

  return (
    <div className="space-y-6">
      <PageHeader title={ct('subscriptions.discounts')} description={ct('subscriptions.discountsDesc')} />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ct('common.noData')}
      />
    </div>
  );
}
