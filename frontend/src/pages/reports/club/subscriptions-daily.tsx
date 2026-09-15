import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/common/data-table';
import { ClubStatCard } from '@/components/club/stat-card';
import { StatusBadge } from '@/components/common/status-badge';
import { ReportShell, downloadCsv } from '@/components/reports/report-shell';
import { DateRangeFilter, firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { ReportAudienceFilter, useReportAudience } from '@/components/reports/audience-filter';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubSubscriptionListItem } from '@/types/club';

/**
 * تقرير الاشتراكات خلال فترة. Filters by subscription_start_date via startDateFrom/startDateTo.
 */
export function ClubSubscriptionsReportPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayLocal);
  const [branch, setBranch] = useState('all');
  const audience = useReportAudience();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'club-subs-daily', startDate, endDate, branch, audience.gender],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const data = await fetchAllReportRows<ClubSubscriptionListItem>('/club-subscriptions', {
        startDateFrom: startDate,
        startDateTo: endDate,
        ...(branchId ? { branch: String(branchId) } : {}),
        ...(audience.gender ? { gender: audience.gender } : {}),
      });
      return { data, total: data.length };
    },
  });

  const rows = data?.data ?? [];
  const stats = useMemo(() => {
    const total = rows.length;
    const value = rows.reduce((s, r) => s + Number(r.subscriptionValue ?? 0), 0);
    const paid = rows.reduce((s, r) => s + Number(r.paidAmount ?? 0), 0);
    const remaining = rows.reduce((s, r) => s + Number(r.remainingAmount ?? 0), 0);
    return { total, value, paid, remaining };
  }, [rows]);

  const columns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(
    () => [
      { accessorKey: 'subscriptionNumber', header: ui('رقم الاشتراك') },
      { accessorKey: 'customerName', header: ui('العميل'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'subscriptionType', header: ui('النوع'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'subscriptionStartDate', header: ui('البداية'), cell: ({ getValue }) => toArabicDigits(String(getValue() ?? '')) },
      { accessorKey: 'subscriptionEndDate', header: ui('النهاية'), cell: ({ getValue }) => toArabicDigits(String(getValue() ?? '')) },
      { accessorKey: 'subscriptionValue', header: ui('القيمة'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
      { accessorKey: 'paidAmount', header: ui('المدفوع'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
      { accessorKey: 'remainingAmount', header: ui('المتبقي'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
      {
        accessorKey: 'status',
        header: ui('الحالة'),
        cell: ({ row }) => {
          const map = { active: 'active', expired: 'expired', upcoming: 'pending', frozen: 'suspended' } as const;
          return <StatusBadge status={map[row.original.status as keyof typeof map] ?? 'pending'} />;
        },
      },
    ],
    [ui],
  );

  const exportCsv = () => {
    downloadCsv(`subscriptions-${startDate}-to-${endDate}`, [
      [ui('رقم الاشتراك'), ui('العميل'), ui('النوع'), ui('البداية'), ui('النهاية'), ui('القيمة'), ui('المدفوع'), ui('المتبقي'), ui('الحالة')],
      ...rows.map((r) => [
        r.subscriptionNumber ?? '',
        r.customerName ?? '',
        r.subscriptionType ?? '',
        String(r.subscriptionStartDate ?? ''),
        String(r.subscriptionEndDate ?? ''),
        Number(r.subscriptionValue ?? 0),
        Number(r.paidAmount ?? 0),
        Number(r.remainingAmount ?? 0),
        r.status ?? '',
      ]),
    ]);
  };

  return (
    <ReportShell
      title={ui('تقرير الاشتراكات خلال فترة')}
      description={ui('الاشتراكات المسجّلة خلال الفترة المحددة')}
      filters={
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          extra={<>
            <BranchFilter value={branch} onChange={setBranch} />
            <ReportAudienceFilter value={audience.value} onChange={audience.setValue} locked={audience.locked} />
          </>}
        />
      }
      stats={
        <>
          <ClubStatCard label={ui('عدد الاشتراكات')} value={stats.total} />
          <ClubStatCard label={ui('إجمالي القيمة')} value={stats.value} />
          <ClubStatCard label={ui('المدفوع')} value={stats.paid} />
          <ClubStatCard label={ui('المتبقي')} value={stats.remaining} />
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
        emptyTitle={ui('لا يوجد اشتراكات في هذه الفترة')}
        enableExport={false}
      />
    </ReportShell>
  );
}
