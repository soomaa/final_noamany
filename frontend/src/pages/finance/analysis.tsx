import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/common/states';
import type { PaginatedResponse } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { NamedEntity } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { FinancePageShell } from './finance-shell';

interface MonthlyAnalysis {
  subscriptions: number;
  lockers: number;
  cafeSales: number;
  subscriptionRefunds: number;
  cogs: number;
  expenses: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

function monthStart() {
  const today = new Date();
  return localDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
}

function csvValue(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function FinanceAnalysisPage() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');
  const [cafeCategoryId, setCafeCategoryId] = useState('all');
  const [gender, setGender] = useState('all');

  const { data: categories } = useQuery({
    queryKey: ['cafe-categories', 'monthly-analysis'],
    queryFn: async () => {
      // This is the same category resource used by /club/cafe/categories.
      const { data } = await api.get<PaginatedResponse<NamedEntity>>('/categories', {
        params: { page: 1, pageSize: 500, status: 'active' },
      });
      return data.data;
    },
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance', 'monthly-analysis', dateFrom, dateTo, branchId, cafeCategoryId, gender],
    queryFn: async () => {
      const { data: report } = await api.get<MonthlyAnalysis>('/finance/analysis', {
        params: {
          dateFrom,
          dateTo,
          ...(branchId !== 'all' ? { branchId } : {}),
          ...(cafeCategoryId !== 'all' ? { cafeCategoryId } : {}),
          ...(gender !== 'all' ? { gender } : {}),
        },
      });
      return report;
    },
  });

  const rows = [
    { label: ui('الاشتراكات'), revenue: data?.subscriptions ?? 0, expense: 0 },
    { label: ui('اللوكر'), revenue: data?.lockers ?? 0, expense: 0 },
    { label: ui('مبيعات الكافيه بعد الخصم'), revenue: data?.cafeSales ?? 0, expense: 0 },
    { label: ui('إجمالي الإيرادات'), revenue: data?.totalRevenue ?? 0, expense: 0, total: true },
    { label: ui('مرتجعات الاشتراكات'), revenue: 0, expense: data?.subscriptionRefunds ?? 0 },
    { label: ui('تكلفة مبيعات الكافيه'), revenue: 0, expense: data?.cogs ?? 0 },
    { label: ui('المصروفات'), revenue: 0, expense: data?.expenses ?? 0 },
    { label: ui('إجمالي المصروفات'), revenue: 0, expense: data?.totalExpenses ?? 0, total: true },
    { label: ui('صافي الربح / الخسارة'), revenue: data?.netProfit ?? 0, expense: 0, net: true },
  ];

  const exportCsv = () => {
    const contents = [
      [ui('البند'), ui('الإيراد'), ui('المصروف')].map(csvValue).join(','),
      ...rows.map((row) => [row.label, row.revenue.toFixed(2), row.expense.toFixed(2)].map(csvValue).join(',')),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${contents}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `monthly-analysis-${dateFrom}-${dateTo}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const value = (amount: number) => toArabicDigits(amount.toFixed(2));

  return (
    <FinancePageShell title={ui('تقرير التحليل الشهري')} description={ui('الإيرادات والمصروفات وصافي النتيجة وفق منطق التقرير القديم')}>
      <div className="print:hidden flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div className="grid gap-1"><Label className="text-xs">{ui('من تاريخ')}</Label><Input className="nums" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
        <div className="grid gap-1"><Label className="text-xs">{ui('إلى تاريخ')}</Label><Input className="nums" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
        <div className="grid gap-1"><Label className="text-xs">{ui('الفرع')}</Label><select className="rounded-md border bg-background px-3 py-2 text-sm" value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="all">{ui('كل الفروع')}</option>{(branches ?? []).map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}</select></div>
        <div className="grid gap-1"><Label className="text-xs">{ui('فئة الكافيه')}</Label><select className="rounded-md border bg-background px-3 py-2 text-sm" value={cafeCategoryId} onChange={(event) => setCafeCategoryId(event.target.value)}><option value="all">{ui('كل الفئات')}</option>{(categories ?? []).map((category) => <option key={category.id} value={String(category.id)}>{category.nameAr}</option>)}</select></div>
        <div className="grid gap-1"><Label className="text-xs">{ui('النوع')}</Label><select className="rounded-md border bg-background px-3 py-2 text-sm" value={gender} onChange={(event) => setGender(event.target.value)}><option value="all">{ui('الكل')}</option><option value="male">{ui('رجالي')}</option><option value="female">{ui('حريمي')}</option></select></div>
        <Button variant="brand" onClick={() => void refetch()}>{ui('عرض التقرير')}</Button>
        <Button variant="outline" disabled={!data} onClick={exportCsv}><Download className="ms-1 h-4 w-4" />{ui('تصدير CSV')}</Button>
        <Button variant="outline" disabled={!data} onClick={() => window.print()}><Printer className="ms-1 h-4 w-4" />{ui('طباعة')}</Button>
      </div>

      {isError ? <ErrorState onRetry={() => void refetch()} /> : (
        <section className="mt-6 rounded-xl border bg-card p-4" aria-busy={isLoading}>
          <div className="mb-4 flex items-baseline justify-between gap-4"><h2 className="font-semibold">{ui('نتيجة تقرير التحليل الشهري')}</h2><span className="nums text-xs text-muted-foreground">{dateFrom} — {dateTo}</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="bg-primary text-primary-foreground"><tr><th className="p-3 text-start">{ui('البند')}</th><th className="p-3 text-end">{ui('الإيرادات')}</th><th className="p-3 text-end">{ui('المصروفات')}</th></tr></thead><tbody>
            {rows.map((row) => <tr key={row.label} className={row.net ? 'bg-emerald-100 font-bold dark:bg-emerald-950' : row.total ? 'bg-muted font-semibold' : 'border-b'}><td className="p-3">{row.label}</td><td className="nums p-3 text-end">{isLoading ? '…' : value(row.revenue)}</td><td className="nums p-3 text-end">{row.net ? '—' : isLoading ? '…' : value(row.expense)}</td></tr>)}
          </tbody></table></div>
          <p className="mt-3 text-xs text-muted-foreground">{ui('مبيعات الكافيه تعرض صافي المبيعات بعد الخصم؛ تكلفة المبيعات تستند إلى آخر بند فاتورة شراء لنفس المنتج.')}</p>
        </section>
      )}
    </FinancePageShell>
  );
}
