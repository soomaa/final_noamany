import { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

function receiptDate(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function invoiceDigits(value: unknown): string {
  return String(value ?? '—').replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
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
        body { font-family: Tahoma, Arial, sans-serif; padding: 0; font-size: 11px; color: #111; background: #fff; direction: rtl; }
        .invoice-wrapper {
          width: 76mm;
          max-width: 76mm;
          margin: 0 auto;
          border: 0;
          border-radius: 0;
        }
        .header {
          background: #fff;
          color: #111;
          text-align: center;
          padding: 1mm 0;
          border-bottom: 1px solid #111;
        }
        .header .brand { font-size: 16px; font-weight: 800; letter-spacing: .3px; margin-bottom: 1px; }
        .header .subtitle { font-size: 9px; color: #333; margin-bottom: 2px; }
        .logo-crop { width: 29mm; height: 11mm; overflow: hidden; position: relative; flex: 0 0 29mm; }
        .header .logo { width: 42mm; max-width: none; height: auto; object-fit: initial; display: block; position: absolute; top: -15mm; right: -6.5mm; margin: 0; }
        .header .inv-num {
          display: inline-block; border: 1px solid #111; border-radius: 0; padding: 1px 12px; font-size: 10px; font-weight: 700;
        }
        .receipt-number { text-align: center; font-size: 10px; font-weight: 700; margin: 1mm 0 2mm; }
        .logo-line { display: flex; align-items: center; justify-content: center; gap: 2mm; margin: 1mm 0 2mm; direction: rtl; }
        .club-mark { border: 1px solid #111; border-radius: 50%; width: 8mm; height: 8mm; flex: 0 0 8mm; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
        .receipt-heading { font-size: 10px; font-weight: 700; text-align: center; text-decoration: underline; margin-bottom: 1mm; }
        .body { padding: 1mm 1mm 0; }
        .section-title {
          font-size: 10px;
          font-weight: 700;
          color: #111; text-transform: none; letter-spacing: 0; margin: .5mm 0; padding-bottom: .5mm; border-bottom: 1px solid #111;
        }
        .info-grid {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0; margin-bottom: 2mm;
        }
        .info-grid .lbl {
          color: #333; padding: 1mm 0; border-bottom: 1px dashed #bbb; font-size: 9px;
        }
        .info-grid .val {
          color: #111; padding: 1mm 0 1mm 1mm; border-bottom: 1px dashed #bbb; font-size: 9px; font-weight: 700; text-align: start;
        }
        .divider {
          border: none;
          border-top: 1px dashed #d1d5db;
          margin: 12px 0;
        }
        .totals-block { background: #fff; border: 1px solid #ddd; border-radius: 0; padding: .5mm 2mm; margin: 1mm 0; }
        .totals-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1mm 0; font-size: 9px; color: #111; border-bottom: 1px dashed #bbb;
        }
        .totals-row:last-child { border-bottom: none; }
        .totals-row.highlight { font-weight: 700; font-size: 11px; color: #111; padding-top: 2mm; margin-top: 1mm; }
        .totals-row.discount { color: #dc2626; }
        .totals-row.remaining { color: #d97706; }
        .payment-badge { display: inline-block; color: #111; border: 1px solid #111; border-radius: 0; padding: 1px 6px; font-size: 10px; font-weight: 700; margin-top: 1px; }
        .split-line {
          display: flex;
          justify-content: space-between;
          padding: 1mm 0 1mm 2mm; font-size: 9px; color: #333;
        }
        .footer-strip {
          background: #fff;
          text-align: center;
          padding: 2mm 0; font-size: 9px; color: #111; border-top: 1px solid #111;
        }
        .staff-block { margin: 1.5mm 0; font-size: 9px; line-height: 1.7; }
        .staff-line { display: flex; justify-content: space-between; gap: 2mm; white-space: nowrap; }
        .qr-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2mm 5mm; justify-items: center; padding: 2mm 8mm 1mm; }
        .qr-grid svg { width: 15mm; height: 15mm; }
        .nums { font-variant-numeric: tabular-nums; }
        @media print {
          @page { size: 80mm auto; margin: 3mm; }
          body { width: 76mm; }
          .invoice-wrapper { width: 76mm; max-width: 76mm; }
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
  const printTime = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{ct('subscriptions.invoiceTitle')}</DialogTitle>
        </DialogHeader>

        {/* ── printable area ── */}
        <div ref={printRef} dir="rtl">
          <div className="invoice-wrapper mx-auto w-[76mm] max-w-full overflow-hidden text-sm">

            {/* Header */}
            <div className="header bg-white text-foreground text-center px-2 py-2">
              <p className="receipt-heading">إيصال اشتراك</p>
              <p className="receipt-number">رقم الإيصال: {invoiceDigits(displayReceiptNumbers || subscription.subscriptionNumber)}</p>
              <div className="logo-line flex items-center justify-center gap-2" style={{ direction: 'rtl' }}>
                <span className="subtitle whitespace-nowrap" style={{ fontSize: '9px', margin: 0 }}>نادي فتنس سنتر</span>
                <span className="club-mark inline-flex shrink-0 items-center justify-center rounded-full border border-foreground font-bold" style={{ width: '8mm', height: '8mm', fontSize: '13px' }}>C</span>
                <span className="logo-crop" style={{ width: '29mm', height: '11mm', overflow: 'hidden', position: 'relative', flex: '0 0 29mm' }}>
                  <img className="logo" src="/noamany-logo.png" alt="Noamany" style={{ width: '42mm', maxWidth: 'none', height: 'auto', position: 'absolute', top: '-15mm', right: '-6.5mm' }} />
                </span>
              </div>
            </div>

            <div className="body p-2 space-y-2">

              <p className="section-title text-[10px] font-bold border-b pb-1 mb-2">بيانات الاشتراك</p>
              <div className="info-grid grid grid-cols-[auto_1fr] text-xs">
                {displayReceiptNumbers ? <><span className="lbl">{ct('subscriptions.receiptNumber')}</span><span className="val nums">{invoiceDigits(displayReceiptNumbers)}</span></> : null}
                <span className="lbl">{ct('subscriptions.customerName')}</span><span className="val">{subscription.customerName ?? '—'}</span>
                <span className="lbl">رقم العضوية</span><span className="val nums">{invoiceDigits(subscription.memberCode)}</span>
                <span className="lbl">رقم الهاتف</span><span className="val nums">{invoiceDigits(subscription.memberPhone)}</span>
                <span className="lbl">{ct('subscriptions.subscriptionType')}</span><span className="val">{subscription.subscriptionType ?? '—'}</span>
                <span className="lbl">{ct('subscriptions.startDate')}</span><span className="val nums">{invoiceDigits(receiptDate(subscription.subscriptionStartDate))}</span>
                <span className="lbl">{ct('subscriptions.endDate')}</span><span className="val nums">{invoiceDigits(receiptDate(subscription.subscriptionEndDate))}</span>
                <span className="lbl">{ct('subscriptions.registrationDate')}</span><span className="val nums">{invoiceDigits(receiptDate(subscription.registrationDate))}</span>
              </div>

              <div className="totals-block">
                <div className="totals-row"><span>{ct('subscriptions.subscriptionValue')}</span><span className="nums">{invoiceDigits(subscription.subscriptionValue.toFixed(2))}</span></div>
                <div className="totals-row discount"><span>{ct('subscriptions.discount')}</span><span className="nums">-{invoiceDigits((subscription.discountEnabled ? subscription.discountValue : 0).toFixed(2))}</span></div>
                <div className="totals-row highlight"><span>{ct('subscriptions.netValue')}</span><span className="nums">{invoiceDigits(net.toFixed(2))}</span></div>
                <div className="totals-row"><span>{ct('subscriptions.paidAmount')}</span><span className="nums">{invoiceDigits(subscription.paidAmount.toFixed(2))}</span></div>
                <div className="totals-row remaining"><span>{ct('subscriptions.remainingAmount')}</span><span className="nums">{invoiceDigits(subscription.remainingAmount.toFixed(2))}</span></div>
              </div>

              {(tenderLines.length > 0 || subscription.paymentMethod) && <div className="flex justify-between items-start text-xs"><span>{ct('subscriptions.paymentMethod')}</span><div className="text-end"><span className="payment-badge">{clubPaymentMethodsLabel(ct, tenderLines, subscription.paymentMethod)}</span>{splitTender ? tenderLines.map((line) => <div key={line.method} className="split-line"><span>{clubPaymentMethodLabel(ct, line.method)}</span><span className="nums">{invoiceDigits(line.amount.toFixed(2))}</span></div>) : null}</div></div>}

              <div className="staff-block">
                <div className="staff-line"><span>الموظف</span><b>{subscription.assignedStaffName || subscription.salesName || '—'}</b></div>
                <div className="staff-line"><span>التاريخ</span><b className="nums">{invoiceDigits(receiptDate(receipts[0]?.receiptDate || subscription.registrationDate))}</b></div>
                <div className="staff-line"><span>الوقت</span><b className="nums" dir="ltr">{printTime}</b></div>
              </div>

              <div className="qr-grid grid grid-cols-2 gap-3 justify-items-center" aria-label="رموز الفاتورة">
                {[
                  subscription.memberCode || String(subscription.memberId ?? subscription.id),
                  subscription.subscriptionNumber,
                  displayReceiptNumbers || String(subscription.id),
                  subscription.memberPhone || String(subscription.memberId ?? subscription.id),
                ].map((value, index) => <QRCodeSVG key={`${value}-${index}`} value={String(value)} level="M" includeMargin className="h-[18mm] w-[18mm]" />)}
              </div>
            </div>

            {/* Footer */}
            <div className="footer-strip bg-white text-center py-2 text-xs border-t border-foreground">
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
