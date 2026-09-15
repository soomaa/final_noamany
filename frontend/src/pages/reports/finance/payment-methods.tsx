import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/common/data-table';
import { ClubStatCard } from '@/components/club/stat-card';
import { ReportShell, downloadCsv } from '@/components/reports/report-shell';
import { DateRangeFilter, firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { toArabicDigits } from '@/lib/utils';
import { uiStatic } from '@/lib/ui-static';
import { useLocale } from '@/store/locale';

const METHOD_LABELS: Record<string, string> = {
  cash: uiStatic('نقدي'),
  visa: uiStatic('فيزا'),
  card: uiStatic('بطاقة'),
  transfer: uiStatic('تحويل'),
  bank: uiStatic('تحويل بنكي'),
  wallet: uiStatic('محفظة'),
  online: uiStatic('إلكتروني'),
};

/**
 * Payment-methods report — aggregates subscriptions by payment_method inside the date window.
 * Uses /club-subscriptions with a large page size and groups client-side.
 */
export function FinancePaymentMethodsReportPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayLocal);
  const [branch, setBranch] = useState('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'finance-payment-methods', startDate, endDate, branch],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const branchParam = branchId ? { branch: String(branchId) } : {};
      const [subs, sales] = await Promise.all([
        fetchAllReportRows<{ paymentMethod: string | null; paidAmount: number }>('/club-subscriptions', {
          startDateFrom: startDate,
          startDateTo: endDate,
          ...branchParam,
        }),
        fetchAllReportRows<{ paymentMethod: string; totalAmount: number }>('/quick-sales', {
          dateFrom: startDate,
          dateTo: endDate,
          ...(branchId ? { branchId: String(branchId) } : {}),
          status: 'completed',
        }),
      ]);
      return { subs, sales };
    },
  });

  const rollup = useMemo(() => {
    const bucket = new Map<string, { method: string; count: number; total: number }>();
    const add = (raw: string, amount: number) => {
      const key = raw.toLowerCase();
      const label = METHOD_LABELS[key] ?? raw;
      const cur = bucket.get(key) ?? { method: label, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(amount ?? 0);
      bucket.set(key, cur);
    };
    for (const s of data?.subs ?? []) add((s.paymentMethod ?? 'cash').toLowerCase(), s.paidAmount);
    for (const s of data?.sales ?? []) add(String(s.paymentMethod ?? 'cash').toLowerCase(), s.totalAmount);
    return Array.from(bucket.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  const columns = useMemo<ColumnDef<(typeof rollup)[number]>[]>(
    () => [
      { accessorKey: 'method', header: ui('طريقة الدفع'), cell: ({ getValue }) => ui(String(getValue())) },
      { accessorKey: 'count', header: ui('عدد المعاملات'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
      { accessorKey: 'total', header: ui('إجمالي المبالغ'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
    ],
    [ui],
  );

  const totalAmount = rollup.reduce((s, r) => s + r.total, 0);
  const totalCount = rollup.reduce((s, r) => s + r.count, 0);

  const exportCsv = () =>
    downloadCsv(`payment-methods-${startDate}-${endDate}`, [
      [ui('طريقة الدفع'), ui('عدد المعاملات'), ui('إجمالي المبالغ')],
      ...rollup.map((r) => [r.method, r.count, r.total]),
    ]);

  return (
    <ReportShell
      title={ui('تقرير طرق الدفع')}
      description={ui('تفصيل المدفوعات حسب طريقة الدفع خلال الفترة')}
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
          <ClubStatCard label={ui('عدد الطرق')} value={rollup.length} />
          <ClubStatCard label={ui('عدد المعاملات')} value={totalCount} />
          <ClubStatCard label={ui('إجمالي المبالغ')} value={totalAmount} />
        </>
      }
      onExport={exportCsv}
    >
      <DataTable
        columns={columns}
        data={rollup}
        total={rollup.length}
        page={1}
        pageSize={rollup.length || 10}
        onPageChange={() => {}}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ui('لا توجد بيانات')}
        enableExport={false}
      />
    </ReportShell>
  );
}
