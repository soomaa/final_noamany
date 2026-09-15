import { Activity, ArrowLeft, CreditCard, Lock, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Cell, Legend, Pie, PieChart, Tooltip } from 'recharts';
import { ErrorState } from '@/components/common/states';
import { ChartCard, CHART_COLORS } from '@/components/common/chart-card';
import { ClubDashboardMetrics } from '@/components/club/club-dashboard-metrics';
import { WorkspaceWidgets } from '@/components/workspace/workspace-widgets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { ClubDashboardSummary } from '@/types/club';

const selectCls =
  'flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm shadow-sm';

export function ClubDashboardBody({ embedded }: { embedded?: boolean }) {
  const ct = useClubT();
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState('all');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => localToday());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['club-dashboard', 'summary', branchId, startDate, endDate],
    queryFn: async () => {
      const { data: s } = await api.get<ClubDashboardSummary>('/club-dashboard/summary', {
        params: { startDate, endDate, branchId: branchId !== 'all' ? branchId : undefined },
      });
      return s;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const branchOptions = useMemo(
    () => [{ value: 'all', label: ct('common.allBranches') }, ...(branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }))],
    [branches, ct],
  );

  const quickLinks = [
    { to: '/club/members', label: ct('dashboard.quickMembers'), icon: Users },
    { to: '/club/subscriptions', label: ct('dashboard.quickSubscriptions'), icon: CreditCard },
    { to: '/club/lockers', label: ct('dashboard.quickLockers'), icon: Lock },
  ];

  const metricLabels = useMemo(
    () => ({
      monthlyRevenue: ct('dashboard.monthlyRevenue'),
      totalRemaining: ct('dashboard.totalRemaining'),
      netProfit: ct('dashboard.netProfit'),
      expenses: ct('dashboard.expenses'),
      expenseBreakdown: ct('dashboard.expenseBreakdown'),
      totalMembers: ct('dashboard.totalMembers'),
      activeMembers: ct('dashboard.activeMembers'),
      newMembersMonth: ct('dashboard.newMembersMonth'),
      inactiveMembers: ct('dashboard.inactiveMembers'),
      attendanceRate: ct('dashboard.attendanceRate'),
      revenueBreakdown: ct('dashboard.revenueBreakdown'),
      subscriptionRevenue: ct('dashboard.subscriptionRevenue'),
      lockerRevenue: ct('dashboard.lockerRevenue'),
      spaRevenue: ct('dashboard.spaRevenue'),
      classRevenue: ct('dashboard.classRevenue'),
      inbodyRevenue: ct('dashboard.inbodyRevenue'),
      otherRevenue: ct('dashboard.otherRevenue'),
      operationsOverview: ct('dashboard.operationsOverview'),
      trainersCount: ct('dashboard.trainersCount'),
      classesToday: ct('dashboard.classesToday'),
      facilities: ct('dashboard.facilities'),
      avgMembership: ct('dashboard.avgMembership'),
    }),
    [ct],
  );

  if (isError) {
    return <ErrorState message={apiError(error)} onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-5">
      {/* Filters first — set context before reading data */}
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border bg-card/50 p-4 shadow-sm">
        <div className="grid gap-1.5">
          <Label>{ct('common.branch')}</Label>
          <select className={selectCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branchOptions.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label>{ct('common.dateFrom')}</Label>
          <Input type="date" className="w-40" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>{ct('common.dateTo')}</Label>
          <Input type="date" className="w-40" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <WorkspaceWidgets />

      {!embedded && (
        <div className="flex flex-wrap gap-2">
          {quickLinks.map(({ to, label, icon: Icon }) => (
            <Button key={to} variant="outline" size="sm" asChild>
              <Link to={to}><Icon className="size-4" />{label}<ArrowLeft className="size-3 rotate-180" /></Link>
            </Button>
          ))}
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">{ct('common.loading')}</p>}

      {data && (
        <>
          <ClubDashboardMetrics data={data} labels={metricLabels} />

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="surface-card rounded-2xl border p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 font-semibold dark:text-white">
                <Activity className="size-4 text-amber-500" />
                {ct('dashboard.alerts')}
              </h3>
              <ul className="space-y-3">
                <li className="flex items-center justify-between rounded-xl bg-destructive/[0.06] px-4 py-3 dark:bg-destructive/10">
                  <span className="text-sm">{ct('dashboard.expiredSubs')}</span>
                  <span className="nums rounded-full bg-destructive/10 px-2.5 py-0.5 text-sm font-bold text-destructive">
                    {toArabicDigits(data.alerts.expiredSubscriptions)}
                  </span>
                </li>
                <li className="flex items-center justify-between rounded-xl bg-amber-500/[0.08] px-4 py-3 dark:bg-amber-500/10">
                  <span className="text-sm">{ct('dashboard.pendingRenewals')}</span>
                  <span className="nums rounded-full bg-amber-500/15 px-2.5 py-0.5 text-sm font-bold text-amber-700 dark:text-amber-300">
                    {toArabicDigits(data.alerts.pendingRenewals)}
                  </span>
                </li>
                <li className="flex items-center justify-between rounded-xl bg-emerald-500/[0.08] px-4 py-3 dark:bg-emerald-500/10">
                  <span className="text-sm">{ct('dashboard.newMembersAlert')}</span>
                  <span className="nums rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {toArabicDigits(data.alerts.newMembers)}
                  </span>
                </li>
              </ul>
            </div>

            <ChartCard
              title={ct('dashboard.subDistribution')}
              icon={Activity}
              height={260}
              isEmpty={
                ![
                  data.subscriptionDistribution.monthly,
                  data.subscriptionDistribution.quarterly,
                  data.subscriptionDistribution.halfYearly,
                  data.subscriptionDistribution.yearly,
                ].some((v) => v > 0)
              }
              emptyText={ct('common.noData')}
            >
              <PieChart>
                <Pie
                  data={[
                    { name: ct('dashboard.monthly'), value: data.subscriptionDistribution.monthly },
                    { name: ct('dashboard.quarterly'), value: data.subscriptionDistribution.quarterly },
                    { name: ct('dashboard.halfYearly'), value: data.subscriptionDistribution.halfYearly },
                    { name: ct('dashboard.yearly'), value: data.subscriptionDistribution.yearly },
                  ].filter((d) => d.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {[0, 1, 2, 3].map((i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => toArabicDigits(v)} />
                <Legend />
              </PieChart>
            </ChartCard>
          </div>

          <div className="surface-card rounded-2xl border p-5 shadow-sm">
            <h3 className="mb-4 font-semibold dark:text-white">{ct('dashboard.recentActivity')}</h3>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-white/55">
                  {ct('dashboard.newMembersList')}
                </p>
                <ul className="space-y-2">
                  {data.recentActivities.members.length === 0 && (
                    <li className="text-sm text-muted-foreground dark:text-white/60">{ct('common.noData')}</li>
                  )}
                  {data.recentActivities.members.map((m) => (
                    <li key={m.code} className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2 text-sm dark:bg-white/[0.04]">
                      <span>{m.label}</span>
                      <span className="nums text-muted-foreground dark:text-white/60">{m.code}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-white/55">
                  {ct('dashboard.recentPayments')}
                </p>
                <ul className="space-y-2">
                  {data.recentActivities.payments.length === 0 && (
                    <li className="text-sm text-muted-foreground dark:text-white/60">{ct('common.noData')}</li>
                  )}
                  {data.recentActivities.payments.map((p) => (
                    <li key={p.receiptNumber} className="flex items-center justify-between rounded-lg bg-foreground/[0.03] px-3 py-2 text-sm dark:bg-white/[0.04]">
                      <span className="truncate">{p.label}</span>
                      <span className="nums ms-2 shrink-0 font-semibold text-emerald-600 dark:text-emerald-300">
                        {toArabicDigits(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {!data.expensesAvailable && (
            <p className="text-xs text-muted-foreground dark:text-white/45">{ct('dashboard.expensesNote')}</p>
          )}
        </>
      )}
    </div>
  );
}
