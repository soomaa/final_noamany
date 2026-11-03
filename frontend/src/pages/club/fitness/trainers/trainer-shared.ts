import { useEffect, useMemo, useState } from 'react';
import { toArabicDigits } from '@/lib/utils';

/** Today's date (YYYY-MM-DD) in Cairo, whatever the browser's or server's time zone. */
export function cairoToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
}

export const cairoMonth = () => cairoToday().slice(0, 7);

export const fmtNumber = (value: number) =>
  toArabicDigits((value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 }));

export const fmtPercent = (value: number) => `${fmtNumber(Math.round((value ?? 0) * 10) / 10)}٪`;

/**
 * Local pagination for tables whose rows are all loaded at once, so the pager only offers pages
 * that exist and actually moves between them. Goes back to page 1 when the rows change.
 */
export function useClientTable<T>(rows: T[], initialPageSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  useEffect(() => setPage(1), [rows]);
  const data = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);
  return {
    data,
    total: rows.length,
    page,
    pageSize,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
  };
}
