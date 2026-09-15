import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DollarSign, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useState } from 'react';
import { StatCard } from '@/components/common/stat-card';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { financeQueryDates, normalizeFinanceDashboard } from '@/lib/finance-api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { FinancePageShell } from './finance-shell';

export function FinanceDashboardBody() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const [startDate, setStartDate] = useState(() => localToday());
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance', 'dashboard', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<Record<string, unknown>>('/finance/dashboard', {
        params: {
          ...financeQueryDates(startDate, endDate),
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return normalizeFinanceDashboard(d);
    },
  });

  const trend = data?.monthlyTrend ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div className="grid gap-1">
          <Label className="text-xs">{ui('من تاريخ')}</Label>
          <Input className="nums" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">{ui('إلى تاريخ')}</Label>
          <Input className="nums" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">{ui('الفرع')}</Label>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="all">{ui('كل الفروع')}</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="brand" onClick={() => void refetch()}>
          {ui('بحث')}
        </Button>
      </div>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
      <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={ui('إجمالي الإيرادات')}
          value={isLoading ? '…' : toArabicDigits((data?.totalRevenue ?? 0).toFixed(2))}
          subtitle={isLoading ? undefined : `${toArabicDigits(data?.revenueCount ?? 0)} ${ui('إيراد')}`}
          icon={<TrendingUp className="h-5 w-5" />}
          colorIndex={2}
          loading={isLoading}
        />
        <StatCard
          title={ui('إجمالي المصروفات')}
          value={isLoading ? '…' : toArabicDigits((data?.totalExpenses ?? 0).toFixed(2))}
          subtitle={isLoading ? undefined : `${toArabicDigits(data?.expenseCount ?? 0)} ${ui('مصروف')}`}
          icon={<TrendingDown className="h-5 w-5" />}
          colorIndex={4}
          loading={isLoading}
        />
        <StatCard
          title={ui('صافي الربح')}
          value={isLoading ? '…' : toArabicDigits((data?.netProfit ?? 0).toFixed(2))}
          subtitle={isLoading ? undefined : `${toArabicDigits((data?.profitMargin ?? 0).toFixed(1))}% ${ui('هامش')}`}
          icon={<DollarSign className="h-5 w-5" />}
          colorIndex={0}
          loading={isLoading}
        />
        <StatCard
          title={ui('نسبة التحصيل')}
          value={
            isLoading
              ? '…'
              : toArabicDigits(
                  (data?.totalRevenue ?? 0) + (data?.totalExpenses ?? 0) > 0
                    ? (((data?.totalRevenue ?? 0) / ((data?.totalRevenue ?? 0) + (data?.totalExpenses ?? 0))) * 100).toFixed(1)
                    : '0',
                ) + '%'
          }
          icon={<Wallet className="h-5 w-5" />}
          colorIndex={6}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-4 font-semibold">{ui('الاتجاه الشهري')}</h3>
          {trend.length > 0 ? (
            <div className="w-full min-w-0" style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => toArabicDigits(v)} />
                <Tooltip formatter={(v: number) => toArabicDigits(v.toFixed(2))} />
                <Legend />
                <Bar dataKey="revenue" name={ui('الإيرادات')} fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name={ui('المصروفات')} fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{ui('لا توجد بيانات')}</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 font-semibold">{ui('المصروفات حسب الفئة')}</h3>
            {(data?.expensesByCategory ?? []).length > 0 ? (
              <div className="space-y-2">
                {(data?.expensesByCategory ?? []).map((cat) => (
                  <div key={cat.category} className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
                    <span>{cat.category}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{toArabicDigits(cat.count)}</span>
                      <span className="nums font-bold text-red-600">{toArabicDigits(cat.total.toFixed(2))}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{ui('لا توجد بيانات')}</p>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 font-semibold">{ui('الإيرادات حسب المصدر')}</h3>
            {(data?.revenuesBySource ?? []).length > 0 ? (
              <div className="space-y-2">
                {(data?.revenuesBySource ?? []).map((src) => (
                  <div key={src.source} className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
                    <span>{src.source}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{toArabicDigits(src.count)}</span>
                      <span className="nums font-bold text-green-600">{toArabicDigits(src.total.toFixed(2))}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{ui('لا توجد بيانات')}</p>
            )}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

export function FinanceDashboardPage() {
  const { ui } = useLocale();
  return (
    <FinancePageShell title={ui('لوحة تحكم المالية')} description={ui('نظرة عامة على الإيرادات والمصروفات والربحية')}>
      <FinanceDashboardBody />
    </FinancePageShell>
  );
}
