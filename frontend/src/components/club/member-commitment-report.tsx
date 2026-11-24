import type { ColumnDef } from '@tanstack/react-table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDownUp, Building2, Eye, LockKeyhole } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { SearchableSelect } from '@/components/common/searchable-select';
import { MemberCell } from '@/components/club/member-cell';
import { MemberGenderSelect, useMemberGenderFilter } from '@/components/club/member-gender-filter';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { downloadExcel } from '@/lib/export';
import { formatDate, localToday } from '@/lib/formatters';
import { cn, toArabicDigits } from '@/lib/utils';
import { useAuth } from '@/store/auth';

type SubscriptionStatus = 'active' | 'expired' | 'upcoming' | 'frozen' | 'all';
type Bucket = 'all' | 'high' | 'medium' | 'low';

interface CommitmentRow {
  subscriptionId: number;
  subscriptionNumber: string;
  subscriptionType: string | null;
  status: 'active' | 'expired' | 'upcoming' | 'frozen';
  startDate: string;
  endDate: string;
  totalDays: number;
  remainingDays: number;
  isLinkedToSessions: boolean;
  sessionsCount: number | null;
  sessionsUsed: number;
  sessionsRemaining: number | null;
  attendanceDays: number;
  attendanceEntries: number;
  attendanceRate: number;
  lastAttendanceDate: string | null;
  branchId: number;
  member: { id: number; memberCode: string; name: string; phone: string | null; profilePicture: string | null; branchId: number };
}

interface CommitmentResponse {
  data: CommitmentRow[];
  total: number;
  page: number;
  pageSize: number;
  buckets: { all: number; high: number; medium: number; low: number };
}

const selectCls = 'flex h-11 w-full rounded-xl border border-primary/25 bg-background px-3 text-sm font-medium';

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: 'active', label: 'النشطة' },
  { value: 'frozen', label: 'المجمّدة' },
  { value: 'upcoming', label: 'القادمة' },
  { value: 'expired', label: 'المنتهية' },
  { value: 'all', label: 'كل الاشتراكات' },
];

const BUCKETS: { value: Bucket; label: string; hint: string }[] = [
  { value: 'all', label: 'الكل', hint: '' },
  { value: 'high', label: 'ملتزمون', hint: '٧٥٪ فأكثر' },
  { value: 'medium', label: 'متوسط', hint: '٤٠–٧٤٪' },
  { value: 'low', label: 'ضعاف الحضور', hint: 'أقل من ٤٠٪' },
];

const STATUS_LABEL: Record<CommitmentRow['status'], string> = {
  active: 'نشط',
  frozen: 'مجمّد',
  upcoming: 'لم يبدأ',
  expired: 'منتهي',
};

function bucketOf(rate: number): Exclude<Bucket, 'all'> {
  if (rate >= 75) return 'high';
  if (rate >= 40) return 'medium';
  return 'low';
}

