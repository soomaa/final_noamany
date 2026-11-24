import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, TicketPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface InvitationAllowance {
  subscriptionId: number;
  allowed: number;
  used: number;
  remaining: number;
  activeToday: boolean;
}

const summaryKey = (memberId: number) => ['club-reception-invitations', memberId] as const;

/**
 * "إضافة دعوة / ضيف" under a subscription: the plan's remaining guest invitations and a
 * button that records a guest in the invitations list (the same list the app uses).
 */
export function ReceptionGuestInvitation({ memberId, subscriptionId }: { memberId: number; subscriptionId: number }) {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestHere, setGuestHere] = useState(true);
  const [saving, setSaving] = useState(false);

  // One request per member, shared by every subscription card.
  const summary = useQuery({
    queryKey: summaryKey(memberId),
    queryFn: async () => (await api.get<{ subscriptions: InvitationAllowance[] }>('/club-reception-invitations/summary', {
      params: { memberId },
    })).data,
  });
  const allowance = summary.data?.subscriptions.find((row) => row.subscriptionId === subscriptionId);
  const allowed = allowance?.allowed ?? 0;
  const remaining = allowance?.remaining ?? 0;
  const canCreate = can('club.reception:create') || can('app-management.invitations:create');

  const close = () => {
    setOpen(false);
    setGuestName('');
    setGuestPhone('');
    setGuestHere(true);
  };

  const submit = async () => {
    if (guestName.trim().length < 2) {
      toast.error(ui('اكتب اسم الضيف'));
      return;
    }
    if (!guestPhone.trim()) {
      toast.error(ui('رقم الموبايل مطلوب'));
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<{ invitationCode: string; remaining: number }>('/club-reception-invitations', {
        memberId, subscriptionId, guestName: guestName.trim(), guestPhone: guestPhone.trim(), guestHere,
      });
      toast.success(`${ui('تم تسجيل الدعوة')} ${data.invitationCode} — ${ui('الدعوات المتبقية')}: ${toArabicDigits(data.remaining)}`);
      close();
      void qc.invalidateQueries({ queryKey: summaryKey(memberId) });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  // A plan without invitations shows nothing, as it did before this box existed.
  if (summary.isSuccess && allowed < 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
      <div>
        <p className="font-semibold">{ui('إضافة دعوة / ضيف')}</p>
        <p className="nums text-sm text-muted-foreground">
          {summary.isLoading
            ? ui('جاري التحميل…')
            : summary.isError
              ? ui('تعذر تحميل الدعوات')
              : <>{ui('الدعوات المتبقية')}: <b className="text-foreground">{toArabicDigits(remaining)}</b> {ui('من')} {toArabicDigits(allowed)}</>}
        </p>
      </div>
      {summary.isError ? (
        <Button variant="outline" onClick={() => void summary.refetch()}>{ui('إعادة المحاولة')}</Button>
      ) : (
        <Button
          variant="brand"
          disabled={!canCreate || !allowance?.activeToday || remaining < 1}
          onClick={() => setOpen(true)}
        >
          <TicketPlus className="size-4" />
          {ui('إضافة دعوة / ضيف')}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(value) => { if (!value && !saving) close(); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{ui('إضافة دعوة / ضيف')}</DialogTitle>
            <DialogDescription>
              {ui('تُخصم دعوة واحدة من الاشتراك وتظهر في صفحة الدعوات.')} {ui('المتبقي بعد الإضافة')}: <span className="nums">{toArabicDigits(Math.max(0, remaining - 1))}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="guest-name">{ui('اسم الضيف')}</Label>
              <Input id="guest-name" value={guestName} autoFocus onChange={(event) => setGuestName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-phone">{ui('موبايل الضيف')}</Label>
              <Input id="guest-phone" dir="ltr" inputMode="tel" value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={guestHere} onCheckedChange={(value) => setGuestHere(value === true)} />
              {ui('الضيف موجود الآن (تسجيل حضوره)')}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={close}>{ui('إلغاء')}</Button>
            <Button variant="brand" disabled={saving} onClick={() => void submit()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <TicketPlus className="size-4" />}
              {ui('تسجيل الدعوة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
