import type { ColumnDef } from '@tanstack/react-table';
import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { useAuth } from '@/store/auth';
import { SELECT_CLS } from './shared';

export type BarcodeReportKind = 'member' | 'class' | 'spa';

type ReportRow = {
  key: string;
  source: 'a' | 's' | 'e';
  id: number;
  memberCode: string;
  memberName: string;
  subscriptionName: string | null;
  branchId: number | null;
  attendanceDate: string;
  time: string | null;
  attendanceType: string;
  employeeName: string | null;
};

type ReportResponse = { data: ReportRow[]; total: number; page: number; pageSize: number; todayOnly: boolean; canDelete: boolean };

const RESOURCE = 'club-attendance/barcode-report';
const TYPE_LABELS: Record<string, string> = { normal: 'عادي', class: 'حصص', spa: 'سبا', inbody: 'إنبودي' };
const EMPTY_TITLES: Record<BarcodeReportKind, string> = {
  member: 'لا يوجد حضور مسجل',
  class: 'لا يوجد حضور حصص مسجل',
  spa: 'لا توجد زيارات سبا مسجلة',
};

const weekdayFormatter = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', timeZone: 'UTC' });

function formatDay(date: string) {
  const weekday = /^\d{4}-\d{2}-\d{2}$/.test(date) ? weekdayFormatter.format(new Date(`${date}T12:00:00Z`)) : '';
  return (
    <div className="leading-tight">
      <div className="font-medium">{weekday}</div>
      <div className="font-mono text-xs text-muted-foreground" dir="ltr">{date}</div>
    </div>
  );
}

function formatTime(time: string | null) {
  if (!time) return '—';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Member / class / SPA attendance report: today-only for reception, delete for admins. */
export function BarcodeAttendanceReportPanel({
  kind,
  externalFilters,
}: {
  kind: BarcodeReportKind;
  /** When the host page owns the date/branch filters, the panel hides its own filter bar. */
  externalFilters?: { dateFrom?: string; dateTo?: string; branch?: string };
}) {
  const { params, setParams } = useListQuery();
  const user = useAuth((state) => state.user);
  const { superAdmin } = usePermission();
  const isAdmin = user?.level === 1 || superAdmin;
  const qc = useQueryClient();
  const { data: branches } = useBranches();
  const query = useMemo(
    () => ({ ...params, filters: { ...(externalFilters ?? params.filters), kind } }),
    [params, kind, externalFilters],
  );
  const { data, isLoading, isError, refetch } = usePaginatedList<ReportRow>(RESOURCE, query);
  const response = data as ReportResponse | undefined;
  const todayOnly = response?.todayOnly ?? false;
  const canDelete = response?.canDelete ?? false;
  const branchName = (id: number | null) => (id == null ? '—' : branches?.find((b) => b.id === id)?.name ?? `#${id}`);

  const remove = async (row: ReportRow) => {
    const ok = await confirm({
      title: 'حذف سجل الحضور',
      description: `سيتم حذف حضور ${row.memberName} (${row.memberCode}) بتاريخ ${row.attendanceDate} وإرجاع الرصيد المخصوم إن وجد.`,
      confirmLabel: 'حذف',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.delete(`/${RESOURCE}/${row.source}/${row.id}`);
      toast.success('تم حذف سجل الحضور');
      for (const key of [RESOURCE, 'club-attendance', 'club-spa-attendance', 'club-classes', 'club-subscriptions']) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    } catch (error) {
      toast.error(apiError(error, 'تعذر حذف سجل الحضور'));
    }
  };

  const columns = useMemo<ColumnDef<ReportRow>[]>(() => [
    { accessorKey: 'memberCode', header: 'كود العضو', cell: ({ getValue }) => <span className="font-mono font-semibold" dir="ltr">{getValue() as string}</span> },
    { accessorKey: 'memberName', header: 'اسم العضو' },
    { accessorKey: 'subscriptionName', header: 'اسم الاشتراك', cell: ({ getValue }) => (getValue() as string | null) || '—' },
    ...(kind === 'member'
      ? [{ accessorKey: 'attendanceType', header: 'نوع الحضور', cell: ({ getValue }: { getValue: () => unknown }) => TYPE_LABELS[getValue() as string] ?? 'عادي' } as ColumnDef<ReportRow>]
      : []),
    { id: 'branch', header: 'الفرع', cell: ({ row }) => branchName(row.original.branchId) },
    { accessorKey: 'attendanceDate', header: 'اليوم', cell: ({ getValue }) => formatDay(getValue() as string) },
    { accessorKey: 'time', header: 'الساعة', cell: ({ getValue }) => <span className="font-mono" dir="ltr">{formatTime(getValue() as string | null)}</span> },
    { accessorKey: 'employeeName', header: 'الموظف', cell: ({ getValue }) => (getValue() as string | null) || '—' },
    ...(canDelete
      ? [{
          id: 'actions',
          header: 'الإجراء',
          cell: ({ row }: { row: { original: ReportRow } }) => (
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => void remove(row.original)}>
              <Trash2 className="size-4" /> حذف
            </Button>
          ),
        } as ColumnDef<ReportRow>]
      : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [kind, canDelete, branches]);

  const setFilter = (key: string, value: string) => setParams({ filters: { ...params.filters, [key]: value }, page: 1 });

  return (
    <div className="space-y-6">
      {externalFilters ? null : todayOnly ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">يعرض التقرير حضور اليوم فقط.</p>
      ) : (
        <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-4">
          <Input type="date" aria-label="من تاريخ" value={params.filters.dateFrom ?? ''} onChange={(e) => setFilter('dateFrom', e.target.value)} />
          <Input type="date" aria-label="إلى تاريخ" value={params.filters.dateTo ?? ''} onChange={(e) => setFilter('dateTo', e.target.value)} />
          {isAdmin ? (
            <select className={SELECT_CLS} aria-label="الفرع" value={params.filters.branch ?? ''} onChange={(e) => setFilter('branch', e.target.value)}>
              <option value="">كل الفروع</option>
              {(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          ) : <div />}
          <Button variant="outline" onClick={() => setParams({ filters: {}, search: '', page: 1 })}><RotateCcw className="size-4" />مسح الفلاتر</Button>
        </div>
      )}
      <DataTable
        columns={columns}
        data={response?.data ?? []}
        total={response?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={EMPTY_TITLES[kind]}
      />
    </div>
  );
}
