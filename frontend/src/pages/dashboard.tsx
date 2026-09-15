import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Users,
  UserCheck,
  Clock,
  Palmtree,
  TrendingUp,
  AlertTriangle,
  UserX,
  Fingerprint,
  FileText,
  CalendarOff,
  ArrowLeft,
  PieChart as PieChartIcon,
  Building2,
  Info,
  Activity,
} from 'lucide-react';
import { formatNum } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/common/stat-card';
import { StatusBadge } from '@/components/common/status-badge';
import { DateText } from '@/components/common/formatters';
import { EmptyState, ErrorState } from '@/components/common/states';
import { WelcomeBanner } from '@/components/common/welcome-banner';
import { ChartCard, CHART_COLORS } from '@/components/common/chart-card';
import { useDashboard } from '@/hooks/use-dashboard';
import { useGlobalSettings } from '@/hooks/use-global-settings';
import { useAlerts } from '@/hooks/use-notifications';
import { useBranches } from '@/hooks/use-branches';
import { getAlertTypes } from '@/lib/i18n-constants';
import type { AlertGroupKey } from '@/types/notifications';
import type { DashboardSummary } from '@/types';
import { useAuth } from '@/store/auth';
import { cn, formatDigits } from '@/lib/utils';
import { isNotImplemented } from '@/lib/api-hooks';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const QUICK_LINK_DEFS = [
  { to: '/attendance', labelKey: 'لوحة الحضور', icon: Fingerprint },
  { to: '/employees', labelKey: 'الموظفين', icon: Users },
  { to: '/leaves', labelKey: 'الإجازات', icon: CalendarOff },
  { to: '/reports', labelKey: 'التقارير', icon: FileText },
] as const;

const STATUS_COLORS = ['#34D399', '#FBBF24', '#F87171', '#60A5FA'];

