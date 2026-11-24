import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Ban, Cake, CalendarClock, Check, Copy, Eye, FileText, Laptop, MessageCircle, Pause, Play, Plus, RotateCcw, Search, Send, Shuffle, Smile, Trash2, UserX, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { PermissionButton as Button } from '@/components/club/permission-button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ListPageShell } from '@/components/common/list-page-shell';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState } from '@/components/common/states';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { searchClubMembers } from '@/lib/club-member-search';
import { confirm } from '@/lib/confirm';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import type { ClubSearchHit } from '@/types/gym-ops';
import { gymTimeZone } from '@/lib/gym-locale';

// ── API shapes ──────────────────────────────────────────────────────────────

type CampaignStatus = 'ready' | 'running' | 'paused' | 'done' | 'cancelled';
type MessageStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'skipped' | 'cancelled';
type SkipReason = 'no_phone' | 'invalid_phone' | 'opted_out' | 'duplicate_phone' | 'recently_messaged' | 'not_on_whatsapp' | 'already_greeted' | 'excluded_manually';
type Source = 'expired' | 'expiring' | 'members' | 'birthdays';
type Counts = { total: number; queued: number; sending: number; sent: number; failed: number; uncertain: number; cancelled: number };
interface Campaign { id: number; name: string; branchId: number; source: string; status: CampaignStatus; createdAt: string; startedAt: string | null; finishedAt: string | null; counts: Counts }
interface Message { id: number; memberId: number | null; name: string; phone: string; body: string; status: MessageStatus; reason: string | null; sentAt: string | null }
interface TemplateField { label: string; options: string[] }
interface Template { id: number; name: string; body: string; isActive: boolean; isBirthday?: boolean; isAbsence?: boolean; addOptOutLine?: boolean; fields?: TemplateField[] }
interface AbsenceSettings { yellowDays: number; redDays: number; templateId: number | null }
interface BirthdayInfo { enabled: boolean; time: string; activeOnly: boolean; template: { id: number; name: string; body: string; addOptOutLine: boolean } | null; pairedBranchIds: number[]; today: string; ranToday: number[]; todaysCampaigns: { id: number; branchId: number; name: string; status: CampaignStatus }[] }
interface Device { id: string; branchId: number; label: string; paired: boolean; pairedAt: string | null; lastSeenAt: string | null; pairCodeActive: boolean }
interface OptOut { phone: string; key: string; reason: string | null; createdAt: string }
interface ControlInfo {
  configured: boolean;
  error?: string;
  status?: { enabled: boolean; dailyLimit: number; monthlyLimit: number; minDelaySec: number; maxDelaySec: number; sendFrom: string; sendTo: string; withinHours: boolean; usage: { today: number; month: number; failedToday: number }; lock: { label: string | null } | null };
}
interface Preview {
  total: number; sendable: number; truncated: boolean;
  excluded: Partial<Record<SkipReason, number>>;
  sample: { name: string; phone: string; body: string }[];
  recipients: { memberId: number; name: string; code: string; phone: string | null; endDate: string | null; packageName: string | null; age?: number | null; skip: SkipReason | null }[];
}

const DEFAULT_BODY = '{أهلًا|إزيك يا|مساء الخير يا} {first_name} 👋\nاشتراكك ({package}) في {branch} انتهى يوم {end_date}.\n{تحب نجددهولك؟|نجددهولك؟|نحجزلك التجديد؟} رد بـ «1» وهنكلمك 💪\n---\n{first_name} {وحشتنا|افتقدناك} في {branch} 🙌\nاشتراك {package} خلص يوم {end_date}.\nلو حابب تكمّل رد بـ «1» {ونظبطلك التجديد|ونجهزلك كل حاجة}';
const VARIABLES: { key: string; label: string }[] = [
  { key: 'first_name', label: 'الاسم الأول' },
  { key: 'name', label: 'الاسم بالكامل' },
  { key: 'end_date', label: 'تاريخ الانتهاء' },
  { key: 'days', label: 'عدد الأيام' },
  { key: 'package', label: 'الباقة' },
  { key: 'branch', label: 'الفرع' },
  { key: 'code', label: 'كود العضو' },
  { key: 'age', label: 'السن' },
  { key: 'last_visit', label: 'آخر حضور' },
];

// ── template fields (mirrors the server: wa-campaigns.utils.ts) ───────────────

const CHOICE_GROUP = /\{((?:[^{}\n]|\{\w+\})*\|(?:[^{}\n]|\{\w+\})*)\}/g;
const cleanOption = (text: string) => text.replace(/[\r\n]+/g, ' ').replace(/\|/g, '/').trim();
/** Fields → stored body: one line per field, `{a|b}` when it has several wordings. */
function fieldsToBody(fields: TemplateField[]): string {
  return fields
    .map((f) => [...new Set(f.options.map(cleanOption).filter(Boolean))])
    .filter((o) => o.length)
    .map((o) => (o.length > 1 ? `{${o.join('|')}}` : o[0]))
    .join('\n');
}
const SAMPLE_VARS: Record<string, string> = { first_name: 'أحمد', name: 'أحمد محمد', end_date: '24/11/2026', days: '7', package: 'اشتراك شهر', branch: 'الجلاء', code: 'B1234', age: '28', last_visit: '10/11/2026' };
/** One random wording with sample values, the way a member would receive it. */
function sampleMessage(body: string): string {
  const versions = body.replace(/\r\n?/g, '\n').split(/\n[ \t]*-{3,}[ \t]*(?:\n|$)/).map((v) => v.trim()).filter(Boolean);
  const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
  const text = (versions.length ? pick(versions) : body).replace(CHOICE_GROUP, (_m, inner: string) => pick(inner.split('|')).trim());
  return text.replace(/\{(\w+)\}/g, (m, key: string) => SAMPLE_VARS[key] ?? m);
}

