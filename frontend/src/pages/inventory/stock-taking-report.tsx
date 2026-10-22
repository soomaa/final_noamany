import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { WarehouseSelect } from '@/components/inventory/warehouse-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { InventoryPageShell } from './inventory-shell';
import { indexColumn } from './simple-crud-tab';
import { type CountSession, STATUS_LABELS, StockCountDetailsDialog } from './stock-count-shared';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Stock-count reports ("محاضر الجرد") within a date range, optionally for one warehouse. */
export function InventoryStockTakingReportPage() {
  const { ui } = useLocale();
  // Default range: the current month up to today.
  const defaults = useMemo(() => {
    const now = new Date();
    return { filters: { dateFrom: isoDay(new Date(now.getFullYear(), now.getMonth(), 1, 12)), dateTo: isoDay(now) } };
  }, []);
  const { params, setParams } = useListQuery(defaults);
  const { data, isLoading, isError, refetch } = usePaginatedList<CountSession>('stock-taking', params);
  const [details, setDetails] = useState<CountSession | null>(null);

  const setFilter = (key: string, value: string) => setParams({ filters: { [key]: value }, page: 1 });

  const showDetails = async (id: number) => {
    try {
      setDetails((await api.get<CountSession>(`/stock-taking/${id}`)).data);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns = useMemo<ColumnDef<CountSession>[]>(
    () => [
      { ...indexColumn(params.page, params.pageSize), size: 40 } as ColumnDef<CountSession>,
      { accessorKey: 'sessionNumber', header: ui('رقم محضر الجرد'), size: 170 },
      {
        accessorKey: 'createdAt',
        header: ui('التاريخ'),
        size: 95,
        cell: ({ getValue }) => <span className="nums">{String(getValue()).slice(0, 10)}</span>,
      },
      { accessorKey: 'warehouseName', header: ui('المخزن'), size: 120, cell: ({ getValue }) => (getValue() as string) || '—' },
      { accessorKey: 'categoryName', header: ui('النوع'), size: 80, cell: ({ getValue }) => (getValue() as string) || '—' },
      { accessorKey: 'createdByName', header: ui('اسم الموظف'), size: 90, cell: ({ getValue }) => (getValue() as string) || '—' },
      {
        id: 'itemsCount',
        header: ui('عدد الأصناف'),
        size: 75,
        cell: ({ row }) => <span className="nums">{toArabicDigits(row.original.items?.length ?? 0)}</span>,
      },
      {
        id: 'differences',
        header: ui('أصناف بها فروق'),
        size: 85,
        cell: ({ row }) => <span className="nums">{toArabicDigits((row.original.items ?? []).filter((i) => i.variance !== 0).length)}</span>,
      },
      { accessorKey: 'status', header: ui('الحالة'), size: 90, cell: ({ getValue }) => ui(STATUS_LABELS[getValue() as string] ?? (getValue() as string)) },
      {
        id: 'actions',
        header: ui('الإجراءات'),
        size: 70,
        cell: ({ row }) => (
          <Button variant="ghost" size="icon" title={ui('تفاصيل')} onClick={() => void showDetails(row.original.id)}>
            <Eye className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [params.page, params.pageSize, ui],
  );

  return (
    <InventoryPageShell title={ui('تقرير محاضر الجرد')} description={ui('محاضر الجرد خلال فترة لمخزن محدد')}>
      <div className="space-y-4">
        <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="count-report-from">{ui('من تاريخ')}</Label>
            <Input
              id="count-report-from"
              type="date"
              className="nums"
              value={params.filters.dateFrom ?? ''}
              max={params.filters.dateTo || undefined}
              onChange={(e) => setFilter('dateFrom', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="count-report-to">{ui('إلى تاريخ')}</Label>
            <Input
              id="count-report-to"
              type="date"
              className="nums"
              value={params.filters.dateTo ?? ''}
              min={params.filters.dateFrom || undefined}
              onChange={(e) => setFilter('dateTo', e.target.value)}
            />
          </div>
          <WarehouseSelect
            value={params.filters.warehouseId ?? ''}
            onChange={(id) => setFilter('warehouseId', id)}
            label="المخزن"
            emptyLabel="كل المخازن"
          />
        </div>

        <DataTable
          columns={columns}
          compact
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
        />
      </div>

      <StockCountDetailsDialog session={details} onClose={() => setDetails(null)} />
    </InventoryPageShell>
  );
}
