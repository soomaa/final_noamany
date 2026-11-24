import { Activity, FileUp, Loader2, Minus, PlusCircle, Sparkles, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ReceptionGuestInvitation } from '@/components/club/reception-guest-invitation';
import { useFileUpload } from '@/components/employees/use-uploads';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubMemberOverviewSubscription } from '@/types/club';

type Service = 'inbody' | 'spa';

const EMPTY_RESULT = { weight: '', heightCm: '', bodyFat: '', muscleMass: '', notes: '' };
const PAYMENT_METHODS: Array<[string, string]> = [['cash', 'نقدي'], ['card', 'فيزا / بطاقة'], ['wallet', 'محفظة'], ['transfer', 'تحويل']];
interface InbodyServiceOption { id: number; name: string; price: number }

/**
 * InBody and SPA allowances of one subscription, with their reception actions.
 * Under the subscription card ('invitation' / 'all'): the guest invitation and InBody — deduct alone,
 * deduct with the result and report file, or, once the plan's InBody are used up (or the plan has
 * none), «إضافة InBody»: a paid InBody at the price set in «فواتير InBody» (client, 25 Nov).
 * Beside the member photo ('services'): SPA only.
 */
export function ReceptionServiceAllowances({ memberId, subscription, canUse, onRecorded, part = 'all' }: {
  /** 'invitation' = only the guest invitation (under the subscription card); 'services' = only InBody /
   * SPA with their buttons (under the member photo, client 22 Nov); 'all' = both. */
  part?: 'all' | 'invitation' | 'services';
  memberId: number;
  /** The same subscription from the member overview (carries the InBody / SPA counters). */
  subscription: ClubMemberOverviewSubscription | undefined;
  canUse: boolean;
  onRecorded: () => void;
}) {
  const { ui } = useLocale();
  const { upload, uploading } = useFileUpload();
  const [busy, setBusy] = useState<Service | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [result, setResult] = useState(EMPTY_RESULT);
  const [file, setFile] = useState<File | null>(null);
  const [buyMode, setBuyMode] = useState(false);
  const [serviceId, setServiceId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const inbodyServices = useQuery({
    queryKey: ['club-inbody-services', 'catalog'],
    queryFn: async () => (await api.get<InbodyServiceOption[]>('/club-inbody-services/catalog')).data,
    enabled: part !== 'services',
    staleTime: 5 * 60_000,
  });

  if (!subscription) return null;
  const inbodyTotal = subscription.inbodyCount ?? 0;
  const inbodyLeft = Math.max(0, inbodyTotal - subscription.inbodyUsed);
  const spaTotal = subscription.spaCount ?? 0;
  const spaLeft = Math.max(0, spaTotal - subscription.spaUsed);
  const usable = canUse && subscription.status === 'active';
  const showInbody = part !== 'services';
  if (part === 'services' && spaTotal <= 0) return null;

  const record = async (service: Service, measurement?: Record<string, unknown>) => {
    setBusy(service);
    try {
      await api.post('/club-attendance/service-check-in', {
        memberId, subscriptionId: subscription.id, attendanceType: service, ...(measurement ? { measurement } : {}),
      });
      toast.success(ui(service === 'spa' ? 'تم تسجيل حضور السبا' : measurement ? 'تم خصم InBody وحفظ النتيجة' : 'تم خصم InBody من الاشتراك'));
      onRecorded();
      return true;
    } catch (error) {
      toast.error(apiError(error));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const deductOnly = async (service: Service) => {
    const left = service === 'spa' ? spaLeft : inbodyLeft;
    const ok = await confirm({
      title: ui(service === 'spa' ? 'تسجيل حضور السبا' : 'خصم InBody من الاشتراك'),
      description: `${ui('سيتم خصم جلسة واحدة. المتبقي بعد الخصم')}: ${toArabicDigits(left - 1)}`,
      confirmLabel: ui('تأكيد الخصم'),
    });
    if (ok) await record(service);
  };

  const submitResult = async () => {
    if (buyMode) return void submitPurchase();
    const numbers = Object.fromEntries(
      (['weight', 'heightCm', 'bodyFat', 'muscleMass'] as const)
        .filter((key) => result[key].trim() !== '')
        .map((key) => [key, Number(result[key])]),
    );
    if (Object.values(numbers).some((value) => !Number.isFinite(value))) {
      toast.error(ui('أدخل أرقامًا صحيحة في القياسات'));
      return;
    }
    if (!file && !Object.keys(numbers).length) {
      toast.error(ui('ارفع تقرير InBody أو أدخل قياسًا واحدًا على الأقل'));
      return;
    }
    let reportUrl: string | undefined;
    if (file) {
      const path = await upload('inbody', file);
      if (!path) return;
      reportUrl = path;
    }
    const ok = await record('inbody', { ...numbers, notes: result.notes.trim() || undefined, reportUrl });
    if (ok) closeResult();
  };

  const closeResult = () => {
    setResultOpen(false);
    setBuyMode(false);
    setResult(EMPTY_RESULT);
    setFile(null);
  };

  /** Paid InBody (no allowance left): invoice at the service price, then the optional result. */
  const submitPurchase = async () => {
    const service = (inbodyServices.data ?? []).find((s) => String(s.id) === serviceId);
    if (!service) {
      toast.error(ui('اختار خدمة InBody'));
      return;
    }
    const numbers = Object.fromEntries(
      (['weight', 'heightCm', 'bodyFat', 'muscleMass'] as const)
        .filter((key) => result[key].trim() !== '')
        .map((key) => [key, Number(result[key])]),
    );
    if (Object.values(numbers).some((value) => !Number.isFinite(value))) {
      toast.error(ui('أدخل أرقامًا صحيحة في القياسات'));
      return;
    }
    setBusy('inbody');
    try {
      let reportUrl: string | undefined;
      if (file) {
        const path = await upload('inbody', file);
        if (!path) return;
        reportUrl = path;
      }
      await api.post('/club-inbody-invoices', {
        isMember: true, memberId, serviceId: service.id, branchId: subscription.branchId, paymentMethod,
      });
      if (reportUrl || Object.keys(numbers).length || result.notes.trim()) {
        try {
          await api.post('/club-inbody-measurements', {
            memberId, measurementDate: localToday(), ...numbers, notes: result.notes.trim() || undefined, reportUrl,
          });
        } catch (error) {
          toast.error(`${ui('اتسجلت الفاتورة بس النتيجة ما اتحفظتش')}: ${apiError(error)}`);
          onRecorded();
          closeResult();
          return;
        }
      }
      toast.success(`${ui('تم تسجيل InBody مدفوع')} — ${toArabicDigits(service.price)} ${ui('ج.م')}`);
      onRecorded();
      closeResult();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setBusy(null);
    }
  };

  const box = 'flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4';
  const compact = part === 'services';
  const compactBox = 'space-y-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-2.5';
  const field = (key: keyof typeof EMPTY_RESULT, label: string, unit: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`inbody-${key}`}>{ui(label)} <span className="text-xs text-muted-foreground">({ui(unit)})</span></Label>
      <Input id={`inbody-${key}`} type="number" inputMode="decimal" step="0.1" value={result[key]}
        onChange={(event) => setResult((current) => ({ ...current, [key]: event.target.value }))} />
    </div>
  );

  return (
    <div className={part === 'services' ? 'space-y-2' : 'mt-3 space-y-3'}>
      {part !== 'services' ? <ReceptionGuestInvitation memberId={memberId} subscriptionId={subscription.id} /> : null}
      {part === 'services' ? (
        <p className="text-xs font-semibold text-muted-foreground">{subscription.subscriptionTypeName || subscription.subscriptionType || ui('اشتراك')}</p>
      ) : null}
      {/* A service the plan does not include is not shown at all (client, 22 Nov: «غير مشمول» rows were noise).
          SPA comes before InBody (client, 24 Nov). */}
      {part !== 'invitation' && spaTotal > 0 ? (
        compact ? (
          <div className={compactBox}>
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4 text-primary" />{ui('السبا')}</p>
              <span className="nums rounded-full bg-background px-2 py-0.5 text-xs">{toArabicDigits(spaLeft)} {ui('من')} {toArabicDigits(spaTotal)}</span>
            </div>
            <Button size="sm" variant="outline" className="h-8 w-full gap-1 px-2 text-xs" disabled={!usable || spaLeft < 1 || busy != null} onClick={() => void deductOnly('spa')}>
              {busy === 'spa' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {ui('تسجيل حضور السبا')}
            </Button>
          </div>
        ) : (
        <div className={box}>
          <div>
            <p className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-primary" />{ui('السبا')}</p>
            <p className="nums text-sm text-muted-foreground">
              {ui('المتبقي')}: <b className="text-foreground">{toArabicDigits(spaLeft)}</b> {ui('من')} {toArabicDigits(spaTotal)}
            </p>
          </div>
          <Button variant="outline" disabled={!usable || spaLeft < 1 || busy != null} onClick={() => void deductOnly('spa')}>
            {busy === 'spa' ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {ui('تسجيل حضور السبا')}
          </Button>
        </div>
        )
      ) : null}

      {showInbody ? (
        <div className={box}>
          <div>
            <p className="flex items-center gap-2 font-semibold"><Activity className="size-4 text-primary" />InBody</p>
            <p className="nums text-sm text-muted-foreground">
              {inbodyTotal > 0
                ? <>{ui('المتبقي')}: <b className="text-foreground">{toArabicDigits(inbodyLeft)}</b> {ui('من')} {toArabicDigits(inbodyTotal)}</>
                : ui('مش مشمول في الاشتراك')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {inbodyLeft > 0 ? (
              <>
                <Button variant="outline" disabled={!usable || busy != null} onClick={() => void deductOnly('inbody')}>
                  {busy === 'inbody' && !resultOpen ? <Loader2 className="size-4 animate-spin" /> : <Minus className="size-4" />}
                  {ui('خصم من الاشتراك')}
                </Button>
                <Button variant="brand" disabled={!usable || busy != null} onClick={() => setResultOpen(true)}>
                  <FileUp className="size-4" />
                  {ui('خصم ورفع النتيجة')}
                </Button>
              </>
            ) : (
              <Button
                variant="brand"
                disabled={!canUse || busy != null || !(inbodyServices.data?.length)}
                title={inbodyServices.isSuccess && !inbodyServices.data?.length ? ui('مفيش أسعار InBody — ضيفها من «فواتير InBody» ← الإعدادات') : undefined}
                onClick={() => {
                  setBuyMode(true);
                  setServiceId(String(inbodyServices.data?.[0]?.id ?? ''));
                  setPaymentMethod('cash');
                  setResultOpen(true);
                }}
              >
                <PlusCircle className="size-4" />
                {ui('إضافة InBody')}
              </Button>
            )}
          </div>
          {inbodyLeft < 1 && inbodyServices.isSuccess && !inbodyServices.data?.length ? (
            <p className="basis-full text-xs text-amber-700 dark:text-amber-300">{ui('مفيش أسعار InBody متسجلة — ضيفها من «فواتير InBody» ← الإعدادات عشان تقدر تبيع InBody من هنا.')}</p>
          ) : null}
        </div>
      ) : null}

      <Dialog open={resultOpen} onOpenChange={(open) => { if (!open && busy == null && !uploading) closeResult(); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{buyMode ? ui('إضافة InBody مدفوع') : ui('خصم InBody ورفع النتيجة')}</DialogTitle>
            <DialogDescription>
              {buyMode
                ? ui('رصيد InBody في الاشتراك خلص: بتتعمل فاتورة InBody بالسعر المتحدد، والنتيجة (اختياري) بتتحفظ في ملف العضو.')
                : <>{ui('تُخصم جلسة واحدة من الاشتراك وتُحفظ النتيجة في ملف العضو معًا.')} {ui('المتبقي بعد الخصم')}: <span className="nums">{toArabicDigits(inbodyLeft - 1)}</span></>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {buyMode ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="inbody-service">{ui('الخدمة')}</Label>
                  <select id="inbody-service" value={serviceId} onChange={(event) => setServiceId(event.target.value)}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {(inbodyServices.data ?? []).map((option) => (
                      <option key={option.id} value={String(option.id)}>{option.name} — {toArabicDigits(option.price)} {ui('ج.م')}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inbody-pay">{ui('طريقة الدفع')}</Label>
                  <select id="inbody-pay" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}
                    className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    {PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{ui(label)}</option>)}
                  </select>
                </div>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="inbody-report">{ui('تقرير InBody (صورة أو PDF)')}{buyMode ? <span className="text-xs text-muted-foreground"> ({ui('اختياري')})</span> : null}</Label>
              {file ? (
                <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-sm">
                  <FileUp className="size-4 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <Button variant="ghost" size="icon" aria-label={ui('إزالة الملف')} onClick={() => setFile(null)}><X className="size-4" /></Button>
                </div>
              ) : (
                <Input id="inbody-report" type="file" accept="image/*,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {field('weight', 'الوزن', 'كجم')}
              {field('heightCm', 'الطول', 'سم')}
              {field('bodyFat', 'نسبة الدهون', '%')}
              {field('muscleMass', 'كتلة العضلات', 'كجم')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inbody-notes">{ui('ملاحظات')}</Label>
              <Textarea id="inbody-notes" rows={2} value={result.notes} onChange={(event) => setResult((current) => ({ ...current, notes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy != null || uploading} onClick={closeResult}>{ui('إلغاء')}</Button>
            <Button variant="brand" disabled={busy != null || uploading} onClick={() => void submitResult()}>
              {busy != null || uploading ? <Loader2 className="size-4 animate-spin" /> : buyMode ? <PlusCircle className="size-4" /> : <FileUp className="size-4" />}
              {buyMode ? ui('تسجيل InBody مدفوع') : ui('خصم وحفظ النتيجة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
