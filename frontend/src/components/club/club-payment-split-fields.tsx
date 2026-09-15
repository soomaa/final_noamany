import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClubT } from '@/hooks/use-club-t';
import { cn, toArabicDigits } from '@/lib/utils';
import {
  CLUB_PAYMENT_METHODS,
  ClubPaymentMethod,
  ClubPaymentMethodSelect,
} from './club-payment-method-select';

/** A tender row while the user is editing it — `amount` stays a string so the input stays controlled. */
export interface ClubPaymentSplitRow {
  method: ClubPaymentMethod;
  amount: string;
}

export function singlePaymentRow(
  method: ClubPaymentMethod = 'cash',
  amount: string | number = '',
): ClubPaymentSplitRow[] {
  return [{ method, amount: String(amount) }];
}

export function splitRowsTotal(rows: ClubPaymentSplitRow[]): number {
  return Math.round(rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) * 100) / 100;
}

/** First method not used yet, so adding a row doesn't duplicate one the user already picked. */
function nextUnusedMethod(rows: ClubPaymentSplitRow[]): ClubPaymentMethod {
  const used = new Set(rows.map((r) => r.method));
  return CLUB_PAYMENT_METHODS.find((m) => !used.has(m)) ?? 'cash';
}

export interface ClubPaymentSplitPayload {
  paymentMethod: ClubPaymentMethod;
  payments?: { method: ClubPaymentMethod; amount: number }[];
}

type ClubTranslate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Turn the edited rows into a request body, or return an error message to show the user.
 *
 * A single row needs no `payments` — the backend puts the whole collected amount on that method.
 * A split must add up to `total` exactly; the backend rejects a mismatch too, but catching it here
 * avoids a round trip and names the numbers the user has to reconcile.
 */
export function buildClubPaymentSplit(
  rows: ClubPaymentSplitRow[],
  total: number,
  ct: ClubTranslate,
): { payload: ClubPaymentSplitPayload } | { error: string } {
  const first = rows[0]?.method ?? 'cash';
  if (rows.length <= 1) return { payload: { paymentMethod: first } };

  const payments = rows
    .map((r) => ({ method: r.method, amount: Math.round((Number(r.amount) || 0) * 100) / 100 }))
    .filter((p) => p.amount > 0);

  if (payments.length === 0) return { error: ct('subscriptions.splitEmpty') };

  const allocated = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const expected = Math.round(total * 100) / 100;
  if (allocated !== expected) {
    return {
      error: ct('subscriptions.splitMismatch', {
        allocated: toArabicDigits(allocated),
        total: toArabicDigits(expected),
      }),
    };
  }

  return { payload: { paymentMethod: payments[0].method, payments } };
}

interface ClubPaymentSplitFieldsProps {
  /** Maximum amount that can be collected; a newly-added method receives the unpaid remainder. */
  total: number;
  rows: ClubPaymentSplitRow[];
  onChange: (rows: ClubPaymentSplitRow[]) => void;
  /** Keeps the parent form's paid amount in sync with the payment rows. */
  onTotalChange?: (total: number) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Payment method picker that owns the collected amount and can split it across several methods
 * (e.g. 300 نقدي + 200 تحويل بنكي on the same receipt).
 *
 * The paid amount is entered once, beside its method. Adding another method fills that row with
 * the remainder automatically, while the parent receives the sum for its paid/remaining summary.
 */
export function ClubPaymentSplitFields({
  total,
  rows,
  onChange,
  onTotalChange,
  className,
  disabled,
}: ClubPaymentSplitFieldsProps) {
  const ct = useClubT();
  const split = rows.length > 1;
  const allocated = splitRowsTotal(rows);
  const unallocated = Math.round((total - allocated) * 100) / 100;

  const commit = (next: ClubPaymentSplitRow[]) => {
    onChange(next);
    onTotalChange?.(splitRowsTotal(next));
  };

  const setRow = (index: number, patch: Partial<ClubPaymentSplitRow>) => {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    commit(next);
  };

  const addRow = () => {
    const remaining = Math.round((total - splitRowsTotal(rows)) * 100) / 100;
    commit([
      ...rows,
      { method: nextUnusedMethod(rows), amount: remaining > 0 ? String(remaining) : '' },
    ]);
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    commit(next);
  };

  return (
    <div className={cn('space-y-2', className)}>
      {rows.map((row, index) => (
        <div key={index} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Label className="mb-1 block text-xs text-muted-foreground">
              {ct('subscriptions.paymentMethod')}
            </Label>
            <ClubPaymentMethodSelect
              value={row.method}
              onChange={(method) => setRow(index, { method })}
            />
          </div>
          <div className="w-32 shrink-0">
            <Label className="mb-1 block text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {ct('subscriptions.paid')}
            </Label>
            <Input
              className="nums h-11 border-emerald-500/45 bg-emerald-500/[0.07] text-center font-semibold text-emerald-800 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20 dark:text-emerald-200"
              type="number"
              min={0}
              max={total > 0 ? total : undefined}
              step="any"
              value={row.amount}
              disabled={disabled}
              onChange={(event) => setRow(index, { amount: event.target.value })}
            />
          </div>
          {split ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={ct('subscriptions.removePaymentMethod')}
              disabled={disabled}
              onClick={() => removeRow(index)}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || rows.length >= CLUB_PAYMENT_METHODS.length}
          onClick={addRow}
        >
          <Plus className="me-1 size-4" />
          {ct('subscriptions.addPaymentMethod')}
        </Button>
        {split ? (
          <span
            className={cn(
              'nums text-xs font-medium',
              unallocated === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
            )}
          >
            {unallocated === 0
              ? ct('subscriptions.splitBalanced')
              : unallocated > 0
                ? `${ct('subscriptions.splitUnallocated')}: ${toArabicDigits(unallocated)}`
                : `${ct('subscriptions.splitOverAllocated')}: ${toArabicDigits(Math.abs(unallocated))}`}
          </span>
        ) : null}
      </div>
    </div>
  );
}
