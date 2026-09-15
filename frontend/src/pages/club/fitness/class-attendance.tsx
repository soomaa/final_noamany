import type { ColumnDef } from '@tanstack/react-table';
import { RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBranches } from '@/hooks/use-branches';
import { useArrayResource, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubClassAttendanceRow, ClubClassType } from '@/types/fitness';
import { SELECT_CLS } from './shared';

/** Barcode-based class attendance report, filterable by class type. */
export function FitnessClassAttendanceReportPanel() {
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const { data: classTypes } = useArrayResource<ClubClassType>('club-class-types');
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubClassAttendanceRow>('club-classes/attendance-report', params);
  const columns = useMemo<ColumnDef<ClubClassAttendanceRow>[]>(() => [
    { accessorKey: 'memberName', header: 'العضو' },
    { accessorKey: 'memberCode', header: 'كود العضو', cell: ({ getValue }) => <span className="nums font-mono">{toArabicDigits(getValue() as string)}</span> },
    { accessorKey: 'className', header: 'الحصة' },
    { id: 'classType', header: 'نوع الحصة', cell: ({ row }) => row.original.classType?.name ?? '—' },
    { accessorKey: 'classDate', header: 'التاريخ', cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span> },
    { accessorKey: 'attendanceTime', header: 'وقت الحضور', cell: ({ getValue }) => <span className="nums">{toArabicDigits((getValue() as string | null) ?? '—')}</span> },
  ], []);
  const setFilter = (key: string, value: string) => setParams({ filters: { ...params.filters, [key]: value }, page: 1 });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-xl border bg-card p-4 lg:grid-cols-5">
        <Input type="date" className="nums" aria-label="من تاريخ" value={params.filters.dateFrom ?? ''} onChange={(e) => setFilter('dateFrom', e.target.value)} />
        <Input type="date" className="nums" aria-label="إلى تاريخ" value={params.filters.dateTo ?? ''} onChange={(e) => setFilter('dateTo', e.target.value)} />
        <select className={SELECT_CLS} aria-label="الفرع" value={params.filters.branch ?? ''} onChange={(e) => setFilter('branch', e.target.value)}><option value="">كل الفروع</option>{(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        <select className={SELECT_CLS} aria-label="نوع الحصة" value={params.filters.classTypeId ?? ''} onChange={(e) => setFilter('classTypeId', e.target.value)}><option value="">كل أنواع الحصص</option>{(classTypes ?? []).filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <Button variant="outline" onClick={() => setParams({ filters: {}, search: '', page: 1 })}><RotateCcw className="size-4" />مسح الفلاتر</Button>
      </div>
      <DataTable columns={columns} data={data?.data ?? []} total={data?.total ?? 0} page={params.page} pageSize={params.pageSize} onPageChange={(page) => setParams({ page })} onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })} search={params.search} onSearchChange={(search) => setParams({ search, page: 1 })} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} emptyTitle="لا يوجد حضور حصص مسجل" />
    </div>
  );
}

export function FitnessClassAttendancePage() {
  return <div className="space-y-6"><PageHeader title="تقرير حضور الحصص" description="الحضور المسجل بالباركود، مع فلترة حسب التاريخ والفرع ونوع الحصة." /><FitnessClassAttendanceReportPanel /></div>;
}
