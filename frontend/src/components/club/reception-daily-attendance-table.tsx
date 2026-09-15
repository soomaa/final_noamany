import type { ColumnDef } from '@tanstack/react-table';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, LogOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { formatTimeFromDate, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface ReceptionAttendanceRow {
  id: number;
  memberName: string;
  memberCode: string;
  subscriptionType: string | null;
  attendanceDate: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: 'checked_in' | 'checked_out';
  duration: number | null;
  branchId: number;
}

function formatAttendanceTime(value: string | null, locale: string) {
  if (!value) return '—';
  return formatTimeFromDate(value, locale === 'en' ? 'en' : 'ar', { seconds: true });
}

export function ReceptionDailyAttendanceTable({
  branchId,
  branches = [],
  showBranch = false,
}: {
  branchId?: string;
  branches?: Array<{ id: number; name: string | null }>;
  showBranch?: boolean;
}) {
  const { ui, locale } = useLocale();
  const ct = useClubT();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [checkingOutId, setCheckingOutId] = useState<number | null>(null);
  const today = localToday();

  useEffect(() => {
    setPage(1);
  }, [branchId]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['club-attendance', 'reception-today', today, branchId || 'all', page, pageSize, search],
    queryFn: async ({ signal }) => {
      const response = await api.get<PaginatedResponse<ReceptionAttendanceRow>>('/club-attendance', {
        params: {
          page,
          pageSize,
          search: search || undefined,
          startDate: today,
          endDate: today,
          branch: branchId || undefined,
        },
        signal,
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const checkOut = useCallback(async (attendanceId: number) => {
    setCheckingOutId(attendanceId);
    try {
      await api.post('/club-attendance/check-out', { attendanceId });
      toast.success(ui('تم تسجيل الخروج بنجاح'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['club-attendance'] }),
        queryClient.invalidateQueries({ queryKey: ['club-recent-checkins'] }),
      ]);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setCheckingOutId(null);
    }
  }, [queryClient, ui]);

  const columns = useMemo<ColumnDef<ReceptionAttendanceRow>[]>(
    () => [
      { accessorKey: 'memberName', header: ct('members.name') },
      {
        accessorKey: 'memberCode',
        header: ct('members.memberCode'),
        cell: ({ getValue }) => <span className="nums font-mono">{getValue() as string}</span>,
      },
      {
        accessorKey: 'subscriptionType',
        header: ct('subscriptions.subscriptionType'),
        cell: ({ getValue }) => (getValue() as string | null) ?? '—',
      },
      ...(showBranch
        ? [{
            id: 'branch',
            header: ct('common.branch'),
            cell: ({ row }: { row: { original: ReceptionAttendanceRow } }) => {
              const id = row.original.branchId;
              const name = branches.find((branch) => branch.id === id)?.name?.trim();
              return (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium">
                  <Building2 className="size-3.5 text-primary" />
                  {name || `${ui('فرع رقم')} ${toArabicDigits(id)}`}
                </span>
              );
            },
          }]
        : []),
      {
        accessorKey: 'attendanceDate',
        header: ct('members.attendanceDate'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as string)}</span>,
      },
      {
        accessorKey: 'checkInTime',
        header: ct('members.checkInTime'),
        cell: ({ getValue }) => (
          <span className="nums">{formatAttendanceTime(getValue() as string, locale)}</span>
        ),
      },
      {
        accessorKey: 'duration',
        header: ct('members.duration'),
        cell: ({ getValue }) => {
          const value = getValue() as number | null;
          return value == null ? '—' : <span className="nums">{toArabicDigits(value)}</span>;
        },
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) =>
          row.original.status === 'checked_in' ? (
            <Button
              size="sm"
              variant="outline"
              disabled={checkingOutId === row.original.id}
              onClick={() => void checkOut(row.original.id)}
            >
              <LogOut className="size-4" />
              {checkingOutId === row.original.id ? ct('common.saving') : ct('members.checkOut')}
            </Button>
          ) : (
            <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {ui('تم تسجيل الخروج')}
            </span>
          ),
      },
    ],
    [branches, checkOut, checkingOutId, ct, locale, showBranch, ui],
  );

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{ui('سجل حضور اليوم')}</h2>
        <p className="text-sm text-muted-foreground">
          {ui('متابعة دخول وخروج الأعضاء المسجلين اليوم')}
        </p>
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder={ui('بحث في حضور اليوم…')}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ui('لا توجد سجلات حضور اليوم')}
      />
    </section>
  );
}
