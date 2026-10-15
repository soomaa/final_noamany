import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  Loader2,
  Package,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import { AccountingPageShell } from './accounting-shell';
import {
  monthStart,
  ReportFilters,
  StatementGroup,
  StatementSubtotal,
  StatementTotal,
  useAccountingCurrency,
  type StatementItem,
} from './report-shared';

interface IncomeStatementResponse {
  revenue: { total: number; items: StatementItem[] };
  costOfGoodsSold: { total: number; items: StatementItem[] };
  grossProfit: number;
  expenses: { total: number; items: StatementItem[] };
  netIncome: number;
}

export function IncomeStatementPage() {
  const { ui } = useLocale();
  const currency = useAccountingCurrency();
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['accounting', 'income-statement', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<IncomeStatementResponse>('/accounting/income-statement', {
        params: {
          dateFrom: startDate,
          dateTo: endDate,
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return d;
    },
  });

  const netIncome = data?.netIncome ?? 0;
  // A service-only club posts no cost of goods sold; hiding the cost line and the gross
  // profit rule there keeps the statement to the two blocks that actually have figures.
  const hasCostOfSales = (data?.costOfGoodsSold.items.length ?? 0) > 0;

  return (
    <AccountingPageShell
      title={ui('قائمة الدخل')}
      description={ui('عرض الإيرادات والمصروفات وصافي الربح')}
      actions={
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {ui('تحديث')}
        </Button>
      }
    >
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
        <Card>
          <CardHeader>
            <CardTitle>{ui('قائمة الدخل')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                <StatementGroup
                  size="lg"
                  title={ui('الإيرادات')}
                  icon={TrendingUp}
                  iconClassName="text-success"
                  tone="success"
                  items={data?.revenue.items ?? []}
                  total={data?.revenue.total ?? 0}
                  totalLabel={ui('إجمالي الإيرادات')}
                  emptyLabel={ui('لا توجد إيرادات في الفترة المحددة')}
                  currency={currency}
                />

                {hasCostOfSales && (
                  <>
                    <StatementGroup
                      size="lg"
                      title={ui('تكلفة البضاعة المباعة')}
                      icon={Package}
                      iconClassName="text-warning"
                      tone="warning"
                      items={data?.costOfGoodsSold.items ?? []}
                      total={data?.costOfGoodsSold.total ?? 0}
                      totalLabel={ui('إجمالي تكلفة البضاعة المباعة')}
                      emptyLabel={ui('لا توجد تكلفة بضاعة مباعة في الفترة المحددة')}
                      currency={currency}
                    />
                    <StatementSubtotal
                      label={ui('مجمل الربح')}
                      amount={data?.grossProfit ?? 0}
                      currency={currency}
                      tone={(data?.grossProfit ?? 0) >= 0 ? 'success' : 'destructive'}
                    />
                  </>
                )}

                <StatementGroup
                  size="lg"
                  title={ui('المصروفات التشغيلية')}
                  icon={TrendingDown}
                  iconClassName="text-destructive"
                  tone="destructive"
                  items={data?.expenses.items ?? []}
                  total={data?.expenses.total ?? 0}
                  totalLabel={ui('إجمالي المصروفات التشغيلية')}
                  emptyLabel={ui('لا توجد مصروفات في الفترة المحددة')}
                  currency={currency}
                />

                <StatementTotal
                  label={ui('صافي الدخل')}
                  icon={DollarSign}
                  amount={netIncome}
                  currency={currency}
                  tone={netIncome >= 0 ? 'success' : 'destructive'}
                  boxTone="primary"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </AccountingPageShell>
  );
}
