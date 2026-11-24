import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { clubPaymentMethodsLabel } from '@/components/club/club-payment-method-select';
import { useClubT } from '@/hooks/use-club-t';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { formatMoney } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';

export interface SubscriptionPurgePreview {
  subscription: {
    id: number;
    subscriptionNumber: string;
    memberId: number | null;
    memberCode: string | null;
    customerName: string | null;
    subscriptionType: string | null;
    startDate: string;
    endDate: string;
    registrationDate: string;
    subscriptionValue: number;
    paidAmount: number;
  };
  receipts: Array<{ id: number; receiptNumber: string; amount: number; receiptDate: string; payments: Array<{ method: string; amount: number }> }>;
  totalMoney: number;
  journalEntries: number;
  revenues: number;
  refunds: number;
  refundExpenses: number;
  points: { earned: number; redeemed: number; rows: number };
  discountGrantsRestored: number;
  commissions: { trainer: number; sales: number };
  freezes: number;
  waivers: number;
  attendance: number;
  classBookings: number;
  csFeedbacks: number;
  unlinked: { inbodyInvoices: number; spaInvoices: number; staffTasks: number; csInteractions: number; onlineRequests: number };
  blockers: Array<{ code: string; message: string; count?: number }>;
  canPurge: boolean;
  canPurgeByMovingAttendance: boolean;
  moveTargets: Array<{ id: number; subscriptionNumber: string; subscriptionType: string | null; startDate: string; endDate: string; status: string }>;
}

/** «حذف (اتعمل بالغلط)» is offered only with the subscriptions delete grant. */
export function useCanPurgeSubscription() {
  const { can } = usePermission();
  return can('club.subscriptions:delete') || can('club.subscriptions.list:delete');
}

interface Props {
  subscriptionId: number | null;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful purge (queries are already invalidated). */
  onPurged?: () => void;
}

const n = (v: number) => toArabicDigits(String(v));

/**
 * Remove a subscription created by mistake, with its receipts and every money/accounting trace.
 * Two deliberate steps: the reason, then typing the subscription number.
 */
