import { formatDisplayNumber } from '@/lib/number-display';
import { BadgePercent, Banknote, CircleOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useClubT } from '@/hooks/use-club-t';
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
  showSummary = true,
  disabled = false,
  onChange,
}: {
  grossValue: number;
  codes: ClubDiscountCode[];
  mode: SubscriptionDiscountMode;
  codeId: string;
  fixedValue: string;
  showSummary?: boolean;
  disabled?: boolean;
  onChange: (next: {
    mode: SubscriptionDiscountMode;
    codeId: string;
    fixedValue: string;
  }) => void;
}) {
  const ct = useClubT();
  const discount = calculateSubscriptionDiscount(grossValue, mode, codes, codeId, fixedValue);
  const activeCodes = codes.filter((item) => item.isActive);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={ct('subscriptions.discountMode')}>
        {([
          { value: 'none', label: ct('subscriptions.noDiscount'), icon: CircleOff },
          { value: 'code', label: ct('subscriptions.discountCode'), icon: BadgePercent },
          { value: 'fixed', label: ct('subscriptions.fixedDiscount'), icon: Banknote },
        ] as const).map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={mode === item.value}
              variant={mode === item.value ? 'brand' : 'outline'}
              className="justify-start"
              disabled={disabled}
              onClick={() => onChange({ mode: item.value, codeId, fixedValue })}
            >
              <Icon className="size-4" /> {item.label}
            </Button>
          );
        })}
      </div>

      {mode === 'code' ? (
        <div className="grid gap-2">
          <Label htmlFor="subscription-discount-code">{ct('subscriptions.chooseDiscountCode')}</Label>
          <select
            id="subscription-discount-code"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={codeId}
            disabled={disabled}
            onChange={(event) => onChange({ mode, codeId: event.target.value, fixedValue })}
          >
            <option value="">—</option>
            {activeCodes.map((code) => (
              <option key={code.id} value={code.id}>
                {code.code} — {formatDisplayNumber(code.percentage)}%
              </option>
            ))}
          </select>
          {!activeCodes.length ? (
            <p className="text-xs text-muted-foreground">{ct('subscriptions.noActiveDiscountCodes')}</p>
          ) : null}
        </div>
      ) : null}

      {mode === 'fixed' ? (
        <div className="grid gap-2">
          <Label htmlFor="subscription-fixed-discount">{ct('subscriptions.fixedDiscountAmount')}</Label>
          <Input
            id="subscription-fixed-discount"
            className="nums"
            type="number"
            min={0}
            max={grossValue || undefined}
            step="0.01"
            value={fixedValue}
            disabled={disabled}
            onChange={(event) => onChange({ mode, codeId, fixedValue: event.target.value })}
          />
        </div>
      ) : null}

      {showSummary ? <div className={cn('rounded-xl border p-3 text-sm', discount > 0 && 'border-primary/25 bg-primary/5')}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">{ct('subscriptions.calculatedDiscount')}</span>
          <b className="nums">{formatMoney(discount)}</b>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 border-t pt-2">
          <span className="text-muted-foreground">{ct('subscriptions.netSubscription')}</span>
          <b className="nums">{formatMoney(Math.max(0, grossValue - discount))}</b>
        </div>
      </div> : null}
    </div>
  );
}