function DashboardFilters({
  isAdmin,
  branch,
  manWomen,
  branchOptions,
  onBranchChange,
  onManWomenChange,
  light,
}: {
  isAdmin: boolean;
  branch: string;
  manWomen: string;
  branchOptions: { value: string; label: string }[];
  onBranchChange: (v: string) => void;
  onManWomenChange: (v: string) => void;
  light?: boolean;
}) {
  const { ui } = useLocale();
  const triggerClass = light
    ? 'h-10 w-[140px] border-white/25 bg-white/10 text-white backdrop-blur-sm hover:bg-white/15 [&>span]:text-white/90'
    : 'w-[140px]';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn('text-sm font-medium', light ? 'text-white/70' : 'text-muted-foreground')}>
        {uiStatic('تصفية:')}
      </span>
      {isAdmin && (
        <Select value={branch} onValueChange={onBranchChange}>
          <SelectTrigger className={triggerClass}>
            <SelectValue placeholder={uiStatic('الفرع')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{uiStatic('كل الفروع')}</SelectItem>
            {branchOptions.map((b) => (
              <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={manWomen} onValueChange={onManWomenChange}>
        <SelectTrigger className={light ? cn(triggerClass, 'w-[120px]') : 'w-[120px]'}>
          <SelectValue placeholder={uiStatic('النوع')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{uiStatic('الكل')}</SelectItem>
          <SelectItem value="1">{uiStatic('رجالى')}</SelectItem>
          <SelectItem value="2">{uiStatic('حريمى')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function AttendanceHeroCard({
  data,
  isLoading,
}: {
  data: DashboardSummary | null | undefined;
  isLoading: boolean;
}) {
  const { locale } = useLocale();

  const attendancePct = data ? Math.min(100, Math.max(0, data.presentPct)) : 0;
  const onTime = data ? Math.max(0, data.presentToday - data.lateToday) : 0;
  const absentToday = data ? Math.max(0, data.totalEmployees - data.presentToday - data.onLeaveToday) : 0;

  const RADIUS = 44;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const dashOffset = CIRCUMFERENCE * (1 - attendancePct / 100);

  if (isLoading) {
    return (
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2a2410] via-[#171308] to-[#000000] p-6 shadow-xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
          <Skeleton className="mx-auto size-28 shrink-0 rounded-full bg-white/15 sm:mx-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-24 bg-white/15" />
            <Skeleton className="h-10 w-20 bg-white/20" />
            <div className="flex gap-3">
              <Skeleton className="h-14 w-20 rounded-xl bg-white/15" />
              <Skeleton className="h-14 w-20 rounded-xl bg-white/15" />
              <Skeleton className="h-14 w-20 rounded-xl bg-white/15" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2a2410] via-[#171308] to-[#000000] p-6 shadow-xl ring-1 ring-white/10">
      <div className="pointer-events-none absolute -end-10 -top-10 size-40 rounded-full bg-white/[0.06] blur-2xl" />
      <div className="pointer-events-none absolute -bottom-8 start-1/3 size-32 rounded-full bg-white/[0.04] blur-xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
        {/* Ring progress */}
        <div className="relative mx-auto shrink-0 sm:mx-0">
          <svg width="112" height="112" className="-rotate-90" aria-hidden>
            <circle cx="56" cy="56" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
            <circle
              cx="56"
              cy="56"
              r={RADIUS}
              fill="none"
              stroke="#34D399"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold text-white nums">{formatDigits(Math.round(attendancePct), locale)}%</span>
            <span className="text-[10px] font-medium text-white/60">{uiStatic('حضور')}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/55">
              <Activity className="size-3.5" />
              {uiStatic('بصمة اليوم')}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-bold text-white nums">{formatNum(data?.presentToday ?? 0, locale)}</span>
              <span className="text-sm text-white/55">
                / {formatNum(data?.totalEmployees ?? 0, locale)} {uiStatic('موظف')}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded-xl bg-white/10 px-3 py-2 text-center">
              <UserCheck className="mx-auto mb-1 size-3.5 text-emerald-300" />
              <p className="text-base font-bold text-white nums">{formatNum(onTime, locale)}</p>
              <p className="text-[10px] font-medium text-white/60">{uiStatic('في الوقت')}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2 text-center">
              <Clock className="mx-auto mb-1 size-3.5 text-amber-300" />
              <p className="text-base font-bold text-white nums">{formatNum(data?.lateToday ?? 0, locale)}</p>
              <p className="text-[10px] font-medium text-white/60">{uiStatic('متأخر')}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2 text-center">
              <UserX className="mx-auto mb-1 size-3.5 text-rose-300" />
              <p className="text-base font-bold text-white nums">{formatNum(absentToday, locale)}</p>
              <p className="text-[10px] font-medium text-white/60">{uiStatic('غائب اليوم')}</p>
            </div>
          </div>

          <Link
            to="/attendance"
            className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/22"
          >
            <Fingerprint className="size-3.5" />
            {uiStatic('لوحة الحضور الكاملة')}
            <ArrowLeft className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function DashboardBody({
  data,
  isLoading,
  alertHighlights,
  setupPending,
  hideQuickLinks,
  filterNode,
}: {
  data: DashboardSummary | null | undefined;
  isLoading: boolean;
  alertHighlights: Array<{ key: string; label: string; name: string | null; empId: number; daysLeft: number }>;
  setupPending?: boolean;
  hideQuickLinks?: boolean;
  filterNode?: ReactNode;
}) {
  const { ui, locale } = useLocale();

  const chartData = useMemo(
    () => data?.weekly?.map((w) => ({ name: ui(w.label), pct: w.pct })) ?? [],
    [data?.weekly, ui],
  );

  const absentToday = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, data.totalEmployees - data.presentToday - data.onLeaveToday);
  }, [data]);

  const onTimeToday = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, data.presentToday - data.lateToday);
  }, [data]);

  const statusBreakdown = useMemo(() => {
    if (!data) return [];
    return [
      { name: uiStatic('حاضر'), value: onTimeToday, color: STATUS_COLORS[0] },
      { name: uiStatic('متأخر اليوم'), value: data.lateToday, color: STATUS_COLORS[1] },
      { name: uiStatic('غائب اليوم'), value: absentToday, color: STATUS_COLORS[2] },
      { name: uiStatic('في إجازة'), value: data.onLeaveToday, color: STATUS_COLORS[3] },
    ].filter((s) => s.value > 0);
  }, [data, ui, onTimeToday, absentToday]);

  const deptBreakdown = useMemo(() => {
    const rows = data?.todayAttendance ?? [];
    const map = new Map<string, { present: number; late: number; other: number }>();
    for (const row of rows) {
      const dept = row.department ?? uiStatic('غير محدد');
      const cur = map.get(dept) ?? { present: 0, late: 0, other: 0 };
      if (row.status === 'late') cur.late++;
      else if (row.status === 'present') cur.present++;
      else cur.other++;
      map.set(dept, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name: name.length > 14 ? `${name.slice(0, 12)}…` : name,
        fullName: name,
        present: v.present,
        late: v.late,
        other: v.other,
        total: v.present + v.late + v.other,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [data?.todayAttendance, ui]);

  const quickLinks = useMemo(
    () => QUICK_LINK_DEFS.map((link) => ({ ...link, label: uiStatic(link.labelKey) })),
    [ui],
  );

  return (
    <>
      {setupPending && (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3.5 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="font-semibold text-primary">{uiStatic('لوحة التحكم قيد الإعداد')}</p>
            <p className="mt-0.5 text-muted-foreground">{uiStatic('سيتم تفعيل البيانات عند اكتمال الخادم.')}</p>
          </div>
        </div>
      )}

      {!hideQuickLinks && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center justify-between rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-card to-secondary/30 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Icon className="size-5" />
                </div>
                <span className="font-semibold">{label}</span>
              </div>
              <ArrowLeft className="size-4 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      )}

      {/* Editorial two-column layout */}
      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        {/* ── Main column ── */}
        <div className="min-w-0 space-y-5">
          <AttendanceHeroCard data={data} isLoading={isLoading} />

          {/* 3 core attendance metrics */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title={uiStatic('حاضر اليوم')} value={data?.presentToday ?? 0} subtitle={data ? `${formatDigits(data.presentPct.toFixed(1), locale)}%` : undefined} icon={<UserCheck className="size-5" />} colorIndex={3} loading={isLoading} />
            <StatCard title={uiStatic('متأخر اليوم')} value={data?.lateToday ?? 0} subtitle={data?.avgLateMinutes ? uiStatic(`متوسط ${formatDigits(Math.round(data.avgLateMinutes), locale)} د`) : undefined} icon={<Clock className="size-5" />} colorIndex={4} loading={isLoading} />
            <StatCard title={uiStatic('غائب اليوم')} value={absentToday} icon={<UserX className="size-5" />} colorIndex={1} loading={isLoading} />
          </div>

          <ChartCard
            title={uiStatic('نسبة الحضور الأسبوعية')}
            icon={TrendingUp}
            loading={isLoading}
            isEmpty={!isLoading && chartData.length === 0}
            emptyText={uiStatic('لا توجد بيانات أسبوعية')}
            height={220}
          >
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="brandFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ED1C24" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ED1C24" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => formatDigits(v, locale)} domain={[0, 100]} />
              <Tooltip formatter={(v: number) => [`${formatDigits(v.toFixed(1), locale)}%`, uiStatic('النسبة')]} />
              <Area type="monotone" dataKey="pct" stroke="#ED1C24" fill="url(#brandFill)" strokeWidth={2} />
            </AreaChart>
          </ChartCard>

          <ChartCard
            title={uiStatic('حسب الإدارة')}
            icon={Building2}
            description={uiStatic('متابعة البصمة اليوم')}
            loading={isLoading}
            isEmpty={!isLoading && deptBreakdown.length === 0}
            emptyText={uiStatic('لا يوجد حضور مسجّل لهذا اليوم.')}
            height={240}
          >
            <BarChart data={deptBreakdown} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => formatDigits(v, locale)} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number) => formatDigits(v, locale)}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
              />
              <Legend />
              <Bar dataKey="present" name={uiStatic('حاضر')} stackId="a" fill="#34D399" radius={[0, 0, 0, 0]} />
              <Bar dataKey="late" name={uiStatic('متأخر')} stackId="a" fill="#FBBF24" radius={[0, 0, 0, 0]} />
              <Bar dataKey="other" name={uiStatic('أخرى')} stackId="a" fill="#94A3B8" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartCard>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/20">
              <CardTitle className="flex items-center gap-2 text-[14.5px] font-bold">
                <Fingerprint className="size-5 text-primary" />
                {uiStatic('متابعة البصمة اليوم')} — <DateText value={new Date().toISOString()} />
              </CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link to="/attendance">{uiStatic('عرض لوحة الحضور')}</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : !data?.todayAttendance?.length ? (
                <EmptyState title={uiStatic('عفواً … لا توجد نتائج')} description={uiStatic('لا يوجد حضور مسجّل لهذا اليوم.')} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-muted-foreground">
                        <th className="p-3 text-start">#</th>
                        <th className="p-3 text-start">{uiStatic('كود الموظف')}</th>
                        <th className="p-3 text-start">{uiStatic('الاسم')}</th>
                        <th className="p-3 text-start">{uiStatic('الإدارة')}</th>
                        <th className="p-3 text-start">{uiStatic('الحضور')}</th>
                        <th className="p-3 text-start">{uiStatic('الانصراف')}</th>
                        <th className="p-3 text-start">{uiStatic('التأخير')}</th>
                        <th className="p-3 text-start">{uiStatic('الحالة')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.todayAttendance.map((row, i) => (
                        <tr key={row.hodoorId} className="border-b border-border/50 transition-colors even:bg-muted/20 hover:bg-primary/5">
                          <td className="p-3 nums">{formatDigits(i + 1, locale)}</td>
                          <td className="p-3 nums">{formatDigits(row.empCode ?? '—', locale)}</td>
                          <td className="p-3 font-medium">{row.name ?? '—'}</td>
                          <td className="p-3">{row.department ?? '—'}</td>
                          <td className="p-3 nums">{row.checkIn ? formatDigits(row.checkIn, locale) : '—'}</td>
                          <td className="p-3 nums">{row.checkOut ? formatDigits(row.checkOut, locale) : '—'}</td>
                          <td className="p-3 nums">{row.lateMin != null ? formatDigits(row.lateMin, locale) : '—'}</td>
                          <td className="p-3">
                            <StatusBadge status={row.status === 'late' ? 'late' : row.status === 'leave' ? 'leave' : row.status === 'absent' ? 'absent' : 'present'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right rail ── */}
        <div className="space-y-5">
          {filterNode && (
            <div className="rounded-xl border px-4 py-3">
              {filterNode}
            </div>
          )}

          <StatCard title={uiStatic('إجمالي الموظفين')} value={data?.totalEmployees ?? 0} icon={<Users className="size-5" />} colorIndex={0} loading={isLoading} />
          <StatCard title={uiStatic('في إجازة')} value={data?.onLeaveToday ?? 0} icon={<Palmtree className="size-5" />} colorIndex={6} loading={isLoading} sparkline={chartData.map((c) => ({ v: c.pct }))} />

          <ChartCard
            title={uiStatic('توزيع حضور اليوم')}
            icon={PieChartIcon}
            description={uiStatic('حسب الحالة')}
            loading={isLoading}
            isEmpty={!isLoading && statusBreakdown.length === 0}
            emptyText={uiStatic('لا توجد بيانات')}
            height={220}
          >
            <PieChart>
              <Pie
                data={statusBreakdown}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
              >
                {statusBreakdown.map((entry, i) => (
                  <Cell key={entry.name} fill={entry.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatDigits(v, locale)} />
              <Legend />
            </PieChart>
          </ChartCard>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="border-b border-border/60 bg-muted/20">
              <CardTitle className="flex items-center gap-2 text-[14.5px] font-bold">
                <AlertTriangle className="size-5 text-warning" />
                {uiStatic('تنبيهات اليوم')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
              ) : (
                <>
                  {(data?.lateToday ?? 0) > 0 && (
                    <div className="rounded-xl border border-warning/30 bg-warning/5 p-3.5 text-sm">
                      <span className="font-semibold text-warning">{uiStatic('تأخير:')}</span>{' '}
                      {formatDigits(data!.lateToday, locale)} {uiStatic('موظف متأخر اليوم')}
                      {data!.avgLateMinutes > 0 && (
                        <span className="text-muted-foreground">
                          {' '}
                          ({uiStatic(`متوسط ${formatDigits(Math.round(data!.avgLateMinutes), locale)} دقيقة`)})
                        </span>
                      )}
                    </div>
                  )}
                  {absentToday > 0 && (
                    <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm">
                      <span className="font-semibold text-destructive">{uiStatic('غياب:')}</span>{' '}
                      {formatDigits(absentToday, locale)} {uiStatic('موظف لم يسجّل حضوراً اليوم')}
                    </div>
                  )}
                  {(data?.presentPct ?? 0) < 50 && (data?.totalEmployees ?? 0) > 0 && (
                    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 text-sm">
                      {uiStatic(`نسبة الحضور منخفضة (${formatDigits(data!.presentPct.toFixed(1), locale)}%) — راجع لوحة الحضور`)}
                    </div>
                  )}
                  {alertHighlights.length === 0 && (data?.lateToday ?? 0) === 0 && absentToday === 0 && (
                    <div className="rounded-xl border border-border p-3.5 text-sm text-muted-foreground">
                      {uiStatic('لا توجد تنبيهات عاجلة اليوم')}
                    </div>
                  )}
                  {alertHighlights.map((a) => (
                    <Link
                      key={`${a.key}-${a.empId}`}
                      to={`/employees/${a.empId}`}
                      className="block rounded-xl border border-warning/30 bg-warning/5 p-3.5 text-sm transition-colors hover:bg-warning/10"
                    >
                      <span className="font-semibold text-warning">{a.label}:</span>{' '}
                      {a.name ?? '—'}
                      <span className="text-muted-foreground">
                        {' '}
                        ({uiStatic('باقي')} <span className="nums">{formatDigits(a.daysLeft, locale)}</span> {uiStatic('يوم')})
                      </span>
                    </Link>
                  ))}
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link to="/notifications">{uiStatic('عرض كل الإشعارات')}</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export function HrSectionDashboard({ hideQuickLinks = true }: { hideQuickLinks?: boolean }) {
  const { t, ui } = useLocale();
  const { user } = useAuth();
  const isAdmin = user?.level === 1;
  const [branch, setBranch] = useState<string>('all');
  const [manWomen, setManWomen] = useState<string>('all');
  const { data: branches } = useBranches();
  const { data: alerts } = useAlerts();

  const branchOptions = useMemo(
    () => branches?.map((b) => ({ value: String(b.id), label: b.name ?? `${ui('فرع')} ${b.id}` })) ?? [],
    [branches],
  );

  const alertTypes = useMemo(() => getAlertTypes(t), [t]);
  const alertHighlights = useMemo(() => {
    if (!alerts) return [];
    return alertTypes.flatMap((alertType) => {
      const key = alertType.key as AlertGroupKey;
      const items = alerts[key] ?? [];
      return items.slice(0, 2).map((item) => ({
        key: alertType.key,
        label: alertType.label,
        name: item.name,
        empId: item.empId,
        daysLeft: item.daysLeft,
      }));
    }).slice(0, 6);
  }, [alerts, alertTypes]);

  const { data, isLoading, isError, error, refetch } = useDashboard({
    branch: branch === 'all' ? 'all' : Number(branch),
    manWomen: manWomen === 'all' ? undefined : Number(manWomen),
  });

  const setupPending = isError && isNotImplemented(error);

  if (isError && !setupPending) {
    return <ErrorState inline onRetry={() => void refetch()} />;
  }

  return (
    <DashboardBody
      data={setupPending ? null : data}
      isLoading={isLoading && !setupPending}
      alertHighlights={alertHighlights}
      setupPending={setupPending}
      hideQuickLinks={hideQuickLinks}
      filterNode={
        <DashboardFilters
          isAdmin={isAdmin}
          branch={branch}
          manWomen={manWomen}
          branchOptions={branchOptions}
          onBranchChange={setBranch}
          onManWomenChange={setManWomen}
        />
      }
    />
  );
}

export function DashboardPage() {
  const { t, ui } = useLocale();
  const { user } = useAuth();
  const isAdmin = user?.level === 1;
  const [branch, setBranch] = useState<string>('all');
  const [manWomen, setManWomen] = useState<string>('all');

  const { data: globalSettings } = useGlobalSettings();
  const { data: branches } = useBranches();
  const { data: alerts } = useAlerts();

  const branchOptions = useMemo(
    () => branches?.map((b) => ({ value: String(b.id), label: b.name ?? ui(`فرع ${b.id}`) })) ?? [],
    [branches, ui],
  );

  const alertTypes = useMemo(() => getAlertTypes(t), [t]);

  const alertHighlights = useMemo(() => {
    if (!alerts) return [];
    return alertTypes.flatMap((alertType) => {
      const key = alertType.key as AlertGroupKey;
      const items = alerts[key] ?? [];
      return items.slice(0, 2).map((item) => ({
        key: alertType.key,
        label: alertType.label,
        name: item.name,
        empId: item.empId,
        daysLeft: item.daysLeft,
      }));
    }).slice(0, 6);
  }, [alerts, alertTypes]);

  const { data, isLoading, isError, error, refetch } = useDashboard({
    branch: branch === 'all' ? 'all' : Number(branch),
    manWomen: manWomen === 'all' ? undefined : Number(manWomen),
  });

  const setupPending = isError && isNotImplemented(error);
  const showContent = !isError || setupPending;

  const bannerStats = useMemo(
    () => [
      { label: ui('إجمالي الموظفين'), value: data?.totalEmployees ?? 0 },
      { label: ui('حاضر اليوم'), value: data?.presentToday ?? 0 },
      { label: ui('متأخر اليوم'), value: data?.lateToday ?? 0 },
      { label: ui('في إجازة'), value: data?.onLeaveToday ?? 0 },
    ],
    [data, ui],
  );

  const filterActions = (
    <DashboardFilters
      isAdmin={isAdmin}
      branch={branch}
      manWomen={manWomen}
      branchOptions={branchOptions}
      onBranchChange={setBranch}
      onManWomenChange={setManWomen}
      light
    />
  );

  if (isError && !setupPending) {
    return (
      <div className="space-y-6">
        <WelcomeBanner
          name={user?.name}
          instituteName={globalSettings?.instituteName}
          actions={filterActions}
          stats={bannerStats}
          loading={isLoading}
        />
        <ErrorState inline onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WelcomeBanner
        name={user?.name}
        instituteName={globalSettings?.instituteName}
        actions={filterActions}
        stats={bannerStats}
        loading={isLoading && !setupPending}
      />

      {showContent && (
        <DashboardBody
          data={setupPending ? null : data}
          isLoading={isLoading && !setupPending}
          alertHighlights={alertHighlights}
          setupPending={setupPending}
        />
      )}
    </div>
  );
}
