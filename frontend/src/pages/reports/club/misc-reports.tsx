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
import { api } from '@/lib/api';
import { formatMoney, formatTimeFromDate } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

/* ============================================================================
 * تقرير حصص الاشتراكات — subscriptions linked to sessions
 * ========================================================================= */
export function ClubSubscriptionSessionsReportPage() {
  const { ui } = useLocale();
  const [branch, setBranch] = useState('all');
  const audience = useReportAudience();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'club-sub-sessions', branch, audience.gender],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const data = await fetchAllReportRows<{
        id: number;
        subscriptionNumber: string;
        customerName: string | null;
        subscriptionType: string | null;
        sessionsCount: number;
        isLinkedToSessions: boolean;
      }>('/club-subscriptions', {
        ...(branchId ? { branch: String(branchId) } : {}),
        ...(audience.gender ? { gender: audience.gender } : {}),
      });
      return { data, total: data.length };
    },
  });

  const rows = (data?.data ?? []).filter((r) => r.isLinkedToSessions);

  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(
    () => [
      { accessorKey: 'subscriptionNumber', header: ui('رقم الاشتراك') },
      { accessorKey: 'customerName', header: ui('العميل'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'subscriptionType', header: ui('النوع'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'sessionsCount', header: ui('عدد الحصص'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
    ],
    [ui],
  );

  const exportCsv = () =>
    downloadCsv('subscription-sessions', [
      [ui('رقم الاشتراك'), ui('العميل'), ui('النوع'), ui('عدد الحصص')],
      ...rows.map((r) => [r.subscriptionNumber, r.customerName ?? '', r.subscriptionType ?? '', r.sessionsCount]),
    ]);

  return (
    <ReportShell
      title={ui('تقرير حصص الاشتراكات')}
      description={ui('الاشتراكات المرتبطة بعدد حصص محدد')}
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
        emptyTitle={ui('لا توجد حصص')}
        enableExport={false}
      />
    </ReportShell>
  );
}

/* ============================================================================
 * تقرير الاشتراكات والتحصيل حسب مستخدم النظام
 * ========================================================================= */
export function ClubSalesStaffReportPage() {
  const { ui, locale } = useLocale();
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayLocal);
  const [branch, setBranch] = useState('all');
  const audience = useReportAudience();
  const [userId, setUserId] = useState('all');
  const [search, setSearch] = useState('');
  const [summaryPage, setSummaryPage] = useState(1);
  const [detailPage, setDetailPage] = useState(1);
  const [summaryPageSize, setSummaryPageSize] = useState(10);
  const [detailPageSize, setDetailPageSize] = useState(15);

  type UserAnalyticsRow = {
    userId: number;
    userName: string;
    subscriptionsCount: number;
    subscriptionsValue: number;
    receiptsCount: number;
    collectedAmount: number;
  };

  type UserAnalyticsActivity = {
    id: string;
    activityType: 'subscription' | 'receipt';
    activityLabel: string;
    userId: number | null;
    userName: string;
    memberId: number | null;
    memberCode: string | null;
    memberName: string;
    subscriptionId: number | null;
    subscriptionNumber: string;
    subscriptionType: string;
    registrationDate: string;
    occurredAt: string;
    subscriptionValue: number;
    collectedAmount: number;
    branchId: number | null;
    branchName: string | null;
  };

  type UserAnalyticsResponse = {
    data: UserAnalyticsRow[];
    activities: UserAnalyticsActivity[];
    totals: {
      usersCount: number;
      subscriptionsCount: number;
      subscriptionsValue: number;
      receiptsCount: number;
      collectedAmount: number;
    };
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'club-sales-staff', startDate, endDate, branch, audience.gender],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const response = await api.get<UserAnalyticsResponse>('/club-subscriptions/user-analytics', {
        params: {
          startDate,
          endDate,
          ...(branchId ? { branch: String(branchId) } : {}),
          ...(audience.gender ? { gender: audience.gender } : {}),
        },
      });
      return response.data;
    },
  });

  const rows = useMemo(
    () =>
      (data?.data ?? []).filter(
        (row) => userId === 'all' || String(row.userId) === userId,
      ),
    [data, userId],
  );

  const activities = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale === 'en' ? 'en' : 'ar');
    return (data?.activities ?? []).filter((row) => {
      if (userId !== 'all' && String(row.userId) !== userId) return false;
      if (!needle) return true;
      return [
        row.userName,
        row.memberName,
        row.memberCode,
        row.subscriptionNumber,
        row.subscriptionType,
        row.branchName,
        row.activityLabel,
      ].some((value) => String(value ?? '').toLocaleLowerCase(locale === 'en' ? 'en' : 'ar').includes(needle));
    });
  }, [data, locale, search, userId]);

  const summaryRows = rows.slice((summaryPage - 1) * summaryPageSize, summaryPage * summaryPageSize);
  const detailRows = activities.slice((detailPage - 1) * detailPageSize, detailPage * detailPageSize);

  const setReportUser = (value: string) => {
    setUserId(value);
    setSummaryPage(1);
    setDetailPage(1);
  };

  const formatTimestamp = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return toArabicDigits(value || '—');
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  const columns = useMemo<ColumnDef<UserAnalyticsRow>[]>(
    () => [
      { accessorKey: 'userName', header: ui('المستخدم') },
      {
        accessorKey: 'subscriptionsCount',
        header: ui('عدد الاشتراكات'),
        cell: ({ getValue }) => toArabicDigits(getValue() as number),
      },
      {
        accessorKey: 'subscriptionsValue',
        header: ui('قيمة الاشتراكات'),
        cell: ({ getValue }) => formatMoney(getValue() as number, undefined, locale),
      },
      {
        accessorKey: 'receiptsCount',
        header: ui('عدد الدفعات'),
        cell: ({ getValue }) => toArabicDigits(getValue() as number),
      },
      {
        accessorKey: 'collectedAmount',
        header: ui('المبلغ المحصل'),
        cell: ({ getValue }) => formatMoney(getValue() as number, undefined, locale),
      },
    ],
    [locale, ui],
  );

  const activityColumns = useMemo<ColumnDef<UserAnalyticsActivity>[]>(
    () => [
      {
        accessorKey: 'activityLabel',
        header: ui('العملية'),
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.activityType === 'subscription' ? 'active' : 'paid'}
            label={row.original.activityLabel}
          />
        ),
      },
      { accessorKey: 'userName', header: ui('المستخدم') },
      {
        id: 'member',
        header: ui('العضو'),
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.memberName || '—'}</p>
            <p className="text-xs text-muted-foreground nums">{toArabicDigits(row.original.memberCode ?? '—')}</p>
          </div>
        ),
      },
      {
        accessorKey: 'subscriptionNumber',
        header: ui('رقم الاشتراك'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(String(getValue() ?? '—'))}</span>,
      },
      { accessorKey: 'subscriptionType', header: ui('نوع الاشتراك') },
      {
        accessorKey: 'occurredAt',
        header: ui('التاريخ والوقت'),
        cell: ({ getValue }) => <span className="whitespace-nowrap nums">{formatTimestamp(String(getValue() ?? ''))}</span>,
      },
      {
        accessorKey: 'subscriptionValue',
        header: ui('قيمة الاشتراك'),
        cell: ({ getValue }) => formatMoney(Number(getValue() ?? 0), undefined, locale),
      },
      {
        accessorKey: 'collectedAmount',
        header: ui('المبلغ المحصل'),
        cell: ({ getValue }) => formatMoney(Number(getValue() ?? 0), undefined, locale),
      },
      {
        accessorKey: 'branchName',
        header: ui('الفرع'),
        cell: ({ getValue }) => String(getValue() ?? '—'),
      },
    ],
    [locale, ui],
  );

  const exportCsv = () =>
    downloadCsv(`subscription-users-${startDate}-${endDate}`, [
      [
        ui('العملية'),
        ui('المستخدم'),
        ui('العضو'),
        ui('كود العضو'),
        ui('رقم الاشتراك'),
        ui('نوع الاشتراك'),
        ui('التاريخ والوقت'),
        ui('قيمة الاشتراكات'),
        ui('المبلغ المحصل'),
        ui('الفرع'),
      ],
      ...activities.map((row) => [
        row.activityLabel,
        row.userName,
        row.memberName,
        row.memberCode ?? '',
        row.subscriptionNumber,
        row.subscriptionType,
        formatTimestamp(row.occurredAt),
        row.subscriptionValue,
        row.collectedAmount,
        row.branchName ?? '',
      ]),
    ]);

  const userFilter = (
    <div className="grid gap-1.5">
      <label className="text-xs text-muted-foreground">{ui('المستخدم')}</label>
      <select
        value={userId}
        onChange={(event) => setReportUser(event.target.value)}
        className="flex h-10 w-52 items-center rounded-md border border-input bg-background px-3 text-sm"
      >
        <option value="all">{ui('كل المستخدمين')}</option>
        {(data?.data ?? []).map((row) => (
          <option key={row.userId} value={String(row.userId)}>
            {row.userName}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <ReportShell
      title={ui('تقرير الاشتراكات بالمستخدمين')}
      description={ui('عدد الاشتراكات والمبالغ التي حصلها كل مستخدم خلال الفترة')}
      filters={
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          extra={
            <>
              <BranchFilter value={branch} onChange={(value) => { setBranch(value); setSummaryPage(1); setDetailPage(1); }} />
              <ReportAudienceFilter value={audience.value} onChange={audience.setValue} locked={audience.locked} />
              {userFilter}
            </>
          }
        />
      }
      stats={
        <>
          <ClubStatCard label={ui('عدد المستخدمين')} value={rows.length} />
          <ClubStatCard
            label={ui('إجمالي الاشتراكات')}
            value={rows.reduce((sum, row) => sum + row.subscriptionsCount, 0)}
          />
          <ClubStatCard
            label={ui('قيمة الاشتراكات')}
            value={formatMoney(
              rows.reduce((sum, row) => sum + row.subscriptionsValue, 0),
              undefined,
              locale,
            )}
          />
          <ClubStatCard
            label={ui('إجمالي المبالغ المحصلة')}
            value={formatMoney(
              rows.reduce((sum, row) => sum + row.collectedAmount, 0),
              undefined,
              locale,
            )}
          />
        </>
      }
      onExport={exportCsv}
    >
      <div className="space-y-8">
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{ui('ملخص حسب المستخدم')}</h2>
            <p className="text-sm text-muted-foreground">{ui('عدد الاشتراكات وقيمتها والتحصيل الفعلي لكل مستخدم')}</p>
          </div>
          <DataTable
            columns={columns}
            data={summaryRows}
            total={rows.length}
            page={summaryPage}
            pageSize={summaryPageSize}
            onPageChange={setSummaryPage}
            onPageSizeChange={(size) => { setSummaryPageSize(size); setSummaryPage(1); }}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            emptyTitle={ui('لا توجد بيانات خلال الفترة')}
            enableExport={false}
          />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{ui('سجل الاشتراكات والتحصيل')}</h2>
            <p className="text-sm text-muted-foreground">{ui('تفاصيل العضو ونوع الاشتراك والمستخدم والتاريخ والوقت لكل عملية')}</p>
          </div>
          <DataTable
            columns={activityColumns}
            data={detailRows}
            total={activities.length}
            page={detailPage}
            pageSize={detailPageSize}
            onPageChange={setDetailPage}
            onPageSizeChange={(size) => { setDetailPageSize(size); setDetailPage(1); }}
            search={search}
            onSearchChange={(value) => { setSearch(value); setDetailPage(1); }}
            searchPlaceholder={ui('ابحث باسم العضو أو الكود أو نوع الاشتراك أو المستخدم…')}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            emptyTitle={ui('لا توجد عمليات خلال الفترة')}
            enableExport={false}
          />
        </section>
      </div>
    </ReportShell>
  );
}

/* ============================================================================
 * تقرير الحضور والانصراف
 * ========================================================================= */
export function ClubAttendanceReportPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayLocal);
  const [branch, setBranch] = useState('all');
  const audience = useReportAudience();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'club-attendance', startDate, endDate, branch, audience.gender],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const data = await fetchAllReportRows<{
        id: number;
        memberName: string;
        memberCode: string;
        attendanceDate: string;
        checkInTime: string;
        checkOutTime: string | null;
        status: string;
        duration: number | null;
      }>('/club-attendance', {
        startDate,
        endDate,
        ...(branchId ? { branch: String(branchId) } : {}),
        ...(audience.gender ? { gender: audience.gender } : {}),
      });
      return { data, total: data.length };
    },
  });

  const rows = data?.data ?? [];

  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(
    () => [
      { accessorKey: 'memberName', header: ui('العضو') },
      { accessorKey: 'memberCode', header: ui('الكود') },
      { accessorKey: 'attendanceDate', header: ui('التاريخ'), cell: ({ getValue }) => toArabicDigits(String(getValue() ?? '')) },
      {
        accessorKey: 'checkInTime',
        header: ui('دخول'),
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? formatTimeFromDate(v) : '—';
        },
      },
      {
        accessorKey: 'checkOutTime',
        header: ui('خروج'),
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          return v ? formatTimeFromDate(v) : '—';
        },
      },
      {
        accessorKey: 'duration',
        header: ui('المدة'),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v != null ? toArabicDigits(v) : '—';
        },
      },
    ],
    [ui],
  );

  const exportCsv = () =>
    downloadCsv(`attendance-${startDate}-${endDate}`, [
      [ui('العضو'), ui('الكود'), ui('التاريخ'), ui('دخول'), ui('خروج'), ui('المدة')],
      ...rows.map((r) => [
        r.memberName,
        r.memberCode,
        r.attendanceDate,
        r.checkInTime,
        r.checkOutTime ?? '',
        r.duration ?? '',
      ]),
    ]);

  return (
    <ReportShell
      title={ui('تقرير الحضور والانصراف')}
      description={ui('سجلات الدخول والخروج خلال الفترة')}
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
      stats={<ClubStatCard label={ui('عدد السجلات')} value={rows.length} />}
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
        emptyTitle={ui('لا توجد سجلات')}
        enableExport={false}
      />
    </ReportShell>
  );
}

