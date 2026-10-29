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
      <title>إيصال اشتراك - ${subscription.subscriptionNumber}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        /* Thermal printers fade grey and thin strokes: print everything solid black and bold. */
        body { font-family: Tahoma, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #000; background: #fff; direction: rtl; }
        .invoice-wrapper { width: 76mm; max-width: 76mm; margin: 0 auto; }
        .receipt-heading { font-size: 14px; font-weight: 800; text-align: center; text-decoration: underline; margin-bottom: 1mm; }
        .receipt-number { text-align: center; font-size: 17px; font-weight: 800; margin: 1mm 0 2mm; }
        .logo-line { display: flex; align-items: center; justify-content: center; gap: 2mm; margin: 1mm 0 2mm; direction: rtl; }
        .club-name { font-size: 13px; font-weight: 800; white-space: nowrap; }
        .club-mark { border: 2px solid #000; border-radius: 50%; width: 10mm; height: 10mm; flex: 0 0 10mm; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; }
        .logo-crop { width: 29mm; height: 11mm; overflow: hidden; position: relative; flex: 0 0 29mm; }
        .logo { width: 42mm; max-width: none; height: auto; display: block; position: absolute; top: -15mm; right: -6.5mm; }
        .branch-line { text-align: center; font-size: 13px; font-weight: 800; margin-bottom: 2mm; }
        .amount-line { display: flex; justify-content: space-between; align-items: flex-end; gap: 2mm; margin: 2mm 0; }
        .money { display: flex; gap: 4mm; text-align: center; }
        .money small { display: block; font-size: 11px; }
        .money b { font-size: 16px; }
        .row { display: flex; align-items: baseline; gap: 2mm; padding: 1.2mm 0; }
        .row .lbl { white-space: nowrap; font-size: 12px; }
        .row .val { flex: 1; font-size: 14px; font-weight: 800; text-align: center; border-bottom: 1px dotted #000; min-height: 5mm; }
        .period { font-size: 12px; text-align: center; margin: 1.5mm 0; }
        .no-refund { text-align: center; font-size: 14px; font-weight: 800; margin: 2mm 0; padding: 1mm 0; border-top: 1px solid #000; border-bottom: 1px solid #000; }
        .sign-grid { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; margin: 2mm 0; }
        .sign-grid small { display: block; font-size: 11px; }
        .sign-grid b { font-size: 13px; }
        .qr-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2mm 5mm; justify-items: center; padding: 2mm 8mm 1mm; }
        .qr-grid svg { width: 17mm; height: 17mm; }
        .footer-strip { text-align: center; padding: 2mm 0; font-size: 12px; border-top: 1px solid #000; }
        .nums { font-variant-numeric: tabular-nums; }
        @media print {
          @page { size: 80mm auto; margin: 3mm; }
          body { width: 76mm; }
        }
      </style>
      </head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    // Wait for the logo so it is not missing from the printed copy.
    const printNow = () => { w.print(); w.close(); };
    const images = Array.from(w.document.images);
    const pending = images.filter((img) => !img.complete);
    if (pending.length === 0) printNow();
    else {
      let left = pending.length;
      const done = () => { left -= 1; if (left <= 0) printNow(); };
      pending.forEach((img) => { img.onload = done; img.onerror = done; });
    }
  };

  if (!subscription) return null;

  const tenderLines = collectTenderLines(receipts);
  const displayReceiptNumbers = receipts.length > 0
    ? [...new Set(receipts.map((r) => r.receiptNumber).filter(Boolean))].join(' / ')
    : (subscription.receiptNumber ?? '');
  const printTime = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date());
  // The amount received on this receipt; split into pounds and piasters like the old paper receipt.
  const received = receipts.length > 0
    ? Math.round(receipts.reduce((sum, r) => sum + (r.amount ?? 0), 0) * 100) / 100
    : subscription.paidAmount;
  const pounds = Math.trunc(received);
  const piasters = Math.round((received - pounds) * 100);
  const branchLetter = (subscription.branchCode ?? '').trim();
  const captainName = subscription.assignedStaffName || subscription.salesName || '';
  const staffName = subscription.createdByName || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{ct('subscriptions.invoiceTitle')}</DialogTitle>
        </DialogHeader>

        {/* ── printable area ── */}
        <div ref={printRef} dir="rtl">
          <div className="invoice-wrapper mx-auto w-[76mm] max-w-full overflow-hidden text-sm font-bold text-black bg-white p-2">
            <p className="receipt-heading text-center underline">إيصال استلام نقدية</p>
            <p className="receipt-number text-center text-lg font-extrabold">رقم الإيصال: <span className="nums">{invoiceDigits(displayReceiptNumbers || subscription.subscriptionNumber)}</span></p>
            <div className="logo-line flex items-center justify-center gap-2" style={{ direction: 'rtl' }}>
              <span className="club-name whitespace-nowrap">نعماني فتنس سنتر</span>
              {branchLetter ? <span className="club-mark inline-flex shrink-0 items-center justify-center rounded-full border-2 border-black" style={{ width: '10mm', height: '10mm', fontSize: '18px' }}>{branchLetter}</span> : null}
              <span className="logo-crop" style={{ width: '29mm', height: '11mm', overflow: 'hidden', position: 'relative', flex: '0 0 29mm' }}>
                <img className="logo" src="/noamany-logo.png" alt="Noamany" style={{ width: '42mm', maxWidth: 'none', height: 'auto', position: 'absolute', top: '-15mm', right: '-6.5mm' }} />
              </span>
            </div>
            {subscription.branchName ? <p className="branch-line text-center">فرع {subscription.branchName}</p> : null}

            <div className="amount-line flex justify-between items-end gap-2">
              <div className="row flex flex-1 gap-2"><span className="lbl">التاريخ :</span><span className="val nums flex-1 text-center">{invoiceDigits(receiptDate(receipts[0]?.receiptDate || subscription.registrationDate))}</span></div>
              <div className="money flex gap-3 text-center">
                <div><small>قرش</small><b className="nums">{invoiceDigits(String(piasters).padStart(2, '0'))}</b></div>
                <div><small>جنيه</small><b className="nums">{invoiceDigits(pounds)}</b></div>
              </div>
            </div>

            <div className="row flex gap-2"><span className="lbl">استلمنا من المحترم :</span><span className="val flex-1 text-center">{subscription.customerName ?? '—'}</span></div>
            <div className="row flex gap-2"><span className="lbl">رقم الكود :</span><span className="val nums flex-1 text-center">{invoiceDigits(subscription.memberCode)}</span></div>
            <div className="row flex gap-2"><span className="lbl">رقم الموبايل :</span><span className="val nums flex-1 text-center">{invoiceDigits(subscription.memberPhone)}</span></div>
            <div className="row flex gap-2"><span className="lbl">طريقة الدفع :</span><span className="val flex-1 text-center">{clubPaymentMethodsLabel(ct, tenderLines, subscription.paymentMethod)}</span></div>
            <div className="row flex gap-2"><span className="lbl">مبلغ وقدره :</span><span className="val nums flex-1 text-center">{invoiceDigits(received.toFixed(2))}</span></div>
            {tenderLines.length > 1 ? tenderLines.map((line) => (
              <div key={line.method} className="row flex gap-2"><span className="lbl">{clubPaymentMethodLabel(ct, line.method)} :</span><span className="val nums flex-1 text-center">{invoiceDigits(line.amount.toFixed(2))}</span></div>
            )) : null}
            {subscription.remainingAmount > 0 ? <div className="row flex gap-2"><span className="lbl">المتبقي :</span><span className="val nums flex-1 text-center">{invoiceDigits(subscription.remainingAmount.toFixed(2))}</span></div> : null}
            {subscription.discountEnabled && subscription.discountValue > 0 ? <div className="row flex gap-2"><span className="lbl">الخصم :</span><span className="val nums flex-1 text-center">{invoiceDigits(subscription.discountValue.toFixed(2))}</span></div> : null}
            <div className="row flex gap-2"><span className="lbl">اسم الكابتن :</span><span className="val flex-1 text-center">{captainName || '—'}</span></div>
            <p className="period text-center nums">وذلك عن اشتراك للفترة من {invoiceDigits(receiptDate(subscription.subscriptionStartDate))} حتى {invoiceDigits(receiptDate(subscription.subscriptionEndDate))}</p>
            <div className="row flex gap-2"><span className="lbl">نوع الاشتراك :</span><span className="val flex-1 text-center">{subscription.subscriptionType ?? '—'}</span></div>

            <p className="no-refund text-center border-y border-black py-1">الاشتراك لا يسترد ولا يستبدل</p>

            <div className="sign-grid grid grid-cols-3 text-center">
              <div><small>الموظف</small><b>{staffName || '—'}</b></div>
              <div><small>الوقت</small><b className="nums" dir="ltr">{printTime}</b></div>
              <div><small>الختم</small><b>&nbsp;</b></div>
            </div>

            <div className="qr-grid grid grid-cols-2 gap-3 justify-items-center" aria-label="رموز الإيصال">
              {[
                subscription.memberCode || String(subscription.memberId ?? subscription.id),
                subscription.subscriptionNumber,
                displayReceiptNumbers || String(subscription.id),
                subscription.memberPhone || String(subscription.memberId ?? subscription.id),
              ].map((value, index) => <QRCodeSVG key={`${value}-${index}`} value={String(value)} level="M" includeMargin className="h-[18mm] w-[18mm]" />)}
            </div>

            <div className="footer-strip text-center py-2 border-t border-black">
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
