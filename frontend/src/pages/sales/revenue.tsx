import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';

interface ShiftRevenue {
  shiftId: number;
  shiftName: string;
  totalRevenue: number;
  transactionCount: number;
  byPaymentMethod: Record<string, number>;
}

interface ShiftRevenueApiEntry {
  shift?: { id?: number; name?: string };
  summary?: { totalRevenue?: number; totalTransactions?: number };
  quickSales?: Array<{ totalAmount?: number; paymentMethod?: string }>;
  bookings?: Array<{ totalAmount?: number }>;
}

interface ShiftRevenueApiResponse {
  summary?: { totalRevenue?: number };
  shifts?: ShiftRevenueApiEntry[];
}

function paymentAmounts(entry: ShiftRevenueApiEntry): Record<string, number> {
  const amounts: Record<string, number> = {};
  for (const sale of entry.quickSales ?? []) {
    const method = sale.paymentMethod ?? 'other';
    amounts[method] = (amounts[method] ?? 0) + (sale.totalAmount ?? 0);
  }
  for (const booking of entry.bookings ?? []) {
    amounts.booking = (amounts.booking ?? 0) + (booking.totalAmount ?? 0);
  }
  return amounts;
}

function mapRevenueResponse(r: ShiftRevenueApiResponse): { grandTotal: number; shifts: ShiftRevenue[] } {
  return {
    grandTotal: r.summary?.totalRevenue ?? 0,
    shifts: (r.shifts ?? []).map((entry) => ({
      shiftId: entry.shift?.id ?? 0,
      shiftName: entry.shift?.name ?? '—',
      totalRevenue: entry.summary?.totalRevenue ?? 0,
      transactionCount: entry.summary?.totalTransactions ?? 0,
      byPaymentMethod: paymentAmounts(entry),
    })),
  };
}

export function SalesRevenuePage() {
  const { ui } = useLocale();
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(localToday());

  const effectiveBranch = branchId || String(branches?.[0]?.id ?? '');

  // Map raw payment-method enum codes from the API to translated labels.
  const paymentLabel = (code: string) => {
    const map: Record<string, string> = {
      cash: ui('نقدي'),
      card: ui('بطاقة'),
      wallet: ui('محفظة'),
      transfer: ui('تحويل'),
      booking: ui('حجز'),
      other: ui('أخرى'),
    };
    return map[code] ?? code;
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shifts', 'revenue', effectiveBranch, date],
    queryFn: async () => {
      const { data: r } = await api.get<ShiftRevenueApiResponse>('/shifts/revenue', {
        params: { branchId: effectiveBranch, date },
      });
      return mapRevenueResponse(r);
    },
    enabled: !!effectiveBranch,
  });

  return (
    <GymSalesPageShell section="sales" title={ui('تقرير إيراد الورديات')} description={ui('إيرادات المبيعات حسب الوردية وطريقة الدفع')}>
      <div className="mb-4 flex flex-wrap gap-4">
        <div>
          <Label className="text-xs">{ui('الفرع')}</Label>
          <select
            className="mt-1 block rounded-md border bg-background px-3 py-2 text-sm"
            value={effectiveBranch}
            onChange={(e) => setBranchId(e.target.value)}
          >
            {(branches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">{ui('التاريخ')}</Label>
          <Input className="mt-1 nums" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">{ui('إجمالي الإيراد')}</p>
          <p className="nums text-3xl font-bold text-primary">
            {isLoading ? '…' : toArabicDigits((data?.grandTotal ?? 0).toFixed(2))}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(data?.shifts ?? []).map((s) => (
          <div key={s.shiftId} className="rounded-xl border bg-card p-4">
            <div className="flex justify-between">
              <h3 className="font-semibold">{s.shiftName}</h3>
              <span className="nums font-bold text-primary">
                {toArabicDigits((s.totalRevenue ?? 0).toFixed(2))}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {ui('عدد العمليات')}: {toArabicDigits(s.transactionCount)}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {Object.entries(s.byPaymentMethod ?? {}).map(([method, amount]) => (
                <span key={method}>
                  {paymentLabel(method)}: <span className="nums font-medium">{toArabicDigits((amount ?? 0).toFixed(2))}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
        {!isLoading && !data?.shifts?.length && (
          <p className="text-sm text-muted-foreground">{ui('لا توجد بيانات لهذا التاريخ')}</p>
        )}
      </div>
    </GymSalesPageShell>
  );
}
