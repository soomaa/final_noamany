import type { ColumnDef } from '@tanstack/react-table';
import { RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBranches } from '@/hooks/use-branches';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubSpaAttendanceRow } from '@/types/fitness';
import { SELECT_CLS } from './shared';

/** Daily SPA visit report. Admissions are created only by barcode check-in. */
export function FitnessSpaAttendanceReportPanel() {
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubSpaAttendanceRow>('club-spa-attendance', params);

  const columns = useMemo<ColumnDef<ClubSpaAttendanceRow>[]>(() => [
    { accessorKey: 'memberName', header: 'العضو' },
    { accessorKey: 'memberCode', header: 'كود العضو', cell: ({ getValue }) => <span className="nums font-mono">{toArabicDigits(getValue() as string)}</span> },
    { accessorKey: 'attendanceDate', header: 'التاريخ', cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span> },
    { accessorKey: 'checkInTime', header: 'وقت الدخول', cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span> },
    { accessorKey: 'subscriptionId', header: 'رقم الاشتراك', cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span> },
  ], []);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-4">
        <Input type="date" className="nums" aria-label="من تاريخ" value={params.filters.dateFrom ?? ''} onChange={(e) => setParams({ filters: { ...params.filters, dateFrom: e.target.value }, page: 1 })} />
        <Input type="date" className="nums" aria-label="إلى تاريخ" value={params.filters.dateTo ?? ''} onChange={(e) => setParams({ filters: { ...params.filters, dateTo: e.target.value }, page: 1 })} />
        <select className={SELECT_CLS} aria-label="الفرع" value={params.filters.branch ?? ''} onChange={(e) => setParams({ filters: { ...params.filters, branch: e.target.value }, page: 1 })}>
          <option value="">كل الفروع</option>
          {(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        <Button variant="outline" onClick={() => setParams({ filters: {}, search: '', page: 1 })}><RotateCcw className="size-4" />مسح الفلاتر</Button>
      </div>
      <DataTable columns={columns} data={data?.data ?? []} total={data?.total ?? 0} page={params.page} pageSize={params.pageSize} onPageChange={(page) => setParams({ page })} onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })} search={params.search} onSearchChange={(search) => setParams({ search, page: 1 })} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} emptyTitle="لا توجد زيارات سبا مسجلة" />
    </div>
  );
}

export function FitnessSpaAttendancePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="تقرير حضور السبا" description="زيارات السبا التي تم تسجيلها بالباركود فقط، مع فلاتر التاريخ والفرع والبحث." />
      <FitnessSpaAttendanceReportPanel />
    </div>
  );
}
