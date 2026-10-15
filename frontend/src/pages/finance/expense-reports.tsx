import { formatMoneyNumber } from '@/lib/formatters';
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
import type { ExpenseReportData, ExpenseCategory } from '@/types/finance';
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
  const [businessUnit, setBusinessUnit] = useState('gym');
  const [category, setCategory] = useState('all');
  const { data: categories = [] } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => (await api.get<ExpenseCategory[]>('/expense-categories')).data,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance', 'expense-reports', startDate, endDate, branchId, businessUnit, category],
    queryFn: async () => {
      const { data: d } = await api.get<ExpenseReportData>('/finance/expense-reports', {
        params: {
          startDate,
          endDate,
          businessUnit, category,
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return d;
    },
  });

  return (
    <FinancePageShell title={ui('تقارير المصروفات')} description={ui('المصروفات حسب الأنواع المُدارة والفترة، وتشمل المعلق والمعتمد وتستبعد المرفوض.')}>
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div className="grid gap-1">
          <Label htmlFor="report-business-unit">{ui('المصروفات')}</Label>
          <select id="report-business-unit" className="h-10 rounded-md border bg-background px-3 text-sm" value={businessUnit} onChange={(event) => setBusinessUnit(event.target.value)}>
            <option value="gym">{ui('مصروفات الجيم')}</option>
            <option value="cafe">{ui('مصروفات الكافيه')}</option>
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="report-expense-category">{ui('نوع المصروف')}</Label>
          <select id="report-expense-category" className="h-10 rounded-md border bg-background px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">{ui('كل الأنواع')}</option>
            {categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="expense-report-from" className="text-xs">{ui('من تاريخ')}</Label>
          <Input id="expense-report-from" className="nums" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="expense-report-to" className="text-xs">{ui('إلى تاريخ')}</Label>
          <Input id="expense-report-to" className="nums" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="expense-report-branch" className="text-xs">{ui('الفرع')}</Label>
          <select
            id="expense-report-branch"
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
          value={isLoading ? '…' : formatMoneyNumber((data?.totalAmount ?? 0))}
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
          title={ui('المتبقي')}
          value={isLoading ? '…' : formatMoneyNumber(data?.remainingAmount ?? 0)}
          colorIndex={2}
          loading={isLoading}
        />
      </div>
      <p className="text-sm text-muted-foreground">{ui('المدفوع')}: <span className="nums font-semibold">{formatMoneyNumber(data?.paidAmount ?? 0)}</span></p>
      {(data?.paymentsNeedingReview ?? 0) > 0 && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {ui('في مصروفات قديمة حالتها جزئي لكن المدفوع مش محفوظ. راجع المدفوع من تعديل المصروف؛ إجماليات المدفوع والمتبقي غير مكتملة لحين المراجعة.')}
        </p>
      )}

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
                    <span className="nums font-bold">{formatMoneyNumber(cat.total)}</span>
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
                <Tooltip formatter={(v: number) => formatMoneyNumber(v)} />
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