/* ============================================================================
 * تقرير المدربين
 * ========================================================================= */
export function ClubTrainersReportPage() {
  const { ui } = useLocale();
  const [branch, setBranch] = useState('all');
  const audience = useReportAudience();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'club-trainers', branch, audience.gender],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const data = await fetchAllReportRows<{
        id: number;
        name: string;
        specialization: string | null;
        rating: number | null;
        activeClients: number | null;
        isActive: boolean;
      }>('/club-trainers', {
        ...(branchId ? { branch: String(branchId) } : {}),
        ...(audience.gender ? { gender: audience.gender } : {}),
      });
      return { data, total: data.length };
    },
  });

  const rows = data?.data ?? [];

  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(
    () => [
      { accessorKey: 'name', header: ui('اسم المدرب') },
      { accessorKey: 'specialization', header: ui('التخصص'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        accessorKey: 'rating',
        header: ui('التقييم'),
        cell: ({ getValue }) => (getValue() != null ? toArabicDigits(Number(getValue())) : '—'),
      },
      {
        accessorKey: 'activeClients',
        header: ui('عدد العملاء'),
        cell: ({ getValue }) => (getValue() != null ? toArabicDigits(Number(getValue())) : '—'),
      },
      {
        accessorKey: 'isActive',
        header: ui('الحالة'),
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'active' : 'suspended'} />,
      },
    ],
    [ui],
  );

  const exportCsv = () =>
    downloadCsv('trainers', [
      [ui('اسم المدرب'), ui('التخصص'), ui('التقييم'), ui('عدد العملاء'), ui('الحالة')],
      ...rows.map((r) => [r.name, r.specialization ?? '', r.rating ?? '', r.activeClients ?? '', r.isActive ? ui('نشط') : ui('موقوف')]),
    ]);

  return (
    <ReportShell
      title={ui('تقرير المدربين')}
      description={ui('قائمة كاملة بالمدربين والتخصصات وحالة العمل')}
      filters={<>
        <BranchFilter value={branch} onChange={setBranch} />
        <ReportAudienceFilter value={audience.value} onChange={audience.setValue} locked={audience.locked} />
      </>}
      stats={
        <>
          <ClubStatCard label={ui('إجمالي المدربين')} value={rows.length} />
          <ClubStatCard label={ui('النشطين')} value={rows.filter((r) => r.isActive).length} />
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
        emptyTitle={ui('لا يوجد مدربون')}
        enableExport={false}
      />
    </ReportShell>
  );
}

