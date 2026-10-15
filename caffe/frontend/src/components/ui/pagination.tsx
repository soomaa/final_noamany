import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}: PaginationProps) {
  const { ui } = useLocale();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {ui('عرض')} {toArabicDigits(from)}–{toArabicDigits(to)} {ui('من')} {toArabicDigits(total)}
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-9 w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {toArabicDigits(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-9" disabled={page <= 1} onClick={() => onPageChange(1)} aria-label={ui('الصفحة الأولى')}>
            <ChevronsRight />
          </Button>
          <Button variant="outline" size="icon" className="size-9" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={ui('السابق')}>
            <ChevronRight />
          </Button>
          <span className="min-w-[80px] text-center text-sm nums">
            {toArabicDigits(page)} / {toArabicDigits(totalPages)}
          </span>
          <Button variant="outline" size="icon" className="size-9" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label={ui('التالي')}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" className="size-9" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)} aria-label={ui('الصفحة الأخيرة')}>
            <ChevronsLeft />
          </Button>
        </div>
      </div>
    </div>
  );
}
