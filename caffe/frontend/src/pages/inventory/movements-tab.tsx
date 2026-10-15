import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { usePaginatedList } from '@/lib/api-hooks';
import { formatDate } from '@/lib/formatters';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { InventoryMovementRow } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { indexColumn } from './simple-crud-tab';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { useBranches } from '@/hooks/use-branches';
import type { ProductListItem } from '@/types/inventory';

export function MovementsTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: branches = [] } = useBranches();
  const { data: productData } = usePaginatedList<ProductListItem>('products', { page: 1, pageSize: 200, search: '', filters: { status: 'active' } });
  const { data, isLoading, isError, error, refetch } = usePaginatedList<InventoryMovementRow>(
    'inventory-movements',
    params,
  );
  const filters = useMemo<FilterField[]>(() => [
    { key: 'branchId', label: ui('الفرع'), type: 'select', options: branches.map((branch) => ({ value: String(branch.id), label: branch.name || `${ui('فرع رقم')} ${branch.id}` })) },
    { key: 'productId', label: ui('الصنف'), type: 'select', options: (productData?.data ?? []).map((product) => ({ value: String(product.id), label: `${product.nameAr}${product.size ? ` — ${product.size}` : ''} · ${product.productCode}` })) },
    { key: 'txnType', label: ui('نوع الحركة'), type: 'select', options: [
      { value: 'receipt', label: ui('استلام مشتريات') }, { value: 'issue', label: ui('صرف/بيع') }, { value: 'transfer', label: ui('تحويل داخلي') },
      { value: 'adjustment', label: ui('تسوية جرد') }, { value: 'purchase_return', label: ui('مرتجع شراء') }, { value: 'sales_return', label: ui('مرتجع بيع') },
    ] },
    { key: 'dateFrom', label: ui('من تاريخ'), type: 'date' },
    { key: 'dateTo', label: ui('إلى تاريخ'), type: 'date' },
  ], [branches, productData, ui]);

  const columns = useMemo<ColumnDef<InventoryMovementRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<InventoryMovementRow>,
      {
        accessorKey: 'movementDate',
        header: ui('التاريخ'),
        cell: ({ getValue }) => formatDate(getValue() as string),
      },
      {
        accessorKey: 'txnType',
        header: ui('ماذا حدث'),
        cell: ({ row }) => {
          const labels: Record<string, string> = {
            receipt: ui('استلام مشتريات'), issue: ui('صرف/بيع'), transfer: ui('تحويل داخلي'),
            adjustment: ui('تسوية جرد'), purchase_return: ui('مرتجع شراء'), sales_return: ui('مرتجع بيع'),
          };
          return labels[row.original.txnType] ?? row.original.txnType;
        },
      },
      {
        accessorKey: 'direction',
        header: ui('التأثير'),
        cell: ({ row }) => (
          <span className={row.original.direction === 'in' ? 'font-medium text-emerald-700' : 'font-medium text-rose-700'}>
            {row.original.direction === 'in' ? ui('إضافة للمخزون') : ui('خصم من المخزون')}
          </span>
        ),
      },
      {
        accessorKey: 'quantity',
        header: ui('الكمية'),
        cell: ({ row }) => <span className="nums font-semibold">{row.original.direction === 'in' ? '+' : '-'}{toArabicDigits(Math.abs(row.original.quantity))}</span>,
      },
      {
        accessorKey: 'balanceAfter',
        header: ui('الرصيد بعد'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'docRef',
        header: ui('المصدر/المستند'),
        cell: ({ row }) => (
          <div><span className="block font-medium">{row.original.docRef ?? '—'}</span><span className="text-xs text-muted-foreground">{row.original.docType ?? ''}</span></div>
        ),
      },
      {
        accessorKey: 'actorName',
        header: ui('نفّذها'),
        cell: ({ row }) => row.original.actorName ?? (row.original.createdBy ? `#${row.original.createdBy}` : ui('النظام')),
      },
      {
        accessorKey: 'product',
        header: ui('المنتج'),
        cell: ({ row }) => row.original.product
          ? `${row.original.product.nameAr}${row.original.product.size ? ` — ${row.original.product.size}` : ''}`
          : '—',
      },
    ],
    [params.page, params.pageSize, ui],
  );

  return (
    <ListPageShell
      isError={isError}
      error={error}
      isLoading={isLoading}
      onRetry={() => void refetch()}
    >
      <FilterBar fields={filters} searchPlaceholder={ui('بحث برقم المستند أو الملاحظات…')} />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        isLoading={isLoading}
      />
    </ListPageShell>
  );
}
