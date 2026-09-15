import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/common/data-table';
import { ClubStatCard } from '@/components/club/stat-card';
import { StatusBadge } from '@/components/common/status-badge';
import { ReportShell, downloadCsv } from '@/components/reports/report-shell';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { ReportAudienceFilter, useReportAudience } from '@/components/reports/audience-filter';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubSubscriptionListItem } from '@/types/club';

type StatusFilter = 'expired' | 'active' | 'expiring';

function useSubs(status: StatusFilter, branch: string, gender?: 'male' | 'female') {
  return useQuery({
    queryKey: ['reports', 'club-subs-status', status, branch, gender],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (status === 'expired') params.status = 'expired';
      if (status === 'active') params.status = 'active';
      if (status === 'expiring') params.expiresWithinDays = 7;
      const branchId = normalizeBranchParam(branch);
      if (branchId) params.branch = String(branchId);
      if (gender) params.gender = gender;
      const data = await fetchAllReportRows<ClubSubscriptionListItem>('/club-subscriptions', params);
      return { data, total: data.length };
    },
  });
}

function StatusReport({ status, title, description }: { status: StatusFilter; title: string; description: string }) {
  const { ui } = useLocale();
  const [branch, setBranch] = useState('all');
  const audience = useReportAudience();
  const { data, isLoading, isError, refetch } = useSubs(status, branch, audience.gender);
  const rows = data?.data ?? [];

  const columns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(
    () => [
      { accessorKey: 'subscriptionNumber', header: ui('رقم الاشتراك') },
      { accessorKey: 'customerName', header: ui('العميل'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'subscriptionType', header: ui('النوع'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        accessorKey: 'subscriptionEndDate',
        header: ui('تاريخ الانتهاء'),
        cell: ({ getValue }) => toArabicDigits(String(getValue() ?? '')),
      },
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
    downloadCsv(`subs-${status}`, [
      [ui('رقم الاشتراك'), ui('العميل'), ui('النوع'), ui('تاريخ الانتهاء'), ui('المتبقي')],
      ...rows.map((r) => [
        r.subscriptionNumber ?? '',
        r.customerName ?? '',
        r.subscriptionType ?? '',
        String(r.subscriptionEndDate ?? ''),
        Number(r.remainingAmount ?? 0),
      ]),
    ]);
  };

  return (
    <ReportShell
      title={title}
      description={description}
      filters={<>
        <BranchFilter value={branch} onChange={setBranch} />
        <ReportAudienceFilter value={audience.value} onChange={audience.setValue} locked={audience.locked} />
      </>}
      stats={<ClubStatCard label={ui('العدد')} value={rows.length} />}
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
        emptyTitle={ui('لا توجد اشتراكات')}
        enableExport={false}
      />
    </ReportShell>
  );
}

export function ClubSubscriptionsExpiredReportPage() {
  const { ui } = useLocale();
  return <StatusReport status="expired" title={ui('تقرير الاشتراكات المنتهية')} description={ui('كل الاشتراكات التي انتهت صلاحيتها')} />;
}
export function ClubSubscriptionsActiveReportPage() {
  const { ui } = useLocale();
  return <StatusReport status="active" title={ui('تقرير الاشتراكات النشطة')} description={ui('الاشتراكات السارية حالياً')} />;
}
export function ClubSubscriptionsExpiringReportPage() {
  const { ui } = useLocale();
  return (
    <StatusReport
      status="expiring"
      title={ui('تقرير الاشتراكات التي ستنتهي قريباً')}
      description={ui('الاشتراكات التي تنتهي خلال 7 أيام')}
    />
  );
}
