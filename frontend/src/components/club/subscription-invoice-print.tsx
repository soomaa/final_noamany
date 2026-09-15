import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toArabicDigits } from '@/lib/utils';
import { useClubT } from '@/hooks/use-club-t';
import type { ClubSubscriptionListItem } from '@/types/club';
import {
  clubPaymentMethodLabel,
  clubPaymentMethodsLabel,
  type ClubReceiptPaymentLine,
} from './club-payment-method-select';
import type { SubscriptionPaymentReceiptRow } from './subscription-payment-panel';

/**
 * Every method money actually came in through, across all of the subscription's receipts, merged
 * so the invoice reads "نقدي + تحويل بنكي" once instead of repeating a method per receipt.
 */
function collectTenderLines(
  receipts: SubscriptionPaymentReceiptRow[],
): ClubReceiptPaymentLine[] {
  const byMethod = new Map<string, number>();
  for (const receipt of receipts) {
    const lines =
      receipt.payments && receipt.payments.length > 0
        ? receipt.payments
        : receipt.paymentMethod
          ? [{ method: receipt.paymentMethod, amount: receipt.amount }]
          : [];
    for (const line of lines) {
      byMethod.set(line.method, Math.round(((byMethod.get(line.method) ?? 0) + line.amount) * 100) / 100);
    }
  }
  return [...byMethod].map(([method, amount]) => ({ method, amount }));
}

export function SubscriptionInvoicePrint({
  open,
  onOpenChange,
  subscription,
  receipts = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: ClubSubscriptionListItem | null;
  /** The subscription's receipts, used to print the real tender breakdown. */
  receipts?: SubscriptionPaymentReceiptRow[];
}) {
  const ct = useClubT();
  const printRef = useRef<HTMLDivElement>(null);

  const print = () => {
    if (!printRef.current || !subscription) return;
    const w = window.open('', '_blank', 'width=480,height=720');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><title>${subscription.subscriptionNumber}</title>
      <style>body{font-family:system-ui;padding:20px;font-size:14px}.nums{font-variant-numeric:tabular-nums}
      .header{text-align:center;margin-bottom:16px;border-bottom:2px solid #111;padding-bottom:12px}
      table{width:100%;margin:12px 0}td{padding:6px 0;border-bottom:1px solid #eee}.total{font-size:18px;font-weight:bold}</style>
      </head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  if (!subscription) return null;

  const net = subscription.subscriptionValue - (subscription.discountEnabled ? subscription.discountValue : 0);
  const tenderLines = collectTenderLines(receipts);
  const splitTender = tenderLines.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{ct('subscriptions.invoiceTitle')}</DialogTitle>
        </DialogHeader>
        <div ref={printRef} className="space-y-3 text-sm">
          <div className="header text-center">
            <p className="text-xl font-bold">Noamany</p>
            <p className="text-muted-foreground">{ct('subscriptions.invoiceSubtitle')}</p>
            <p className="nums mt-2 font-semibold">{toArabicDigits(subscription.subscriptionNumber)}</p>
          </div>
          <table>
            <tbody>
              <tr><td>{ct('subscriptions.customerName')}</td><td className="text-end">{subscription.customerName ?? '—'}</td></tr>
              <tr><td>{ct('subscriptions.subscriptionType')}</td><td className="text-end">{subscription.subscriptionType ?? '—'}</td></tr>
              <tr><td>{ct('subscriptions.startDate')}</td><td className="nums text-end">{toArabicDigits(subscription.subscriptionStartDate)}</td></tr>
              <tr><td>{ct('subscriptions.endDate')}</td><td className="nums text-end">{toArabicDigits(subscription.subscriptionEndDate)}</td></tr>
              <tr><td>{ct('subscriptions.registrationDate')}</td><td className="nums text-end">{toArabicDigits(subscription.registrationDate)}</td></tr>
              <tr><td>{ct('subscriptions.subscriptionValue')}</td><td className="nums text-end">{toArabicDigits(subscription.subscriptionValue.toFixed(2))}</td></tr>
              {subscription.discountEnabled ? (
                <tr><td>{ct('subscriptions.discount')}</td><td className="nums text-end">-{toArabicDigits(subscription.discountValue.toFixed(2))}</td></tr>
              ) : null}
              <tr><td>{ct('subscriptions.netValue')}</td><td className="nums text-end">{toArabicDigits(net.toFixed(2))}</td></tr>
              <tr><td>{ct('subscriptions.paidAmount')}</td><td className="nums text-end">{toArabicDigits(subscription.paidAmount.toFixed(2))}</td></tr>
              <tr><td>{ct('subscriptions.remainingAmount')}</td><td className="nums text-end">{toArabicDigits(subscription.remainingAmount.toFixed(2))}</td></tr>
              {tenderLines.length > 0 || subscription.paymentMethod ? (
                <tr>
                  <td>{ct('subscriptions.paymentMethod')}</td>
                  <td className="text-end">
                    {clubPaymentMethodsLabel(ct, tenderLines, subscription.paymentMethod)}
                  </td>
                </tr>
              ) : null}
              {/* Split collection: itemize so the customer can see how much went on each method. */}
              {splitTender
                ? tenderLines.map((line) => (
                    <tr key={line.method}>
                      <td className="ps-4 text-muted-foreground">
                        {clubPaymentMethodLabel(ct, line.method)}
                      </td>
                      <td className="nums text-end">{toArabicDigits(line.amount.toFixed(2))}</td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
          <p className="text-center text-xs text-muted-foreground">{ct('subscriptions.invoiceFooter')}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{ct('common.cancel')}</Button>
          <Button onClick={print}>{ct('common.print')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
