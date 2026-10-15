import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { AccountNode } from '@/types/accounting';
import { ErrorState } from '@/components/common/states';
import { useLocale } from '@/store/locale';
import { AccountingPageShell } from './accounting-shell';
import { ReportFilters } from './trial-balance';

function monthStart() {
  const d = new Date();
  return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function AccountStatementPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');
  const [accountId, setAccountId] = useState('');
  const [includeChildren, setIncludeChildren] = useState(false);

  const { data: tree } = useQuery({
    queryKey: ['accounting', 'accounts', 'tree'],
    queryFn: async () => {
      const { data: d } = await api.get<AccountNode[]>('/accounting/accounts/tree');
      return d;
    },
  });

  const { data, refetch, isLoading, isFetching, isError } = useQuery({
    queryKey: ['accounting', 'account-statement', accountId, startDate, endDate, branchId, includeChildren],
    enabled: !!accountId,
    queryFn: async () => {
      const { data: d } = await api.get<{
        account: { code: string; name: string };
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
      }>('/accounting/account-statement', {
        params: {
          accountId,
          dateFrom: startDate,
          dateTo: endDate,
          includeChildren,
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return d;
    },
  });

  const flat = flattenAll(tree ?? []);

  return (
    <AccountingPageShell title={ui('كشف حساب')} description={ui('كشف حساب تفصيلي مع الرصيد الافتتاحي والختامي')}>
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid min-w-[220px] gap-1">
            <label className="text-xs">{ui('الحساب')}</label>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">{ui('اختر حساب')}</option>
              {flat.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeChildren} onChange={(e) => setIncludeChildren(e.target.checked)} />
            {ui('يشمل الحسابات الفرعية')}
          </label>
        </div>
        <ReportFilters
          startDate={startDate}
          endDate={endDate}
          branchId={branchId}
          onStart={setStartDate}
          onEnd={setEndDate}
          onBranch={setBranchId}
          onSearch={() => void refetch()}
        />
      </div>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
      <>
      {data && (
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <strong>{data.account.name}</strong>
            <span className="ms-2 nums text-muted-foreground">({data.account.code})</span>
            <div className="mt-1 text-sm text-muted-foreground">
              {ui('افتتاحي')}: {toArabicDigits(data.openingBalance.toFixed(2))} · {ui('ختامي')}:{' '}
              {toArabicDigits(data.closingBalance.toFixed(2))}
            </div>
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
              {data.movements.map((m, i) => (
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
      )}
      {!accountId && <p className="text-muted-foreground">{ui('اختر حساباً لعرض الكشف')}</p>}
      {accountId && isLoading && isFetching && <p>{ui('جاري التحميل…')}</p>}
      </>
      )}
    </AccountingPageShell>
  );
}

function flattenAll(nodes: AccountNode[]): AccountNode[] {
  const out: AccountNode[] = [];
  const walk = (list: AccountNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
