import { useQuery } from '@tanstack/react-query';
import { Calculator, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/common/states';
import { DateRangeFilter } from '@/components/reports/date-range-filter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { financeQueryDates, normalizeProfitLoss } from '@/lib/finance-api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { FinancePageShell } from './finance-shell';

function yearStart() {
  return localDateStr(new Date(new Date().getFullYear(), 0, 1));
}

export function FinanceProfitLossPage() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance', 'profit-loss', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<Record<string, unknown>>('/finance/profit-loss', {
        params: {
          ...financeQueryDates(startDate, endDate),
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return normalizeProfitLoss(d);
    },
  });

  const netProfit = data?.netProfit ?? (data?.revenue?.total ?? 0) - (data?.expenses?.total ?? 0);
  const profitMargin = data?.profitMargin ?? 0;

  return (
    <FinancePageShell title={ui('الأرباح والخسائر')} description={ui('قائمة الأرباح والخسائر للفترة المحددة')}>
      <div className="rounded-xl border bg-card p-4">
        <DateRangeFilter
          showPresets
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          extra={
            <>
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
            </>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-6 w-6" />
            {ui('قائمة الأرباح والخسائر')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading && <p className="text-sm text-muted-foreground">{ui('جاري التحميل…')}</p>}

          {!isLoading && isError && <ErrorState inline onRetry={() => void refetch()} />}

          {!isLoading && !isError && data && (
            <>
              <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950/30">
                <div className="mb-3 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <span className="font-semibold">{ui('الإيرادات')}</span>
                </div>
                <ul className="space-y-2 text-sm">
                  {(data.revenue?.items ?? []).map((item) => (
                    <li key={item.label} className="flex justify-between">
                      <span>{item.label}</span>
                      <span className="nums font-medium text-green-600">{toArabicDigits(item.amount.toFixed(2))}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t pt-3 font-bold">
                  <span>{ui('إجمالي الإيرادات')}</span>
                  <span className="nums text-green-600">{toArabicDigits((data.revenue?.total ?? 0).toFixed(2))}</span>
                </div>
              </div>

              <div className="rounded-lg bg-red-50 p-4 dark:bg-red-950/30">
                <div className="mb-3 flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  <span className="font-semibold">{ui('المصروفات')}</span>
                </div>
                <ul className="space-y-2 text-sm">
                  {(data.expenses?.items ?? []).map((item) => (
                    <li key={item.label} className="flex justify-between">
                      <span>{item.label}</span>
                      <span className="nums font-medium text-red-600">({toArabicDigits(item.amount.toFixed(2))})</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t pt-3 font-bold">
                  <span>{ui('إجمالي المصروفات')}</span>
                  <span className="nums text-red-600">({toArabicDigits((data.expenses?.total ?? 0).toFixed(2))})</span>
                </div>
              </div>

              <div
                className={`rounded-lg p-6 ${netProfit >= 0 ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-orange-50 dark:bg-orange-950/30'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xl font-bold">{ui('صافي الربح/الخسارة')}</span>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {ui('هامش الربح')}: {toArabicDigits(profitMargin.toFixed(2))}%
                    </p>
                  </div>
                  <span className={`nums text-4xl font-bold ${netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                    {toArabicDigits(netProfit.toFixed(2))}
                  </span>
                </div>
              </div>
            </>
          )}

          {!isLoading && !isError && !data && (
            <p className="text-center text-sm text-muted-foreground">{ui('لا توجد بيانات')}</p>
          )}
        </CardContent>
      </Card>
    </FinancePageShell>
  );
}
