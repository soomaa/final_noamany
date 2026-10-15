import { DialogFormSummary } from '@/components/common/dialog-form-layout';
import { useClubT } from '@/hooks/use-club-t';
import { toArabicDigits } from '@/lib/utils';
import {
  clubPaymentMethodsLabel,
  type ClubReceiptPaymentLine,
} from './club-payment-method-select';

export interface SubscriptionPaymentReceiptRow {
  id: number;
  receiptNumber: string;
  amount: number;
  receiptDate: string;
  /** Dominant method; `payments` carries the full split when the collection mixed methods. */
  paymentMethod?: string | null;
  payments?: ClubReceiptPaymentLine[];
}

export function subscriptionNetValue(sub: {
  subscriptionValue: number;
  discountEnabled: boolean;
  discountValue: number;
}) {
  const value = sub.subscriptionValue ?? 0;
  const discount = sub.discountEnabled ? sub.discountValue ?? 0 : 0;
  return Math.max(0, value - discount);
}

export function SubscriptionPaymentPanel({
  value,
  paid,
  remaining,
  receipts,
  loading,
}: {
  value: number;
  paid: number;
  remaining: number;
  receipts: SubscriptionPaymentReceiptRow[];
  loading?: boolean;
}) {
  const ct = useClubT();

  return (
    <div className="space-y-4">
      <DialogFormSummary
        items={[
          { label: ct('subscriptions.value'), value: toArabicDigits(value) },
          { label: ct('subscriptions.paid'), value: toArabicDigits(paid), accent: 'success' },
          { label: ct('subscriptions.remaining'), value: toArabicDigits(remaining), accent: 'warning' },
        ]}
      />
      <div>
        <h4 className="mb-2 text-sm font-semibold">{ct('subscriptions.paymentHistory')}</h4>
        {loading ? (
          <p className="text-sm text-muted-foreground">{ct('common.loading')}</p>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ct('subscriptions.noPaymentHistory')}</p>
        ) : (
          <div className="max-h-48 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b">
                  <th className="p-2 text-start">{ct('subscriptions.receiptNumber')}</th>
                  <th className="p-2 text-start">{ct('common.amount')}</th>
                  <th className="p-2 text-start">{ct('subscriptions.receiptDate')}</th>
                  <th className="p-2 text-start">{ct('subscriptions.paymentMethod')}</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-2 nums">{r.receiptNumber}</td>
                    <td className="p-2 nums">{toArabicDigits(r.amount)}</td>
                    <td className="p-2 nums">{toArabicDigits(r.receiptDate)}</td>
                    <td className="p-2">{clubPaymentMethodsLabel(ct, r.payments, r.paymentMethod)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
