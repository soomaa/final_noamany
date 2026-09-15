import { BadgePercent, Banknote, CircleOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { ClubDiscountCode } from '@/types/club';

export type SubscriptionDiscountMode = 'none' | 'code' | 'fixed';

export function calculateSubscriptionDiscount(
  grossValue: number,
  mode: SubscriptionDiscountMode,
  codes: ClubDiscountCode[],
  codeId: string,
  fixedValue: string,
): number {
  const gross = Math.max(0, Number(grossValue) || 0);
  if (mode === 'code') {
    const code = codes.find((item) => item.id === Number(codeId));
    return Math.min(gross, Math.round((gross * (code?.percentage ?? 0)) / 100 * 100) / 100);
  }
  if (mode === 'fixed') {
    return Math.min(gross, Math.max(0, Number(fixedValue) || 0));
  }
  return 0;
}

export function SubscriptionDiscountFields({
  grossValue,
  codes,
  mode,
  codeId,
  fixedValue,
  onChange,
}: {
  grossValue: number;
  codes: ClubDiscountCode[];
  mode: SubscriptionDiscountMode;
  codeId: string;
  fixedValue: string;
  onChange: (next: {
    mode: SubscriptionDiscountMode;
    codeId: string;
    fixedValue: string;
  }) => void;
}) {
  const discount = calculateSubscriptionDiscount(grossValue, mode, codes, codeId, fixedValue);
  const activeCodes = codes.filter((item) => item.isActive);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {([
          { value: 'none', label: 'بدون خصم', icon: CircleOff },
          { value: 'code', label: 'كود خصم', icon: BadgePercent },
          { value: 'fixed', label: 'قيمة بالجنيه', icon: Banknote },
        ] as const).map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.value}
              type="button"
              variant={mode === item.value ? 'brand' : 'outline'}
              className="justify-start"
              onClick={() => onChange({ mode: item.value, codeId, fixedValue })}
            >
              <Icon className="size-4" /> {item.label}
            </Button>
          );
        })}
      </div>

      {mode === 'code' ? (
        <div className="grid gap-2">
          <Label htmlFor="subscription-discount-code">اختر كود الخصم</Label>
          <select
            id="subscription-discount-code"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={codeId}
            onChange={(event) => onChange({ mode, codeId: event.target.value, fixedValue })}
          >
            <option value="">—</option>
            {activeCodes.map((code) => (
              <option key={code.id} value={code.id}>
                {code.code} — {code.percentage}%
              </option>
            ))}
          </select>
          {!activeCodes.length ? (
            <p className="text-xs text-muted-foreground">لا توجد أكواد خصم فعّالة.</p>
          ) : null}
        </div>
      ) : null}

      {mode === 'fixed' ? (
        <div className="grid gap-2">
          <Label htmlFor="subscription-fixed-discount">قيمة الخصم بالجنيه</Label>
          <Input
            id="subscription-fixed-discount"
            className="nums"
            type="number"
            min={0}
            max={grossValue || undefined}
            step="0.01"
            value={fixedValue}
            onChange={(event) => onChange({ mode, codeId, fixedValue: event.target.value })}
          />
        </div>
      ) : null}

      <div className={cn('rounded-xl border p-3 text-sm', discount > 0 && 'border-primary/25 bg-primary/5')}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">قيمة الخصم المحسوبة</span>
          <b className="nums">{formatMoney(discount)}</b>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 border-t pt-2">
          <span className="text-muted-foreground">صافي الاشتراك</span>
          <b className="nums">{formatMoney(Math.max(0, grossValue - discount))}</b>
        </div>
      </div>
    </div>
  );
}

