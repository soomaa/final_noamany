import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/common/data-table';
import { ClubStatCard } from '@/components/club/stat-card';
import { ReportShell, downloadCsv } from '@/components/reports/report-shell';
import { DateRangeFilter, firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { api } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

const selectCls = 'flex h-10 rounded-md border border-input bg-background px-3 text-sm';

interface RevenueBySourceRow {
  source: string;
  count: number;
  netAmount: number;
}

interface RevenueByTypeRow {
  subscriptionTypeId: number | null;
  typeName: string;
  receiptsCount: number;
  gross: number;
  refunds: number;
  net: number;
}

interface RevenueReportResponse {
  bySource?: RevenueBySourceRow[];
  byMonth?: Array<{ month: string; amount: number }>;
  grandTotal?: number;
  subscriptions?: {
    gross: number;
    refunds: number;
    net: number;
    byType: RevenueByTypeRow[];
  };
}

/**
 * تقرير الإيرادات — reads from /finance/revenue-reports.
 * Server aggregates by source, by month, and by subscription type (receipts − refunds);
 * we surface the stat grid, the source breakdown, and the subscriptions-net breakdown.
 */
export function FinanceRevenueReportPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayLocal);
  const [branch, setBranch] = useState('all');
  const [subscriptionType, setSubscriptionType] = useState('all');

  const { data: subTypes } = useArrayResource<{ id: number; name: string }>('club-subscription-types');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'finance-revenue', startDate, endDate, branch, subscriptionType],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const { data: r } = await api.get<RevenueReportResponse>('/finance/revenue-reports', {
        params: {
          dateFrom: startDate,
          dateTo: endDate,
          ...(branchId ? { branchId: String(branchId) } : {}),
          ...(subscriptionType !== 'all' ? { subscriptionTypeId: subscriptionType } : {}),
        },
      });
      return r;
    },
  });

  const rows = data?.bySource ?? [];
  const total = data?.grandTotal ?? 0;
  const subs = data?.subscriptions;
  const typeRows = subs?.byType ?? [];

  const columns = useMemo<ColumnDef<RevenueBySourceRow>[]>(
    () => [
      { accessorKey: 'source', header: ui('المصدر') },
      { accessorKey: 'count', header: ui('عدد المعاملات'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
      { accessorKey: 'netAmount', header: ui('الإجمالي'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
    ],
    [ui],
  );

  const typeColumns = useMemo<ColumnDef<RevenueByTypeRow>[]>(
    () => [
      { accessorKey: 'typeName', header: ui('نوع الاشتراك') },
      { accessorKey: 'receiptsCount', header: ui('عدد الإيصالات'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
      { accessorKey: 'gross', header: ui('إجمالي الإيراد'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
      {
        accessorKey: 'refunds',
        header: ui('المرتجعات'),
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return v > 0 ? <span className="text-destructive nums">{toArabicDigits(v)}</span> : toArabicDigits(0);
        },
      },
      { accessorKey: 'net', header: ui('صافي الإيراد'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
    ],
    [ui],
  );

  const exportCsv = () =>
    downloadCsv(`revenue-${startDate}-${endDate}`, [
      [ui('المصدر'), ui('عدد المعاملات'), ui('الإجمالي')],
      ...rows.map((r) => [r.source, r.count, r.netAmount]),
      [],
      [ui('نوع الاشتراك'), ui('عدد الإيصالات'), ui('إجمالي الإيراد'), ui('المرتجعات'), ui('صافي الإيراد')],
      ...typeRows.map((r) => [r.typeName, r.receiptsCount, r.gross, r.refunds, r.net]),
    ]);

  return (
    <ReportShell
      title={ui('تقرير الإيرادات')}
      description={ui('إيرادات الفترة مقسّمة حسب المصدر ونوع الاشتراك مع خصم المرتجعات')}
      filters={
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          extra={
            <>
              <BranchFilter value={branch} onChange={setBranch} />
              <select
                className={selectCls}
                value={subscriptionType}
                onChange={(e) => setSubscriptionType(e.target.value)}
                aria-label={ui('نوع الاشتراك')}
              >
                <option value="all">{ui('كل أنواع الاشتراكات')}</option>
                {(subTypes ?? []).map((t) => (
                  <option key={t.id} value={String(t.id)}>{t.name}</option>
                ))}
              </select>
            </>
          }
        />
      }
      stats={
        <>
          <ClubStatCard label={ui('إجمالي الإيرادات')} value={total} />
          <ClubStatCard label={ui('إيراد الاشتراكات')} value={subs?.gross ?? 0} />
          <ClubStatCard label={ui('المرتجعات')} value={subs?.refunds ?? 0} />
          <ClubStatCard label={ui('صافي إيراد الاشتراكات')} value={subs?.net ?? 0} />
        </>
      }
      onExport={exportCsv}
    >
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 font-medium">{ui('الإيرادات حسب المصدر')}</h3>
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
            emptyTitle={ui('لا توجد إيرادات')}
            enableExport={false}
          />
        </div>
        <div>
          <h3 className="mb-3 font-medium">{ui('إيراد الاشتراكات حسب النوع (بعد خصم المرتجعات)')}</h3>
          <DataTable
            columns={typeColumns}
            data={typeRows}
            total={typeRows.length}
            page={1}
            pageSize={typeRows.length || 10}
            onPageChange={() => {}}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            emptyTitle={ui('لا توجد اشتراكات في الفترة')}
            enableExport={false}
          />
        </div>
      </div>
    </ReportShell>
  );
}