/** The emoji people actually use in gym / club messages, grouped like WhatsApp's picker. */
const EMOJI_GROUPS: { title: string; items: string[] }[] = [
  { title: 'وشوش', items: ['😀', '😃', '😄', '😁', '😊', '🙂', '😉', '😍', '🥰', '😘', '🤩', '😎', '🤗', '🤔', '😅', '😂', '🥳', '😇', '🙏', '😢', '😮', '😴'] },
  { title: 'إيدين', items: ['👋', '👍', '👏', '🙌', '💪', '🤝', '✌️', '👌', '🤞', '👉', '👇', '☝️', '✋', '🫶'] },
  { title: 'رياضة', items: ['🏋️', '🏋️‍♀️', '🤸', '🧘', '🧘‍♀️', '🏃', '🏃‍♀️', '🚴', '🏊', '🥊', '⚽', '🏀', '🎾', '🏆', '🥇', '🎯', '⏱️', '🔥', '⚡', '💯'] },
  { title: 'احتفال وعروض', items: ['🎉', '🎊', '🎁', '🎂', '🎈', '✨', '⭐', '🌟', '💥', '🛍️', '🏷️', '💰', '💸', '🆕', '🆓', '🔔', '📣', '📢'] },
  { title: 'قلوب', items: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💕'] },
  { title: 'أكل وصحة', items: ['🥗', '🥑', '🍎', '🍌', '🥤', '💧', '🍳', '🥩', '🥛', '☕'] },
  { title: 'رموز', items: ['✅', '☑️', '❌', '⚠️', '📅', '🗓️', '⏰', '📍', '📞', '📲', '💬', '👉', '➡️', '⬅️', '🔝', '🆗'] },
];

function EmojiPicker({ onPick, inline = false }: { onPick: (emoji: string) => void; inline?: boolean }) {
  const { ui } = useLocale();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="icon" variant="ghost" permissionAction={null} onMouseDown={(e) => e.preventDefault()} className={inline ? 'h-7 w-7 rounded-full text-muted-foreground hover:text-foreground' : 'absolute bottom-2 end-2 h-8 w-8 rounded-full text-muted-foreground hover:text-foreground'} aria-label={ui('إضافة إيموجي')} title={ui('إضافة إيموجي')}>
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {EMOJI_GROUPS.map((g) => (
            <section key={g.title}>
              <p className="px-1 pb-1 text-[11px] font-semibold text-muted-foreground">{ui(g.title)}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {g.items.map((e, i) => (
                  <button key={`${e}-${i}`} type="button" className="grid h-8 w-8 place-items-center rounded-md text-xl leading-none hover:bg-muted" onClick={() => onPick(e)} aria-label={e}>{e}</button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: gymTimeZone() }).format(new Date());
const shiftIso = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function useLabels() {
  const { ui } = useLocale();
  return useMemo(() => ({
    campaign: { ready: ui('جاهزة'), running: ui('جاري الإرسال'), paused: ui('متوقفة مؤقتًا'), done: ui('انتهت'), cancelled: ui('ملغاة') } as Record<CampaignStatus, string>,
    message: { queued: ui('في الانتظار'), sending: ui('يتم الإرسال'), sent: ui('تم الإرسال'), failed: ui('فشل'), uncertain: ui('تحتاج مراجعة'), skipped: ui('مستبعدة'), cancelled: ui('ملغاة') } as Record<MessageStatus, string>,
    skip: { no_phone: ui('بدون رقم'), invalid_phone: ui('رقم غير صالح لواتساب'), opted_out: ui('طلب عدم الإرسال'), duplicate_phone: ui('رقم مكرر'), recently_messaged: ui('وصلته رسالة خلال آخر 3 أيام'), not_on_whatsapp: ui('الرقم مش على واتساب'), already_greeted: ui('اتبعتله تهنئة عيد ميلاد قبل كده'), excluded_manually: ui('مستبعد يدويًا') } as Record<SkipReason, string>,
    reason: { not_on_whatsapp: ui('الرقم غير مسجل على واتساب'), no_report: ui('الجهاز لم يبلغ بالنتيجة — راجع المحادثة'), send_timeout: ui('لم يتأكد الإرسال — راجع المحادثة'), compose_timeout: ui('تعذر فتح المحادثة'), logged_out: ui('واتساب ويب غير مسجل الدخول'), opted_out: ui('طلب عدم الإرسال'), confirmed_by_staff: ui('تم التأكيد يدويًا'), birthday_passed: ui('يوم عيد الميلاد خلص قبل الإرسال') } as Record<string, string>,
  }), [ui]);
}

const campaignBadge: Record<CampaignStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'> = { ready: 'secondary', running: 'success', paused: 'warning', done: 'default', cancelled: 'outline' };

// ── page ────────────────────────────────────────────────────────────────────

export function ClubWhatsappPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const [creating, setCreating] = useState(false);
  return (
    <ListPageShell>
      <PageHeader
        title={ui('رسائل واتساب')}
        description={ui('حملات تذكير للأعضاء تُرسل من واتساب ويب عبر إضافة كروم، رسالة رسالة وبحدود الإرسال المتفق عليها')}
        actions={can('club.whatsapp:create') ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />{ui('حملة جديدة')}</Button> : undefined}
      />
      <ControlBanner />
      <Tabs defaultValue="campaigns" className="space-y-4">
        <TabsList className="mx-auto grid h-auto w-full max-w-3xl grid-cols-2 gap-1.5 rounded-2xl p-1.5 sm:grid-cols-4">
          {([['campaigns', 'الحملات', MessageCircle], ['templates', 'القوالب', FileText], ['devices', 'أجهزة الإرسال', Laptop], ['opt-outs', 'قائمة عدم الإرسال', Ban]] as const).map(([value, label, Icon]) => (
            <TabsTrigger key={value} value={value} className="h-11 gap-2 rounded-xl text-[15px] font-semibold data-[state=active]:shadow-md"><Icon className="h-4 w-4" />{ui(label)}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="devices"><DevicesTab /></TabsContent>
        <TabsContent value="opt-outs"><OptOutsTab /></TabsContent>
      </Tabs>
      {creating && <NewCampaignDialog onClose={() => setCreating(false)} />}
    </ListPageShell>
  );
}

function useControl() {
  return useQuery({
    queryKey: ['wa-campaigns', 'control'],
    queryFn: async () => (await api.get<ControlInfo>('/wa-campaigns/control')).data,
    refetchInterval: 30_000,
  });
}

/**
 * How the daily limit spreads waiting messages over days. The limit belongs to the number, so with
 * several campaigns running this is an estimate per campaign.
 */
function dailyPlan(status: ControlInfo['status'], waiting: number) {
  if (!status || !waiting || !status.dailyLimit) return null;
  const leftToday = Math.max(0, status.dailyLimit - status.usage.today);
  if (waiting <= leftToday) return null;
  const laterDays = Math.ceil((waiting - leftToday) / status.dailyLimit);
  return { leftToday, laterDays, perDay: status.dailyLimit, waitingForTomorrow: leftToday === 0 };
}

function ControlBanner() {
  const { ui } = useLocale();
  const { data, isLoading } = useControl();
  if (isLoading || !data) return null;
  if (!data.status) {
    return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{data.configured ? ui('تعذر الاتصال بخدمة التحكم في الإرسال') : ui('خدمة التحكم في واتساب غير مضبوطة على السيرفر')}{data.error ? ` — ${data.error}` : ''}</div>;
  }
  const s = data.status;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card p-4 text-sm">
      <span className="flex items-center gap-2 font-semibold"><MessageCircle className="h-4 w-4 text-success" />{!s.enabled ? <span className="text-destructive">{ui('الإرسال موقوف من مزود الخدمة')}</span> : s.lock ? `${ui('يتم الإرسال الآن من')}: ${s.lock.label ?? ''}` : s.withinHours ? ui('جاهز للإرسال') : ui('خارج مواعيد الإرسال')}</span>
      <span>{ui('اليوم')}: <b className="tabular-nums">{s.usage.today}</b> / {s.dailyLimit}</span>
      <span>{ui('هذا الشهر')}: <b className="tabular-nums">{s.usage.month}</b> / {s.monthlyLimit}</span>
      <span className="text-muted-foreground">{ui('مواعيد الإرسال')}: <bdi>{s.sendFrom}</bdi> – <bdi>{s.sendTo}</bdi> · {ui('كل')} {s.minDelaySec}–{s.maxDelaySec} {ui('ثانية')}</span>
    </div>
  );
}

// ── campaigns ───────────────────────────────────────────────────────────────

function CampaignsTab() {
  const { ui } = useLocale();
  const labels = useLabels();
  const { can } = usePermission();
  const qc = useQueryClient();
  const { data: branches } = useBranches();
  const { data: control } = useControl();
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['wa-campaigns', 'list'],
    queryFn: async () => (await api.get<{ data: Campaign[] }>('/wa-campaigns', { params: { pageSize: 100 } })).data.data,
    refetchInterval: 10_000,
  });
  const branchName = (id: number) => branches?.find((b) => b.id === id)?.name ?? `#${id}`;
  const act = async (c: Campaign, action: 'start' | 'pause' | 'cancel' | 'retry-failed') => {
    if (action === 'cancel' && !(await confirm({ title: ui('إلغاء الحملة'), description: ui('الرسائل التي لم تُرسل بعد لن تُرسل. هل تريد المتابعة؟'), variant: 'destructive' }))) return;
    setBusy(c.id);
    try {
      const { data: res } = await api.post<{ requeued?: number }>(`/wa-campaigns/${c.id}/${action}`);
      if (action === 'retry-failed') toast.success(`${ui('تمت إعادة')} ${res.requeued ?? 0} ${ui('رسالة للانتظار')}`);
      void qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">{ui('جاري التحميل…')}</p>;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (!data?.length) return <div className="space-y-3"><BirthdayCard /><EmptyState title={ui('لا توجد حملات بعد')} description={ui('ابدأ بحملة للاشتراكات المنتهية، ثم شغّل إضافة واتساب على جهاز الفرع')} /></div>;
  return (
    <div className="space-y-3">
      <BirthdayCard />
      {data.map((c) => {
        const done = c.counts.sent + c.counts.failed + c.counts.uncertain + c.counts.cancelled;
        const pct = c.counts.total ? Math.round((done / c.counts.total) * 100) : 0;
        const plan = c.status === 'running' || c.status === 'ready' ? dailyPlan(control?.status, c.counts.queued) : null;
        return (
          <div key={c.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{c.name}</h3><Badge variant={campaignBadge[c.status]}>{labels.campaign[c.status]}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground">{branchName(c.branchId)} · {fmtTime(c.createdAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {can('club.whatsapp:update') && (c.status === 'ready' || c.status === 'paused') && <Button size="sm" disabled={busy === c.id} onClick={() => void act(c, 'start')}><Play className="h-4 w-4" />{ui('تشغيل')}</Button>}
                {can('club.whatsapp:update') && c.status === 'running' && <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => void act(c, 'pause')}><Pause className="h-4 w-4" />{ui('إيقاف مؤقت')}</Button>}
                {can('club.whatsapp:update') && c.counts.failed > 0 && c.status !== 'cancelled' && <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => void act(c, 'retry-failed')}><RotateCcw className="h-4 w-4" />{ui('إعادة الفاشلة')}</Button>}
                <Button size="sm" variant="ghost" onClick={() => setOpenId(c.id)}><Eye className="h-4 w-4" />{ui('التفاصيل')}</Button>
                {can('club.whatsapp:update') && ['ready', 'running', 'paused'].includes(c.status) && <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => void act(c, 'cancel')}><Ban className="h-4 w-4 text-destructive" /></Button>}
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} /></div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
              <span>{labels.message.sent}: <b>{c.counts.sent}</b></span>
              <span>{labels.message.queued}: <b>{c.counts.queued + c.counts.sending}</b></span>
              {c.counts.failed > 0 && <span className="text-destructive">{labels.message.failed}: <b>{c.counts.failed}</b></span>}
              {c.counts.uncertain > 0 && <span className="text-warning">{labels.message.uncertain}: <b>{c.counts.uncertain}</b></span>}
              <span className="text-muted-foreground">{ui('الإجمالي')}: {c.counts.total}</span>
            </div>
            {plan && (
              <p className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${plan.waitingForTomorrow ? 'bg-warning/10 text-warning' : 'bg-muted text-foreground'}`}>
                <CalendarClock className="h-4 w-4 shrink-0" />
                {plan.waitingForTomorrow
                  ? `${ui('خلص حد اليوم')} — ${c.counts.queued} ${ui('رسالة في انتظار الإرسال من بكرة')}${plan.laterDays > 1 ? ` (${ui('على')} ${plan.laterDays} ${ui('أيام')}، ${plan.perDay} ${ui('في اليوم')})` : ''}`
                  : `${ui('اليوم')} ${plan.leftToday} ${ui('رسالة، والباقي')} ${c.counts.queued - plan.leftToday} ${ui('على')} ${plan.laterDays} ${plan.laterDays > 1 ? ui('أيام') : ui('يوم')} (${plan.perDay} ${ui('في اليوم')})`}
              </p>
            )}
          </div>
        );
      })}
      {openId !== null && <CampaignDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function CampaignDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { ui } = useLocale();
  const labels = useLabels();
  const { can } = usePermission();
  const qc = useQueryClient();
  const [status, setStatus] = useState<MessageStatus | ''>('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['wa-campaigns', 'messages', id, status, page],
    queryFn: async () => (await api.get<{ data: Message[]; total: number }>(`/wa-campaigns/${id}/messages`, { params: { status: status || undefined, page, pageSize: 50 } })).data,
    refetchInterval: 10_000,
  });
  const resolve = async (m: Message, action: 'requeue' | 'mark-sent') => {
    try {
      await api.post(`/wa-campaigns/messages/${m.id}/${action}`);
      void qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const filters: (MessageStatus | '')[] = ['', 'queued', 'sent', 'failed', 'uncertain', 'cancelled'];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{ui('رسائل الحملة')}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => <Button key={f || 'all'} size="sm" variant={status === f ? 'default' : 'outline'} onClick={() => { setStatus(f); setPage(1); }}>{f ? labels.message[f] : ui('الكل')}</Button>)}
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">{ui('جاري التحميل…')}</p> : isError ? <ErrorState onRetry={() => void refetch()} inline /> : (
          <div className="max-h-[60vh] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="p-2 text-start">{ui('العضو')}</th><th className="p-2 text-start">{ui('الرقم')}</th><th className="p-2 text-start">{ui('الحالة')}</th><th className="p-2 text-start">{ui('الوقت')}</th><th className="p-2" /></tr></thead>
              <tbody>
                {data?.data.map((m) => (
                  <tr key={m.id} className="border-t align-top">
                    <td className="p-2"><div className="font-medium">{m.name}</div><details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{ui('نص الرسالة')}</summary><p className="whitespace-pre-wrap pt-1">{m.body}</p></details></td>
                    <td className="p-2" dir="ltr">{m.phone}</td>
                    <td className="p-2"><div>{labels.message[m.status]}</div>{m.reason && <div className="text-xs text-muted-foreground">{labels.reason[m.reason] ?? m.reason}</div>}</td>
                    <td className="p-2 text-xs">{fmtTime(m.sentAt)}</td>
                    <td className="p-2">{can('club.whatsapp:update') && (m.status === 'uncertain' || m.status === 'failed') && <div className="flex flex-col gap-1">
                      <Button size="sm" variant="outline" onClick={() => void resolve(m, 'requeue')}>{ui('إعادة الإرسال')}</Button>
                      {m.status === 'uncertain' && <Button size="sm" variant="ghost" onClick={() => void resolve(m, 'mark-sent')}>{ui('وصلت بالفعل')}</Button>}
                    </div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.data.length && <p className="p-6 text-center text-sm text-muted-foreground">{ui('لا توجد رسائل')}</p>}
          </div>
        )}
        <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">{ui('الإجمالي')}: {data?.total ?? 0}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{ui('السابق')}</Button>
            <Button size="sm" variant="outline" disabled={!data || page * 50 >= data.total} onClick={() => setPage((p) => p + 1)}>{ui('التالي')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Per template: add the automatic «ابعت إيقاف» line at the end of every message (on by default). */
function OptOutLineToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { ui } = useLocale();
  return (
    <div className="grid gap-1">
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />{ui('إضافة سطر «لو مش حابب توصلك رسايل ابعت إيقاف» في آخر الرسالة')}</label>
      {!checked && <p className="text-xs text-warning">{ui('من غير السطر ده خطر حظر رقم الجيم من واتساب بيزيد شوية — الأفضل يفضل في رسايل التذكير والحملات الكبيرة.')}</p>}
    </div>
  );
}

/**
 * The template as fields: each line of the message is one field (التحية، الرسالة، الختام…), and a
 * field can have several wordings — every member gets one of them, so messages don't look copied.
 */
function FieldsEditor({ fields, onChange }: { fields: TemplateField[]; onChange: (f: TemplateField[]) => void }) {
  const { ui } = useLocale();
  const [focus, setFocus] = useState<{ field: number; option: number; el: HTMLInputElement } | null>(null);
  const [seed, setSeed] = useState(0);
  const body = fieldsToBody(fields);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sample = useMemo(() => (body ? sampleMessage(body) : ''), [body, seed]);
  const update = (i: number, field: TemplateField) => onChange(fields.map((f, k) => (k === i ? field : f)));
  const move = (i: number, by: number) => {
    const next = [...fields];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item);
    onChange(next);
  };
  const insert = (token: string) => {
    if (!focus) return void toast.info(ui('اضغط جوه الخانة اللي عايز تضيف فيها الأول'));
    const field = fields[focus.field];
    const value = field.options[focus.option] ?? '';
    const start = focus.el.selectionStart ?? value.length;
    const end = focus.el.selectionEnd ?? value.length;
    update(focus.field, { ...field, options: field.options.map((o, k) => (k === focus.option ? value.slice(0, start) + token + value.slice(end) : o)) });
    requestAnimationFrame(() => { focus.el.focus(); focus.el.setSelectionRange(start + token.length, start + token.length); });
  };
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/50 p-2">
        <span className="text-xs text-muted-foreground">{ui('أضف في الخانة اللي واقف فيها')}:</span>
        {VARIABLES.map((v) => <Button key={v.key} type="button" size="sm" variant="outline" className="h-7 text-xs" permissionAction={null} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(`{${v.key}}`)}>+ {ui(v.label)}</Button>)}
        <EmojiPicker inline onPick={insert} />
      </div>
      {fields.map((field, i) => (
        <div key={i} className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
            <Input className="h-8 max-w-48 font-semibold" value={field.label} maxLength={60} placeholder={ui('اسم السطر (مثلاً: التحية)')} onChange={(e) => update(i, { ...field, label: e.target.value })} />
            <div className="ms-auto flex gap-0.5">
              <Button type="button" size="icon" variant="ghost" className="size-7" permissionAction={null} disabled={i === 0} aria-label={ui('لفوق')} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
              <Button type="button" size="icon" variant="ghost" className="size-7" permissionAction={null} disabled={i === fields.length - 1} aria-label={ui('لتحت')} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
              <Button type="button" size="icon" variant="ghost" className="size-7" permissionAction={null} disabled={fields.length < 2} aria-label={ui('مسح السطر')} onClick={() => onChange(fields.filter((_, k) => k !== i))}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            {field.options.map((option, k) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{k === 0 ? ui('الصيغة') : ui('أو')}</span>
                <Input
                  value={option}
                  maxLength={500}
                  placeholder={k === 0 ? ui('اكتب السطر هنا') : ui('صيغة تانية لنفس السطر')}
                  onFocus={(e) => setFocus({ field: i, option: k, el: e.currentTarget })}
                  onChange={(e) => update(i, { ...field, options: field.options.map((o, j) => (j === k ? e.target.value : o)) })}
                />
                <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" permissionAction={null} disabled={field.options.length < 2} aria-label={ui('مسح الصيغة')} onClick={() => update(i, { ...field, options: field.options.filter((_, j) => j !== k) })}><X className="size-4" /></Button>
              </div>
            ))}
            {field.options.length < 8 && <Button type="button" size="sm" variant="ghost" className="h-7 justify-self-start text-xs" permissionAction={null} onClick={() => update(i, { ...field, options: [...field.options, ''] })}><Plus className="size-3.5" />{ui('صيغة تانية للسطر ده')}</Button>}
          </div>
        </div>
      ))}
      {fields.length < 12 && <Button type="button" variant="outline" permissionAction={null} onClick={() => onChange([...fields, { label: '', options: [''] }])}><Plus className="size-4" />{ui('سطر جديد')}</Button>}
      {body && (
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">{ui('شكل الرسالة (مثال)')}</span>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" permissionAction={null} onClick={() => setSeed((n) => n + 1)}><Shuffle className="size-3.5" />{ui('مثال تاني')}</Button>
          </div>
          <div className="whitespace-pre-wrap rounded-lg rounded-tl-none bg-[#d9fdd3] p-3 text-sm text-[#111b21] shadow-sm">{sample}</div>
          <p className="text-[11px] text-muted-foreground">{ui('كل عضو بتوصله صيغة واحدة من كل سطر بشكل عشوائي، فالرسايل ماتبقاش نسخة واحدة.')}</p>
        </div>
      )}
    </div>
  );
}

const fieldsValid = (fields: TemplateField[]) => fields.some((f) => f.options.some((o) => o.trim()));

// ── birthdays ───────────────────────────────────────────────────────────────

/** Daily birthday greetings: on/off, time, «only current subscribers», the greeting text, and «send today's now». */
function BirthdayCard() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const { data: branches } = useBranches();
  const [busy, setBusy] = useState<'save' | 'run' | null>(null);
  const [editing, setEditing] = useState<TemplateField[] | null>(null);
  const [optOutLine, setOptOutLine] = useState(true);
  const { data: templates } = useTemplates();
  const birthdayTemplate = templates?.find((t) => t.isBirthday);
  const { data } = useQuery({ queryKey: ['wa-campaigns', 'birthdays'], queryFn: async () => (await api.get<BirthdayInfo>('/wa-campaigns/birthdays')).data });
  if (!data) return null;
  const canConfigure = can('club.whatsapp:configure');
  const branchName = (id: number) => branches?.find((b) => b.id === id)?.name ?? `#${id}`;
  const save = async (patch: Partial<{ enabled: boolean; time: string; activeOnly: boolean }>) => {
    setBusy('save');
    try {
      qc.setQueryData(['wa-campaigns', 'birthdays'], (await api.patch<BirthdayInfo>('/wa-campaigns/birthdays', patch)).data);
      toast.success(ui('تم الحفظ'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(null);
    }
  };
  const saveText = async () => {
    if (!data.template || !editing || !fieldsValid(editing)) return;
    const fields = editing.map((f) => ({ label: f.label.trim(), options: f.options.map((o) => o.trim()).filter(Boolean) })).filter((f) => f.options.length);
    setBusy('save');
    try {
      await api.patch(`/wa-campaigns/templates/${data.template.id}`, { name: data.template.name, body: fieldsToBody(fields), fields, isActive: true, addOptOutLine: optOutLine });
      toast.success(ui('تم حفظ نص التهنئة'));
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(null);
    }
  };
  const runNow = async () => {
    setBusy('run');
    try {
      const { data: res } = await api.post<{ branches: { branchId: number; queued: number }[] }>('/wa-campaigns/birthdays/run');
      const queued = res.branches.reduce((n, b) => n + b.queued, 0);
      toast.success(res.branches.length ? `${ui('تم تجهيز التهنئة')}: ${queued} ${ui('رسالة')}` : ui('تهنئة النهارده اتعملت قبل كده لكل الفروع'));
      void qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(null);
    }
  };
  const todays = data.todaysCampaigns;
  const waiting = data.pairedBranchIds.filter((id) => !data.ranToday.includes(id));
  return (
    <div className="rounded-xl border border-pink-200 bg-pink-50/40 p-4 dark:border-pink-900/50 dark:bg-pink-950/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pink-100 text-pink-600 dark:bg-pink-900/40"><Cake className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h3 className="font-semibold">{ui('تهنئة أعياد الميلاد التلقائية')}</h3>
            <p className="text-xs text-muted-foreground">{ui('كل يوم في الميعاد ده بتتعمل حملة تهنئة لكل فرع عنده جهاز إرسال مربوط، والإضافة بتبعتها وهي مفتوحة. اللي مااتبعتش لحد آخر اليوم بيتلغي.')}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={data.enabled} disabled={!canConfigure || busy !== null} onCheckedChange={(v) => void save({ enabled: v })} aria-label={ui('تشغيل التهنئة التلقائية')} />
          {data.enabled ? ui('شغالة') : ui('مقفولة')}
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">{ui('الساعة')}
          <Input type="time" dir="ltr" className="h-9 w-32" key={data.time} defaultValue={data.time} disabled={!canConfigure || busy !== null} onBlur={(e) => { if (/^\d{2}:\d{2}$/.test(e.target.value) && e.target.value !== data.time) void save({ time: e.target.value }); }} />
        </label>
        <label className="flex items-center gap-2"><Checkbox checked={data.activeOnly} disabled={!canConfigure || busy !== null} onCheckedChange={(v) => void save({ activeOnly: v === true })} />{ui('المشتركين حاليًا بس')}</label>
        {canConfigure && data.template && <Button size="sm" variant="outline" permissionAction="configure" onClick={() => { setEditing(birthdayTemplate?.fields?.length ? birthdayTemplate.fields : [{ label: '', options: [data.template!.body] }]); setOptOutLine(data.template!.addOptOutLine); }}>{ui('تعديل نص التهنئة')}</Button>}
        {canConfigure && <Button size="sm" permissionAction="configure" disabled={busy !== null || !data.pairedBranchIds.length} onClick={() => void runNow()}><Send className="h-4 w-4" />{busy === 'run' ? ui('جاري التجهيز…') : ui('ابعت تهنئة النهارده دلوقتي')}</Button>}
      </div>
      <div className="mt-2 space-y-1 text-xs">
        {!data.pairedBranchIds.length
          ? <p className="text-warning">{ui('مفيش جهاز إرسال مربوط — اربط الإضافة من تاب «أجهزة الإرسال» علشان التهنئة تتبعت.')}</p>
          : <p className="text-muted-foreground">{ui('الفروع اللي هتتبعتلها')}: {data.pairedBranchIds.map(branchName).join('، ')}{waiting.length && data.enabled ? ` · ${ui('النهارده الساعة')} ${data.time}` : ''}</p>}
        {todays.length > 0 && <p className="text-success">{ui('النهارده')}: {todays.map((c) => branchName(c.branchId)).join('، ')}</p>}
      </div>
      {data.template && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">{ui('مثال للتهنئة')} — {data.template.name}</summary>
          <p className="mt-1 whitespace-pre-wrap rounded-lg rounded-tl-none bg-[#d9fdd3] p-3 text-sm text-[#111b21]">{sampleMessage(data.template.body)}</p>
        </details>
      )}
      {editing !== null && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent size="lg" className="max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{ui('نص تهنئة عيد الميلاد')}</DialogTitle>
              <DialogDescription>{ui('كل سطر في خانة، ولكل سطر ممكن تكتب أكتر من صيغة — كل عضو بتوصله صيغة منهم.')}</DialogDescription>
            </DialogHeader>
            <FieldsEditor fields={editing} onChange={setEditing} />
            <OptOutLineToggle checked={optOutLine} onChange={setOptOutLine} />
            <DialogFooter>
              <Button variant="outline" permissionAction={null} onClick={() => setEditing(null)}>{ui('إلغاء')}</Button>
              <Button permissionAction="configure" disabled={busy !== null || !fieldsValid(editing)} onClick={() => void saveText()}>{busy === 'save' ? ui('جاري الحفظ…') : ui('حفظ')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── new campaign ────────────────────────────────────────────────────────────

/** Mirrors the server: a line holding only `---` separates versions of the same message. */
const versionCount = (body: string) => body.replace(/\r\n?/g, '\n').split(/\n[ \t]*-{3,}[ \t]*(?:\n|$)/).filter((p) => p.trim()).length;
const hasLink = (body: string) => /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|eg|me|app|link|ly)\b/i.test(body);

function BodyEditor({ value, onChange, optOutLine = true }: { value: string; onChange: (v: string) => void; optOutLine?: boolean }) {
  const { ui } = useLocale();
  const versions = versionCount(value);
  const choices = (value.match(CHOICE_GROUP) ?? []).length;
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  const insert = (key: string) => insertText(`{${key}}`);
  const insertText = (token: string) => {
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + token.length, start + token.length); });
  };
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Textarea ref={setEl} rows={7} value={value} onChange={(e) => onChange(e.target.value)} maxLength={4000} className="pb-10" />
        <EmojiPicker onPick={insertText} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {VARIABLES.map((v) => <Button key={v.key} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => insert(v.key)}>+ {ui(v.label)}</Button>)}
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange(`${value.trimEnd()}\n---\n`)}>+ {ui('صيغة تانية للرسالة')}</Button>
      </div>
      <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
        <p>
          {ui('كل عضو بتوصله صيغة مختلفة علشان الرسايل تبان طبيعية.')}{' '}
          <b className="text-foreground">{versions} {ui('صيغة')}</b>{choices > 0 && <> · <b className="text-foreground">{choices} {ui('اختيارات للكلمات')}</b></>}
        </p>
        <p>{ui('افصل بين الصيغ بسطر فيه --- بس، ولتنويع كلمة اكتب الاختيارات كده:')} <bdi dir="rtl" className="font-mono">{'{أهلًا|إزيك|مساء الخير}'}</bdi></p>
        <p>{optOutLine ? ui('هيتضاف تلقائيًا سطر قصير «لو مش حابب توصلك رسايل ابعت إيقاف»، واللي يرد بإيقاف بيتشال من الإرسال.') : ui('الرسالة هتتبعت من غير سطر «ابعت إيقاف» (اختيار القالب). اللي يرد بإيقاف لسه بيتشال من الإرسال.')}</p>
      </div>
      {versions < 2 && <p className="text-xs text-warning">{ui('الأفضل تكتب صيغتين أو تلاتة للرسالة — نفس النص لكل الأعضاء بيرفع احتمال حظر الرقم.')}</p>}
      {hasLink(value) && <p role="alert" className="text-xs text-warning">{ui('بلاش لينكات في أول رسالة — اللينك لحد مكلمكش قبل كده من أقوى علامات السبام. ابعته بعد ما العضو يرد.')}</p>}
    </div>
  );
}

function NewCampaignDialog({ onClose }: { onClose: () => void }) {
  const { ui } = useLocale();
  const labels = useLabels();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const { data: branches } = useBranches();
  const { data: control } = useControl();
  const { data: templates } = useTemplates();
  const today = todayIso();
  const [name, setName] = useState(`${ui('تذكير تجديد')} ${today}`);
  const [branchId, setBranchId] = useState<number>(user?.branch || 0);
  const [source, setSource] = useState<Source>('expired');
  const [activeOnly, setActiveOnly] = useState(false);
  const [expiredFrom, setExpiredFrom] = useState(shiftIso(today, -30));
  const [expiredTo, setExpiredTo] = useState(shiftIso(today, -1));
  const [withinDays, setWithinDays] = useState('7');
  const [gender, setGender] = useState<'' | 'male' | 'female'>('');
  const [members, setMembers] = useState<ClubSearchHit[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState<'preview' | 'create' | null>(null);
  const [startNow, setStartNow] = useState(true);

  useEffect(() => { if (!branchId && branches?.length) setBranchId(branches[0].id); }, [branches, branchId]);
  // Any change to the audience or text makes the shown preview stale.
  useEffect(() => { setPreview(null); }, [branchId, source, expiredFrom, expiredTo, withinDays, gender, members, body, activeOnly, templateId]);
  useEffect(() => { setExcluded(new Set()); }, [branchId, source]);

  const audience = () => ({
    branchId, source, body, templateId: templateId ?? undefined,
    ...(source === 'expired' ? { expiredFrom, expiredTo } : {}),
    ...(source === 'expiring' ? { withinDays: Number(withinDays) || 0 } : {}),
    ...(source === 'members' ? { memberIds: members.map((m) => m.id) } : {}),
    ...(source === 'birthdays' ? { activeOnly } : {}),
    ...(gender ? { gender } : {}),
    excludeMemberIds: [...excluded],
  });
  const runPreview = async () => {
    setLoading('preview');
    try {
      setPreview((await api.post<Preview>('/wa-campaigns/preview', audience())).data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(null);
    }
  };
  const pickSource = (next: Source) => {
    setSource(next);
    // Birthdays start from the birthday template and a fitting campaign name.
    const birthdayTemplate = templates?.find((t) => t.isBirthday);
    if (next === 'birthdays' && birthdayTemplate) { setTemplateId(birthdayTemplate.id); setBody(birthdayTemplate.body); setName(`${ui('تهنئة أعياد الميلاد')} ${today}`); }
    else if (source === 'birthdays') { setTemplateId(null); setBody(DEFAULT_BODY); setName(`${ui('تذكير تجديد')} ${today}`); }
  };
  const toggleExcluded = (memberId: number) => {
    setExcluded((prev) => { const next = new Set(prev); if (next.has(memberId)) next.delete(memberId); else next.add(memberId); return next; });
  };
  // The server's count, adjusted for rows ticked or unticked since that preview ran.
  const sendable = preview
    ? preview.sendable
      - preview.recipients.filter((r) => !r.skip && excluded.has(r.memberId)).length
      + preview.recipients.filter((r) => r.skip === 'excluded_manually' && !excluded.has(r.memberId)).length
    : 0;
  const create = async () => {
    setLoading('create');
    try {
      const { data } = await api.post<{ queued: number; skipped: number }>('/wa-campaigns', { ...audience(), name: name.trim(), start: startNow });
      toast.success(`${ui('تم إنشاء الحملة')}: ${data.queued} ${ui('رسالة')}`);
      void qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="form">
        <DialogHeader>
          <DialogTitle>{ui('حملة واتساب جديدة')}</DialogTitle>
          <DialogDescription>{ui('اختر الأعضاء ونص الرسالة، راجع المعاينة، ثم شغّل الحملة')}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[70vh] gap-5 overflow-y-auto px-1 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <div className="grid gap-2"><Label>{ui('اسم الحملة')}</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} /></div>
            <div className="grid gap-2">
              <Label>{ui('الفرع')}</Label>
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={branchId} onChange={(e) => { setBranchId(Number(e.target.value)); setMembers([]); }}>
                {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name ?? `#${b.id}`}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ui('من سيستلم الرسالة؟')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {([['expired', 'اشتراكات منتهية'], ['expiring', 'تنتهي قريبًا'], ['members', 'أعضاء محددون'], ['birthdays', 'أعياد ميلاد النهارده']] as const).map(([key, label]) => (
                  <Button key={key} type="button" variant={source === key ? 'default' : 'outline'} onClick={() => pickSource(key)}>{key === 'birthdays' && <Cake className="h-4 w-4" />}{ui(label)}</Button>
                ))}
              </div>
            </div>
            {source === 'expired' && (
              <div className="grid gap-2">
                <Label>{ui('انتهى الاشتراك في الفترة')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" dir="ltr" value={expiredFrom} max={expiredTo} onChange={(e) => setExpiredFrom(e.target.value)} />
                  <Input type="date" dir="ltr" value={expiredTo} max={shiftIso(today, -1)} onChange={(e) => setExpiredTo(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[[1, 'أمس'], [7, 'آخر 7 أيام'], [30, 'آخر 30 يوم'], [90, 'آخر 3 شهور'], [36500, 'كل المنتهية']].map(([days, label]) => (
                    <Button key={days} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setExpiredFrom(shiftIso(today, -Number(days))); setExpiredTo(shiftIso(today, -1)); }}>{ui(String(label))}</Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{ui('الأعضاء الذين جددوا أو لديهم اشتراك أحدث لا يظهرون')}</p>
              </div>
            )}
            {source === 'expiring' && (
              <div className="grid gap-2"><Label>{ui('ينتهي خلال (يوم)')}</Label><Input type="number" dir="ltr" min={0} max={90} value={withinDays} onChange={(e) => setWithinDays(e.target.value)} /></div>
            )}
            {source === 'members' && <MemberPicker branchId={branchId} members={members} onChange={setMembers} />}
            {source === 'birthdays' && (
              <div className="grid gap-2">
                <p className="text-xs text-muted-foreground">{ui('الأعضاء اللي عيد ميلادهم النهارده في الفرع ده (حسب تاريخ الميلاد في ملف العضو). اللي اتبعتله تهنئة قبل كده مش هيتبعتله تاني، ورسايل التذكير مش بتمنع التهنئة.')}</p>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={activeOnly} onCheckedChange={(v) => setActiveOnly(v === true)} />{ui('المشتركين حاليًا بس')}</label>
              </div>
            )}
            {source !== 'members' && (
              <div className="grid gap-2">
                <Label>{ui('النوع')}</Label>
                <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
                  <option value="">{ui('الكل')}</option><option value="male">{ui('رجال')}</option><option value="female">{ui('سيدات')}</option>
                </select>
              </div>
            )}
          </div>
          <div className="grid content-start gap-4">
            <div className="grid gap-2">
              <Label>{ui('القالب')}</Label>
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={templateId ?? ''} onChange={(e) => { const t = templates?.find((x) => x.id === Number(e.target.value)); setTemplateId(t?.id ?? null); if (t) setBody(t.body); }}>
                <option value="">{ui('بدون قالب — نص مخصص')}</option>
                {(templates ?? []).filter((t) => t.isActive).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {templateId ? (
              <div className="grid gap-2">
                <Label>{ui('شكل الرسالة (مثال)')}</Label>
                <div className="whitespace-pre-wrap rounded-lg rounded-tl-none bg-[#d9fdd3] p-3 text-sm text-[#111b21] shadow-sm">{sampleMessage(body)}</div>
                <p className="text-xs text-muted-foreground">{ui('النص من القالب — لتعديله افتح تاب «القوالب». المعاينة بتوريك الرسايل الحقيقية بأسماء الأعضاء.')}</p>
              </div>
            ) : (
              <div className="grid gap-2"><Label>{ui('نص الرسالة')}</Label><BodyEditor value={body} onChange={setBody} /></div>
            )}
          </div>
        </div>

        {preview && (
          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>{ui('سيتم الإرسال إلى')}: <b className="tabular-nums text-success">{sendable}</b></span>
              <span className="text-muted-foreground">{ui('من أصل')} {preview.total}</span>
              {Object.entries(preview.excluded).map(([reason, n]) => <span key={reason} className="text-muted-foreground">{labels.skip[reason as SkipReason]}: {n}</span>)}
              {preview.truncated && <span className="text-warning">{ui('تم الاكتفاء بأول 5000 عضو')}</span>}
            </div>
            <SplitNote status={control?.status} sendable={sendable} />
            {preview.sample.length > 0 && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {preview.sample.map((s, i) => <div key={i} className="whitespace-pre-wrap rounded-lg rounded-tl-none bg-[#d9fdd3] p-3 text-sm text-[#111b21] shadow-sm">
                <div className="mb-1 text-[11px] text-[#667781]">{s.name}</div>{s.body}
              </div>)}
            </div>}
            <div className="max-h-64 overflow-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-muted-foreground"><tr><th className="w-10 p-2" /><th className="p-2 text-start">{ui('العضو')}</th><th className="p-2 text-start">{ui('الرقم')}</th><th className="p-2 text-start">{source === 'birthdays' ? ui('السن') : ui('الانتهاء')}</th><th className="p-2 text-start">{ui('ملاحظة')}</th></tr></thead>
                <tbody>{preview.recipients.map((r) => {
                  const off = !!r.skip || excluded.has(r.memberId);
                  return (
                    <tr key={r.memberId} className={off ? 'border-t text-muted-foreground' : 'border-t'}>
                      <td className="p-2">{r.skip && r.skip !== 'excluded_manually' ? null : <Checkbox checked={!off} onCheckedChange={() => toggleExcluded(r.memberId)} aria-label={r.name} />}</td>
                      <td className="p-2">{r.name} <span className="text-xs text-muted-foreground">#{r.code}</span></td>
                      <td className="p-2" dir="ltr">{r.phone ?? '—'}</td>
                      <td className="p-2" dir="ltr">{source === 'birthdays' ? (r.age ?? '—') : (r.endDate ?? '—')}</td>
                      <td className="p-2 text-xs">{r.skip ? labels.skip[r.skip] : excluded.has(r.memberId) ? labels.skip.excluded_manually : ''}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap items-center gap-3 sm:justify-between">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={startNow} onCheckedChange={(v) => setStartNow(v === true)} />{ui('ابدأ الإرسال فورًا')}</label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{ui('إلغاء')}</Button>
            <Button variant="outline" disabled={loading !== null || !branchId || !body.trim() || (source === 'members' && !members.length)} onClick={() => void runPreview()}><Eye className="h-4 w-4" />{loading === 'preview' ? ui('جاري التجهيز…') : ui('معاينة')}</Button>
            <Button permissionAction="create" disabled={loading !== null || !preview || !sendable || !name.trim()} onClick={() => void create()}>{loading === 'create' ? ui('جاري الإنشاء…') : `${ui('إنشاء الحملة')} (${sendable})`}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberPicker({ branchId, members, onChange }: { branchId: number; members: ClubSearchHit[]; onChange: (m: ClubSearchHit[]) => void }) {
  const { ui } = useLocale();
  const [q, setQ] = useState('');
  const { data: hits } = useQuery({
    queryKey: ['wa-campaigns', 'member-search', branchId, q.trim()],
    queryFn: async () => (await searchClubMembers(q, branchId)).hits as unknown as ClubSearchHit[],
    enabled: q.trim().length >= 2,
  });
  return (
    <div className="grid gap-2">
      <Label>{ui('الأعضاء')}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="ps-9" placeholder={ui('ابحث بالاسم أو الكود أو الموبايل')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!!hits?.length && q.trim().length >= 2 && (
        <div className="rounded-lg border bg-card">
          {hits.map((h) => (
            <button key={h.id} type="button" className="flex w-full items-center justify-between gap-3 border-b p-2 text-start text-sm last:border-0 hover:bg-muted disabled:opacity-50" disabled={members.some((m) => m.id === h.id)} onClick={() => { onChange([...members, h]); setQ(''); }}>
              <span>{h.name} <span className="text-xs text-muted-foreground">#{h.memberCode}</span></span><span dir="ltr" className="text-xs">{h.phone ?? '—'}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <Badge key={m.id} variant="secondary" className="gap-1">{m.name}<button type="button" aria-label={ui('إزالة')} onClick={() => onChange(members.filter((x) => x.id !== m.id))}><X className="h-3 w-3" /></button></Badge>
        ))}
      </div>
    </div>
  );
}

/** A big audience is not refused: the daily limit splits it over days. Say so before creating. */
function SplitNote({ status, sendable }: { status: ControlInfo['status']; sendable: number }) {
  const { ui } = useLocale();
  const plan = dailyPlan(status, sendable);
  if (!status || !plan) return null;
  const monthLeft = Math.max(0, status.monthlyLimit - status.usage.month);
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div>
        <p>{ui('الحملة هتتقسم على الأيام حسب الحد اليومي')} ({plan.perDay} {ui('رسالة في اليوم')}): {ui('اليوم')} <b>{plan.leftToday}</b>{ui('، والباقي')} <b>{sendable - plan.leftToday}</b> {ui('على')} <b>{plan.laterDays}</b> {plan.laterDays > 1 ? ui('أيام') : ui('يوم')}.</p>
        <p className="text-xs text-muted-foreground">{ui('الإضافة بتكمل لوحدها كل يوم طول ما الجهاز وواتساب ويب مفتوحين.')}</p>
        {sendable > monthLeft && <p className="mt-1 text-xs text-destructive">{ui('المتبقي من حد الشهر')} {monthLeft} {ui('رسالة فقط — الباقي هيستنى الشهر الجاي أو زيادة الحد.')}</p>}
      </div>
    </div>
  );
}

function CopyButton({ text, label, small }: { text: string; label: string; small?: boolean }) {
  const { ui } = useLocale();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(ui('تم النسخ'));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(ui('تعذر النسخ — انسخه يدويًا'));
    }
  };
  const Icon = copied ? Check : Copy;
  return (
    <Button type="button" size="icon" variant="ghost" className={small ? 'h-7 w-7' : 'h-10 w-10'} aria-label={label} title={label} onClick={() => void copy()}>
      <Icon className={small ? 'h-3.5 w-3.5' : 'h-5 w-5'} />
    </Button>
  );
}

// ── templates ───────────────────────────────────────────────────────────────

function TemplatesTab() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, isLoading, isError, refetch } = useTemplates();
  const save = async () => {
    const fields = (editing?.fields ?? []).map((f) => ({ label: f.label.trim(), options: f.options.map((o) => o.trim()).filter(Boolean) })).filter((f) => f.options.length);
    if (!editing?.name?.trim() || !fields.length) return void toast.error(ui('اسم القالب وسطر واحد على الأقل مطلوبين'));
    setSaving(true);
    try {
      const body = { name: editing.name.trim(), body: fieldsToBody(fields), fields, isActive: editing.isActive ?? true, addOptOutLine: editing.addOptOutLine ?? true };
      if (editing.id) await api.patch(`/wa-campaigns/templates/${editing.id}`, body);
      else await api.post('/wa-campaigns/templates', body);
      toast.success(ui('تم الحفظ'));
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };
  const remove = async (t: Template) => {
    if (!(await confirm({ title: ui('حذف القالب'), description: t.name, variant: 'destructive' }))) return;
    try {
      await api.delete(`/wa-campaigns/templates/${t.id}`);
      void qc.invalidateQueries({ queryKey: ['wa-campaigns', 'templates'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const newTemplate = { name: '', isActive: true, fields: [{ label: 'التحية', options: ['أهلًا يا {first_name} 👋'] }, { label: 'الرسالة', options: [''] }, { label: 'الختام', options: [''] }] };
  return (
    <div className="space-y-3">
      <AbsenceCard templates={data ?? []} />
      {can('club.whatsapp:create') && <Button variant="outline" onClick={() => setEditing(newTemplate)}><Plus className="h-4 w-4" />{ui('قالب جديد')}</Button>}
      {isLoading ? <p className="text-sm text-muted-foreground">{ui('جاري التحميل…')}</p> : isError ? <ErrorState onRetry={() => void refetch()} /> : !data?.length ? <EmptyState title={ui('لا توجد قوالب')} description={ui('احفظ نص الرسالة المتكرر كقالب لاستخدامه في كل حملة')} /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((t) => (
            <div key={t.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{t.name}</h3>
                  {t.isBirthday && <Badge variant="success" className="gap-1"><Cake className="h-3 w-3" />{ui('قالب أعياد الميلاد')}</Badge>}
                  {t.isAbsence && <Badge variant="warning" className="gap-1"><UserX className="h-3 w-3" />{ui('لم يحضر منذ مدة')}</Badge>}
                  {t.addOptOutLine === false && <Badge variant="outline">{ui('من غير سطر الإيقاف')}</Badge>}
                  {!t.isActive && <Badge variant="outline">{ui('غير نشط')}</Badge>}
                </div>
                <div className="flex gap-1">
                  {can('club.whatsapp:update') && <Button size="sm" variant="ghost" onClick={() => setEditing({ ...t, fields: t.fields?.length ? t.fields : [{ label: '', options: [''] }] })}>{ui('تعديل')}</Button>}
                  {can('club.whatsapp:delete') && !t.isBirthday && !t.isAbsence && <Button size="icon" variant="ghost" aria-label={ui('حذف')} onClick={() => void remove(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
              </div>
              <div className="mt-2 grid gap-1 text-sm">
                {(t.fields ?? []).map((f, i) => (
                  <p key={i} className="text-muted-foreground"><b className="text-foreground">{f.label || `${ui('السطر')} ${i + 1}`}:</b> {f.options[0]}{f.options.length > 1 && <span className="text-xs"> ({ui('و')} {f.options.length - 1} {ui('صيغ تانية')})</span>}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent size="lg" className="max-h-[92vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing.id ? ui('تعديل القالب') : ui('قالب جديد')}</DialogTitle></DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2"><Label>{ui('اسم القالب')}</Label><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={120} /></div>
              <FieldsEditor fields={editing.fields ?? []} onChange={(fields) => setEditing({ ...editing, fields })} />
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={editing.isActive ?? true} onCheckedChange={(v) => setEditing({ ...editing, isActive: v === true })} />{ui('نشط')}</label>
              <OptOutLineToggle checked={editing.addOptOutLine ?? true} onChange={(v) => setEditing({ ...editing, addOptOutLine: v })} />
            </div>
            <DialogFooter>
              <Button variant="outline" permissionAction={null} onClick={() => setEditing(null)}>{ui('إلغاء')}</Button>
              <Button disabled={saving || !fieldsValid(editing.fields ?? [])} onClick={() => void save()}>{saving ? ui('جاري الحفظ…') : ui('حفظ')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function useTemplates() {
  return useQuery({ queryKey: ['wa-campaigns', 'templates'], queryFn: async () => (await api.get<Template[]>('/wa-campaigns/templates')).data });
}

/** «لم يحضر منذ مدة»: when a row in today's attendance turns yellow / red, and which template its WhatsApp button opens. */
function AbsenceCard({ templates }: { templates: Template[] }) {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['wa-campaigns', 'absence-settings'], queryFn: async () => (await api.get<AbsenceSettings>('/wa-campaigns/absence-settings')).data });
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const canConfigure = can('club.whatsapp:configure');
  const save = async (patch: Partial<AbsenceSettings>) => {
    setBusy(true);
    try {
      qc.setQueryData(['wa-campaigns', 'absence-settings'], (await api.patch<AbsenceSettings>('/wa-campaigns/absence-settings', patch)).data);
      void qc.invalidateQueries({ queryKey: ['wa-campaigns', 'templates'] });
      void qc.invalidateQueries({ queryKey: ['wa-reminders'] });
      toast.success(ui('تم الحفظ'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };
  const days = (key: 'yellowDays' | 'redDays', value: string) => {
    const n = Math.round(Number(value));
    if (n >= 1 && n <= 365 && n !== data[key]) void save({ [key]: n });
  };
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/50 dark:bg-amber-950/10">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40"><UserX className="h-5 w-5" /></div>
        <div className="min-w-0">
          <h3 className="font-semibold">{ui('لم يحضر منذ مدة — سجل حضور اليوم في الاستقبال')}</h3>
          <p className="text-xs text-muted-foreground">{ui('العضو اللي بيحضر بعد غياب بيتلوّن في جدول الحضور، وجنبه زرار واتساب بيفتح المحادثة بالرسالة جاهزة (بيتبعت يدوي من موبايل الاستقبال).')}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><span className="size-3 rounded-sm bg-amber-300" />{ui('أصفر من')}
          <Input type="number" dir="ltr" min={1} max={365} className="h-9 w-20" key={`y${data.yellowDays}`} defaultValue={data.yellowDays} disabled={!canConfigure || busy} onBlur={(e) => days('yellowDays', e.target.value)} />{ui('يوم غياب')}
        </label>
        <label className="flex items-center gap-2"><span className="size-3 rounded-sm bg-red-300" />{ui('أحمر من')}
          <Input type="number" dir="ltr" min={1} max={365} className="h-9 w-20" key={`r${data.redDays}`} defaultValue={data.redDays} disabled={!canConfigure || busy} onBlur={(e) => days('redDays', e.target.value)} />{ui('يوم أو أكتر')}
        </label>
        <label className="flex items-center gap-2">{ui('القالب')}
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={data.templateId ?? ''} disabled={!canConfigure || busy} onChange={(e) => void save({ templateId: Number(e.target.value) })}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

// ── devices ─────────────────────────────────────────────────────────────────

function DevicesTab() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState<number>(user?.branch || 0);
  const [label, setLabel] = useState('');
  const [code, setCode] = useState<{ label: string; pairCode: string; minutes: number } | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['wa-campaigns', 'devices'], queryFn: async () => (await api.get<Device[]>('/wa-campaigns/devices')).data, refetchInterval: 15_000 });
  useEffect(() => { if (!branchId && branches?.length) setBranchId(branches[0].id); }, [branches, branchId]);
  const branchName = (id: number) => branches?.find((b) => b.id === id)?.name ?? `#${id}`;
  const canConfigure = can('club.whatsapp:configure');
  const add = async () => {
    try {
      const { data: res } = await api.post<{ pairCode: string; expiresInMinutes: number }>('/wa-campaigns/devices', { branchId, label: label.trim() });
      setCode({ label: label.trim(), pairCode: res.pairCode, minutes: res.expiresInMinutes });
      setLabel('');
      void qc.invalidateQueries({ queryKey: ['wa-campaigns', 'devices'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const newCode = async (d: Device) => {
    try {
      const { data: res } = await api.post<{ pairCode: string; expiresInMinutes: number }>(`/wa-campaigns/devices/${d.id}/pair-code`);
      setCode({ label: d.label, pairCode: res.pairCode, minutes: res.expiresInMinutes });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const revoke = async (d: Device) => {
    if (!(await confirm({ title: ui('إلغاء ربط الجهاز'), description: ui('الإضافة على هذا الجهاز ستتوقف عن الإرسال فورًا'), variant: 'destructive' }))) return;
    try {
      await api.delete(`/wa-campaigns/devices/${d.id}`);
      void qc.invalidateQueries({ queryKey: ['wa-campaigns', 'devices'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const online = (d: Device) => !!d.lastSeenAt && Date.now() - Date.parse(d.lastSeenAt) < 2 * 60_000;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 text-sm leading-7">
        <h3 className="mb-1 font-semibold">{ui('طريقة التشغيل على جهاز الفرع')}</h3>
        <ol className="list-decimal space-y-0.5 ps-5 text-muted-foreground">
          <li>{ui('ثبّت إضافة «WhatsApp Campaign Sender» على Chrome (من ملف الإضافة المرسل لك)')}</li>
          <li>{ui('افتح web.whatsapp.com في نافذة منفصلة وسجّل الدخول برقم الجيم')}</li>
          <li>{ui('أضف جهازًا هنا، ثم اكتب عنوان السيستم وكود الربط في الإضافة')}</li>
          <li>{ui('اضغط تشغيل في الإضافة واترك النافذة مفتوحة')}</li>
        </ol>
      </div>
      {canConfigure && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1"><Label>{ui('الفرع')}</Label>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={branchId} onChange={(e) => setBranchId(Number(e.target.value))}>
              {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name ?? `#${b.id}`}</option>)}
            </select>
          </div>
          <div className="grid min-w-[220px] flex-1 gap-1"><Label>{ui('اسم الجهاز')}</Label><Input value={label} placeholder={ui('مثال: كمبيوتر الاستقبال')} onChange={(e) => setLabel(e.target.value)} maxLength={120} /></div>
          <Button disabled={!label.trim() || !branchId} onClick={() => void add()}><Laptop className="h-4 w-4" />{ui('إضافة جهاز')}</Button>
        </div>
      )}
      {code && (
        <div className="rounded-xl border-2 border-success/40 bg-success/5 p-4 text-center">
          <p className="text-sm">{ui('كود ربط')} «{code.label}» — {ui('صالح لمدة')} {code.minutes} {ui('دقيقة')}</p>
          <div className="my-2 flex items-center justify-center gap-2">
            <p dir="ltr" className="font-mono text-4xl font-bold tracking-[0.3em]">{code.pairCode.slice(0, 4)}-{code.pairCode.slice(4)}</p>
            <CopyButton text={`${code.pairCode.slice(0, 4)}-${code.pairCode.slice(4)}`} label={ui('نسخ الكود')} />
          </div>
          <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">{ui('عنوان السيستم')}: <bdi dir="ltr">{window.location.origin}</bdi><CopyButton text={window.location.origin} label={ui('نسخ العنوان')} small /></p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setCode(null)}>{ui('إخفاء')}</Button>
        </div>
      )}
      {isLoading ? <p className="text-sm text-muted-foreground">{ui('جاري التحميل…')}</p> : isError ? <ErrorState onRetry={() => void refetch()} /> : !data?.length ? <EmptyState title={ui('لا توجد أجهزة مربوطة')} /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((d) => (
            <div key={d.id} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4">
              <div>
                <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${online(d) ? 'bg-success' : 'bg-muted-foreground/40'}`} /><h3 className="font-semibold">{d.label}</h3></div>
                <p className="mt-1 text-xs text-muted-foreground">{branchName(d.branchId)} · {d.paired ? `${ui('آخر اتصال')} ${fmtTime(d.lastSeenAt)}` : ui('لم يُربط بعد')}</p>
              </div>
              <div className="flex gap-1">
                {canConfigure && <Button size="sm" variant="outline" onClick={() => void newCode(d)}>{ui('كود جديد')}</Button>}
                {can('club.whatsapp:delete') && <Button size="icon" variant="ghost" aria-label={ui('إلغاء الربط')} onClick={() => void revoke(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── opt-outs ────────────────────────────────────────────────────────────────

function OptOutsTab() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['wa-campaigns', 'opt-outs'], queryFn: async () => (await api.get<OptOut[]>('/wa-campaigns/opt-outs')).data });
  const add = async () => {
    try {
      await api.post('/wa-campaigns/opt-outs', { phone: phone.trim(), reason: reason.trim() || undefined });
      setPhone(''); setReason('');
      void qc.invalidateQueries({ queryKey: ['wa-campaigns'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  const remove = async (o: OptOut) => {
    try {
      await api.delete(`/wa-campaigns/opt-outs/${o.key}`);
      void qc.invalidateQueries({ queryKey: ['wa-campaigns', 'opt-outs'] });
    } catch (e) {
      toast.error(apiError(e));
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{ui('الأرقام هنا لا تصلها أي رسالة من أي حملة. أضف كل من طلب عدم الإرسال.')}</p>
      {can('club.whatsapp:configure') && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1"><Label>{ui('رقم الموبايل')}</Label><Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" /></div>
          <div className="grid min-w-[220px] flex-1 gap-1"><Label>{ui('السبب')}</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></div>
          <Button disabled={phone.trim().length < 6} onClick={() => void add()}><Ban className="h-4 w-4" />{ui('إضافة')}</Button>
        </div>
      )}
      {isLoading ? <p className="text-sm text-muted-foreground">{ui('جاري التحميل…')}</p> : isError ? <ErrorState onRetry={() => void refetch()} /> : !data?.length ? <EmptyState title={ui('القائمة فارغة')} /> : (
        <div className="overflow-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground"><tr><th className="p-2 text-start">{ui('الرقم')}</th><th className="p-2 text-start">{ui('السبب')}</th><th className="p-2 text-start">{ui('التاريخ')}</th><th className="p-2" /></tr></thead>
            <tbody>{data.map((o) => (
              <tr key={o.key} className="border-t">
                <td className="p-2" dir="ltr">{o.phone}</td><td className="p-2">{o.reason ?? '—'}</td><td className="p-2 text-xs">{fmtTime(o.createdAt)}</td>
                <td className="p-2">{can('club.whatsapp:delete') && <Button size="icon" variant="ghost" aria-label={ui('حذف')} onClick={() => void remove(o)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
