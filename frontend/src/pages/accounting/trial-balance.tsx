import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, RefreshCw, Scale, XCircle } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatMoney, localToday } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import { AccountingPageShell } from './accounting-shell';
import { monthStart, ReportFilters, useAccountingCurrency } from './report-shared';

interface TrialBalanceRow {
  accountId: number;
  code: string;
  name: string;
  accountType: string;
  debit: number;
  credit: number;
  balance: number;
}

interface TrialBalanceResponse {
  rows: TrialBalanceRow[];
  summary: {
    totalDebit: number;
    totalCredit: number;
    difference: number;
    isBalanced: boolean;
  };
}

export function TrialBalancePage() {
  const { ui } = useLocale();
  const currency = useAccountingCurrency();
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, refetch, isLoading, isFetching, isError } = useQuery({
    queryKey: ['accounting', 'trial-balance', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<TrialBalanceResponse>('/accounting/trial-balance', {
        params: {
          dateFrom: startDate,
          dateTo: endDate,
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return d;
    },
  });

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  return (
    <AccountingPageShell
      title={ui('ميزان المراجعة')}
      description={ui('عرض أرصدة جميع الحسابات وتوازنها')}
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
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                {ui('ميزان المراجعة')}
              </span>
              {summary && (
                <div className="flex items-center gap-2 text-sm">
                  {summary.isBalanced ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-success" />
                      <span className="font-medium text-success">{ui('متوازن')}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-destructive" />
                      <span className="font-medium text-destructive">{ui('غير متوازن')}</span>
                    </>
                  )}
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-muted-foreground">
                    <th className="p-3 text-start font-semibold">{ui('رمز الحساب')}</th>
                    <th className="p-3 text-start font-semibold">{ui('اسم الحساب')}</th>
                    <th className="p-3 text-start font-semibold">{ui('مدين')}</th>
                    <th className="p-3 text-start font-semibold">{ui('دائن')}</th>
                    <th className="p-3 text-start font-semibold">{ui('الرصيد')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={5} className="p-10 text-center">
                        <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
                      </td>
                    </tr>
                  )}
                  {!isLoading &&
                    rows.map((row) => (
                      <tr key={row.accountId} className="border-b hover:bg-muted/30">
                        <td className="nums p-3 font-medium">{row.code}</td>
                        <td className="p-3">{row.name}</td>
                        <td className="nums p-3">
                          {row.debit > 0 ? (
                            <span className="font-semibold">{formatMoney(row.debit, currency)}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="nums p-3">
                          {row.credit > 0 ? (
                            <span className="font-semibold">{formatMoney(row.credit, currency)}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="nums p-3">{formatMoney(row.balance, currency)}</td>
                      </tr>
                    ))}
                  {!isLoading && rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        {ui('لا توجد حركات — قم بترحيل قيود أولاً')}
                      </td>
                    </tr>
                  )}
                </tbody>
                {summary && rows.length > 0 && (
                  <tfoot className="bg-muted/40">
                    <tr className="border-t-2 font-bold">
                      <td colSpan={2} className="p-3">
                        {ui('الإجمالي')}
                      </td>
                      <td className="nums p-3 text-base">{formatMoney(summary.totalDebit, currency)}</td>
                      <td className="nums p-3 text-base">{formatMoney(summary.totalCredit, currency)}</td>
                      <td className="p-3" />
                    </tr>
                    {!summary.isBalanced && (
                      <tr className="bg-destructive/5">
                        <td colSpan={2} className="p-2 font-semibold text-destructive">
                          {ui('الفرق')}
                        </td>
                        <td colSpan={3} className="nums p-2 font-bold text-destructive">
                          {formatMoney(summary.difference, currency)}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </AccountingPageShell>
  );
}

export { ReportFilters } from './report-shared';
