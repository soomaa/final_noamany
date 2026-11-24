import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/states';
import { WhatsAppIcon } from '@/components/club/whatsapp-icon';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { GYM_NAME, useWhatsAppTemplates, WHATSAPP_TEMPLATES_QUERY_KEY } from '@/hooks/use-whatsapp-templates';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  memberSubscriptionsMessage,
  mergeWhatsAppTemplates,
  SAMPLE_PACKAGE,
  SAMPLE_SUBSCRIPTION,
  packageMessage,
  subscriptionMessage,
  validWhatsAppTemplate,
  WHATSAPP_FIELD_LABELS,
  WHATSAPP_KIND_FIELDS,
  WHATSAPP_KIND_HINTS,
  WHATSAPP_KIND_LABELS,
  WHATSAPP_KINDS,
  type WhatsAppField,
  type WhatsAppKind,
  type WhatsAppTemplates,
} from '@/lib/whatsapp-message';

/** Sample operation values for kinds whose message talks about an operation, not just the subscription. */
const SAMPLE_OPERATION = {
  payment_amount: '500 ج.م',
  previous_package: 'شهر',
  refund_amount: '',
  freeze_start: '١ ديسمبر ٢٠٢٦',
  freeze_end: '١٥ ديسمبر ٢٠٢٦',
};

