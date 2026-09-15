import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/common/data-table';
import { ClubStatCard } from '@/components/club/stat-card';
import { ReportShell, downloadCsv } from '@/components/reports/report-shell';
import { DateRangeFilter, firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { ReportAudienceFilter, useReportAudience } from '@/components/reports/audience-filter';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface MemberRow {
  id: number;
  memberCode: string;
  name: string;
  phone: string | null;
  createdAt: string;
  branchId: number;
  gender: 'male' | 'female';
}

/**
 * تقرير الأعضاء خلال فترة (default: current month).
 * Uses /club-members?createdFrom=&createdTo= — server filters by created_at.
 */
export function ClubMembersReportPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayLocal);
  const [branch, setBranch] = useState('all');
  const audience = useReportAudience();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'club-members-daily', startDate, endDate, branch, audience.gender],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const data = await fetchAllReportRows<MemberRow>('/club-members', {
        createdFrom: startDate,
        createdTo: endDate,
        ...(branchId ? { branch: String(branchId) } : {}),
        ...(audience.gender ? { gender: audience.gender } : {}),
      });
      return { data, total: data.length };
    },
  });

  const rows = data?.data ?? [];
  const stats = useMemo(() => {
    const males = rows.filter((r) => r.gender === 'male').length;
    const females = rows.filter((r) => r.gender === 'female').length;
    return { total: rows.length, males, females };
  }, [rows]);

  const columns = useMemo<ColumnDef<MemberRow>[]>(
    () => [
      { accessorKey: 'memberCode', header: ui('كود العضو') },
      { accessorKey: 'name', header: ui('الاسم') },
      { accessorKey: 'phone', header: ui('الجوال'), cell: ({ getValue }) => toArabicDigits((getValue() as string) ?? '—') },
      {
        accessorKey: 'gender',
        header: ui('الجنس'),
        cell: ({ getValue }) => (getValue() === 'male' ? ui('ذكر') : ui('أنثى')),
      },
      {
        accessorKey: 'createdAt',
        header: ui('تاريخ التسجيل'),
        cell: ({ getValue }) => toArabicDigits(String(getValue() ?? '').slice(0, 10)),
      },
    ],
    [ui],
  );

  const exportCsv = () => {
    downloadCsv(`members-${startDate}-to-${endDate}`, [
      [ui('كود العضو'), ui('الاسم'), ui('الجوال'), ui('الجنس'), ui('تاريخ التسجيل')],
      ...rows.map((r) => [
        r.memberCode,
        r.name,
        r.phone ?? '',
        r.gender === 'male' ? ui('ذكر') : ui('أنثى'),
        String(r.createdAt ?? '').slice(0, 10),
      ]),
    ]);
  };

  return (
    <ReportShell
      title={ui('تقرير الأعضاء خلال فترة')}
      description={ui('الأعضاء المسجلين خلال الفترة المحددة، مقسّمين حسب الجنس')}
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
          <ClubStatCard label={ui('إجمالي الأعضاء')} value={stats.total} />
          <ClubStatCard label={ui('ذكور')} value={stats.males} />
          <ClubStatCard label={ui('إناث')} value={stats.females} />
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
        emptyTitle={ui('لا يوجد أعضاء في هذه الفترة')}
        enableExport={false}
      />
    </ReportShell>
  );
}
