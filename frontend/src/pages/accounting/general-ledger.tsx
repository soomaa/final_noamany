import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { ErrorState } from '@/components/common/states';
import { useLocale } from '@/store/locale';
import { AccountingPageShell } from './accounting-shell';
import { ReportFilters } from './trial-balance';

function monthStart() {
  const d = new Date();
  return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function GeneralLedgerPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, refetch, isLoading, isError } = useQuery({
    queryKey: ['accounting', 'general-ledger', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<{
        sections: Array<{
          code: string;
          name: string;
          openingBalance: number;
          closingBalance: number;
          movements: Array<{
            date: string;
            entryNo: string;
            description: string | null;
            debit: number;
            credit: number;
            balance: number;
          }>;
        }>;
      }>('/accounting/general-ledger', {
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
    <AccountingPageShell title={ui('دفتر الأستاذ العام')} description={ui('حركات الحسابات مع الرصيد الجاري — محسوب من الخادم')}>
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
      <div className="space-y-6">
        {(data?.sections ?? []).map((sec) => (
          <div key={sec.code} className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3 font-medium">
              <span className="nums">{sec.code}</span> — {sec.name}
              <span className="ms-3 text-sm text-muted-foreground">
                {ui('افتتاحي')}: {toArabicDigits(sec.openingBalance.toFixed(2))} · {ui('ختامي')}:{' '}
                {toArabicDigits(sec.closingBalance.toFixed(2))}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="p-2 text-start">{ui('التاريخ')}</th>
                  <th className="p-2 text-start">{ui('القيد')}</th>
                  <th className="p-2 text-start">{ui('الوصف')}</th>
                  <th className="p-2 text-start">{ui('مدين')}</th>
                  <th className="p-2 text-start">{ui('دائن')}</th>
                  <th className="p-2 text-start">{ui('الرصيد')}</th>
                </tr>
              </thead>
              <tbody>
                {sec.movements.map((m, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 nums">{m.date}</td>
                    <td className="p-2 nums">{m.entryNo}</td>
                    <td className="p-2">{m.description ?? '—'}</td>
                    <td className="p-2 nums">{toArabicDigits(m.debit.toFixed(2))}</td>
                    <td className="p-2 nums">{toArabicDigits(m.credit.toFixed(2))}</td>
                    <td className="p-2 nums">{toArabicDigits(m.balance.toFixed(2))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {!isLoading && (data?.sections?.length ?? 0) === 0 && (
          <p className="text-center text-muted-foreground">{ui('لا توجد حركات في الفترة المحددة')}</p>
        )}
      </div>
      )}
    </AccountingPageShell>
  );
}
