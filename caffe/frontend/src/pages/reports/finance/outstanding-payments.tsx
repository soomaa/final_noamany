import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/common/data-table';
import { ClubStatCard } from '@/components/club/stat-card';
import { ReportShell, downloadCsv } from '@/components/reports/report-shell';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubSubscriptionListItem } from '@/types/club';

/**
 * Outstanding-payments report — subscriptions with remaining_amount > 0.
 * Uses the existing /club-subscriptions/outstanding-report endpoint, then filters by branch client-side
 * (the endpoint returns the fully-hydrated ClubSubscriptionListItem including branchId).
 */
export function FinanceOutstandingReportPage() {
  const { ui } = useLocale();
  const [branch, setBranch] = useState('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'finance-outstanding', branch],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const { data: r } = await api.get<{
        subscriptions: ClubSubscriptionListItem[];
        summary: { count: number; totalOutstanding?: number };
      }>('/club-subscriptions/outstanding-report', {
        params: branchId ? { branch: String(branchId) } : undefined,
      });
      return r;
    },
  });

  const rows = data?.subscriptions ?? [];
  const totalOutstanding = rows.reduce((s, r) => s + Number(r.remainingAmount ?? 0), 0);

  const columns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(
    () => [
      { accessorKey: 'subscriptionNumber', header: ui('رقم الاشتراك') },
      { accessorKey: 'customerName', header: ui('العميل'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'subscriptionType', header: ui('النوع'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'subscriptionValue', header: ui('القيمة'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
      { accessorKey: 'paidAmount', header: ui('المدفوع'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
      {
        accessorKey: 'remainingAmount',
        header: ui('المتبقي'),
        cell: ({ getValue }) => (
          <span className="font-semibold text-rose-600 nums">{toArabicDigits(getValue() as number)}</span>
        ),
      },
    ],
    [ui],
  );

  const exportCsv = () =>
    downloadCsv('outstanding-payments', [
      [ui('رقم الاشتراك'), ui('العميل'), ui('النوع'), ui('القيمة'), ui('المدفوع'), ui('المتبقي')],
      ...rows.map((r) => [
        r.subscriptionNumber ?? '',
        r.customerName ?? '',
        r.subscriptionType ?? '',
        Number(r.subscriptionValue ?? 0),
        Number(r.paidAmount ?? 0),
        Number(r.remainingAmount ?? 0),
      ]),
    ]);

  return (
    <ReportShell
      title={ui('تقرير سداد المتبقي')}
      description={ui('الاشتراكات التي لها مبلغ متبقٍ مطلوب سداده')}
      filters={<BranchFilter value={branch} onChange={setBranch} />}
      stats={
        <>
          <ClubStatCard label={ui('عدد الاشتراكات')} value={rows.length} />
          <ClubStatCard label={ui('إجمالي المتبقي')} value={totalOutstanding} />
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
        emptyTitle={ui('لا توجد مبالغ متبقية')}
        enableExport={false}
      />
    </ReportShell>
  );
}
