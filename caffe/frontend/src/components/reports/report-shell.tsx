import { Download } from 'lucide-react';
import { ReactNode } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';

export interface ReportStat {
  label: string;
  value: string | number;
  hint?: string;
}

interface ReportShellProps {
  title: string;
  description?: string;
  stats?: ReactNode;
  filters?: ReactNode;
  onExport?: () => void;
  children: ReactNode;
  extraActions?: ReactNode;
}

/**
 * Shared shell for all report pages. Provides:
 *  - PageHeader with a CSV export button (when onExport is passed)
 *  - a filters row placeholder
 *  - a stats grid placeholder
 *  - the body area
 */
export function ReportShell({
  title,
  description,
  stats,
  filters,
  onExport,
  children,
  extraActions,
}: ReportShellProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="flex gap-2">
            {extraActions}
            {onExport && (
              <Button variant="outline" onClick={onExport}>
                <Download className="size-4" />
                CSV
              </Button>
            )}
          </div>
        }
      />
      {filters && <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">{filters}</div>}
      {stats && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats}</div>}
      {children}
    </div>
  );
}

/**
 * Turn a plain 2D array (headers + rows) into a downloadable CSV. BOM prefix so Excel opens Arabic.
 */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  if (!rows.length) return;
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const body = rows.map((r) => r.map(escape).join(',')).join('\n');
  const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
