import { useQuery } from '@tanstack/react-query';
import { Plus, Send, Trash2, Webhook } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import { uiStatic } from '@/lib/ui-static';
import { useLocale } from '@/store/locale';

interface WebhookEndpoint {
  id: number;
  name: string;
  url: string;
  events: string[];
  hasSecret: boolean;
  isActive: boolean;
  createdAt: string;
}

interface WebhookDelivery {
  id: number;
  endpointName: string;
  endpointUrl: string;
  eventType: string;
  status: string;
  attempts: number;
  responseCode: number | null;
  errorMessage: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

interface WebhookMeta {
  eventTypes: string[];
  queueBackend: 'bullmq' | 'inline';
}

const EVENT_LABELS_AR: Record<string, string> = {
  member_checked_in: uiStatic('تسجيل دخول عضو'),
  subscription_created: uiStatic('اشتراك جديد'),
  subscription_renewed: uiStatic('تجديد اشتراك'),
  subscription_payment: uiStatic('دفع اشتراك'),
  class_enrolled: uiStatic('تسجيل حصة'),
  class_waitlisted: uiStatic('قائمة انتظار حصة'),
  ping: uiStatic('اختبار'),
};

export function WebhooksSettingsPage() {
  const { ui } = useLocale();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['member_checked_in']);
  const [saving, setSaving] = useState(false);

  const { data: meta } = useQuery({
    queryKey: ['webhooks-meta'],
    queryFn: async () => (await api.get<WebhookMeta>('/webhooks/meta')).data,
  });

  const { data: endpoints, refetch: refetchEndpoints } = useQuery({
    queryKey: ['webhooks-endpoints'],
    queryFn: async () => (await api.get<WebhookEndpoint[]>('/webhooks/endpoints')).data,
  });

  const { data: deliveries, refetch: refetchDeliveries } = useQuery({
    queryKey: ['webhooks-deliveries'],
    queryFn: async () => (await api.get<WebhookDelivery[]>('/webhooks/deliveries')).data,
    refetchInterval: 15_000,
  });

  const toggleEvent = (ev: string) => {
    setSelectedEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev],
    );
  };

  const create = async () => {
    if (!name.trim() || !url.trim() || !selectedEvents.length) {
      toast.error(ui('أكمل الحقول المطلوبة'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/webhooks/endpoints', {
        name: name.trim(),
        url: url.trim(),
        events: selectedEvents,
        secret: secret.trim() || undefined,
      });
      toast.success(ui('تم إنشاء Webhook'));
      setName('');
      setUrl('');
      setSecret('');
      void refetchEndpoints();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: number, active: boolean) => {
    await api.patch(`/webhooks/endpoints/${id}/toggle`, null, { params: { active: String(active) } });
    void refetchEndpoints();
  };

  const remove = async (id: number) => {
    const ok = await confirm({ title: ui('حذف Webhook؟'), variant: 'destructive' });
    if (!ok) return;
    await api.delete(`/webhooks/endpoints/${id}`);
    toast.success(ui('تم الحذف'));
    void refetchEndpoints();
  };

  const test = async (id: number) => {
    try {
      await api.post(`/webhooks/endpoints/${id}/test`);
      toast.success(ui('تم إرسال اختبار — راجع سجل التسليم'));
      void refetchDeliveries();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const deliveryStatus = (s: string): 'active' | 'pending' | 'suspended' | 'rejected' => {
    if (s === 'delivered') return 'active';
    if (s === 'pending') return 'pending';
    if (s === 'failed') return 'rejected';
    return 'suspended';
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={ui('Webhooks')}
        description={ui('إرسال أحداث النادي إلى أنظمة خارجية عبر HTTP مع توقيع HMAC')}
      />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Webhook className="size-4" />
        <span>
          {ui('محرك الطابور')}:{' '}
          <strong>{meta?.queueBackend === 'bullmq' ? 'BullMQ + Redis' : ui('محلي (بدون Redis)')}</strong>
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ui('إضافة endpoint')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>{ui('الاسم')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Zapier / CRM" />
            </div>
            <div className="grid gap-1.5">
              <Label>URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." dir="ltr" />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label>{ui('Secret (HMAC)')}</Label>
              <Input
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={ui('اختياري — للتحقق X-Noamany-Signature')}
                dir="ltr"
                type="password"
              />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">{ui('الأحداث')}</Label>
            <div className="flex flex-wrap gap-2">
              {(meta?.eventTypes ?? []).map((ev) => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => toggleEvent(ev)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    selectedEvents.includes(ev)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {ui(EVENT_LABELS_AR[ev] ?? ev)}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={() => void create()} disabled={saving}>
            <Plus className="me-2 size-4" />
            {ui('إضافة')}
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{ui('Endpoints')}</h2>
        {!endpoints?.length ? (
          <p className="text-sm text-muted-foreground">{ui('لا توجد webhooks')}</p>
        ) : (
          <div className="grid gap-3">
            {endpoints.map((ep) => (
              <div key={ep.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{ep.name}</p>
                    <p className="truncate text-xs text-muted-foreground" dir="ltr">
                      {ep.url}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ep.events.map((e) => ui(EVENT_LABELS_AR[e] ?? e)).join(' · ')}
                      {ep.hasSecret ? ' · HMAC' : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={ep.isActive ? 'active' : 'suspended'} />
                    <Button size="sm" variant="outline" onClick={() => void test(ep.id)}>
                      <Send className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void toggle(ep.id, !ep.isActive)}
                    >
                      {ep.isActive ? ui('إيقاف') : ui('تفعيل')}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void remove(ep.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{ui('سجل التسليم')}</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-start">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">{ui('Endpoint')}</th>
                <th className="p-3">{ui('الحدث')}</th>
                <th className="p-3">{ui('الحالة')}</th>
                <th className="p-3">{ui('HTTP')}</th>
                <th className="p-3">{ui('محاولات')}</th>
              </tr>
            </thead>
            <tbody>
              {(deliveries ?? []).map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="nums p-3">{toArabicDigits(d.id)}</td>
                  <td className="p-3">{d.endpointName}</td>
                  <td className="p-3">{ui(EVENT_LABELS_AR[d.eventType] ?? d.eventType)}</td>
                  <td className="p-3">
                    <StatusBadge status={deliveryStatus(d.status)} />
                  </td>
                  <td className="nums p-3">{d.responseCode ? toArabicDigits(d.responseCode) : '—'}</td>
                  <td className="nums p-3">{toArabicDigits(d.attempts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!deliveries?.length && (
            <p className="p-4 text-center text-sm text-muted-foreground">{ui('لا توجد تسليمات بعد')}</p>
          )}
        </div>
        {(deliveries ?? []).some((d) => d.errorMessage) && (
          <p className="text-xs text-muted-foreground">
            {ui('آخر خطأ')}: {(deliveries ?? []).find((d) => d.errorMessage)?.errorMessage}
          </p>
        )}
      </section>

      <Card className="border-dashed">
        <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{ui('ترويسات التوقيع')}</p>
          <p dir="ltr">X-Noamany-Event · X-Noamany-Delivery · X-Noamany-Timestamp · X-Noamany-Signature</p>
          <p>{ui('التوقيع')}: HMAC-SHA256 {ui('على')} &quot;{'{timestamp}.{body}'}&quot;</p>
        </CardContent>
      </Card>
    </div>
  );
}
