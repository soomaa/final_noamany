import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useState } from 'react';
import { StatCard } from '@/components/common/stat-card';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { ExpenseReportData } from '@/types/finance';
import { useLocale } from '@/store/locale';
import { FinancePageShell } from './finance-shell';

function yearStart() {
  return localDateStr(new Date(new Date().getFullYear(), 0, 1));
}

export function FinanceExpenseReportsPage() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance', 'expense-reports', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<ExpenseReportData>('/finance/expense-reports', {
        params: {
          startDate,
          endDate,
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return d;
    },
  });

  return (
    <FinancePageShell title={ui('تقارير المصروفات')} description={ui('تحليل المصروفات حسب الفئة والفترة')}>
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
          title={ui('إجمالي المصروفات')}
          value={isLoading ? '…' : toArabicDigits((data?.totalAmount ?? 0).toFixed(2))}
          colorIndex={4}
          loading={isLoading}
        />
        <StatCard
          title={ui('عدد المصروفات')}
          value={isLoading ? '…' : toArabicDigits(data?.totalExpenses ?? 0)}
          colorIndex={0}
          loading={isLoading}
        />
        <StatCard
          title={ui('فئات مختلفة')}
          value={isLoading ? '…' : toArabicDigits(data?.expensesByCategory?.length ?? 0)}
          colorIndex={2}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-4 font-semibold">{ui('المصروفات حسب الفئة')}</h3>
          {(data?.expensesByCategory ?? []).length > 0 ? (
            <div className="space-y-2">
              {(data?.expensesByCategory ?? []).map((cat) => (
                <div key={cat.category} className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
                  <span>{cat.category}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{toArabicDigits(cat.count)}</span>
                    <span className="nums font-bold">{toArabicDigits(cat.total.toFixed(2))}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{ui('لا توجد بيانات')}</p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-4 font-semibold">{ui('المصروفات الشهرية')}</h3>
          {(data?.monthlyExpenses ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.monthlyExpenses ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => toArabicDigits(v)} />
                <Tooltip formatter={(v: number) => toArabicDigits(v.toFixed(2))} />
                <Bar dataKey="total" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">{ui('لا توجد بيانات')}</p>
          )}
        </div>
      </div>
      </>
      )}
    </FinancePageShell>
  );
}
