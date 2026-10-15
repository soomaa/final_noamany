import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/common/data-table';
import { ClubStatCard } from '@/components/club/stat-card';
import { ReportShell, downloadCsv } from '@/components/reports/report-shell';
import { DateRangeFilter, firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export function FinanceExpensesReportPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayLocal);
  const [branch, setBranch] = useState('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'finance-expenses', startDate, endDate, branch],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const { data: r } = await api.get<{
        byCategory?: Array<{ category: string; count: number; totalAmount: number }>;
        byMonth?: Array<{ month: string; amount: number }>;
        grandTotal?: number;
      }>('/finance/expense-reports', {
        params: { dateFrom: startDate, dateTo: endDate, ...(branchId ? { branchId: String(branchId) } : {}) },
      });
      return r;
    },
  });

  const rows = data?.byCategory ?? [];
  const total = data?.grandTotal ?? 0;

  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(
    () => [
      { accessorKey: 'category', header: ui('التصنيف') },
      { accessorKey: 'count', header: ui('عدد المعاملات'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
      { accessorKey: 'totalAmount', header: ui('الإجمالي'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
    ],
    [ui],
  );

  const exportCsv = () =>
    downloadCsv(`expenses-${startDate}-${endDate}`, [
      [ui('التصنيف'), ui('عدد المعاملات'), ui('الإجمالي')],
      ...rows.map((r) => [r.category, r.count, r.totalAmount]),
    ]);

  return (
    <ReportShell
      title={ui('تقرير المصروفات')}
      description={ui('مصروفات الفترة مقسّمة حسب التصنيف')}
      filters={
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          extra={<BranchFilter value={branch} onChange={setBranch} />}
        />
      }
      stats={
        <>
          <ClubStatCard label={ui('إجمالي المصروفات')} value={total} />
          <ClubStatCard label={ui('عدد التصنيفات')} value={rows.length} />
        </>
      }
      onExport={exportCsv}
    >
      <DataTable
        columns={columns}
        data={rows}
        total={rows.length}
        page={1}
        pageSize={rows.length || 10}
        onPageChange={() => {}}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ui('لا توجد مصروفات')}
        enableExport={false}
      />
    </ReportShell>
  );
}
