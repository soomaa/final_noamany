import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { ListPageShell } from '@/components/common/list-page-shell';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { StockBalanceRow } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { indexColumn } from './simple-crud-tab';

export function StockTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<StockBalanceRow>('stock', params);

  const columns = useMemo<ColumnDef<StockBalanceRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<StockBalanceRow>,
      {
        accessorKey: 'product',
        header: ui('المنتج'),
        cell: ({ row }) => row.original.product?.nameAr ?? '—',
      },
      {
        accessorKey: 'currentStock',
        header: ui('الكمية'),
        cell: ({ row, getValue }) => {
          const qty = getValue() as number;
          const low = qty <= (row.original.reorderPoint ?? 0);
          return (
            <span className={`nums ${low ? 'font-semibold text-destructive' : ''}`}>
              {toArabicDigits(qty)}
              {low && (
                <StatusBadge status="suspended" label={ui('نقص')} className="ms-2 inline-flex" />
              )}
            </span>
          );
        },
      },
      {
        accessorKey: 'reorderPoint',
        header: ui('حد إعادة الطلب'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
    ],
    [params.page, params.pageSize, ui],
  );

  return (
    <ListPageShell
      title={ui('أرصدة المخزون')}
      isError={isError}
      error={error}
      isLoading={isLoading}
      onRetry={() => void refetch()}
    >
      <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link to="/inventory/transactions">{ui('حركة مخزنية')}</Link>
        </Button>
      </div>
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
      />
    </ListPageShell>
  );
}
