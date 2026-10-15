import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { ErrorState } from '@/components/common/states';
import { DatePresets } from '@/components/common/date-presets';
import { AccountingPageShell } from './accounting-shell';
import { uiStatic } from '@/lib/ui-static';

function monthStart() {
  const d = new Date();
  return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

function ReportFilters({
  startDate,
  endDate,
  branchId,
  onStart,
  onEnd,
  onBranch,
  onSearch,
}: {
  startDate: string;
  endDate: string;
  branchId: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  onBranch: (v: string) => void;
  onSearch: () => void;
}) {
  const { ui, locale } = useLocale();
  const { data: branches } = useBranches();
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <DatePresets
        locale={locale}
        activeStart={startDate}
        activeEnd={endDate}
        onSelect={(start, end) => {
          onStart(start);
          onEnd(end);
        }}
      />
      <div className="flex flex-wrap items-end gap-4">
      <div className="grid gap-1">
        <Label className="text-xs">{uiStatic('من تاريخ')}</Label>
        <Input className="nums" type="date" value={startDate} onChange={(e) => onStart(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">{uiStatic('إلى تاريخ')}</Label>
        <Input className="nums" type="date" value={endDate} onChange={(e) => onEnd(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">{uiStatic('الفرع')}</Label>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={branchId}
          onChange={(e) => onBranch(e.target.value)}
        >
          <option value="all">{uiStatic('كل الفروع')}</option>
          {(branches ?? []).map((b) => (
            <option key={b.id} value={String(b.id)}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <Button variant="brand" onClick={onSearch}>
        {uiStatic('بحث')}
      </Button>
      </div>
    </div>
  );
}

export function TrialBalancePage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, refetch, isLoading, isError } = useQuery({
    queryKey: ['accounting', 'trial-balance', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<{
        rows: Array<{ code: string; name: string; debit: number; credit: number; balance: number }>;
        summary: { totalDebit: number; totalCredit: number; isBalanced: boolean };
      }>('/accounting/trial-balance', {
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
    <AccountingPageShell title={ui('ميزان المراجعة')} description={ui('أرصدة الحسابات من القيود المرحّلة فقط')}>
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
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="p-3 text-start">{ui('الرمز')}</th>
              <th className="p-3 text-start">{ui('الحساب')}</th>
              <th className="p-3 text-start">{ui('مدين')}</th>
              <th className="p-3 text-start">{ui('دائن')}</th>
              <th className="p-3 text-start">{ui('الرصيد')}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r) => (
              <tr key={r.code} className="border-b">
                <td className="p-3 nums">{r.code}</td>
                <td className="p-3">{r.name}</td>
                <td className="p-3 nums">{toArabicDigits(r.debit.toFixed(2))}</td>
                <td className="p-3 nums">{toArabicDigits(r.credit.toFixed(2))}</td>
                <td className="p-3 nums">{toArabicDigits(r.balance.toFixed(2))}</td>
              </tr>
            ))}
            {!isLoading && (data?.rows?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {ui('لا توجد حركات — قم بترحيل قيود أولاً')}
                </td>
              </tr>
            )}
          </tbody>
          {data?.summary && (
            <tfoot>
              <tr className="bg-muted/30 font-medium">
                <td colSpan={2} className="p-3">
                  {ui('الإجمالي')} {data.summary.isBalanced ? '✓' : '⚠'}
                </td>
                <td className="p-3 nums">{toArabicDigits(data.summary.totalDebit.toFixed(2))}</td>
                <td className="p-3 nums">{toArabicDigits(data.summary.totalCredit.toFixed(2))}</td>
                <td className="p-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      )}
    </AccountingPageShell>
  );
}

export { ReportFilters };
