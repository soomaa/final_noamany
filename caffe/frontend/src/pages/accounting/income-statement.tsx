import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { ErrorState } from '@/components/common/states';
import { AccountingPageShell } from './accounting-shell';
import { ReportFilters } from './trial-balance';
import { StatementSection } from './report-shared';

function monthStart() {
  const d = new Date();
  return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function IncomeStatementPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, isError, refetch } = useQuery({
    queryKey: ['accounting', 'income-statement', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<{
        revenue: { total: number; items: Array<{ name: string; amount: number }> };
        expenses: { total: number; items: Array<{ name: string; amount: number }> };
        netIncome: number;
      }>('/accounting/income-statement', {
        params: {
          dateFrom: startDate,
          dateTo: endDate,
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return d;
    },
  });

  return (
    <AccountingPageShell title={ui('قائمة الدخل')} description={ui('الإيرادات والمصروفات من دفتر الأستاذ فقط')}>
      <ReportFilters
        startDate={startDate}
        endDate={endDate}
        branchId={branchId}
        onStart={setStartDate}
        onEnd={setEndDate}
        onBranch={setBranchId}
        onSearch={() => void refetch()}
      />
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <StatementSection title={ui('الإيرادات')} total={data?.revenue.total ?? 0} items={data?.revenue.items ?? []} />
            <StatementSection title={ui('المصروفات')} total={data?.expenses.total ?? 0} items={data?.expenses.items ?? []} />
          </div>
          <div className="rounded-xl border bg-card p-4 text-lg font-semibold">
            {ui('صافي الدخل')}: {toArabicDigits((data?.netIncome ?? 0).toFixed(2))}
          </div>
        </>
      )}
    </AccountingPageShell>
  );
}
