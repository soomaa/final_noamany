import { useClubT } from '@/hooks/use-club-t';
import { cn } from '@/lib/utils';

export type ClubPaymentMethod =
  | 'cash'
  | 'card'
  | 'visa'
  | 'instapay'
  | 'wallet'
  | 'bank'
  | 'transfer'
  | 'online';

export const CLUB_PAYMENT_METHODS: ClubPaymentMethod[] = [
  'cash',
  'visa',
  'instapay',
  'wallet',
  'bank',
  'transfer',
  'card',
  'online',
];

/** One tender line of a receipt, as returned by the club receipts API. */
export interface ClubReceiptPaymentLine {
  method: string;
  amount: number;
}

export function clubPaymentMethodLabel(
  ct: (key: string) => string,
  method: string | null | undefined,
): string {
  if (!method) return '—';
  return CLUB_PAYMENT_METHODS.includes(method as ClubPaymentMethod)
    ? ct(`payments.${method}`)
    : method;
}

/**
 * Label for a receipt's methods: a split receipt reads "نقدي + تحويل بنكي".
 * Falls back to the header method for receipts issued before splits were stored.
 */
export function clubPaymentMethodsLabel(
  ct: (key: string) => string,
  payments: ClubReceiptPaymentLine[] | null | undefined,
  fallbackMethod?: string | null,
): string {
  if (!payments || payments.length === 0) return clubPaymentMethodLabel(ct, fallbackMethod);
  return payments.map((p) => clubPaymentMethodLabel(ct, p.method)).join(' + ');
}

export function ClubPaymentMethodSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: ClubPaymentMethod) => void;
  className?: string;
}) {
  const ct = useClubT();
  return (
    <select
      className={cn(
        'flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      value={value}
      onChange={(event) => onChange(event.target.value as ClubPaymentMethod)}
    >
      {CLUB_PAYMENT_METHODS.map((method) => (
        <option key={method} value={method}>{ct(`payments.${method}`)}</option>
      ))}
    </select>
  );
}