/* ============================================================================
 * تقرير اللوكر خلال فترة
 * ========================================================================= */
export function ClubLockersReportPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayLocal);
  const [branch, setBranch] = useState('all');
  const audience = useReportAudience();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', 'club-lockers', startDate, endDate, branch, audience.gender],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const data = await fetchAllReportRows<{
        id: number;
        subscriptionNumber: string;
        customerName: string | null;
        subscriptionStartDate: string | null;
        subscriptionEndDate: string | null;
        paidAmount: number | null;
        status: string;
      }>('/club-locker-subscriptions', {
        startDate,
        endDate,
        ...(branchId ? { mainBranchId: String(branchId) } : {}),
        ...(audience.gender ? { gender: audience.gender } : {}),
      });
      return { data, total: data.length };
    },
  });

  const rows = data?.data ?? [];

  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(
    () => [
      { accessorKey: 'subscriptionNumber', header: ui('رقم اشتراك اللوكر') },
      { accessorKey: 'customerName', header: ui('العضو'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'subscriptionStartDate', header: ui('البداية'), cell: ({ getValue }) => toArabicDigits(String(getValue() ?? '—')) },
      { accessorKey: 'subscriptionEndDate', header: ui('النهاية'), cell: ({ getValue }) => toArabicDigits(String(getValue() ?? '—')) },
      { accessorKey: 'paidAmount', header: ui('المدفوع'), cell: ({ getValue }) => (getValue() != null ? toArabicDigits(Number(getValue())) : '—') },
      {
        accessorKey: 'status',
        header: ui('الحالة'),
        cell: ({ row }) => {
          const map = { active: 'active', expired: 'expired', available: 'pending' } as const;
          return <StatusBadge status={map[row.original.status as keyof typeof map] ?? 'pending'} />;
        },
      },
    ],
    [ui],
  );

  const totalFees = rows.reduce((s, r) => s + Number(r.paidAmount ?? 0), 0);

  const exportCsv = () =>
    downloadCsv(`lockers-${startDate}-${endDate}`, [
      [ui('رقم اللوكر'), ui('العضو'), ui('البداية'), ui('النهاية'), ui('الرسوم'), ui('الحالة')],
      ...rows.map((r) => [r.subscriptionNumber, r.customerName ?? '', r.subscriptionStartDate ?? '', r.subscriptionEndDate ?? '', r.paidAmount ?? 0, r.status]),
    ]);

  return (
    <ReportShell
      title={ui('تقرير اللوكر')}
      description={ui('حجوزات اللوكرات خلال الفترة المحددة')}
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
          <ClubStatCard label={ui('عدد الحجوزات')} value={rows.length} />
          <ClubStatCard label={ui('إجمالي الرسوم')} value={totalFees} />
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
        emptyTitle={ui('لا توجد حجوزات')}
        enableExport={false}
      />
    </ReportShell>
  );
}
