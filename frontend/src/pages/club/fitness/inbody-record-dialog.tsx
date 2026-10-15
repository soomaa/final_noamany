import { formatDisplayNumber } from '@/lib/number-display';
import { FileText, Loader2, Upload, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { useFileUpload, uploadUrl } from '@/components/employees/use-uploads';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';
import type { InbodyMemberContext } from '@/types/fitness';
import { SELECT_CLS } from './shared';
import { useClubPrintingPolicy } from '@/hooks/use-club-printing-policy';
import { printThermalFinancialReceiptWithFallback } from '@/components/club/thermal-receipt-print';
import { useAuth } from '@/store/auth';
import { ClubPaymentSplitFields, singlePaymentRow, splitRowsTotal, type ClubPaymentSplitRow } from '@/components/club/club-payment-split-fields';
import { buildClubPartialPayment } from '@/components/club/club-partial-payment';
import { formatMoney } from '@/lib/formatters';
import { useLocale } from '@/store/locale';

interface InbodyRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function InbodyRecordDialog({ open, onOpenChange, onSaved }: InbodyRecordDialogProps) {
  const { ui } = useLocale();
  const { user } = useAuth();
  const { policy, shouldPrint } = useClubPrintingPolicy();
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const [context, setContext] = useState<InbodyMemberContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [measurementDate, setMeasurementDate] = useState(localToday());
  const [reportUrl, setReportUrl] = useState('');
  const [offerId, setOfferId] = useState('');
  const [paymentRows, setPaymentRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const { upload, uploading } = useFileUpload();

  const reset = () => {
    setSelectedMember(null);
    setContext(null);
    setMeasurementDate(localToday());
    setReportUrl('');
    setOfferId('');
    setPaymentRows(singlePaymentRow());
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !saving && !uploading) reset();
    onOpenChange(next);
  };

  const selectMember = async (member: ClubMemberListItem) => {
    setSelectedMember(member);
    setContext(null);
    setOfferId('');
    setLoadingContext(true);
    try {
      const { data } = await api.get<InbodyMemberContext>('/club-inbody-measurements/member-benefits/by-code', {
        params: { memberCode: member.memberCode },
      });
      setContext(data);
      if (data.totalRemaining === 0 && data.offers[0]) {
        setOfferId(String(data.offers[0].id));
        setPaymentRows(singlePaymentRow('cash', data.offers[0].price));
      }
    } catch (error) {
      toast.error(apiError(error));
      setSelectedMember(null);
    } finally {
      setLoadingContext(false);
    }
  };

  const pickReport = async (file: File | undefined) => {
    if (!file) return;
    const path = await upload('inbody', file);
    if (path) setReportUrl(path);
  };

  const selectedOffer = context?.offers.find((offer) => String(offer.id) === offerId);
  const paidNow = splitRowsTotal(paymentRows);
  const remainingNow = Math.max(0, Math.round(((selectedOffer?.price ?? 0) - paidNow) * 100) / 100);
  const requiresPayment = Boolean(context && context.totalRemaining === 0);
  const saleBlocked = Boolean(
    requiresPayment
      && context
      && !context.hasActiveMembership
      && !context.allowWithoutActiveMembership,
  );

  const save = async () => {
    if (!selectedMember || !context || !measurementDate || !reportUrl) {
      toast.error(ui('اختر العضو وارفع تقرير InBody'));
      return;
    }
    if (requiresPayment && !offerId) {
      toast.error(ui('اختر سعر القياس أو الباقة'));
      return;
    }
    const payment = requiresPayment && selectedOffer ? buildClubPartialPayment(paymentRows, selectedOffer.price) : null;
    if (payment && 'error' in payment) {
      toast.error(payment.error);
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<{
        id: number;
        settlementSource: string;
        chargedAmount: number;
        invoiceNumber: string | null;
        serviceName: string | null;
        paymentMethod: string | null;
        paidAmount: number;
        remainingAmount: number;
        payments?: { method: string; amount: number }[];
      }>('/club-inbody-measurements/record', {
        memberId: selectedMember.id,
        branchId: context.member.branchId,
        measurementDate,
        reportUrl,
        ...(requiresPayment ? { offerId: Number(offerId), ...payment!.payload } : {}),
      });
      toast.success(requiresPayment ? ui('تم تسجيل القياس والتحصيل في الإيرادات') : ui('تم تسجيل القياس وخصمه من الرصيد'));
      if (shouldPrint('inbody', data.chargedAmount, data.invoiceNumber)) {
        printThermalFinancialReceiptWithFallback({
          documentNumber: data.invoiceNumber!,
          transactionLabel: 'InBody measurement',
          itemName: data.serviceName || selectedOffer?.name || 'InBody',
          customerName: selectedMember.name,
          memberCode: selectedMember.memberCode,
          branchName: `Branch #${context.member.branchId}`,
          collectedAmount: data.paidAmount,
          paymentMethod: data.paymentMethod || paymentRows[0]?.method,
          payments: data.payments,
          operatorName: user?.name,
        }, policy);
      }
      reset();
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{ui('تسجيل قياس InBody')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="grid gap-2">
            <Label>{ui('العضو')}</Label>
            <MemberSearchCombobox
              selectedMember={selectedMember}
              onSelect={(member) => void selectMember(member)}
              onClear={() => {
                setSelectedMember(null);
                setContext(null);
                setOfferId('');
              }}
              disabled={saving || uploading}
            />
          </div>

          {loadingContext ? (
            <div className="flex items-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {ui('جارٍ فحص رصيد InBody…')}
            </div>
          ) : context ? (
            <section className="rounded-xl border bg-muted/30 p-4" aria-label={ui('رصيد InBody')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{ui('الرصيد المتاح')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ui('يتم الخصم تلقائيًا من الرصيد الأقرب انتهاءً.')}
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary nums">
                  {toArabicDigits(context.totalRemaining)} {ui('قياس')}
                </span>
              </div>
              {context.balances.length > 0 && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  {context.balances.map((balance) => (
                    <div key={`${balance.source}-${balance.id}`} className="flex items-center justify-between gap-3 text-sm">
                      <span>{balance.label}</span>
                      <span className="text-muted-foreground nums">
                        {toArabicDigits(balance.remaining)} {ui('متبقي')}
                        {balance.expiresAt ? `${ui(' · حتى ')}${toArabicDigits(balance.expiresAt)}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {requiresPayment && context && (
            <section className="space-y-3 border-t pt-4" aria-label={ui('تحصيل InBody')}>
              {saleBlocked ? (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {ui('هذا الفرع لا يسمح ببيع InBody بدون اشتراك جيم فعّال. يمكن تغيير ذلك من تبويب الإعدادات.')}
                </p>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label>{ui('القياس أو الباقة')}</Label>
                    <select className={SELECT_CLS} value={offerId} onChange={(event) => {
                      const nextId = event.target.value;
                      setOfferId(nextId);
                      const offer = context.offers.find((item) => String(item.id) === nextId);
                      setPaymentRows(singlePaymentRow('cash', offer?.price ?? ''));
                    }}>
                      <option value="">{ui('اختر')}</option>
                      {context.offers.map((offer) => (
                        <option key={offer.id} value={offer.id}>
                          {offer.name} — {formatDisplayNumber(offer.measurementCount)} {ui('قياس')} — {formatDisplayNumber(offer.price)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedOffer && (
                    <p className="text-sm text-muted-foreground">
                      {ui('سيتم تحصيل')} <strong className="nums text-foreground">{toArabicDigits(selectedOffer.price)}</strong>
                      {selectedOffer.measurementCount > 1
                        ? `${ui(' ويتبقى للعضو ')}${toArabicDigits(selectedOffer.measurementCount - 1)}${ui(' قياس بعد تسجيل القياس الحالي.')}`
                        : ui('مقابل القياس الحالي.')}
                    </p>
                  )}
                  {selectedOffer ? <>
                    <ClubPaymentSplitFields total={selectedOffer.price} rows={paymentRows} onChange={setPaymentRows} />
                    <div className="grid grid-cols-3 overflow-hidden rounded-xl border bg-muted/20 text-sm">
                      <div className="p-3"><span className="block text-xs text-muted-foreground">{ui('الإجمالي')}</span><strong className="nums">{formatMoney(selectedOffer.price)}</strong></div>
                      <div className="border-x p-3"><span className="block text-xs text-muted-foreground">{ui('المدفوع')}</span><strong className="nums text-emerald-700">{formatMoney(paidNow)}</strong></div>
                      <div className="p-3"><span className="block text-xs text-muted-foreground">{ui('المتبقي')}</span><strong className="nums text-amber-700">{formatMoney(remainingNow)}</strong></div>
                    </div>
                    {remainingNow > 0 ? <p className="text-xs text-amber-700">{ui('سيُحفظ المتبقي كمديونية للعضو ويظهر في شاشة المبالغ المتبقية.')}</p> : null}
                  </> : null}
                </>
              )}
            </section>
          )}

          <div className="grid gap-2">
            <Label>{ui('تاريخ القياس')}</Label>
            <Input type="date" className="nums" value={measurementDate} onChange={(event) => setMeasurementDate(event.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>{ui('تقرير الجهاز')}</Label>
            {reportUrl ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <a href={uploadUrl(reportUrl) ?? '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-brand underline underline-offset-4">
                  <FileText className="size-4" /> {ui('عرض التقرير المرفوع')}
                </a>
                <Button type="button" variant="ghost" size="icon" title={ui('إزالة التقرير')} onClick={() => setReportUrl('')}>
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/5">
                {uploading ? <Loader2 className="size-5 animate-spin text-primary" /> : <Upload className="size-5 text-primary" />}
                <span className="text-sm font-medium">{uploading ? ui('جارٍ رفع التقرير…') : ui('ارفع صورة أو PDF لتقرير InBody')}</span>
                <span className="text-xs text-muted-foreground">{ui('PDF، JPG، PNG أو WebP')}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={uploading} onChange={(event) => void pickReport(event.target.files?.[0])} />
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving || uploading}>{ui('إلغاء')}</Button>
          <Button
            variant="brand"
            permissionAction="create"
            onClick={() => void save()}
            disabled={saving || uploading || loadingContext || !context || !reportUrl || saleBlocked || (requiresPayment && !offerId)}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {requiresPayment ? ui('تسجيل وتحصيل') : ui('تسجيل القياس')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
