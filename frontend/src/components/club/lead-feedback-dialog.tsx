import { useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarCheck,
  CheckCircle2,
  PhoneMissed,
  PhoneOff,
  RefreshCw,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { PermissionButton as Button } from '@/components/club/permission-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { LEAD_FEEDBACK_OPTIONS, type LeadFeedbackOption } from '@/lib/lead-feedback';

/**
 * What happened on this contact, in one tap.
 *
 * Mirrors `lead-feedback.ts` on the server, which owns the mapping from these words to
 * pipeline statuses — the rep picks an outcome and never sees the word "status". Keys must
 * stay in step with that file; the server rejects anything it does not recognise, so a
 * drift here fails loudly rather than writing a wrong status.
 */

const FEEDBACK_ICON: Record<string, { icon: LucideIcon; tone: string }> = {
  no_answer: { icon: PhoneMissed, tone: 'text-amber-600 dark:text-amber-400' },
  unreachable: { icon: PhoneOff, tone: 'text-orange-600 dark:text-orange-400' },
  follow_up: { icon: RefreshCw, tone: 'text-sky-600 dark:text-sky-400' },
  arrange_visit: { icon: CalendarCheck, tone: 'text-violet-600 dark:text-violet-400' },
  not_interested: { icon: XCircle, tone: 'text-destructive' },
  membership_done: { icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-400' },
};

export function LeadFeedbackDialog({
  leadId,
  leadName,
  open,
  onOpenChange,
  onSaved,
}: {
  leadId: number | null;
  leadName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { ui, locale } = useLocale();
  const isRtl = locale === 'ar';
  const [picked, setPicked] = useState<LeadFeedbackOption | null>(null);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPicked(null);
    setDate('');
    setNote('');
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const save = async () => {
    if (!leadId || !picked) return;
    if (picked.requiresDate && !date) {
      toast.error(ui('لازم تحدد التاريخ لهذه النتيجة'));
      return;
    }
    setSaving(true);
    try {
      await api.post(`/club-leads/${leadId}/feedback`, {
        feedback: picked.key,
        date: date || undefined,
        note: note.trim() || undefined,
      });
      toast.success(isRtl ? picked.ar : picked.en);
      close(false);
      onSaved();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {ui('نتيجة التواصل')}
            {leadName ? <span className="text-muted-foreground"> — {leadName}</span> : null}
          </DialogTitle>
        </DialogHeader>

        {/* One tap per outcome. Big targets because this is used on a phone between calls,
            and the icon carries the meaning when the label is read at a glance. */}
        <div className="grid grid-cols-2 gap-2">
          {LEAD_FEEDBACK_OPTIONS.map((o) => {
            const { icon: Icon, tone } = FEEDBACK_ICON[o.key];
            const active = picked?.key === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  setPicked(o);
                  if (!o.requiresDate) setDate('');
                }}
                className={cn(
                  'flex items-center gap-2 rounded-xl border p-3 text-start text-sm font-medium transition',
                  active ? 'border-primary bg-primary/10' : 'hover:bg-muted/60',
                )}
              >
                <Icon className={cn('size-5 shrink-0', tone)} />
                <span className="min-w-0 flex-1 truncate">{isRtl ? o.ar : o.en}</span>
              </button>
            );
          })}
        </div>

        {picked?.closes && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {isRtl
              ? 'هيختفي من قائمة المتابعة، وتلاقيه في الفلتر الخاص بيه وقت ما تحتاجه.'
              : 'It leaves the working list and stays available under its own filter.'}
          </p>
        )}

        {picked?.requiresDate && (
          <div className="grid gap-1.5">
            <Label>
              {picked.key === 'arrange_visit' ? ui('تاريخ الزيارة') : ui('تاريخ المتابعة')}
            </Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}

        {picked && (
          <div className="grid gap-1.5">
            <Label>{ui('ملاحظات (اختياري)')}</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => close(false)} disabled={saving}>
            {ui('إلغاء')}
          </Button>
          <Button onClick={() => void save()} disabled={!picked || saving}>
            {ui('حفظ')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
