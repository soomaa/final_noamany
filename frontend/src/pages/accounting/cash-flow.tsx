import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { localDateStr, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { ErrorState } from '@/components/common/states';
import { AccountingPageShell } from './accounting-shell';
import { ReportFilters } from './trial-balance';

function monthStart() {
  const d = new Date();
  return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function CashFlowPage() {
  const { ui } = useLocale();
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(() => localToday());
  const [branchId, setBranchId] = useState('all');

  const { data, isError, refetch } = useQuery({
    queryKey: ['accounting', 'cash-flow', startDate, endDate, branchId],
    queryFn: async () => {
      const { data: d } = await api.get<{
        operating: { inflow: number; outflow: number; net: number };
        investing: { inflow: number; outflow: number; net: number };
        financing: { inflow: number; outflow: number; net: number };
        netChange: number;
      }>('/accounting/cash-flow', {
        params: {
          dateFrom: startDate,
          dateTo: endDate,
          ...(branchId !== 'all' ? { branchId } : {}),
        },
      });
      return d;
    },
  });

  const sections = [
    { key: 'operating', label: ui('التشغيل'), data: data?.operating },
    { key: 'investing', label: ui('الاستثمار'), data: data?.investing },
    { key: 'financing', label: ui('التمويل'), data: data?.financing },
  ] as const;

  return (
    <AccountingPageShell title={ui('التدفقات النقدية')} description={ui('حركة النقد من حسابات الخزينة والبنك')}>
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
          <div className="grid gap-4 md:grid-cols-3">
            {sections.map(({ key, label, data: sec }) => (
              <div key={key} className="rounded-xl border bg-card p-4">
                <h3 className="mb-3 font-medium">{label}</h3>
                <p className="text-sm">{ui('تدفق داخل')}: {toArabicDigits((sec?.inflow ?? 0).toFixed(2))}</p>
                <p className="text-sm">{ui('تدفق خارج')}: {toArabicDigits((sec?.outflow ?? 0).toFixed(2))}</p>
                <p className="mt-2 font-semibold">{ui('صافي')}: {toArabicDigits((sec?.net ?? 0).toFixed(2))}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border bg-card p-4 font-semibold">
            {ui('صافي التغير في النقد')}: {toArabicDigits((data?.netChange ?? 0).toFixed(2))}
          </div>
        </>
      )}
    </AccountingPageShell>
  );
}
