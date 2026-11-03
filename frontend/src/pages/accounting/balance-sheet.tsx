import { useQuery } from '@tanstack/react-query';
import { Building2, Loader2, RefreshCw, Users, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { formatMoney, localToday } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import { AccountingPageShell } from './accounting-shell';
import {
  StatementGroup,
  StatementTotal,
  useAccountingCurrency,
  type StatementItem,
} from './report-shared';

interface BalanceSheetResponse {
  assets: { total: number; items: StatementItem[] };
  liabilities: { total: number; items: StatementItem[] };
  equity: { total: number; items: StatementItem[] };
  netIncomeToDate: number;
  totalAssets: number;
  totalLiabilitiesEquity: number;
  isBalanced: boolean;
}

/**
 * Non-current asset and liability roots in the seeded chart of accounts
 * (`1.02` fixed assets, `1.03` intangibles, `2.02` long-term liabilities).
 * Splitting on the account code is exact, unlike guessing from the account name.
 */
const NON_CURRENT_ASSET_PREFIXES = ['1.02', '1.03'];
const NON_CURRENT_LIABILITY_PREFIXES = ['2.02'];

function splitByCode(items: StatementItem[], prefixes: string[]) {
  const nonCurrent: StatementItem[] = [];
  const current: StatementItem[] = [];
  for (const item of items) {
    const code = item.code ?? '';
    if (prefixes.some((prefix) => code.startsWith(prefix))) nonCurrent.push(item);
    else current.push(item);
  }
  return { nonCurrent, current };
}

function sum(items: StatementItem[]): number {
  return Math.round(items.reduce((total, item) => total + item.amount, 0) * 100) / 100;
}

export function BalanceSheetPage() {
  const { ui } = useLocale();
  const currency = useAccountingCurrency();
  const { data: branches } = useBranches();
  const [asOfDate, setAsOfDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['accounting', 'balance-sheet', asOfDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<BalanceSheetResponse>('/accounting/balance-sheet', {
        params: {
          asOfDate,
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return d;
    },
  });

  const groups = useMemo(() => {
    const assets = splitByCode(data?.assets.items ?? [], NON_CURRENT_ASSET_PREFIXES);
    const liabilities = splitByCode(
      data?.liabilities.items ?? [],
      NON_CURRENT_LIABILITY_PREFIXES,
    );
    return {
      fixedAssets: assets.nonCurrent,
      currentAssets: assets.current,
      longTermLiabilities: liabilities.nonCurrent,
      shortTermLiabilities: liabilities.current,
    };
  }, [data]);

  const totalAssets = data?.totalAssets ?? 0;
  const totalLiabilities = data?.liabilities.total ?? 0;
  const totalLiabilitiesEquity = data?.totalLiabilitiesEquity ?? 0;
  const difference = Math.round((totalAssets - totalLiabilitiesEquity) * 100) / 100;

  return (
    <AccountingPageShell
      title={ui('الميزانية العمومية')}
      description={ui('عرض الأصول والخصوم وحقوق الملكية')}
      actions={
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {ui('تحديث')}
        </Button>
      }
    >
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div className="grid gap-1">
          <Label className="text-xs">{ui('تاريخ التقرير')}</Label>
          <Input
            className="nums"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
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
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-success" />
                {ui('الأصول')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <StatementGroup
                  title={ui('الأصول الثابتة')}
                  items={groups.fixedAssets}
                  total={sum(groups.fixedAssets)}
                  totalLabel={ui('إجمالي الأصول الثابتة')}
                  emptyLabel={ui('لا توجد أصول ثابتة')}
                  currency={currency}
                />
                <StatementGroup
                  title={ui('الأصول المتداولة')}
                  items={groups.currentAssets}
                  total={sum(groups.currentAssets)}
                  totalLabel={ui('إجمالي الأصول المتداولة')}
                  emptyLabel={ui('لا توجد أصول متداولة')}
                  currency={currency}
                />
                <StatementTotal
                  label={ui('إجمالي الأصول')}
                  amount={totalAssets}
                  currency={currency}
                  tone="success"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-destructive" />
                {ui('الخصوم وحقوق الملكية')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <StatementGroup
                  title={ui('الخصوم قصيرة الأجل')}
                  items={groups.shortTermLiabilities}
                  total={sum(groups.shortTermLiabilities)}
                  totalLabel={ui('إجمالي الخصوم قصيرة الأجل')}
                  emptyLabel={ui('لا توجد خصوم قصيرة الأجل')}
                  currency={currency}
                />
                <StatementGroup
                  title={ui('الخصوم طويلة الأجل')}
                  items={groups.longTermLiabilities}
                  total={sum(groups.longTermLiabilities)}
                  totalLabel={ui('إجمالي الخصوم طويلة الأجل')}
                  emptyLabel={ui('لا توجد خصوم طويلة الأجل')}
                  currency={currency}
                />

                <div className="flex items-center justify-between gap-3 border-y-2 py-2 font-bold">
                  <span>{ui('إجمالي الخصوم')}</span>
                  <span className="nums">{formatMoney(totalLiabilities, currency)}</span>
                </div>

                <StatementGroup
                  title={ui('حقوق الملكية')}
                  icon={Users}
                  iconClassName="text-primary"
                  items={data?.equity.items ?? []}
                  total={data?.equity.total ?? 0}
                  totalLabel={ui('إجمالي حقوق الملكية')}
                  emptyLabel={ui('لا توجد حقوق ملكية')}
                  currency={currency}
                />

                <StatementTotal
                  label={ui('إجمالي الخصوم وحقوق الملكية')}
                  amount={totalLiabilitiesEquity}
                  currency={currency}
                  tone="primary"
                  note={
                    data?.isBalanced
                      ? `✓ ${ui('متوازنة')}`
                      : `${ui('الفرق')}: ${formatMoney(difference, currency)}`
                  }
                  noteTone={data?.isBalanced ? 'success' : 'destructive'}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AccountingPageShell>
  );
}
