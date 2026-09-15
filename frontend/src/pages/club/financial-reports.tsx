import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from 'recharts';
import { PageHeader } from '@/components/common/page-header';
import { ClubStatCard } from '@/components/club/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClubT } from '@/hooks/use-club-t';
import { api } from '@/lib/api';
import { toCsvWithBom } from '@/lib/csv';
import { useArrayResource } from '@/lib/api-hooks';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { ClubDashboardSummary } from '@/types/club';
import { useLocale } from '@/store/locale';

const PIE_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea'];

interface RevenueByTypeRow {
  subscriptionTypeId: number | null;
  typeName: string;
  receiptsCount: number;
  gross: number;
  refunds: number;
  net: number;
}

interface RevenueReportResponse {
  grandTotal?: number;
  subscriptions?: { gross: number; refunds: number; net: number; byType: RevenueByTypeRow[] };
}

export function ClubFinancialReportsPage() {
  const { ui } = useLocale();
  const ct = useClubT();
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => localToday());
  const [branch, setBranch] = useState('all');
  const [subscriptionType, setSubscriptionType] = useState('all');

  const { data: subTypes } = useArrayResource<{ id: number; name: string }>('club-subscription-types');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['club-financial-reports', startDate, endDate, branch],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const { data: s } = await api.get<ClubDashboardSummary>('/club-dashboard/summary', {
        params: { startDate, endDate, ...(branchId ? { branchId: String(branchId) } : {}) },
      });
      return s;
    },
  });

  // Per subscription-type revenue (gross − refunds = net) from the finance revenue-reports endpoint,
  // which the doctor asked to expose on the gym financial page (type breakdown + refund impact).
  const {
    data: revenue,
    isLoading: revenueLoading,
    refetch: refetchRevenue,
  } = useQuery({
    queryKey: ['club-financial-reports', 'by-type', startDate, endDate, branch, subscriptionType],
    queryFn: async () => {
      const branchId = normalizeBranchParam(branch);
      const { data: r } = await api.get<RevenueReportResponse>('/finance/revenue-reports', {
        params: {
          dateFrom: startDate,
          dateTo: endDate,
          ...(branchId ? { branchId: String(branchId) } : {}),
          ...(subscriptionType !== 'all' ? { subscriptionTypeId: subscriptionType } : {}),
        },
      });
      return r;
    },
  });

  const revenueBreakdown = useMemo(() => {
    if (!data) return [];
    return [
      { name: ct('dashboard.subscriptionRevenue'), value: data.subscriptionRevenue ?? 0 },
      { name: ct('dashboard.lockerRevenue'), value: data.lockerRevenue ?? 0 },
      { name: ct('dashboard.spaRevenue'), value: data.spaRevenue ?? 0 },
      { name: ct('dashboard.inbodyRevenue'), value: data.inbodyRevenue ?? 0 },
      { name: ct('dashboard.classRevenue'), value: data.classRevenue ?? 0 },
    ].filter((x) => x.value > 0);
  }, [data, ct]);

  const distribution = useMemo(() => {
    if (!data?.subscriptionDistribution) return [];
    const d = data.subscriptionDistribution;
    return [
      { name: ct('dashboard.monthly'), count: d.monthly },
      { name: ct('dashboard.quarterly'), count: d.quarterly },
      { name: ct('dashboard.halfYearly'), count: d.halfYearly },
      { name: ct('dashboard.yearly'), count: d.yearly },
    ];
  }, [data, ct]);

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      [ui('البند'), ui('القيمة')],
      [ct('dashboard.subscriptionRevenue'), String(data.subscriptionRevenue ?? 0)],
      [ct('dashboard.lockerRevenue'), String(data.lockerRevenue ?? 0)],
      [ct('dashboard.spaRevenue'), String(data.spaRevenue ?? 0)],
      [ct('dashboard.inbodyRevenue'), String(data.inbodyRevenue ?? 0)],
      [ct('dashboard.classRevenue'), String(data.classRevenue ?? 0)],
      [ct('dashboard.totalRevenue'), String(data.totalRevenueAllSources ?? 0)],
      [ct('dashboard.subscriptionRefunds'), String(data.subscriptionRefunds ?? 0)],
      [ct('dashboard.netAfterRefunds'), String(data.netRevenueAfterRefunds ?? (data.totalRevenueAllSources ?? 0) - (data.subscriptionRefunds ?? 0))],
      [ct('dashboard.netProfit'), String(data.netProfit ?? 0)],
    ];
    const typeRows = revenue?.subscriptions?.byType ?? [];
    if (typeRows.length) {
      rows.push([], [ui('نوع الاشتراك'), ui('عدد الإيصالات'), ui('إجمالي الإيراد'), ui('المرتجعات'), ui('صافي الإيراد')]);
      typeRows.forEach((r) =>
        rows.push([r.typeName, String(r.receiptsCount), String(r.gross), String(r.refunds), String(r.net)]),
      );
    }
    const blob = new Blob([toCsvWithBom(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `club-financial-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ct('subscriptions.financialReports')}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!data}>
            {ct('common.export')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div className="grid gap-2">
          <Label>{ct('common.dateFrom')}</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>{ct('common.dateTo')}</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <BranchFilter value={branch} onChange={setBranch} />
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">{ui('نوع الاشتراك')}</Label>
          <select
            value={subscriptionType}
            onChange={(e) => setSubscriptionType(e.target.value)}
            className="flex h-10 w-52 items-center rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">{ui('كل أنواع الاشتراكات')}</option>
            {(subTypes ?? []).map((t) => (
              <option key={t.id} value={String(t.id)}>{t.name}</option>
            ))}
          </select>
        </div>
        <Button
          variant="brand"
          onClick={() => {
            void refetch();
            void refetchRevenue();
          }}
        >
          {ct('common.search')}
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{ct('common.loading')}</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ClubStatCard label={ct('dashboard.subscriptionRevenue')} value={data.subscriptionRevenue ?? 0} />
            <ClubStatCard label={ct('dashboard.lockerRevenue')} value={data.lockerRevenue ?? 0} />
            <ClubStatCard label={ct('dashboard.spaRevenue')} value={data.spaRevenue ?? 0} />
            <ClubStatCard label={ct('dashboard.classRevenue')} value={data.classRevenue ?? 0} />
            <ClubStatCard label={ct('dashboard.inbodyRevenue')} value={data.inbodyRevenue ?? 0} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ClubStatCard label={ct('dashboard.totalRevenue')} value={data.totalRevenueAllSources ?? 0} />
            <ClubStatCard label={ct('dashboard.subscriptionRefunds')} value={data.subscriptionRefunds ?? 0} />
            <ClubStatCard
              label={ct('dashboard.netAfterRefunds')}
              value={data.netRevenueAfterRefunds ?? (data.totalRevenueAllSources ?? 0) - (data.subscriptionRefunds ?? 0)}
            />
            <ClubStatCard label={ct('dashboard.netProfit')} value={data.netProfit ?? 0} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-4 font-medium">{ct('dashboard.totalRevenue')}</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={revenueBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {revenueBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => toArabicDigits(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-4 font-medium">{ct('dashboard.subDistribution')}</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={distribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => toArabicDigits(v)} />
                  <Tooltip formatter={(v: number) => toArabicDigits(v)} />
                  <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-4 font-medium">{ui('إيراد الاشتراكات حسب النوع (بعد خصم المرتجعات)')}</h3>
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <ClubStatCard label={ui('إجمالي إيراد الاشتراكات')} value={revenue?.subscriptions?.gross ?? 0} />
              <ClubStatCard label={ui('المرتجعات')} value={revenue?.subscriptions?.refunds ?? 0} />
              <ClubStatCard label={ui('صافي إيراد الاشتراكات')} value={revenue?.subscriptions?.net ?? 0} />
            </div>
            {revenueLoading ? (
              <p className="text-sm text-muted-foreground">{ct('common.loading')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="p-3 text-start">{ui('نوع الاشتراك')}</th>
                      <th className="p-3 text-start">{ui('عدد الإيصالات')}</th>
                      <th className="p-3 text-start">{ui('إجمالي الإيراد')}</th>
                      <th className="p-3 text-start">{ui('المرتجعات')}</th>
                      <th className="p-3 text-start">{ui('صافي الإيراد')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(revenue?.subscriptions?.byType ?? []).map((r) => (
                      <tr key={r.subscriptionTypeId ?? r.typeName} className="border-b">
                        <td className="p-3">{r.typeName}</td>
                        <td className="p-3 nums">{toArabicDigits(r.receiptsCount)}</td>
                        <td className="p-3 nums">{toArabicDigits(r.gross)}</td>
                        <td className="p-3 nums text-destructive">
                          {r.refunds > 0 ? toArabicDigits(r.refunds) : toArabicDigits(0)}
                        </td>
                        <td className="p-3 nums font-semibold">{toArabicDigits(r.net)}</td>
                      </tr>
                    ))}
                    {(revenue?.subscriptions?.byType ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-muted-foreground">
                          {ct('common.noData')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {data.expensesAvailable === false && (
            <p className="text-sm text-amber-600">{ct('dashboard.expensesNote')}</p>
          )}
        </>
      )}
    </div>
  );
}