const RATE_TONE: Record<Exclude<Bucket, 'all'>, { bar: string; text: string }> = {
  high: { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
  medium: { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
  low: { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400' },
};

/** «التزام الأعضاء»: how much of each subscription the member actually attended. */
export function MemberCommitmentReport() {
  const user = useAuth((s) => s.user);
  const isSystemAdmin = user?.level === 1;
  const { data: branches = [] } = useBranches();
  const navigate = useNavigate();
  const gender = useMemberGenderFilter();
  const [branch, setBranch] = useState('');
  const [status, setStatus] = useState<SubscriptionStatus>('active');
  const [bucket, setBucket] = useState<Bucket>('all');
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const effectiveBranch = isSystemAdmin ? branch : user?.branch ? String(user.branch) : '';
  const filters = useMemo(
    () => ({
      branch: effectiveBranch || undefined,
      status,
      rateBucket: bucket === 'all' ? undefined : bucket,
      gender: gender.param,
      search: search.trim() || undefined,
      sort: sortOrder === 'none' ? undefined : 'attendanceRate',
      order: sortOrder === 'none' ? undefined : sortOrder,
    }),
    [effectiveBranch, status, bucket, gender.param, search, sortOrder],
  );

  const report = useQuery({
    queryKey: ['club-attendance/subscription-utilization', filters, page, pageSize],
    queryFn: async ({ signal }) =>
      (await api.get<CommitmentResponse>('/club-attendance/subscription-utilization', {
        params: { ...filters, page, pageSize },
        signal,
      })).data,
    placeholderData: keepPreviousData,
  });

  const branchName = (id: number) => branches.find((b) => b.id === id)?.name?.trim() || `فرع ${id}`;
  const resetPage = () => setPage(1);

  const columns = useMemo<ColumnDef<CommitmentRow>[]>(
    () => [
      {
        id: 'member',
        header: 'العضو',
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            className="h-auto justify-start gap-2 p-1 text-start hover:bg-primary/5 hover:text-primary"
            aria-label={`عرض ملف العضو ${row.original.member.name}`}
            onClick={() => navigate(`/club/members/${row.original.member.id}/details`)}
          >
            <MemberCell
              name={row.original.member.name}
              code={row.original.member.memberCode}
              profilePicture={row.original.member.profilePicture}
              showCode={false}
            />
            <Eye className="size-4 shrink-0 opacity-55" />
          </Button>
        ),
      },
      {
        id: 'memberCode',
        header: 'الكود',
        cell: ({ row }) => <span className="nums font-mono">{row.original.member.memberCode}</span>,
      },
      ...(isSystemAdmin
        ? [{
            id: 'branch',
            header: 'الفرع',
            cell: ({ row }: { row: { original: CommitmentRow } }) => branchName(row.original.branchId),
          } as ColumnDef<CommitmentRow>]
        : []),
      {
        id: 'subscription',
        header: 'الاشتراك',
        cell: ({ row }) => (
          <div className="min-w-32">
            <p className="font-medium">{row.original.subscriptionType ?? '—'}</p>
            <p className="nums mt-0.5 text-xs text-muted-foreground">
              {row.original.subscriptionNumber} · {STATUS_LABEL[row.original.status]}
            </p>
          </div>
        ),
      },
      {
        id: 'period',
        header: 'فترة الاشتراك',
        cell: ({ row }) => (
          <div className="nums min-w-28 text-sm">
            <p>{formatDate(row.original.startDate)}</p>
            <p className="text-muted-foreground">{formatDate(row.original.endDate)}</p>
          </div>
        ),
      },
      {
        accessorKey: 'totalDays',
        header: 'إجمالي الأيام',
        cell: ({ row }) => <span className="nums font-semibold">{toArabicDigits(row.original.totalDays)}</span>,
      },
      {
        id: 'entries',
        header: 'أيام الحضور',
        cell: ({ row }) => (
          <div className="nums">
            {/* One visit per day: re-entries the same day (stepped out and scanned again) do not count (client, 25 Nov). */}
            <p className="font-semibold">{toArabicDigits(row.original.attendanceDays)} يوم حضور</p>
            {row.original.attendanceEntries > row.original.attendanceDays ? (
              <p className="text-xs text-muted-foreground">سجّل دخول {toArabicDigits(row.original.attendanceEntries)} مرة (فيه أيام دخل وخرج ورجع)</p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'rate',
        header: () => (
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-primary"
            onClick={() => {
              setSortOrder((current) => (current === 'desc' ? 'asc' : current === 'asc' ? 'none' : 'desc'));
              resetPage();
            }}
            title="ترتيب حسب نسبة الحضور"
          >
            نسبة الحضور
            <ArrowDownUp className={cn('size-3.5', sortOrder !== 'none' && 'text-primary')} />
          </button>
        ),
        cell: ({ row }) => {
          const tone = RATE_TONE[bucketOf(row.original.attendanceRate)];
          return (
            <div className="min-w-28">
              <p className={cn('nums font-bold', tone.text)}>{toArabicDigits(row.original.attendanceRate)}٪</p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${row.original.attendanceRate}%` }} />
              </div>
            </div>
          );
        },
      },
      {
        id: 'remaining',
        header: 'المتبقي',
        cell: ({ row }) => (
          <span className="nums">
            {row.original.isLinkedToSessions
              ? `${toArabicDigits(row.original.sessionsRemaining ?? 0)} حصة`
              : `${toArabicDigits(row.original.remainingDays)} يوم`}
          </span>
        ),
      },
      {
        id: 'last',
        header: 'آخر حضور',
        cell: ({ row }) => <span className="nums">{row.original.lastAttendanceDate ? formatDate(row.original.lastAttendanceDate) : 'لم يحضر'}</span>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branches, isSystemAdmin, navigate, sortOrder],
  );

  const exportExcel = async () => {
    setExporting(true);
    try {
      const { data } = await api.get<CommitmentResponse>('/club-attendance/subscription-utilization', {
        params: { ...filters, allRows: 'true' },
      });
      const rows = data.data.map((row) => ({
        memberName: row.member.name,
        memberCode: row.member.memberCode,
        ...(isSystemAdmin ? { branch: branchName(row.branchId) } : {}),
        subscriptionNumber: row.subscriptionNumber,
        subscriptionType: row.subscriptionType ?? '',
        status: STATUS_LABEL[row.status],
        startDate: row.startDate,
        endDate: row.endDate,
        totalDays: row.totalDays,
        attendanceEntries: row.attendanceEntries,
        attendanceDays: row.attendanceDays,
        attendanceRate: `${row.attendanceRate}%`,
        level: BUCKETS.find((b) => b.value === bucketOf(row.attendanceRate))?.label ?? '',
        remaining: row.isLinkedToSessions ? `${row.sessionsRemaining ?? 0} حصة` : `${row.remainingDays} يوم`,
        lastAttendanceDate: row.lastAttendanceDate ?? 'لم يحضر',
      }));
      await downloadExcel(
        rows,
        [
          { key: 'memberName', header: 'العضو' },
          { key: 'memberCode', header: 'الكود' },
          ...(isSystemAdmin ? [{ key: 'branch' as const, header: 'الفرع' }] : []),
          { key: 'subscriptionNumber', header: 'رقم الاشتراك' },
          { key: 'subscriptionType', header: 'نوع الاشتراك' },
          { key: 'status', header: 'الحالة' },
          { key: 'startDate', header: 'البداية' },
          { key: 'endDate', header: 'النهاية' },
          { key: 'totalDays', header: 'إجمالي الأيام' },
          { key: 'attendanceEntries', header: 'مرات تسجيل الدخول' },
          { key: 'attendanceDays', header: 'أيام الحضور' },
          { key: 'attendanceRate', header: 'نسبة الحضور' },
          { key: 'level', header: 'مستوى الالتزام' },
          { key: 'remaining', header: 'المتبقي' },
          { key: 'lastAttendanceDate', header: 'آخر حضور' },
        ] as never,
        `التزام-الأعضاء-${localToday()}`,
        'التزام الأعضاء',
        { rightToLeft: true },
      );
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setExporting(false);
    }
  };

  const counts = report.data?.buckets;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 shadow-sm md:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
        <div className="grid items-end gap-3 md:grid-cols-[minmax(13rem,1fr)_minmax(11rem,.8fr)_minmax(9rem,.6fr)]">
          <div className="grid gap-1.5">
            <Label>الفرع</Label>
            {isSystemAdmin ? (
              <SearchableSelect
                className={selectCls}
                value={branch}
                onChange={(event) => {
                  setBranch(event.target.value);
                  resetPage();
                }}
              >
                <option value="">كل الفروع</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name?.trim() || `فرع رقم ${b.id}`}</option>
                ))}
              </SearchableSelect>
            ) : (
              <div className="flex h-11 items-center gap-2 rounded-xl border border-primary/20 bg-muted/45 px-3 text-sm font-semibold">
                <Building2 className="size-4 text-primary" />
                <span className="min-w-0 flex-1 truncate">{user?.branch_name ?? branchName(Number(user?.branch ?? 0))}</span>
                <LockKeyhole className="size-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>حالة الاشتراك</Label>
            <select
              className={selectCls}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as SubscriptionStatus);
                resetPage();
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <MemberGenderSelect
            value={gender.value}
            locked={gender.locked}
            onChange={(value) => {
              gender.setValue(value);
              resetPage();
            }}
          />
        </div>

        <div className="mt-5 space-y-2 border-t pt-5 text-center">
          <Label className="text-muted-foreground">مستوى الالتزام</Label>
          <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-2 rounded-2xl bg-muted/35 p-1.5 sm:grid-cols-4">
            {BUCKETS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={bucket === option.value ? 'brand' : 'ghost'}
                aria-pressed={bucket === option.value}
                className="h-auto min-h-11 flex-col gap-0 rounded-xl px-2 py-1.5"
                onClick={() => {
                  setBucket(option.value);
                  resetPage();
                }}
              >
                <span>
                  {option.label}
                  {counts ? <span className="nums ms-1.5 opacity-80">({toArabicDigits(counts[option.value])})</span> : null}
                </span>
                {option.hint ? <span className="text-[11px] font-normal opacity-75">{option.hint}</span> : null}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            النسبة = أيام الحضور المختلفة ÷ الأيام اللي عدّت من الاشتراك (ولباقات الحصص: الحصص المستخدمة ÷ عدد الحصص).
          </p>
        </div>
      </section>

      <DataTable
        columns={columns}
        data={report.data?.data ?? []}
        total={report.data?.total ?? 0}
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
        searchPlaceholder="ابحث باسم العضو أو الكود أو رقم أو نوع الاشتراك…"
        isLoading={report.isLoading}
        isError={report.isError}
        onRetry={() => void report.refetch()}
        emptyTitle="لا توجد اشتراكات مطابقة"
        emptyDescription="غيّر حالة الاشتراك أو مستوى الالتزام أو البحث أو الفرع لعرض نتائج أخرى."
        enableExport
        onExportExcel={exporting ? undefined : exportExcel}
      />
    </div>
  );
}
