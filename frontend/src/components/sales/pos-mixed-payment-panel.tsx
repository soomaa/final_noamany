import { CreditCard, Landmark, Plus, Trash2, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fillPaymentRemainder, paymentRemainingCents } from '@/lib/pos-payment-allocation';
import { toArabicDigits } from '@/lib/utils';

export interface PosPaymentCatalogOption {
  id: number;
  name: string;
  code: string;
  method: 'cash' | 'card' | 'wallet' | 'transfer';
  supportsMixedPayment: boolean;
  requiresReference: boolean;
  isEnabled: boolean;
}

export interface PosPaymentAllocation {
  key: string;
  paymentMethodId: number;
  amount: string;
  reference: string;
}

const iconFor = (method: PosPaymentCatalogOption['method']) => {
  if (method === 'cash') return WalletCards;
  if (method === 'transfer') return Landmark;
  return CreditCard;
};

export function newPaymentAllocation(paymentMethodId: number): PosPaymentAllocation {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    paymentMethodId,
    amount: '',
    reference: '',
  };
}

export function PosMixedPaymentPanel({
  methods,
  rows,
  total,
  currency,
  ui,
  onChange,
}: {
  methods: PosPaymentCatalogOption[];
  rows: PosPaymentAllocation[];
  total: number;
  currency: string;
  ui: (text: string) => string;
  onChange: (rows: PosPaymentAllocation[]) => void;
}) {
  const remainingCents = paymentRemainingCents(total, rows);
  const available = methods.filter(
    (method) => method.supportsMixedPayment && !rows.some((row) => row.paymentMethodId === method.id),
  );

  const update = (index: number, patch: Partial<PosPaymentAllocation>) => {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  };

  return (
    <section className="space-y-2 rounded-xl border border-primary/20 bg-primary/[0.035] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-black">{ui('طرق الدفع المضافة')}</h4>
          <p className="text-[10px] text-muted-foreground">{ui('اختر الوسيلة واكتب المبلغ لكل واحدة')}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${remainingCents === 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'}`}>
          {remainingCents === 0
            ? ui('مكتمل')
            : `${ui('المتبقي')} ${toArabicDigits((remainingCents / 100).toFixed(2))} ${currency}`}
        </span>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => {
          const method = methods.find((item) => item.id === row.paymentMethodId) ?? methods[0];
          const MethodIcon = iconFor(method?.method ?? 'card');
          return (
            <div key={row.key} className="rounded-xl border bg-background p-2 shadow-sm">
              <div className="grid items-end gap-2 sm:grid-cols-[minmax(130px,1fr)_110px_auto]">
                <div>
                  <Label className="sr-only">{ui('وسيلة الدفع')}</Label>
                  <div className="relative">
                    <MethodIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <select
                      className="h-9 w-full rounded-lg border bg-background pe-3 ps-9 text-xs font-semibold"
                      aria-label={ui('وسيلة الدفع')}
                      value={row.paymentMethodId}
                      onChange={(event) => update(index, { paymentMethodId: Number(event.target.value), reference: '' })}
                    >
                      {methods
                        .filter((option) => option.id === row.paymentMethodId || !rows.some((item) => item.paymentMethodId === option.id))
                        .map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="sr-only">{ui('المبلغ')}</Label>
                  <Input
                    className="nums h-9 font-black"
                    aria-label={ui('المبلغ')}
                    inputMode="decimal"
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.amount}
                    onChange={(event) => update(index, { amount: event.target.value })}
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    permissionAction={null}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-2 text-[11px]"
                    onClick={() => onChange(fillPaymentRemainder(total, rows, index))}
                  >
                    {ui('ضع المتبقي')}
                  </Button>
                  {rows.length > 2 ? (
                    <Button
                      permissionAction={null}
                      type="button"
                      variant="ghost"
                      size="icon"
                    className="size-9 text-destructive"
                      aria-label={ui('حذف وسيلة الدفع')}
                      onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
              {method?.requiresReference ? (
                <div className="mt-2">
                  <Label className="text-[10px]">{ui('رقم المرجع')}</Label>
                  <Input
                    className="nums mt-1 h-9"
                    aria-label={ui('رقم المرجع')}
                    value={row.reference}
                    onChange={(event) => update(index, { reference: event.target.value })}
                    placeholder={ui('مثال: رقم عملية التحويل أو إيصال الماكينة')}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {available.length ? (
        <Button
          permissionAction={null}
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-full border-dashed"
          onClick={() => onChange([...rows, newPaymentAllocation(available[0].id)])}
        >
          <Plus className="size-4" />
          {ui('إضافة طريقة دفع')}
        </Button>
      ) : null}
    </section>
  );
}
