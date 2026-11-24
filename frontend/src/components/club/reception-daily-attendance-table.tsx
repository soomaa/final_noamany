import type { ColumnDef } from '@tanstack/react-table';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, LogOut, MessageCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { formatTimeFromDate, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

/** «لم يحضر منذ مدة»: the member's last visit before today and, past the yellow threshold, the WhatsApp text. */
interface AbsenceInfo {
  memberId: number;
  lastVisit: string | null;
  days: number | null;
  level: 'yellow' | 'red' | null;
  phone: string | null;
  text: string | null;
}

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
  memberId?: number | null;
}

const ROW_COLOR: Record<'yellow' | 'red', string> = {
  yellow: 'bg-amber-100/70 hover:bg-amber-100 dark:bg-amber-500/15 dark:hover:bg-amber-500/20',
  red: 'bg-red-100/70 hover:bg-red-100 dark:bg-red-500/15 dark:hover:bg-red-500/20',
};

function formatAttendanceTime(value: string | null, locale: string) {
  if (!value) return '—';
  return formatTimeFromDate(value, locale === 'en' ? 'en' : 'ar', { seconds: true });
}

export function ReceptionDailyAttendanceTable({
  branchId,
  branches = [],
  showBranch = false,
  onOpenMember,
}: {
  branchId?: string;
  branches?: Array<{ id: number; name: string | null }>;
  showBranch?: boolean;
  /** Clicking a name opens that member at reception, the same as scanning the card. */
  onOpenMember?: (memberCode: string) => void;
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

  const memberIds = useMemo(
    () => [...new Set((data?.data ?? []).map((r) => r.memberId).filter((id): id is number => !!id))],
    [data],
  );
  // Colours and the WhatsApp text for this page's members (a failure only hides them).
  const { data: absence } = useQuery({
    queryKey: ['wa-reminders', 'absence', today, memberIds.join(',')],
    queryFn: async () => (await api.get<{ yellowDays: number; redDays: number; rows: AbsenceInfo[] }>('/wa-reminders/absence', { params: { members: memberIds.join(','), date: today } })).data,
    enabled: memberIds.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  const absenceByMember = useMemo(() => new Map((absence?.rows ?? []).map((r) => [r.memberId, r])), [absence]);

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
      {
        accessorKey: 'memberName',
        header: ct('members.name'),
        cell: ({ row }) => onOpenMember ? (
          <button
            type="button"
            className="text-start font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
            onClick={() => onOpenMember(row.original.memberCode)}
          >
            {row.original.memberName}
          </button>
        ) : row.original.memberName,
      },
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
        id: 'lastVisit',
        header: ui('آخر حضور'),
        cell: ({ row }) => {
          const info = row.original.memberId ? absenceByMember.get(row.original.memberId) : undefined;
          if (!info) return <span className="text-muted-foreground">—</span>;
          if (!info.lastVisit) return <span className="text-xs text-muted-foreground">{ui('أول حضور')}</span>;
          const link = info.level && info.phone && info.text ? `https://wa.me/${info.phone}?text=${encodeURIComponent(info.text)}` : null;
          return (
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <span className="grid leading-tight">
                <span className="nums">{toArabicDigits(info.lastVisit)}</span>
                <span className={`text-xs ${info.level === 'red' ? 'font-semibold text-red-700 dark:text-red-300' : info.level === 'yellow' ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
                  {info.days === 1 ? ui('امبارح') : `${ui('من')} ${toArabicDigits(info.days ?? 0)} ${ui('يوم')}`}
                </span>
              </span>
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={ui('إرسال رسالة «لم يحضر منذ مدة» على واتساب')}
                  aria-label={ui('إرسال رسالة «لم يحضر منذ مدة» على واتساب')}
                >
                  <MessageCircle className="size-4" />
                </a>
              )}
            </span>
          );
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
    [absenceByMember, branches, checkOut, checkingOutId, ct, locale, showBranch, ui, onOpenMember],
  );

  return (
    // Wider than the reception column on big screens, so every column (and WhatsApp) fits.
    <section className="space-y-3 min-[1800px]:-mx-24 min-[2200px]:-mx-48">
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
        rowClassName={(row) => {
          const level = row.memberId ? absenceByMember.get(row.memberId)?.level : null;
          return level ? ROW_COLOR[level] : undefined;
        }}
      />
      {absence && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-amber-200" />{ui('غايب من')} {toArabicDigits(absence.yellowDays)} {ui('يوم')}</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-red-200" />{ui('غايب من')} {toArabicDigits(absence.redDays)} {ui('يوم أو أكتر')}</span>
          <span className="inline-flex items-center gap-1.5"><MessageCircle className="size-3.5 text-[#25D366]" />{ui('يفتح واتساب برسالة «لم يحضر منذ مدة» جاهزة')}</span>
        </p>
      )}
    </section>
  );
}