export function SubscriptionPurgeDialog({ subscriptionId, onOpenChange, onPurged }: Props) {
  const ct = useClubT();
  const qc = useQueryClient();
  const open = subscriptionId != null;
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setTyped('');
      setMoveTo('');
    }
  }, [open, subscriptionId]);

  const preview = useQuery({
    queryKey: ['club-subscriptions', 'purge-preview', subscriptionId],
    queryFn: async () => (await api.get<SubscriptionPurgePreview>(`/club-subscriptions/${subscriptionId}/purge-preview`)).data,
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });
  const p = preview.data;
  const moving = !!moveTo;
  const blockers = p ? (moving ? p.blockers.filter((b) => b.code !== 'attendance') : p.blockers) : [];
  const allowed = !!p && (p.canPurge || (moving && p.canPurgeByMovingAttendance));
  const numberMatches = !!p && typed.trim() === p.subscription.subscriptionNumber;
  const ready = allowed && reason.trim().length >= 5 && numberMatches && !saving;

  const submit = async () => {
    if (!p || !ready) return;
    setSaving(true);
    try {
      await api.delete(`/club-subscriptions/${p.subscription.id}/purge`, {
        data: { reason: reason.trim(), ...(moving ? { moveAttendanceToSubscriptionId: Number(moveTo) } : {}) },
      });
      toast.success(`اتمسح اشتراك ${p.subscription.subscriptionNumber} وكل حركاته المالية`);
      const keys = [
        ['club-subscriptions'], ['club-receipts'], ['club-private-subscriptions'],
        ['club-reception-member'], ['club-reception-profile'], ['club-members'], ['club-member'],
        ['club-universal-search'], ['me', 'workspace', 'widgets'], ['club-attendance'],
      ];
      await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
      onOpenChange(false);
      onPurged?.();
    } catch (e) {
      toast.error(apiError(e));
      void preview.refetch();
    } finally {
      setSaving(false);
    }
  };

  const lines: Array<[string, string]> = p
    ? ([
        ['قيود محاسبية', n(p.journalEntries)],
        ['إيرادات مسجلة', n(p.revenues)],
        ['نقاط مكتسبة', n(p.points.earned)],
        ['نقاط مستخدمة (هترجع للعضو)', n(p.points.redeemed)],
        ['كود خصم هيرجع للعضو', n(p.discountGrantsRestored)],
        ['عمولات مدرب', n(p.commissions.trainer)],
        ['إيقافات', n(p.freezes)],
        ['إعفاءات', n(p.waivers)],
        ['مرتجعات غير مصروفة', n(p.refunds)],
        ['حجوزات كلاسات', n(p.classBookings)],
        ['حضور', n(p.attendance)],
      ] as Array<[string, string]>).filter(([label, v]) => v !== '٠' || label === 'قيود محاسبية' || label === 'حضور')
    : [];
  const kept = p
    ? [
        p.unlinked.inbodyInvoices ? `فواتير InBody مدفوعة: ${n(p.unlinked.inbodyInvoices)}` : null,
        p.unlinked.spaInvoices ? `فواتير SPA مدفوعة: ${n(p.unlinked.spaInvoices)}` : null,
        p.unlinked.staffTasks ? `مهام: ${n(p.unlinked.staffTasks)}` : null,
        p.unlinked.csInteractions ? `متابعات خدمة عملاء: ${n(p.unlinked.csInteractions)}` : null,
      ].filter(Boolean)
    : [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3 text-start sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="size-5" /> حذف اشتراك اتعمل بالغلط
          </DialogTitle>
          <DialogDescription>
            الاشتراك هيتمسح كأنه ما حصلش: الإيصالات والفلوس والقيود المحاسبية والنقاط. الحركة دي مبترجعش.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {preview.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> بنجهز اللي هيتمسح…
            </div>
          ) : preview.isError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{apiError(preview.error)}</p>
          ) : p ? (
            <>
              <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                <p className="font-semibold">
                  اشتراك رقم <span dir="ltr" className="nums">{p.subscription.subscriptionNumber}</span>
                  {p.subscription.subscriptionType ? ` — ${p.subscription.subscriptionType}` : ''}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {p.subscription.customerName ?? '—'}
                  {p.subscription.memberCode ? <> · <span dir="ltr" className="nums">{p.subscription.memberCode}</span></> : null}
                </p>
                <p className="mt-1 nums text-muted-foreground">
                  {toArabicDigits(p.subscription.startDate)} ← {toArabicDigits(p.subscription.endDate)}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">اللي هيتمسح</p>
                {p.receipts.length ? (
                  <ul className="space-y-1.5">
                    {p.receipts.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm">
                        <span>إيصال رقم <span className="nums font-semibold">{toArabicDigits(r.receiptNumber)}</span> — <span className="nums">{toArabicDigits(r.receiptDate)}</span></span>
                        <span className="nums font-semibold">{formatMoney(r.amount)} <span className="text-xs font-normal text-muted-foreground">({clubPaymentMethodsLabel(ct, r.payments)})</span></span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">مفيش إيصالات على الاشتراك.</p>
                )}
                <div className="flex items-center justify-between rounded-lg bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
                  <span>إجمالي الفلوس اللي هتخرج من الخزنة والإيراد</span>
                  <span className="nums">{formatMoney(p.totalMoney)}</span>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {lines.map(([label, value]) => (
                    <div key={label} className="rounded-lg border px-3 py-1.5">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="nums font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
                {kept.length ? (
                  <p className="text-xs text-muted-foreground">هيفضلوا موجودين بس من غير ربط بالاشتراك: {kept.join('، ')}</p>
                ) : null}
              </div>

              {blockers.length ? (
                <div className="space-y-1.5 rounded-xl border border-destructive/50 bg-destructive/10 p-3">
                  {blockers.map((b) => (
                    <p key={b.code} className="flex items-start gap-2 text-sm font-medium text-destructive">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {b.message}
                    </p>
                  ))}
                </div>
              ) : null}

              {p.attendance > 0 && p.canPurgeByMovingAttendance ? (
                <div className="space-y-1.5">
                  <Label htmlFor="purge-move">انقل الحضور ({n(p.attendance)}) لاشتراك تاني للعضو</Label>
                  <select
                    id="purge-move"
                    value={moveTo}
                    onChange={(e) => setMoveTo(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">— متنقلش (الحذف هيفضل مقفول) —</option>
                    {p.moveTargets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.subscriptionNumber} — {t.subscriptionType ?? ''} ({t.startDate} ← {t.endDate})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {allowed ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="purge-reason">سبب الحذف <span className="text-destructive">*</span></Label>
                    <Textarea
                      id="purge-reason"
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="مثلاً: الاشتراك اتسجل مرتين بالغلط"
                    />
                    {reason.trim().length > 0 && reason.trim().length < 5 ? (
                      <p className="text-xs text-destructive">اكتب السبب بوضوح (٥ حروف على الأقل)</p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="purge-confirm">
                      للتأكيد اكتب رقم الاشتراك: <span dir="ltr" className="nums font-bold">{p.subscription.subscriptionNumber}</span>
                    </Label>
                    <Input
                      id="purge-confirm"
                      dir="ltr"
                      autoComplete="off"
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      className="nums"
                    />
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </div>

        <DialogFooter className="flex-row gap-2 border-t px-4 py-3 sm:justify-start sm:px-5">
          <Button variant="destructive" disabled={!ready} onClick={() => void submit()} className="flex-1 sm:flex-none">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            امسح الاشتراك نهائي
          </Button>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
            رجوع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
