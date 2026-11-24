import { Activity, FileUp, Loader2, Minus, Sparkles, X } from 'lucide-react';
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
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubMemberOverviewSubscription } from '@/types/club';

type Service = 'inbody' | 'spa';

const EMPTY_RESULT = { weight: '', heightCm: '', bodyFat: '', muscleMass: '', notes: '' };

/**
 * InBody and SPA allowances of one subscription, with their reception actions:
 * InBody can be deducted alone or deducted together with its result and report file.
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

  if (!subscription) return null;
  const inbodyTotal = subscription.inbodyCount ?? 0;
  const inbodyLeft = Math.max(0, inbodyTotal - subscription.inbodyUsed);
  const spaTotal = subscription.spaCount ?? 0;
  const spaLeft = Math.max(0, spaTotal - subscription.spaUsed);
  const usable = canUse && subscription.status === 'active';
  if (part === 'services' && inbodyTotal <= 0 && spaTotal <= 0) return null;

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
    setResult(EMPTY_RESULT);
    setFile(null);
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

      {part !== 'invitation' && inbodyTotal > 0 ? (
        compact ? (
          // Under the photo: small, the two actions side by side (client, 22 Nov).
          <div className={compactBox}>
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Activity className="size-4 text-primary" />InBody</p>
              <span className="nums rounded-full bg-background px-2 py-0.5 text-xs">{toArabicDigits(inbodyLeft)} {ui('من')} {toArabicDigits(inbodyTotal)}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-xs" disabled={!usable || inbodyLeft < 1 || busy != null} onClick={() => void deductOnly('inbody')}>
                {busy === 'inbody' && !resultOpen ? <Loader2 className="size-3.5 animate-spin" /> : <Minus className="size-3.5" />}
                {ui('خصم')}
              </Button>
              <Button size="sm" variant="brand" className="h-8 gap-1 px-2 text-xs" disabled={!usable || inbodyLeft < 1 || busy != null} onClick={() => setResultOpen(true)}>
                <FileUp className="size-3.5" />
                {ui('خصم ورفع نتيجة')}
              </Button>
            </div>
          </div>
        ) : (
      <div className={box}>
        <div>
          <p className="flex items-center gap-2 font-semibold"><Activity className="size-4 text-primary" />InBody</p>
          <p className="nums text-sm text-muted-foreground">
            {ui('المتبقي')}: <b className="text-foreground">{toArabicDigits(inbodyLeft)}</b> {ui('من')} {toArabicDigits(inbodyTotal)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!usable || inbodyLeft < 1 || busy != null} onClick={() => void deductOnly('inbody')}>
            {busy === 'inbody' && !resultOpen ? <Loader2 className="size-4 animate-spin" /> : <Minus className="size-4" />}
            {ui('خصم من الاشتراك')}
          </Button>
          <Button variant="brand" disabled={!usable || inbodyLeft < 1 || busy != null} onClick={() => setResultOpen(true)}>
            <FileUp className="size-4" />
            {ui('خصم ورفع النتيجة')}
          </Button>
        </div>
      </div>
        )
      ) : null}

      <Dialog open={resultOpen} onOpenChange={(open) => { if (!open && busy == null && !uploading) closeResult(); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{ui('خصم InBody ورفع النتيجة')}</DialogTitle>
            <DialogDescription>
              {ui('تُخصم جلسة واحدة من الاشتراك وتُحفظ النتيجة في ملف العضو معًا.')} {ui('المتبقي بعد الخصم')}: <span className="nums">{toArabicDigits(inbodyLeft - 1)}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inbody-report">{ui('تقرير InBody (صورة أو PDF)')}</Label>
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
              {busy != null || uploading ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
              {ui('خصم وحفظ النتيجة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
