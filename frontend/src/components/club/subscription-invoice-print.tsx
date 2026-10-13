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
    const w = window.open('', '_blank', 'width=520,height=780');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head>
      <meta charset="UTF-8">
      <title>فاتورة اشتراك - ${subscription.subscriptionNumber}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
          padding: 28px 24px;
          font-size: 13px;
          color: #1a1a1a;
          background: #fff;
          direction: rtl;
        }
        .invoice-wrapper {
          max-width: 420px;
          margin: 0 auto;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #111 0%, #333 100%);
          color: #fff;
          text-align: center;
          padding: 20px 16px 16px;
        }
        .header .brand {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 1px;
          margin-bottom: 4px;
        }
        .header .subtitle {
          font-size: 11px;
          color: #ccc;
          margin-bottom: 10px;
        }
        .header .inv-num {
          display: inline-block;
          background: rgba(255,255,255,0.15);
          border: 1px solid rgba(255,255,255,0.3);
          border-radius: 20px;
          padding: 3px 14px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        .body { padding: 16px; }
        .section-title {
          font-size: 10px;
          font-weight: 700;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
          padding-bottom: 4px;
          border-bottom: 1px solid #f3f4f6;
        }
        .info-grid {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0;
          margin-bottom: 14px;
        }
        .info-grid .lbl {
          color: #6b7280;
          padding: 6px 0;
          border-bottom: 1px dashed #f3f4f6;
          font-size: 12px;
        }
        .info-grid .val {
          color: #111;
          padding: 6px 0 6px 8px;
          border-bottom: 1px dashed #f3f4f6;
          font-size: 12px;
          font-weight: 500;
          text-align: start;
        }
        .divider {
          border: none;
          border-top: 1px dashed #d1d5db;
          margin: 12px 0;
        }
        .totals-block {
          background: #f9fafb;
          border-radius: 8px;
          padding: 12px 14px;
          margin-bottom: 14px;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 5px 0;
          font-size: 12px;
          color: #374151;
          border-bottom: 1px solid #e5e7eb;
        }
        .totals-row:last-child { border-bottom: none; }
        .totals-row.highlight {
          font-weight: 700;
          font-size: 14px;
          color: #111;
          padding-top: 10px;
          margin-top: 4px;
        }
        .totals-row.discount { color: #dc2626; }
        .totals-row.remaining { color: #d97706; }
        .payment-badge {
          display: inline-block;
          background: #111;
          color: #fff;
          border-radius: 6px;
          padding: 2px 10px;
          font-size: 11px;
          font-weight: 600;
          margin-top: 2px;
        }
        .split-line {
          display: flex;
          justify-content: space-between;
          padding: 4px 0 4px 8px;
          font-size: 11px;
          color: #6b7280;
        }
        .footer-strip {
          background: #f3f4f6;
          text-align: center;
          padding: 12px;
          font-size: 11px;
          color: #6b7280;
          border-top: 1px solid #e5e7eb;
        }
        .nums { font-variant-numeric: tabular-nums; }
        @media print {
          body { padding: 0; }
          .invoice-wrapper { border: none; border-radius: 0; max-width: 100%; }
        }
      </style>
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
  const displayReceiptNumbers = receipts.length > 0
    ? [...new Set(receipts.map((r) => r.receiptNumber).filter(Boolean))].join(' / ')
    : (subscription.receiptNumber ?? '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{ct('subscriptions.invoiceTitle')}</DialogTitle>
        </DialogHeader>

        {/* ── printable area ── */}
        <div ref={printRef} dir="rtl">
          <div className="invoice-wrapper border border-border rounded-xl overflow-hidden text-sm">

            {/* Header */}
            <div className="header bg-gradient-to-br from-gray-900 to-gray-700 text-white text-center py-5 px-4">
              <p className="brand text-2xl font-black tracking-wide mb-1">Noamany</p>
              <p className="subtitle text-xs text-gray-300 mb-3">{ct('subscriptions.invoiceSubtitle')}</p>
              <span className="inv-num inline-block bg-white/15 border border-white/30 rounded-full px-4 py-0.5 text-xs font-semibold nums">
                {toArabicDigits(subscription.subscriptionNumber)}
              </span>
            </div>

            <div className="body p-4 space-y-3">

              {/* Member & Subscription info */}
              <p className="section-title text-[10px] font-bold text-muted-foreground uppercase tracking-wide border-b pb-1 mb-2">
                بيانات الاشتراك
              </p>
              <div className="info-grid grid grid-cols-[auto_1fr] text-xs">
                {displayReceiptNumbers ? (
                  <>
                    <span className="lbl text-muted-foreground py-1.5 border-b border-dashed">{ct('subscriptions.receiptNumber')}</span>
                    <span className="val font-semibold py-1.5 border-b border-dashed nums ps-2">{toArabicDigits(displayReceiptNumbers)}</span>
                  </>
                ) : null}
                <span className="lbl text-muted-foreground py-1.5 border-b border-dashed">{ct('subscriptions.customerName')}</span>
                <span className="val font-semibold py-1.5 border-b border-dashed ps-2">{subscription.customerName ?? '—'}</span>

                <span className="lbl text-muted-foreground py-1.5 border-b border-dashed">{ct('subscriptions.subscriptionType')}</span>
                <span className="val font-semibold py-1.5 border-b border-dashed ps-2">{subscription.subscriptionType ?? '—'}</span>

                <span className="lbl text-muted-foreground py-1.5 border-b border-dashed">{ct('subscriptions.startDate')}</span>
                <span className="val font-semibold py-1.5 border-b border-dashed ps-2 nums">{toArabicDigits(subscription.subscriptionStartDate)}</span>

                <span className="lbl text-muted-foreground py-1.5 border-b border-dashed">{ct('subscriptions.endDate')}</span>
                <span className="val font-semibold py-1.5 border-b border-dashed ps-2 nums">{toArabicDigits(subscription.subscriptionEndDate)}</span>

                <span className="lbl text-muted-foreground py-1.5">{ct('subscriptions.registrationDate')}</span>
                <span className="val font-semibold py-1.5 ps-2 nums">{toArabicDigits(subscription.registrationDate)}</span>
              </div>

              {/* Totals block */}
              <div className="totals-block bg-muted/40 rounded-lg p-3 space-y-1 text-xs">
                <div className="totals-row flex justify-between items-center py-1 border-b border-border">
                  <span className="text-muted-foreground">{ct('subscriptions.subscriptionValue')}</span>
                  <span className="nums font-medium">{toArabicDigits(subscription.subscriptionValue.toFixed(2))}</span>
                </div>
                {subscription.discountEnabled && (
                  <div className="totals-row flex justify-between items-center py-1 border-b border-border text-red-600">
                    <span>{ct('subscriptions.discount')}</span>
                    <span className="nums">-{toArabicDigits(subscription.discountValue.toFixed(2))}</span>
                  </div>
                )}
                <div className="totals-row flex justify-between items-center py-1.5 border-b border-border font-bold text-sm">
                  <span>{ct('subscriptions.netValue')}</span>
                  <span className="nums">{toArabicDigits(net.toFixed(2))}</span>
                </div>
                <div className="totals-row flex justify-between items-center py-1 border-b border-border">
                  <span className="text-muted-foreground">{ct('subscriptions.paidAmount')}</span>
                  <span className="nums font-medium">{toArabicDigits(subscription.paidAmount.toFixed(2))}</span>
                </div>
                <div className="totals-row flex justify-between items-center py-1 text-amber-600">
                  <span>{ct('subscriptions.remainingAmount')}</span>
                  <span className="nums font-semibold">{toArabicDigits(subscription.remainingAmount.toFixed(2))}</span>
                </div>
              </div>

              {/* Payment method */}
              {(tenderLines.length > 0 || subscription.paymentMethod) && (
                <div className="flex justify-between items-start text-xs">
                  <span className="text-muted-foreground pt-0.5">{ct('subscriptions.paymentMethod')}</span>
                  <div className="text-end space-y-0.5">
                    <span className="inline-block bg-foreground text-background rounded px-2.5 py-0.5 text-[11px] font-semibold">
                      {clubPaymentMethodsLabel(ct, tenderLines, subscription.paymentMethod)}
                    </span>
                    {splitTender && tenderLines.map((line) => (
                      <div key={line.method} className="flex justify-end gap-2 text-muted-foreground text-[11px]">
                        <span>{clubPaymentMethodLabel(ct, line.method)}</span>
                        <span className="nums">{toArabicDigits(line.amount.toFixed(2))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="footer-strip bg-muted/50 text-center py-3 text-xs text-muted-foreground border-t border-border">
              {ct('subscriptions.invoiceFooter')}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{ct('common.cancel')}</Button>
          <Button onClick={print}><span className="ms-1">🖨</span> {ct('common.print')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
