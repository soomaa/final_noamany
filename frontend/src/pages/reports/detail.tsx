import type { ColumnDef } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { getReportKeys } from '@/lib/i18n-constants';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface ReportRow {
  id: number;
  [key: string]: unknown;
}

function csvCell(value: unknown) {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadReportCsv(rows: ReportRow[], columns: string[], key: string) {
  const csv = [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${key}-report.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportDetailPage() {
  const { ui, t } = useLocale();
  const { key } = useParams<{ key: string }>();
  const meta = useMemo(() => getReportKeys(t).find((r) => r.key === key), [t, key]);
  const { params, setParams } = useListQuery();

  const { data, isLoading, isError, error, refetch } = usePaginatedList<ReportRow>(
    `reports/${key}`,
    params,
    !!key,
  );

  const exportColumns = useMemo(() => {
    const rows = data?.data ?? [];
    return [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((column) => column !== 'id').slice(0, 12);
  }, [data?.data]);

  const columns: ColumnDef<ReportRow>[] = useMemo(() => [
    { id: 'serial', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    ...exportColumns.map<ColumnDef<ReportRow>>((column) => ({
      accessorKey: column,
      header: column.replace(/_/g, ' '),
      cell: ({ getValue }) => {
        const value = getValue();
        return value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
      },
    })),
  ], [exportColumns, params.page, params.pageSize, ui]);

  if (!meta) {
    return <NotImplementedState title={ui('تقرير غير معروف')} />;
  }

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={meta.title} />
        <NotImplementedState title={ui('التقرير قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={meta.title}
        description={ui('تقرير')}
        actions={
          <Button variant="outline" disabled={exportColumns.length === 0} onClick={() => downloadReportCsv(data?.data ?? [], exportColumns, key ?? 'report')}>
            <Download className="me-2 size-4" />
            {ui('تصدير CSV')}
          </Button>
        }
      />
      <FilterBar searchPlaceholder={ui('بحث في التقرير…')} />
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
        emptyTitle={ui('لا توجد نتائج للتقرير')}
      />
    </div>
  );
}
