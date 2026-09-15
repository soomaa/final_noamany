import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { StatCard } from '@/components/common/stat-card';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { financeListLink, financeQueryDates, normalizeFinancialAnalysis } from '@/lib/finance-api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { FINANCE_ROUTES } from '@/lib/finance-routes';
import { useLocale } from '@/store/locale';
import { FinancePageShell } from './finance-shell';

function yearStart() {
  return localDateStr(new Date(new Date().getFullYear(), 0, 1));
}

export function FinanceAnalysisPage() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance', 'analysis', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<Record<string, unknown>>('/finance/analysis', {
        params: {
          ...financeQueryDates(startDate, endDate),
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return normalizeFinancialAnalysis(d);
    },
  });

  const comparison = data?.monthlyComparison ?? [];
  const listLink = (path: string) => financeListLink(path, startDate, endDate, branchId);

  return (
    <FinancePageShell title={ui('التحليل المالي')} description={ui('مقارنة الإيرادات والمصروفات ومؤشرات الأداء')}>
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
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title={ui('إجمالي الإيرادات')}
          value={isLoading ? '…' : toArabicDigits((data?.totalRevenue ?? 0).toFixed(2))}
          icon={<TrendingUp className="h-5 w-5" />}
          colorIndex={2}
          loading={isLoading}
          to={listLink(FINANCE_ROUTES.revenues)}
        />
        <StatCard
          title={ui('إجمالي المصروفات')}
          value={isLoading ? '…' : toArabicDigits((data?.totalExpenses ?? 0).toFixed(2))}
          icon={<TrendingDown className="h-5 w-5" />}
          colorIndex={4}
          loading={isLoading}
          to={listLink(FINANCE_ROUTES.expenses)}
        />
        <StatCard
          title={ui('صافي الربح/الخسارة')}
          value={isLoading ? '…' : toArabicDigits((data?.netProfit ?? 0).toFixed(2))}
          subtitle={isLoading ? undefined : `${toArabicDigits((data?.profitMargin ?? 0).toFixed(1))}% ${ui('هامش')}`}
          icon={<DollarSign className="h-5 w-5" />}
          colorIndex={0}
          loading={isLoading}
          to={FINANCE_ROUTES.profitLoss}
        />
      </div>

      {comparison.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-4 font-semibold">{ui('المقارنة الشهرية')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={comparison}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => toArabicDigits(v)} />
              <Tooltip formatter={(v: number) => toArabicDigits(v.toFixed(2))} />
              <Legend />
              <Line type="monotone" dataKey="revenue" name={ui('الإيرادات')} stroke="#16a34a" strokeWidth={2} />
              <Line type="monotone" dataKey="expense" name={ui('المصروفات')} stroke="#dc2626" strokeWidth={2} />
              <Line type="monotone" dataKey="profit" name={ui('الربح')} stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-4 font-semibold">{ui('توزيع المصروفات')}</h3>
          {(data?.expensesByCategory ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data?.expensesByCategory ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => toArabicDigits(v)} />
                <YAxis type="category" dataKey="category" width={80} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => toArabicDigits(v.toFixed(2))} />
                <Bar dataKey="total" fill="#dc2626" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">{ui('لا توجد بيانات')}</p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-4 font-semibold">{ui('توزيع الإيرادات')}</h3>
          {(data?.revenuesBySource ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data?.revenuesBySource ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => toArabicDigits(v)} />
                <YAxis type="category" dataKey="source" width={80} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => toArabicDigits(v.toFixed(2))} />
                <Bar dataKey="total" fill="#16a34a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">{ui('لا توجد بيانات')}</p>
          )}
        </div>
      </div>

      {(data?.ratioAnalysis ?? []).length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-4 font-semibold">{ui('مؤشرات الأداء')}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.ratioAnalysis ?? []).map((r) => (
              <div key={r.label} className="rounded-lg bg-muted/50 p-4 text-center">
                <p className="text-sm text-muted-foreground">{r.label}</p>
                <p className="nums mt-1 text-2xl font-bold">{toArabicDigits(r.value.toFixed(2))}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}
    </FinancePageShell>
  );
}
