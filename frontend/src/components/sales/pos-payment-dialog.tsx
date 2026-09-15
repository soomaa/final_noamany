import type { ReactNode } from 'react';
import { Banknote } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TouchKeypad } from '@/components/ui/touch-keypad';
import { enterKey, keyboardKeypadKey } from '@/lib/touch-keypad';
import { calculateCashSettlement } from '@/lib/pos-cash-tools';
import { toArabicDigits } from '@/lib/utils';
import type { InvoicePaymentChange } from '@/lib/completed-invoice-edit';

export function PosPaymentDialog({ open, onOpenChange, total, cashDue, currency, tendered, onTenderedChange, controls, canConfirm, busy, deferred, editSummary, onConfirm, ui }: {
  open: boolean; onOpenChange: (open: boolean) => void; total: number; cashDue: number;
  currency: string; tendered: string; onTenderedChange: (value: string) => void;
  controls: ReactNode; canConfirm: boolean; busy: boolean; deferred: boolean;
  editSummary?: { previousTotal: number; previousPaid: number; changes: InvoicePaymentChange[] };
  onConfirm: () => void; ui: (value: string) => string;
}) {
  const settlement = calculateCashSettlement(cashDue, tendered);
  const cashReady = cashDue <= 0 || settlement.status === 'exact' || settlement.status === 'change';
  const money = (amount: number) => `${toArabicDigits(amount.toFixed(2))} ${currency}`;
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
    <DialogContent size="xl" className="gap-4 overflow-hidden p-4 sm:p-5" aria-label={ui('دفع الطلب')} onKeyDown={event => {
      if (busy || cashDue <= 0 || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') !== event.currentTarget) return;
      const key = keyboardKeypadKey(event.key);
      if (key === null) return;
      event.preventDefault();
      onTenderedChange(enterKey(tendered, key, { decimal: true }));
    }}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Banknote className="size-5 text-primary" />{ui(editSummary ? 'مراجعة فرق الفاتورة' : 'دفع الطلب')}</DialogTitle>
        <DialogDescription>{ui(editSummary ? 'راجع التحصيل أو الرد المطلوب لكل طريقة دفع قبل تأكيد التعديل.' : 'راجع المبلغ وطريقة الدفع، ثم أكّد الطلب مرة واحدة.')}</DialogDescription>
      </DialogHeader>
      <div className={`grid min-h-0 flex-1 gap-5 overflow-y-auto overscroll-contain ${cashDue > 0 ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,360px)]' : ''}`}>
        <div className="min-w-0 space-y-4">
          <div className="rounded-xl bg-muted p-4"><p className="text-sm text-muted-foreground">{ui(editSummary ? 'إجمالي الفاتورة بعد التعديل' : 'الإجمالي المطلوب')}</p><p className="nums mt-2 text-2xl font-bold" aria-live="polite">{money(total)}</p></div>
          {editSummary && <div className="space-y-2 text-sm" aria-live="polite">
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">{ui('الإجمالي قبل التعديل')}</span><b className="nums">{money(editSummary.previousTotal)}</b></div>
            <div className="flex justify-between gap-3"><span className="text-muted-foreground">{ui('تم تحصيله سابقًا')}</span><b className="nums">{money(editSummary.previousPaid)}</b></div>
            {deferred ? <p className="rounded-lg bg-primary/10 p-3 font-semibold">{ui('فرق الحساب')}: <span className="nums">{money(total - editSummary.previousTotal)}</span></p> : editSummary.changes.filter(change => change.difference !== 0).map(change => <div key={change.method} className="flex flex-wrap justify-between gap-2 rounded-lg bg-primary/10 p-3 font-semibold">
              <span>{ui(change.difference > 0 ? 'تحصيل إضافي' : 'يُرد للعميل')} · {ui(change.method === 'cash' ? 'نقدي' : change.method === 'card' ? 'بطاقة' : change.method === 'wallet' ? 'محفظة' : 'تحويل')}</span><span className="nums">{money(Math.abs(change.difference))}</span>
            </div>)}
            {!deferred && editSummary.changes.every(change => change.difference === 0) && <p className="rounded-lg bg-primary/10 p-3 font-semibold">{ui('لا يوجد فرق مطلوب تحصيله أو رده')}</p>}
            <p className="leading-relaxed text-muted-foreground">{ui('طرق الدفع أدناه تمثل إجمالي الفاتورة النهائي. المطلوب الآن هو الفرق الموضح فقط.')}</p>
          </div>}
          <fieldset disabled={busy} className="min-w-0 space-y-3">{controls}</fieldset>
          {deferred && <p className="text-sm leading-relaxed text-muted-foreground">{ui('هذا الطلب على الحساب، ولا يتطلب تحصيلًا نقديًا الآن.')}</p>}
        </div>
        {cashDue > 0 && <fieldset disabled={busy} className="min-w-0">
          <TouchKeypad title={ui(editSummary ? 'دفع كام من الفرق؟' : 'العميل دفع كام؟')} value={tendered} decimal showDone={false} hideClose
            press={key => onTenderedChange(enterKey(tendered, key, { decimal: true }))}
            close={() => onOpenChange(false)}
            summary={<div className="space-y-2 text-sm" aria-live="polite">
              <div className="flex justify-between gap-2"><span>{ui('المطلوب نقدًا')}</span><b className="nums">{money(cashDue)}</b></div>
              <div className={`flex justify-between gap-2 rounded-lg p-3 ${cashReady ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100'}`}>
                <span>{ui(cashReady ? 'الباقي للعميل' : 'المتبقي على العميل')}</span><b className="nums">{money((cashReady ? settlement.changeCents : settlement.remainingCents) / 100)}</b>
              </div>
              <Button permissionAction={null} type="button" variant="outline" className="min-h-11 w-full" onClick={() => onTenderedChange(cashDue.toFixed(2))}>{ui('دفع المبلغ بالضبط')}</Button>
            </div>} />
        </fieldset>}
      </div>
      <Button permissionAction={null} className="min-h-12 w-full shrink-0 text-base font-bold" disabled={busy || !canConfirm || !cashReady} onClick={onConfirm}>
        {ui(busy ? 'جاري التأكيد…' : editSummary ? 'تأكيد تعديل الفاتورة وتسوية الفرق' : deferred ? 'إضافة للحساب' : 'تأكيد الدفع والطلب')}
      </Button>
    </DialogContent>
  </Dialog>;
}
