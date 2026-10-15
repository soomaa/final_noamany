import { memo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Boxes, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatNum, formatTimeFromDate } from '@/lib/formatters';
import { normalizeStockUnit, stockUnitLabel } from '@/lib/stock-taking-units';
import { useCurrentShiftSession } from '@/hooks/use-shift-session';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';

interface StockWatchItem {
  productId: number;
  name: string;
  code: string;
  unit: string;
  balanceNow: number;
  balanceAtShiftStart: number;
  soldThisShift: number;
  returnedThisShift: number;
  otherThisShift: number;
  recent: Array<{ at: string; label: string; quantity: number; ref: string | null }>;
}
interface StockWatchResponse {
  configured: boolean;
  since: string;
  shift: { id: number; startedAt: string } | null;
  items: StockWatchItem[];
}

const PREF_KEY = 'pos-stock-watch-open';
const readOpen = () => { try { return localStorage.getItem(PREF_KEY) !== '0'; } catch { return true; } };
const saveOpen = (open: boolean) => { try { localStorage.setItem(PREF_KEY, open ? '1' : '0'); } catch { /* storage blocked */ } };
const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNum(n)}`;

/**
 * Small always-visible strip on the POS: for the chosen stock items, what the system held when the
 * open shift started, what the shift sold / returned / changed otherwise, and the balance now.
 * The cashier compares "دلوقتي" with the shelf at any time and at every handover.
 */
export const PosStockWatch = memo(function PosStockWatch({ branchId }: { branchId: string }) {
  const { ui } = useLocale();
  const [open, setOpen] = useState(readOpen);
  const [detailId, setDetailId] = useState<number | null>(null);
  // Keyed on the open shift and the signed-in cashier (the same query the shift switcher polls):
  // starting a shift, a handover or closing the day reloads the strip for the new shift at once.
  const userId = useAuth((state) => state.user?.sub ?? 0);
  const { data: currentShift } = useCurrentShiftSession(Number(branchId) || undefined);
  const query = useQuery({
    queryKey: ['pos-stock-watch', branchId, currentShift?.id ?? 0, userId],
    queryFn: async () => (await api.get<StockWatchResponse>('/pos/stock-watch', { params: { branchId } })).data,
    enabled: Boolean(branchId),
    staleTime: 0,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  if (!branchId || query.isError) return null;
  const toggle = () => { setOpen((v) => { saveOpen(!v); return !v; }); };
  const detail = data?.items.find((i) => i.productId === detailId) ?? null;

  return (
    <section className="mb-4 rounded-2xl border bg-card p-3 shadow-sm" aria-label={ui('متابعة المخزون في الوردية')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 pt-2">
          <p className="flex items-center gap-2 whitespace-nowrap text-sm font-bold">
            <Boxes className="size-4 text-primary" aria-hidden="true" />
            {ui('متابعة المخزون في الوردية')}
          </p>
          {data ? (
            <p className="nums text-xs text-muted-foreground">
              {data.shift ? `${ui('من أول الوردية')} ${formatTimeFromDate(data.shift.startedAt)}` : ui('من أول اليوم (مفيش وردية مفتوحة)')}
              {!data.configured && data.items.length ? ` · ${ui('الأصناف الأكتر بيعًا — تقدر تختارها من إعدادات نقطة البيع')}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button permissionAction={null} type="button" variant="ghost" size="icon" className="size-9" aria-label={ui('تحديث')} onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button permissionAction={null} type="button" variant="ghost" size="icon" className="size-9" aria-label={ui(open ? 'إخفاء' : 'إظهار')} aria-expanded={open} onClick={toggle}>
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </div>
      </div>
      {open && data ? (
        data.items.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{ui('اختار الأصناف اللي عايز تتابعها من إعدادات نقطة البيع.')}</p>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-4">
              {data.items.map((item) => (
                <button
                  key={item.productId}
                  type="button"
                  onClick={() => setDetailId(detailId === item.productId ? null : item.productId)}
                  aria-expanded={detailId === item.productId}
                  className={`rounded-xl border p-2.5 text-start transition hover:bg-muted/50 ${detailId === item.productId ? 'border-primary bg-primary/5' : ''}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold">{item.name}</span>
                    <span className="nums shrink-0 text-lg font-black text-primary">
                      {formatNum(item.balanceNow)}
                      {normalizeStockUnit(item.unit) !== 'piece' ? <span className="ms-1 text-[11px] font-semibold text-muted-foreground">{stockUnitLabel(item.unit)}</span> : null}
                    </span>
                  </div>
                  <p className="nums mt-1 text-[11px] leading-5 text-muted-foreground">
                    {ui('أول الوردية')} {formatNum(item.balanceAtShiftStart)} · {ui('اتباع')} {formatNum(item.soldThisShift)}
                    {item.returnedThisShift ? ` · ${ui('رجع')} ${formatNum(item.returnedThisShift)}` : ''}
                    {item.otherThisShift ? <> · {ui('حركات تانية')} <bdi dir="ltr">{signed(item.otherThisShift)}</bdi></> : null}
                  </p>
                </button>
              ))}
            </div>
            {detail ? (
              <div className="mt-2 rounded-xl border bg-muted/30 p-2.5 text-xs">
                <p className="mb-1 font-bold">{ui('آخر حركات')}: {detail.name}</p>
                {detail.recent.length === 0 ? <p className="text-muted-foreground">{ui('مفيش حركات في الوردية دي لسه.')}</p> : (
                  <ul className="space-y-0.5">
                    {detail.recent.map((m, i) => (
                      <li key={i} className="nums flex flex-wrap justify-between gap-2">
                        <span>{formatTimeFromDate(m.at)} · {ui(m.label)}{m.ref ? ` · ${m.ref}` : ''}</span>
                        <bdi dir="ltr" className={m.quantity < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}>{signed(m.quantity)}</bdi>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </>
        )
      ) : null}
    </section>
  );
});
