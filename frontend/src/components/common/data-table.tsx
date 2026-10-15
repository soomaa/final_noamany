import { formatDisplayNumber, isIdentifierColumn } from '@/lib/number-display';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Copy, Download, Printer, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DebouncedSearchInput } from '@/components/common/debounced-search-input';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState } from '@/components/common/states';
import { toast } from 'sonner';
import { useLocale } from '@/store/locale';
import { useLocation } from 'react-router-dom';
import { usePermission } from '@/hooks/use-permission';
import { downloadExcel, type ExportColumn } from '@/lib/export';
import { fetchAllListRows, type ExportSource } from '@/lib/export-all-rows';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  enableExport?: boolean;
  /** Optional already-localized export projection. Use it when raw API fields are technical codes. */
  exportData?: Record<string, unknown>[];
  exportColumns?: ExportColumn[];
  /**
   * Pull every row matching the current filters when exporting, instead of only the
   * page on screen. Without it «تصدير» can only see `data`, i.e. one page of rows.
   */
  exportSource?: ExportSource<T>;
  rowClassName?: (row: T) => string | undefined;
}

export function DataTable<T>({
  columns,
  data,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  search,
  onSearchChange,
  searchPlaceholder,
  toolbar,
  emptyTitle,
  emptyDescription,
  emptyAction,
  enableExport = true,
  exportData,
  exportColumns,
  exportSource,
  rowClassName,
}: DataTableProps<T>) {
  const { t, ui } = useLocale();
  const location = useLocation();
  const { can, routeMap } = usePermission();
  const permissionResource = Object.entries(routeMap).reduce<{ key: string; length: number } | null>(
    (best, [route, key]) =>
      (location.pathname === route || location.pathname.startsWith(`${route}/`)) && route.length > (best?.length ?? -1)
        ? { key, length: route.length }
        : best,
    null,
  )?.key;
  // This flag declares table capability only. Each control remains fail-closed
  // against the current page's canonical export/print permission.
  const canExport = enableExport && Boolean(permissionResource && can(`${permissionResource}:export`));
  const canPrint = enableExport && Boolean(permissionResource && can(`${permissionResource}:print`));
  const resolvedSearchPlaceholder = searchPlaceholder ?? ui('بحث في الجدول…');
  const resolvedEmptyTitle = emptyTitle ?? t('shared.noData');
  const table = useReactTable({
    data,
    columns,
    defaultColumn: { cell: ({ getValue, column }) => {
      const value = getValue();
      if (value == null) return null;
      if (isIdentifierColumn(column.id)) return String(value);
      return typeof value === 'number' || typeof value === 'string' ? formatDisplayNumber(value) : String(value);
    } },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
  });

  const [exporting, setExporting] = useState(false);

  /** Columns to export, falling back to the accessor-keyed table columns. */
  const resolveExportColumns = (): ExportColumn[] =>
    exportColumns ?? columns.flatMap((column) => {
      const key = (column as { accessorKey?: string }).accessorKey;
      if (!key) return [];
      const header = typeof column.header === 'string' ? column.header : key;
      return [{ key, header } satisfies ExportColumn];
    });

  /**
   * Rows to export: the whole filtered result set when the page declares an
   * `exportSource`, otherwise the page currently rendered.
   */
  const resolveExportRows = async (): Promise<Record<string, unknown>[]> => {
    if (!exportSource) return exportData ?? (data as Record<string, unknown>[]);
    const rows = await fetchAllListRows<T>(exportSource.resource, exportSource.params);
    const project = exportSource.project;
    return project
      ? rows.map((row, index) => project(row, index))
      : (rows as Record<string, unknown>[]);
  };

  const handleCopy = async () => {
    const projectedColumns = resolveExportColumns();
    const projectedRows = await resolveExportRows();
    const headers = projectedColumns.map((column) => column.header).join('\t');
    const rows = projectedRows.map((row) =>
      projectedColumns
        .map((column) => String(row[column.key] ?? ''))
        .join('\t'),
    );
    await navigator.clipboard.writeText([headers, ...rows].join('\n'));
    toast.success(ui('تم النسخ'));
  };

  const handlePrint = () => window.print();

  const handleExcel = async () => {
    const resolvedExportColumns = resolveExportColumns();
    if (resolvedExportColumns.length === 0) {
      toast.error(ui('لا توجد أعمدة قابلة للتصدير'));
      return;
    }
    try {
      await downloadExcel(
        await resolveExportRows(),
        resolvedExportColumns,
        `${permissionResource ?? 'data'}-${new Date().toISOString().slice(0, 10)}.xlsx`,
        ui('البيانات'),
      );
      toast.success(ui('تم تصدير ملف Excel'));
    } catch {
      toast.error(ui('تعذر تصدير ملف Excel'));
    }
  };

  /** Serializes exports and surfaces failures, so a long fetch cannot be fired twice. */
  const runExport = (task: () => Promise<void>) => {
    if (exporting) return;
    setExporting(true);
    void task()
      .catch(() => toast.error(ui('تعذر تصدير البيانات')))
      .finally(() => setExporting(false));
  };

  if (isError) {
    return <ErrorState message={errorMessage} onRetry={onRetry} />;
  }

  const hasToolbar = !!(onSearchChange || toolbar || ((canExport || canPrint) && data.length > 0));

  return (
    <div className="space-y-3">
      <div className="surface-panel overflow-hidden rounded-xl border bg-card shadow-sm">
        {hasToolbar && (
          <div className="table-panel-header flex flex-col gap-3 border-b border-primary/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2">
              {onSearchChange && (
                <div className="relative max-w-sm flex-1">
                  <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <DebouncedSearchInput
                    key={location.pathname}
                    className="pe-9 h-9 text-sm"
                    placeholder={resolvedSearchPlaceholder}
                    aria-label={resolvedSearchPlaceholder}
                    value={search ?? ''}
                    onValueChange={onSearchChange}
                  />
                </div>
              )}
              {toolbar}
            </div>
            {(canExport || canPrint) && data.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={exporting}>
                    {canExport ? <Download className="size-4" /> : <Printer className="size-4" />}
                    {canExport ? ui(exporting ? 'جاري التصدير…' : 'تصدير') : ui('طباعة')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canExport ? <DropdownMenuItem onClick={() => runExport(handleCopy)}>
                    <Copy className="size-4" /> {ui('نسخ')}
                  </DropdownMenuItem> : null}
                  {canPrint ? <DropdownMenuItem onClick={handlePrint}>
                    <Printer className="size-4" /> {ui('طباعة')}
                  </DropdownMenuItem> : null}
                  {canExport ? <DropdownMenuItem onClick={() => runExport(handleExcel)}>
                    <Download className="size-4" /> Excel
                  </DropdownMenuItem> : null}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
        <Table>
          <TableHeader className="table-panel-header sticky top-0 z-10 border-b border-primary/10 backdrop-blur-sm">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data.length === 0 && (
              <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-4 sm:p-6">
                  <EmptyState
                    compact
                    title={resolvedEmptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                    className="empty-state-inset"
                  />
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className={rowClassName?.(row.original)} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {!isLoading && total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}