function preview(kind: WhatsAppKind, templates: WhatsAppTemplates): string {
  const today = localToday();
  const context = { today, gymName: GYM_NAME, extras: { invitationsLeft: 2, inbodyLeft: 1 } };
  if (kind === 'current_subscriptions' || kind === 'current_subscription_item') {
    return memberSubscriptionsMessage(
      templates,
      { name: 'أحمد', memberCode: '1024' },
      [SAMPLE_SUBSCRIPTION, { ...SAMPLE_SUBSCRIPTION, id: 2, subscriptionNumber: 'SUB-1002', subscriptionType: 'برايفت ١٢ حصة', discountValue: 0, remainingAmount: 0, paidAmount: 1200, subscriptionValue: 1200, isLinkedToSessions: true, sessionsCount: 12, sessionsUsed: 5 }],
      { today, gymName: GYM_NAME, extras: { 1: { invitationsLeft: 2, inbodyLeft: 1 } } },
    );
  }
  if (kind === 'package_details') {
    return packageMessage(templates.package_details, SAMPLE_PACKAGE, { today, gymName: GYM_NAME, memberName: 'أحمد' });
  }
  const sample = kind === 'expired'
    ? { ...SAMPLE_SUBSCRIPTION, subscriptionEndDate: '2026-11-10', status: 'expired' }
    : kind === 'expiring'
      ? { ...SAMPLE_SUBSCRIPTION, subscriptionEndDate: addDays(today, 5) }
      : SAMPLE_SUBSCRIPTION;
  return subscriptionMessage(templates[kind], sample, context, SAMPLE_OPERATION);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** إدارة الاشتراكات ← «قوالب واتساب». */
export function ClubWhatsAppTemplatesPage() {
  const query = useWhatsAppTemplates();
  const client = useQueryClient();
  const { can } = usePermission();
  const editable = can('club.subscriptions.whatsapp_templates:update') || can('club.packages.settings:update') || can('club.subscriptions:configure');
  const [draft, setDraft] = useState<WhatsAppTemplates | null>(null);
  const [kind, setKind] = useState<WhatsAppKind>('subscription');
  const [saving, setSaving] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (query.data) setDraft((current) => current ?? query.data);
  }, [query.data]);

  const valid = !!draft && WHATSAPP_KINDS.every((key) => validWhatsAppTemplate(draft[key]));
  const changed = draft && query.data ? WHATSAPP_KINDS.filter((key) => draft[key] !== query.data[key]) : [];

  const save = async () => {
    if (!draft || !valid || saving || !editable || !changed.length) return;
    setSaving(true);
    try {
      // A template equal to the default is stored as «no override» so future default edits apply.
      const templates = Object.fromEntries(changed.map((key) => [key, draft[key] === DEFAULT_WHATSAPP_TEMPLATES[key] ? null : draft[key]]));
      const { data } = await api.patch<unknown>('/club-whatsapp-templates', { templates });
      const merged = mergeWhatsAppTemplates(data);
      client.setQueryData(WHATSAPP_TEMPLATES_QUERY_KEY, merged);
      setDraft(merged);
      toast.success('تم حفظ قوالب واتساب');
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const insert = (field: WhatsAppField) => {
    if (!draft || !textarea.current) return;
    const { selectionStart: start, selectionEnd: end } = textarea.current;
    const token = `{{${field}}}`;
    setDraft({ ...draft, [kind]: draft[kind].slice(0, start) + token + draft[kind].slice(end) });
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="قوالب واتساب"
        description="جهّز رسالة لكل عملية. الرسالة بتتملي ببيانات العضو والاشتراك وبتفتح في واتساب، وانت بتدوس إرسال. أي سطر قيمته صفر أو فاضية مش بيظهر في الرسالة."
        actions={editable ? (
          <Button variant="brand" disabled={!valid || !changed.length || saving} onClick={() => void save()}>
            <Save className="size-4" />
            {saving ? 'جارٍ الحفظ…' : 'حفظ القوالب'}
          </Button>
        ) : undefined}
      />
      {query.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : query.isError ? (
        <ErrorState message={apiError(query.error)} onRetry={() => void query.refetch()} />
      ) : draft ? (
        <>
          {!editable ? (
            <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              عرض فقط — تعديل القوالب محتاج صلاحية «قوالب واتساب: تعديل».
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2" role="group" aria-label="نوع الرسالة">
            {WHATSAPP_KINDS.map((value) => (
              <Button
                key={value}
                type="button"
                variant={kind === value ? 'secondary' : 'outline'}
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={validWhatsAppTemplate(draft[value]) ? undefined : 'border-destructive text-destructive'}
              >
                {WHATSAPP_KIND_LABELS[value]}
                {draft[value] !== query.data?.[value] ? <span aria-label="معدّل" className="size-2 rounded-full bg-amber-500" /> : null}
              </Button>
            ))}
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <section className="min-w-0 space-y-4" aria-labelledby="template-label">
              <div className="space-y-1">
                <Label id="template-label" htmlFor="whatsapp-template">نص رسالة «{WHATSAPP_KIND_LABELS[kind]}»</Label>
                <p className="text-sm text-muted-foreground">{WHATSAPP_KIND_HINTS[kind]}</p>
              </div>
              <textarea
                id="whatsapp-template"
                ref={textarea}
                value={draft[kind]}
                maxLength={3000}
                disabled={!editable || saving}
                dir="auto"
                aria-invalid={!validWhatsAppTemplate(draft[kind])}
                aria-describedby="template-help"
                className="min-h-72 w-full resize-y rounded-xl border border-input bg-background p-4 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                onChange={(event) => setDraft({ ...draft, [kind]: event.target.value })}
              />
              <p id="template-help" className="text-sm text-muted-foreground">
                دوس على أي متغير يتحط مكان المؤشر. الحد الأقصى ٣٠٠٠ حرف.
              </p>
              <div className="flex flex-wrap gap-2">
                {WHATSAPP_KIND_FIELDS[kind].map((field) => (
                  <Button key={field} type="button" size="sm" variant="outline" disabled={!editable || saving} onClick={() => insert(field)}>
                    {WHATSAPP_FIELD_LABELS[field]}
                  </Button>
                ))}
              </div>
              {!validWhatsAppTemplate(draft[kind]) ? (
                <p role="alert" className="text-sm text-destructive">
                  الرسالة فاضية أو فيها متغير مش معروف أو قوس {'{ }'} زيادة. استخدم أزرار المتغيرات بس.
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                disabled={!editable || saving || draft[kind] === DEFAULT_WHATSAPP_TEMPLATES[kind]}
                onClick={() => setDraft({ ...draft, [kind]: DEFAULT_WHATSAPP_TEMPLATES[kind] })}
              >
                <RotateCcw className="size-4" />
                استعادة النص الافتراضي
              </Button>
            </section>
            <section className="min-w-0" aria-labelledby="preview-label">
              <h2 id="preview-label" className="flex items-center gap-2 font-semibold">
                <WhatsAppIcon className="size-5 text-emerald-600 dark:text-emerald-400" />
                معاينة الرسالة
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">بيانات توضيحية — بتتبدل ببيانات العضو والاشتراك وقت الإرسال.</p>
              <div dir="auto" className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-muted p-5 text-sm leading-loose">
                {validWhatsAppTemplate(draft[kind]) ? preview(kind, draft) : '—'}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
