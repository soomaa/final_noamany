import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { ErrorState } from '@/components/common/states';
import { StatementSection } from './report-shared';
import { AccountingPageShell } from './accounting-shell';

export function BalanceSheetPage() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const [asOfDate, setAsOfDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, isError, refetch } = useQuery({
    queryKey: ['accounting', 'balance-sheet', asOfDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<{
        assets: { total: number; items: Array<{ name: string; amount: number }> };
        liabilities: { total: number; items: Array<{ name: string; amount: number }> };
        equity: { total: number; items: Array<{ name: string; amount: number }> };
        totalAssets: number;
        totalLiabilitiesEquity: number;
        isBalanced: boolean;
      }>('/accounting/balance-sheet', {
        params: {
          asOfDate,
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return d;
    },
  });

  return (
    <AccountingPageShell title={ui('الميزانية العمومية')} description={ui('الأصول = الخصوم + حقوق الملكية')}>
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div className="grid gap-1">
          <Label className="text-xs">{ui('حتى تاريخ')}</Label>
          <Input className="nums" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
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
          <div className="grid gap-6 md:grid-cols-3">
            <StatementSection title={ui('الأصول')} total={data?.assets.total ?? 0} items={data?.assets.items ?? []} />
            <StatementSection title={ui('الخصوم')} total={data?.liabilities.total ?? 0} items={data?.liabilities.items ?? []} />
            <StatementSection title={ui('حقوق الملكية')} total={data?.equity.total ?? 0} items={data?.equity.items ?? []} />
          </div>
          <div className="rounded-xl border bg-card p-4 text-sm">
            {ui('إجمالي الأصول')}: {toArabicDigits((data?.totalAssets ?? 0).toFixed(2))} ·{' '}
            {ui('الخصوم + حقوق الملكية')}: {toArabicDigits((data?.totalLiabilitiesEquity ?? 0).toFixed(2))}{' '}
            {data?.isBalanced ? '✓' : '⚠'}
          </div>
        </>
      )}
    </AccountingPageShell>
  );
}
