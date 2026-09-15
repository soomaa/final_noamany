import { useQuery } from '@tanstack/react-query';
import { BookOpen, Calculator, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { StatCard } from '@/components/common/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { ACCOUNTING_ROUTES } from '@/lib/accounting-routes';
import type { AccountingDashboard } from '@/types/accounting';
import { ErrorState } from '@/components/common/states';
import { useLocale } from '@/store/locale';
import { AccountingPageShell } from './accounting-shell';

function monthStart() {
  const d = new Date();
  return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function AccountingDashboardBody() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['accounting', 'dashboard', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<AccountingDashboard>('/accounting/dashboard', {
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
    <div className="space-y-6">
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={ui('إجمالي القيود المرحّلة')}
          value={isLoading ? '…' : toArabicDigits(String(data?.journalEntries.total ?? 0))}
          icon={<BookOpen className="h-5 w-5" />}
          to={`${ACCOUNTING_ROUTES.ledger.journalEntries}?status=posted`}
        />
        <StatCard
          title={ui('قيود اليوم')}
          value={isLoading ? '…' : toArabicDigits(String(data?.journalEntries.daily ?? 0))}
          icon={<Calculator className="h-5 w-5" />}
          to={`${ACCOUNTING_ROUTES.ledger.journalEntries}?dateFrom=${localToday()}&dateTo=${localToday()}`}
        />
        <StatCard
          title={ui('إجمالي الأصول')}
          value={isLoading ? '…' : toArabicDigits((data?.totalAssets ?? 0).toFixed(2))}
          icon={<Scale className="h-5 w-5" />}
          to={ACCOUNTING_ROUTES.statements.balanceSheet}
        />
        <StatCard
          title={ui('صافي الربح')}
          value={isLoading ? '…' : toArabicDigits((data?.netProfit ?? 0).toFixed(2))}
          icon={(data?.netProfit ?? 0) >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          to={ACCOUNTING_ROUTES.statements.incomeStatement}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title={ui('الإيرادات')}
          value={toArabicDigits((data?.revenue ?? 0).toFixed(2))}
          icon={<TrendingUp className="h-5 w-5" />}
          to={ACCOUNTING_ROUTES.statements.incomeStatement}
        />
        <StatCard
          title={ui('المصروفات')}
          value={toArabicDigits((data?.expenses ?? 0).toFixed(2))}
          icon={<TrendingDown className="h-5 w-5" />}
          to={ACCOUNTING_ROUTES.statements.incomeStatement}
        />
        <StatCard
          title={ui('عدد الحسابات')}
          value={toArabicDigits(String(data?.accountCount ?? 0))}
          icon={<BookOpen className="h-5 w-5" />}
          to={ACCOUNTING_ROUTES.ledger.chartOfAccounts}
        />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3 font-medium">{ui('آخر القيود')}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th className="p-3 text-start">{ui('رقم القيد')}</th>
                <th className="p-3 text-start">{ui('التاريخ')}</th>
                <th className="p-3 text-start">{ui('الوصف')}</th>
                <th className="p-3 text-start">{ui('الحالة')}</th>
                <th className="p-3 text-start">{ui('مدين')}</th>
                <th className="p-3 text-start">{ui('دائن')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentEntries ?? []).map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="p-3 nums">{e.entryNo}</td>
                  <td className="p-3 nums">{e.date}</td>
                  <td className="p-3">{e.description ?? '—'}</td>
                  <td className="p-3">{e.status}</td>
                  <td className="p-3 nums">{toArabicDigits(e.totalDebit.toFixed(2))}</td>
                  <td className="p-3 nums">{toArabicDigits(e.totalCredit.toFixed(2))}</td>
                </tr>
              ))}
              {!isLoading && (data?.recentEntries?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    {ui('لا توجد قيود — ابدأ بتهيئة دليل الحسابات من صفحة الحسابات')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

export function AccountingDashboardPage() {
  const { ui } = useLocale();
  return (
    <AccountingPageShell title={ui('لوحة تحكم المحاسبة')} description={ui('نظرة عامة على القيود والأرصدة والربحية من دفتر الأستاذ')}>
      <AccountingDashboardBody />
    </AccountingPageShell>
  );
}
