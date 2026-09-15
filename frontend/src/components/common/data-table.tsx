import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Copy, Download, Printer, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
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
  /** Real Excel export for this table. When omitted, the legacy placeholder remains. */
  onExportExcel?: () => void | Promise<void>;
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
  onExportExcel,
}: DataTableProps<T>) {
  const { t, ui } = useLocale();
  const resolvedSearchPlaceholder = searchPlaceholder ?? ui('بحث في الجدول…');
  const resolvedEmptyTitle = emptyTitle ?? t('shared.noData');
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
  });

  const handleCopy = () => {
    const headers = columns.map((c) => (typeof c.header === 'string' ? c.header : c.id ?? '')).join('\t');
    const rows = data.map((row) =>
      columns
        .map((col) => {
          const key = (col as { accessorKey?: string }).accessorKey;
          if (!key) return '';
          return String((row as Record<string, unknown>)[key] ?? '');
        })
        .join('\t'),
    );
    void navigator.clipboard.writeText([headers, ...rows].join('\n'));
    toast.success(ui('تم النسخ'));
  };

  const handlePrint = () => window.print();

  if (isError) {
    return <ErrorState message={errorMessage} onRetry={onRetry} />;
  }

  const hasToolbar = !!(onSearchChange || toolbar || (enableExport && data.length > 0));

  return (
    <div className="space-y-3">
      <div className="surface-panel overflow-hidden rounded-xl border bg-card shadow-sm">
        {hasToolbar && (
          <div className="table-panel-header flex flex-col gap-3 border-b border-primary/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2">
              {onSearchChange && (
                <div className="relative max-w-sm flex-1">
                  <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pe-9 h-9 text-sm"
                    placeholder={resolvedSearchPlaceholder}
                    value={search ?? ''}
                    onChange={(e) => onSearchChange(e.target.value)}
                  />
                </div>
              )}
              {toolbar}
            </div>
            {enableExport && data.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="size-4" />
                    {ui('تصدير')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleCopy}>
                    <Copy className="size-4" /> {ui('نسخ')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePrint}>
                    <Printer className="size-4" /> {ui('طباعة')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (onExportExcel) void onExportExcel();
                      else toast.info(ui('تصدير Excel — قريباً'));
                    }}
                  >
                    <Download className="size-4" /> Excel
                  </DropdownMenuItem>
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
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
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
