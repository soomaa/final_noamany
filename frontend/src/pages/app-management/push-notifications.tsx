import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  BellRing,
  Cake,
  CalendarClock,
  CalendarX2,
  CheckCircle2,
  Clock3,
  Copy,
  Droplets,
  Eye,
  FlaskConical,
  Hourglass,
  Image as ImageIcon,
  Link2,
  ListChecks,
  Loader2,
  MoonStar,
  Pause,
  Pencil,
  Play,
  Send,
  Settings2,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Trash2,
  UserCheck,
  UserRoundSearch,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { cn } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';

// ── API shapes (backend: src/modules/member-push) ─────────────────────────────

type AudienceKind = 'all' | 'active' | 'expiring' | 'expired' | 'birthday' | 'absent' | 'members';
interface Audience {
  kind: AudienceKind;
  branchIds: number[];
  gender: 'male' | 'female' | null;
  days: number | null;
  memberIds: number[];
}
interface Message {
  title: string;
  body: string;
  type: string;
  link: string;
  imageUrl: string;
}
type ScheduleKind = 'once' | 'daily' | 'weekly' | 'monthly' | 'interval';
interface Schedule {
  kind: ScheduleKind;
  runAt: string;
  time: string;
  weekdays: number[];
  monthDay: number;
  intervalDays: number;
  startDate: string;
  endDate: string;
}
interface Preview {
  members: number;
  membersWithApp: number;
  devices: number;
  delivery: 'topic' | 'tokens';
  target: string | null;
  summary: string;
  sample: { id: number; name: string; branch: string }[];
}
interface Campaign {
  id: number;
  name: string;
  preset: string | null;
  title: string;
  body: string;
  type: string;
  link: string | null;
  imageUrl: string | null;
  audience: Audience;
  audienceSummary: string;
  inApp: boolean;
  schedule: { kind: ScheduleKind; runAt: string | null; time: string | null; weekdays: number[]; monthDay: number | null; intervalDays: number | null; startDate: string | null; endDate: string | null };
  status: 'active' | 'paused' | 'done';
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastSend: { id: number; status: string; sent: number; failed: number; devices: number; members: number } | null;
}
interface SendRow {
  id: number;
  trigger: 'manual' | 'schedule' | 'test';
  campaignId: number | null;
  campaignName: string | null;
  createdBy: string | null;
  title: string;
  body: string;
  type: string;
  link: string | null;
  imageUrl: string | null;
  audienceSummary: string | null;
  delivery: 'topic' | 'tokens';
  topic: string | null;
  inApp: boolean;
  members: number;
  devices: number;
  sent: number;
  failed: number;
  invalid: number;
  limited: number;
  opened: number;
  status: 'running' | 'done' | 'failed' | 'skipped';
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}
interface SendDetail extends SendRow {
  recipientsByStatus: Record<string, number>;
  recipients: { memberId: number; name: string; code: string; branch: string; status: string; openedAt: string | null }[];
}
interface Settings {
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  quietMode: 'defer' | 'skip';
  defaultType: string;
  dailyLimit: number;
  firebase: { configured: boolean; projectId: string | null; keyFileSet: boolean; lastError: string | null; lastErrorAt: string | null };
  devices: { total: number; members: number };
  now: { date: string; time: string };
}

// ── constants ─────────────────────────────────────────────────────────────────

const TYPES = [
  { value: 'general', label: 'عام' },
  { value: 'offer', label: 'عرض' },
  { value: 'announcement', label: 'إعلان' },
  { value: 'reminder', label: 'تذكير' },
  { value: 'subscription', label: 'اشتراك' },
  { value: 'class', label: 'كلاس' },
];
const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label ?? t;

/** Screens the member app can open from data.link. */
const SCREENS = [
  { value: '', label: 'من غير شاشة (يفتح الإشعارات)' },
  { value: 'noamany://offers', label: 'العروض' },
  { value: 'noamany://subscriptions', label: 'اشتراكاتي' },
  { value: 'noamany://classes', label: 'الكلاسات' },
  { value: 'noamany://points', label: 'النقاط' },
  { value: 'noamany://invitations', label: 'الدعوات' },
  { value: 'noamany://notifications', label: 'الإشعارات' },
];

const VARIABLES = [
  { key: 'first_name', label: 'الاسم الأول' },
  { key: 'name', label: 'الاسم بالكامل' },
  { key: 'branch', label: 'الفرع' },
];

const KINDS: { kind: AudienceKind; label: string; hint: string; icon: typeof Users }[] = [
  { kind: 'all', label: 'كل الأعضاء', hint: 'كل اللي نازل عندهم التطبيق', icon: Users },
  { kind: 'active', label: 'المشتركين الحاليين', hint: 'معاهم اشتراك شغال النهارده', icon: UserCheck },
  { kind: 'expiring', label: 'اشتراكهم قرب يخلص', hint: 'بيخلص خلال كام يوم', icon: Hourglass },
  { kind: 'expired', label: 'اشتراكهم خلص', hint: 'خلص في آخر كام يوم', icon: CalendarX2 },
  { kind: 'birthday', label: 'عيد ميلادهم النهارده', hint: 'حسب تاريخ الميلاد', icon: Cake },
  { kind: 'absent', label: 'غايبين', hint: 'معاهم اشتراك ومجوش من مدة', icon: UserX },
  { kind: 'members', label: 'أعضاء بعينهم', hint: 'اختارهم بالاسم أو الكود', icon: UserRoundSearch },
];
const DAYS_LABEL: Partial<Record<AudienceKind, string>> = {
  expiring: 'بيخلص خلال (يوم)',
  expired: 'خلص في آخر (يوم)',
  absent: 'غايب من (يوم) أو أكتر',
};
const DEFAULT_DAYS: Partial<Record<AudienceKind, number>> = { expiring: 3, expired: 7, absent: 7 };
const WEEKDAYS = ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
const SCHEDULE_KINDS: { kind: ScheduleKind; label: string }[] = [
  { kind: 'once', label: 'مرة واحدة' },
  { kind: 'daily', label: 'كل يوم' },
  { kind: 'weekly', label: 'أيام في الأسبوع' },
  { kind: 'monthly', label: 'كل شهر' },
  { kind: 'interval', label: 'كل كام يوم' },
];

const TITLE_SOFT = 50;
const TITLE_MAX = 120;
const BODY_SOFT = 180;
const BODY_MAX = 600;

const EMPTY_AUDIENCE: Audience = { kind: 'all', branchIds: [], gender: null, days: null, memberIds: [] };
const emptyMessage = (type = 'general'): Message => ({ title: '', body: '', type, link: '', imageUrl: '' });
const emptySchedule = (): Schedule => ({ kind: 'daily', runAt: '', time: '09:00', weekdays: [], monthDay: 1, intervalDays: 2, startDate: '', endDate: '' });

interface Preset {
  key: string;
  name: string;
  hint: string;
  icon: typeof Users;
  tone: string;
  message: Message;
  audience: Audience;
  schedule: Schedule;
}
const PRESETS: Preset[] = [
  {
    key: 'birthday', name: 'عيد ميلاد العضو', hint: 'كل يوم 9 الصبح لأصحاب عيد الميلاد', icon: Cake, tone: 'from-pink-500/15 to-rose-500/5 text-pink-600',
    message: { title: 'كل سنة وانت طيب يا {first_name} 🎂', body: 'فريق نعماني {branch} بيتمنالك سنة كلها صحة وإنجازات. مستنيينك تحتفل معانا في الجيم 💪', type: 'general', link: '', imageUrl: '' },
    audience: { ...EMPTY_AUDIENCE, kind: 'birthday' }, schedule: { ...emptySchedule(), kind: 'daily', time: '09:00' },
  },
  {
    key: 'expiring', name: 'اشتراكك بيخلص كمان 3 أيام', hint: 'كل يوم 11 الصبح', icon: Hourglass, tone: 'from-amber-500/15 to-orange-500/5 text-amber-600',
    message: { title: 'اشتراكك قرب يخلص ⏳', body: '{first_name}، اشتراكك في نعماني {branch} بيخلص خلال أيام. جدد دلوقتي وكمّل من غير ما توقف 💪', type: 'subscription', link: 'noamany://subscriptions', imageUrl: '' },
    audience: { ...EMPTY_AUDIENCE, kind: 'expiring', days: 3 }, schedule: { ...emptySchedule(), kind: 'daily', time: '11:00' },
  },
  {
    key: 'expired', name: 'اشتراكك خلص', hint: 'كل يوم 12 الضهر لاشتراكات امبارح', icon: CalendarX2, tone: 'from-red-500/15 to-rose-500/5 text-red-600',
    message: { title: 'وحشتنا يا {first_name} 👋', body: 'اشتراكك خلص، ومكانك لسه مستنيك في نعماني {branch}. جدد النهارده وارجع لتمرينك.', type: 'subscription', link: 'noamany://subscriptions', imageUrl: '' },
    audience: { ...EMPTY_AUDIENCE, kind: 'expired', days: 1 }, schedule: { ...emptySchedule(), kind: 'daily', time: '12:00' },
  },
  {
    key: 'absent', name: 'وحشتنا (غياب 7 أيام)', hint: 'كل يوم 6 المسا', icon: UserX, tone: 'from-violet-500/15 to-indigo-500/5 text-violet-600',
    message: { title: 'فينك يا {first_name}؟', body: 'بقالك أسبوع مجتش نعماني {branch}. خطوة صغيرة النهارده ترجعك للطريق 💪', type: 'reminder', link: '', imageUrl: '' },
    audience: { ...EMPTY_AUDIENCE, kind: 'absent', days: 7 }, schedule: { ...emptySchedule(), kind: 'daily', time: '18:00' },
  },
  {
    key: 'daily_tip', name: 'تذكير يومي (مياه / تمرين)', hint: 'كل يوم 10 الصبح للمشتركين', icon: Droplets, tone: 'from-sky-500/15 to-cyan-500/5 text-sky-600',
    message: { title: 'اشرب مياه 💧', body: 'متنساش تشرب 8 كوبايات مياه النهارده، وجسمك هيشكرك في التمرين.', type: 'reminder', link: '', imageUrl: '' },
    audience: { ...EMPTY_AUDIENCE, kind: 'active' }, schedule: { ...emptySchedule(), kind: 'daily', time: '10:00' },
  },
];

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtNumber = (n: number) => new Intl.NumberFormat('ar-EG').format(n);
const fmtDateTime = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—';
const renderVars = (text: string, sample: { name: string; branch: string }) => {
  const name = sample.name.trim() || 'أحمد محمد';
  return text
    .replace(/\{first_name\}/g, name.split(/\s+/)[0])
    .replace(/\{name\}/g, name)
    .replace(/\{branch\}/g, sample.branch || 'الفرع');
};
const usesVars = (m: Pick<Message, 'title' | 'body'>) => /\{(name|first_name|branch)\}/.test(`${m.title} ${m.body}`);

function audiencePayload(a: Audience) {
  return {
    kind: a.kind,
    branchIds: a.kind === 'members' ? [] : a.branchIds,
    gender: a.kind === 'members' ? null : a.gender,
    days: DEFAULT_DAYS[a.kind] != null ? a.days ?? DEFAULT_DAYS[a.kind] : null,
    memberIds: a.kind === 'members' ? a.memberIds : [],
  };
}
function messagePayload(m: Message) {
  return { title: m.title.trim(), body: m.body.trim(), type: m.type, link: m.link.trim() || undefined, imageUrl: m.imageUrl.trim() || undefined };
}

function useDebounced<T>(value: T, ms = 450): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const STATUS: Record<SendRow['status'], { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  done: { label: 'اتبعت', variant: 'success' },
  running: { label: 'جاري الإرسال', variant: 'warning' },
  failed: { label: 'فشل', variant: 'destructive' },
  skipped: { label: 'اتلغى (ساعات الهدوء)', variant: 'secondary' },
};
const TRIGGER: Record<SendRow['trigger'], string> = { manual: 'يدوي', schedule: 'مجدول', test: 'تجربة' };
const RECIPIENT_STATUS: Record<string, string> = {
  sent: 'وصل', failed: 'فشل', invalid: 'جهاز قديم', no_device: 'مفيش تطبيق', limited: 'وصل للحد اليومي', topic: 'فتحه',
};

// ── page ──────────────────────────────────────────────────────────────────────

export function MemberPushPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'compose';
  const setTab = (value: string) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', value); return n; }, { replace: true });
  const settings = useQuery({ queryKey: ['member-push', 'settings'], queryFn: async () => (await api.get<Settings>('/app/push/settings')).data });
  const s = settings.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="إدارة التطبيق"
        title="إشعارات الموبايل للأعضاء"
        description="ابعت إشعار يوصل لموبايل العضو حتى لو التطبيق مقفول — دلوقتي أو بجدول ثابت، لكل الأعضاء أو لجمهور محسوب."
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile
          icon={s?.firebase.configured ? CheckCircle2 : ShieldAlert}
          tone={s?.firebase.configured ? 'text-success bg-success/10' : 'text-warning bg-warning/15'}
          label="ربط Firebase"
          value={settings.isLoading ? '…' : s?.firebase.configured ? 'شغال' : 'مش متوصل'}
          hint={s?.firebase.configured ? s.firebase.projectId ?? '' : 'الإرسال بيتسجل بس من غير ما يوصل'}
        />
        <StatTile icon={Smartphone} tone="text-primary bg-primary/10" label="أجهزة مسجلة" value={s ? fmtNumber(s.devices.total) : '…'} hint="موبايلات عليها التطبيق" />
        <StatTile icon={Users} tone="text-sky-600 bg-sky-500/10" label="أعضاء عندهم التطبيق" value={s ? fmtNumber(s.devices.members) : '…'} hint={s ? `الحد اليومي: ${fmtNumber(s.dailyLimit)} إشعار للعضو` : ''} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList className="grid w-full grid-cols-4 sm:inline-flex sm:w-auto [&>button]:px-1.5 [&>button]:text-xs sm:[&>button]:px-4 sm:[&>button]:text-sm">
          <TabsTrigger value="compose"><Send />إرسال دلوقتي</TabsTrigger>
          <TabsTrigger value="schedules"><CalendarClock />مجدولة</TabsTrigger>
          <TabsTrigger value="history"><ListChecks />السجل</TabsTrigger>
          <TabsTrigger value="settings"><Settings2 />الإعدادات</TabsTrigger>
        </TabsList>
        <TabsContent value="compose"><ComposeTab settings={s} onSent={() => setTab('history')} /></TabsContent>
        <TabsContent value="schedules"><SchedulesTab settings={s} /></TabsContent>
        <TabsContent value="history"><HistoryTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab settings={s} loading={settings.isLoading} error={settings.isError} onRetry={() => void settings.refetch()} /></TabsContent>
      </Tabs>
    </div>
  );
}

function StatTile({ icon: Icon, tone, label, value, hint }: { icon: typeof Users; tone: string; label: string; value: string; hint?: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col items-start gap-2 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
        <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg sm:h-11 sm:w-11 sm:rounded-xl', tone)}><Icon className="h-4 w-4 sm:h-5 sm:w-5" /></span>
        <div className="min-w-0">
          <p className="text-[11px] leading-tight text-muted-foreground sm:text-xs">{label}</p>
          <p className="nums text-base font-bold leading-tight sm:text-lg">{value}</p>
          {hint ? <p className="hidden truncate text-xs text-muted-foreground sm:block">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, description, icon: Icon, children, className }: { title: string; description?: string; icon: typeof Users; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-primary" />{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

// ── message editor ────────────────────────────────────────────────────────────

function Counter({ value, soft, max }: { value: number; soft: number; max: number }) {
  return (
    <span className={cn('nums text-xs', value > max ? 'text-destructive' : value > soft ? 'text-warning' : 'text-muted-foreground')}>
      {fmtNumber(value)} / {fmtNumber(soft)}
    </span>
  );
}

function MessageEditor({ value, onChange }: { value: Message; onChange: (m: Message) => void }) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [lastField, setLastField] = useState<'title' | 'body'>('body');
  const insert = (key: string) => {
    const token = `{${key}}`;
    if (lastField === 'title') return onChange({ ...value, title: `${value.title}${value.title && !value.title.endsWith(' ') ? ' ' : ''}${token}` });
    const el = bodyRef.current;
    const at = el?.selectionStart ?? value.body.length;
    const body = `${value.body.slice(0, at)}${token}${value.body.slice(at)}`;
    onChange({ ...value, body });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + token.length, at + token.length); });
  };
  const screen = SCREENS.some((x) => x.value === value.link) ? value.link : '__custom';

  return (
    <div className="space-y-4">
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between"><Label htmlFor="push-title">العنوان</Label><Counter value={value.title.length} soft={TITLE_SOFT} max={TITLE_MAX} /></div>
        <Input id="push-title" value={value.title} maxLength={TITLE_MAX} placeholder="مثلاً: عرض نهاية الأسبوع 🔥" onFocus={() => setLastField('title')} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between"><Label htmlFor="push-body">نص الإشعار</Label><Counter value={value.body.length} soft={BODY_SOFT} max={BODY_MAX} /></div>
        <Textarea id="push-body" ref={bodyRef} rows={4} value={value.body} maxLength={BODY_MAX} placeholder="اكتب الرسالة اللي هتظهر للعضو…" onFocus={() => setLastField('body')} onChange={(e) => onChange({ ...value, body: e.target.value })} />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">متغيرات:</span>
          {VARIABLES.map((v) => (
            <button key={v.key} type="button" onClick={() => insert(v.key)} className="rounded-full border border-dashed border-primary/40 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary transition hover:bg-primary/10">
              {v.label}
            </button>
          ))}
        </div>
        {usesVars(value) ? <p className="text-xs text-muted-foreground">الرسالة فيها متغيرات، فهتتبعت لكل عضو لوحده باسمه.</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>النوع</Label>
          <Select value={value.type} onValueChange={(type) => onChange({ ...value, type })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="flex items-center gap-1"><Link2 className="h-3.5 w-3.5" />يفتح على</Label>
          <Select value={screen === '' ? '__none' : screen} onValueChange={(v) => onChange({ ...value, link: v === '__none' ? '' : v === '__custom' ? (value.link || 'https://') : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SCREENS.map((x) => <SelectItem key={x.value || '__none'} value={x.value || '__none'}>{x.label}</SelectItem>)}
              <SelectItem value="__custom">رابط تاني…</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {screen === '__custom' ? (
        <Input dir="ltr" value={value.link} placeholder="https://… أو noamany://…" onChange={(e) => onChange({ ...value, link: e.target.value })} />
      ) : null}
      <div className="grid gap-1.5">
        <Label className="flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />صورة (اختياري)</Label>
        <Input dir="ltr" value={value.imageUrl} placeholder="https://…/offer.jpg" onChange={(e) => onChange({ ...value, imageUrl: e.target.value })} />
        {value.imageUrl && !/^https:\/\//i.test(value.imageUrl) ? <p className="text-xs text-destructive">لازم الرابط يبدأ بـ https://</p> : null}
      </div>
    </div>
  );
}

// ── audience editor ───────────────────────────────────────────────────────────

function AudienceEditor({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  const branches = useBranches();
  const [picked, setPicked] = useState<{ id: number; name: string; code: string }[]>([]);
  useEffect(() => {
    // Keep chips in sync when a schedule is opened for editing (ids only).
    setPicked((list) => value.memberIds.map((id) => list.find((p) => p.id === id) ?? { id, name: `عضو #${id}`, code: '' }));
  }, [value.memberIds]);
  const showFilters = value.kind !== 'members';
  const toggleBranch = (id: number) =>
    onChange({ ...value, branchIds: value.branchIds.includes(id) ? value.branchIds.filter((b) => b !== id) : [...value.branchIds, id] });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 xl:grid-cols-3">
        {KINDS.map(({ kind, label, hint, icon: Icon }) => {
          const active = value.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onChange({ ...value, kind, days: DEFAULT_DAYS[kind] ?? null })}
              className={cn(
                'flex items-start gap-2.5 rounded-xl border p-3 text-start transition',
                active ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:border-primary/40 hover:bg-accent/40',
              )}
            >
              <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {DAYS_LABEL[value.kind] ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label className="shrink-0">{DAYS_LABEL[value.kind]}</Label>
          <Input type="number" min={1} max={365} className="nums h-9 w-24" value={value.days ?? ''} onChange={(e) => onChange({ ...value, days: e.target.value === '' ? null : Number(e.target.value) })} />
          <div className="flex gap-1">
            {[1, 3, 7, 14, 30].map((d) => (
              <button key={d} type="button" onClick={() => onChange({ ...value, days: d })} className={cn('nums rounded-md border px-2 py-1 text-xs', value.days === d ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent')}>{fmtNumber(d)}</button>
            ))}
          </div>
        </div>
      ) : null}

      {showFilters ? (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-1.5">
            <Label>الفروع <span className="text-xs font-normal text-muted-foreground">(من غير اختيار = كل الفروع)</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {(branches.data ?? []).map((b) => (
                <button key={b.id} type="button" onClick={() => toggleBranch(b.id)} className={cn('rounded-full border px-3 py-1 text-xs font-medium transition', value.branchIds.includes(b.id) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>
                  {b.name ?? `فرع ${b.id}`}
                </button>
              ))}
              {branches.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>النوع</Label>
            <div className="inline-flex rounded-lg border p-0.5">
              {([[null, 'الكل'], ['male', 'رجالة'], ['female', 'ستات']] as const).map(([g, label]) => (
                <button key={label} type="button" onClick={() => onChange({ ...value, gender: g })} className={cn('rounded-md px-3 py-1.5 text-xs font-medium', value.gender === g ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <MemberSearchCombobox
            selectedMember={null}
            resetOnSelect
            excludedMemberIds={value.memberIds}
            onSelect={(m: ClubMemberListItem) => {
              setPicked((list) => [...list.filter((p) => p.id !== m.id), { id: m.id, name: m.name, code: m.memberCode }]);
              onChange({ ...value, memberIds: [...new Set([...value.memberIds, m.id])] });
            }}
            onClear={() => undefined}
          />
          <div className="flex flex-wrap gap-1.5">
            {picked.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs">
                {p.name}{p.code ? <span className="nums text-muted-foreground">· {p.code}</span> : null}
                <button type="button" aria-label="شيل" onClick={() => onChange({ ...value, memberIds: value.memberIds.filter((id) => id !== p.id) })}><X className="h-3 w-3" /></button>
              </span>
            ))}
            {!picked.length ? <span className="text-xs text-muted-foreground">لسه مختارتش حد.</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}

// ── estimate + phone preview ──────────────────────────────────────────────────

function useAudiencePreview(audience: Audience, message: Pick<Message, 'title' | 'body'>) {
  const payload = useDebounced(JSON.stringify({ audience: audiencePayload(audience), title: message.title, body: message.body }));
  const ready = audience.kind !== 'members' || audience.memberIds.length > 0;
  return useQuery({
    queryKey: ['member-push', 'preview', payload],
    enabled: ready,
    queryFn: async () => (await api.post<Preview>('/app/push/audience/preview', JSON.parse(payload))).data,
    staleTime: 30_000,
    retry: false,
  });
}

function EstimateCard({ preview, isFetching, error }: { preview?: Preview; isFetching: boolean; error: unknown }) {
  return (
    <div className="rounded-2xl border bg-gradient-to-br from-primary/8 via-card to-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">العدد المتوقع</p>
        {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>
      {error ? <p className="text-sm text-destructive">{apiError(error)}</p> : preview ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="nums text-2xl font-bold">{fmtNumber(preview.members)}</p><p className="text-xs text-muted-foreground">عضو في الجمهور</p></div>
            <div><p className="nums text-2xl font-bold text-primary">{fmtNumber(preview.devices)}</p><p className="text-xs text-muted-foreground">موبايل هيوصله ({fmtNumber(preview.membersWithApp)} عضو)</p></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge variant={preview.delivery === 'topic' ? 'default' : 'secondary'}>{preview.delivery === 'topic' ? 'إرسال جماعي (Topic)' : 'لكل عضو لوحده'}</Badge>
            <span className="text-xs text-muted-foreground">{preview.summary}</span>
          </div>
          {preview.sample.length ? <p className="mt-2 truncate text-xs text-muted-foreground">زي: {preview.sample.map((m) => m.name).join('، ')}</p> : null}
        </>
      ) : <p className="text-sm text-muted-foreground">اختار الجمهور عشان نحسب العدد.</p>}
    </div>
  );
}

function PhonePreview({ message, sample }: { message: Message; sample: { name: string; branch: string } }) {
  const title = renderVars(message.title, sample) || 'عنوان الإشعار';
  const body = renderVars(message.body, sample) || 'نص الإشعار هيظهر هنا…';
  const time = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' }).format(new Date());
  return (
    <div className="mx-auto w-full max-w-[300px]">
      <div className="relative rounded-[2.6rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl dark:border-neutral-800">
        <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
        <div className="relative h-[430px] overflow-hidden rounded-[2rem] bg-gradient-to-b from-[#2b1a3d] via-[#7a1f2b] to-[#ED1C24] px-3 pt-12">
          <p className="nums text-center text-5xl font-light text-white/95">{time}</p>
          <p className="mb-6 text-center text-xs text-white/70">{new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
          <div className="rounded-2xl bg-white/85 p-3 text-neutral-900 shadow-lg backdrop-blur-md dark:bg-neutral-100/90">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] text-neutral-500">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-[#ED1C24] to-[#9B1218] text-[10px] font-bold text-white">ن</span>
              <span className="font-medium">أنا نعماني</span>
              <span className="ms-auto">دلوقتي</span>
            </div>
            <p className="line-clamp-1 text-sm font-semibold">{title}</p>
            <p className="line-clamp-4 whitespace-pre-line text-[13px] leading-snug text-neutral-700">{body}</p>
            {message.imageUrl && /^https:\/\//i.test(message.imageUrl) ? (
              <img src={message.imageUrl} alt="" className="mt-2 h-28 w-full rounded-lg object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : null}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">معاينة باسم: {sample.name || 'أحمد محمد'}</p>
    </div>
  );
}

// ── test dialog ───────────────────────────────────────────────────────────────

const LAST_TEST_KEY = 'member-push:last-test-member';
function readLastTest(): { id: number; name: string } | null {
  try { return JSON.parse(localStorage.getItem(LAST_TEST_KEY) ?? 'null'); } catch { return null; }
}

function TestDialog({ open, onOpenChange, message }: { open: boolean; onOpenChange: (v: boolean) => void; message: Message }) {
  const [member, setMember] = useState<{ id: number; name: string } | null>(readLastTest);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: number; invalid: number; devices: number } | null>(null);
  useEffect(() => { if (open) setResult(null); }, [open]);
  const send = async () => {
    if (!member) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ sent: number; invalid: number; devices: number }>('/app/push/test', { ...messagePayload(message), memberId: member.id });
      setResult(data);
      try { localStorage.setItem(LAST_TEST_KEY, JSON.stringify(member)); } catch { /* ignore */ }
      if (data.devices === 0) toast.warning('العضو ده مفيش عنده التطبيق على أي موبايل');
      else toast.success(`اتبعتت التجربة لـ ${fmtNumber(data.sent)} من ${fmtNumber(data.devices)} موبايل`);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-primary" />إرسال تجربة</DialogTitle>
          <DialogDescription>الإشعار هيوصل لموبايلات العضو ده بس، ومش هيتسجل في إشعارات التطبيق. جرّب على نفسك لو عندك حساب عضو.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <MemberSearchCombobox
            selectedMember={null}
            resetOnSelect
            onSelect={(m: ClubMemberListItem) => setMember({ id: m.id, name: m.name })}
            onClear={() => undefined}
          />
          {member ? (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span>{member.name} <span className="nums text-muted-foreground">#{member.id}</span></span>
              <button type="button" onClick={() => setMember(null)} aria-label="شيل"><X className="h-4 w-4" /></button>
            </div>
          ) : null}
          {result ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniStat label="موبايلات" value={result.devices} />
              <MiniStat label="وصل" value={result.sent} tone="text-success" />
              <MiniStat label="جهاز قديم" value={result.invalid} tone="text-destructive" />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>قفل</Button>
          <Button variant="brand" disabled={!member || busy || !message.title.trim() || !message.body.trim()} onClick={() => void send()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}ابعت التجربة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-2.5">
      <p className={cn('nums text-lg font-bold', tone)}>{fmtNumber(value)}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

// ── compose tab ───────────────────────────────────────────────────────────────

function ComposeTab({ settings, onSent }: { settings?: Settings; onSent: () => void }) {
  const { can } = usePermission();
  const qc = useQueryClient();
  const [message, setMessage] = useState<Message>(() => emptyMessage());
  const [audience, setAudience] = useState<Audience>(EMPTY_AUDIENCE);
  const [inApp, setInApp] = useState(true);
  const [testOpen, setTestOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const typeTouched = useRef(false);
  useEffect(() => {
    if (settings && !typeTouched.current) setMessage((m) => ({ ...m, type: settings.defaultType }));
  }, [settings]);
  const preview = useAudiencePreview(audience, message);
  const sample = preview.data?.sample[0] ?? { name: 'أحمد محمد', branch: 'المعادي' };
  const valid = message.title.trim() && message.body.trim() && (audience.kind !== 'members' || audience.memberIds.length > 0);

  const send = async (force = false) => {
    const p = preview.data;
    if (!force) {
      const ok = await confirm({
        title: 'تأكيد الإرسال',
        description: p
          ? `الإشعار هيتبعت لـ ${fmtNumber(p.members)} عضو (${fmtNumber(p.devices)} موبايل). مش هينفع ترجعه بعد الإرسال.`
          : 'الإشعار هيتبعت دلوقتي ومش هينفع ترجعه.',
        confirmLabel: 'ابعت',
        rows: p ? [{ label: 'الجمهور', after: p.summary }, { label: 'العنوان', after: message.title }] : undefined,
      });
      if (!ok) return;
    }
    setSending(true);
    try {
      const { data } = await api.post<{ id: number; members: number }>('/app/push/send', { ...messagePayload(message), audience: audiencePayload(audience), inApp, force });
      toast.success(`بدأ الإرسال لـ ${fmtNumber(data.members)} عضو — تابع النتيجة في السجل`);
      void qc.invalidateQueries({ queryKey: ['member-push'] });
      setMessage(emptyMessage(settings?.defaultType));
      onSent();
    } catch (e) {
      const msg = apiError(e);
      if (!force && msg.includes('ساعات الهدوء')) {
        if (await confirm({ title: 'دلوقتي ساعات الهدوء', description: `${msg}\nتحب تبعت برضه؟`, confirmLabel: 'ابعت برضه', variant: 'destructive' })) {
          setSending(false);
          return send(true);
        }
      } else toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <SectionCard title="الرسالة" icon={BellRing} description="العنوان قصير ومباشر، والنص يقول للعضو يعمل إيه.">
          <MessageEditor value={message} onChange={(m) => { if (m.type !== message.type) typeTouched.current = true; setMessage(m); }} />
        </SectionCard>
        <SectionCard title="مين هيوصله؟" icon={Users} description="الجمهور بيتحسب لحظة الإرسال.">
          <AudienceEditor value={audience} onChange={setAudience} />
        </SectionCard>
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-semibold">يظهر جوه التطبيق كمان</p>
              <p className="text-xs text-muted-foreground">يتسجل في قايمة «الإشعارات» جوه أنا نعماني، مش بس على شاشة الموبايل.</p>
            </div>
            <Switch checked={inApp} onCheckedChange={setInApp} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <PhonePreview message={message} sample={sample} />
        <EstimateCard preview={preview.data} isFetching={preview.isFetching} error={preview.error} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={!valid || !can('app-management.push:create')} onClick={() => setTestOpen(true)}><FlaskConical className="h-4 w-4" />تجربة على عضو</Button>
          <Button variant="brand" disabled={!valid || sending || !can('app-management.push:create') || preview.data?.members === 0} onClick={() => void send()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}ابعت دلوقتي
          </Button>
        </div>
        {settings?.quietEnabled ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MoonStar className="h-3.5 w-3.5" />ساعات الهدوء من {settings.quietStart} لـ {settings.quietEnd}</p>
        ) : null}
      </div>
      <TestDialog open={testOpen} onOpenChange={setTestOpen} message={message} />
    </div>
  );
}

// ── schedules tab ─────────────────────────────────────────────────────────────

function scheduleText(c: Campaign['schedule']): string {
  const at = c.time ? ` الساعة ${c.time}` : '';
  let text: string;
  switch (c.kind) {
    case 'once': text = `مرة واحدة ${c.runAt ? c.runAt.replace('T', ' ') : ''}`; break;
    case 'daily': text = `كل يوم${at}`; break;
    case 'weekly': text = `كل ${c.weekdays.map((d) => WEEKDAYS[d]).join(' و')}${at}`; break;
    case 'monthly': text = `يوم ${c.monthDay} من كل شهر${at}`; break;
    default: text = `كل ${c.intervalDays} يوم${at}`;
  }
  if (c.startDate || c.endDate) text += ` · ${c.startDate ? `من ${c.startDate}` : ''}${c.endDate ? ` لحد ${c.endDate}` : ''}`;
  return text;
}

function SchedulesTab({ settings }: { settings?: Settings }) {
  const { can } = usePermission();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['member-push', 'campaigns'], queryFn: async () => (await api.get<Campaign[]>('/app/push/campaigns')).data, refetchInterval: 30_000 });
  const [editing, setEditing] = useState<{ id: number | null; preset: string | null; name: string; message: Message; audience: Audience; schedule: Schedule; inApp: boolean } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['member-push'] });

  const openPreset = (p: Preset) => setEditing({ id: null, preset: p.key, name: p.name, message: { ...p.message }, audience: { ...p.audience }, schedule: { ...p.schedule }, inApp: true });
  const openNew = () => setEditing({ id: null, preset: null, name: '', message: emptyMessage(settings?.defaultType), audience: EMPTY_AUDIENCE, schedule: emptySchedule(), inApp: true });
  const openEdit = (c: Campaign) => setEditing({
    id: c.id, preset: c.preset, name: c.name,
    message: { title: c.title, body: c.body, type: c.type, link: c.link ?? '', imageUrl: c.imageUrl ?? '' },
    audience: c.audience, inApp: c.inApp,
    schedule: { kind: c.schedule.kind, runAt: c.schedule.runAt ?? '', time: c.schedule.time ?? '09:00', weekdays: c.schedule.weekdays, monthDay: c.schedule.monthDay ?? 1, intervalDays: c.schedule.intervalDays ?? 2, startDate: c.schedule.startDate ?? '', endDate: c.schedule.endDate ?? '' },
  });
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div className="space-y-5">
      <SectionCard title="حملات جاهزة بضغطة" icon={Sparkles} description="الجمهور بيتحسب وقت كل إرسال، فالحملة دي بتشتغل لوحدها كل يوم.">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" disabled={!can('app-management.push:create')} onClick={() => openPreset(p)} className={cn('group rounded-2xl border bg-gradient-to-br p-3 text-start sm:p-4 transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50', p.tone)}>
              <p.icon className="mb-2 h-6 w-6" />
              <p className="text-sm font-semibold text-foreground">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.hint}</p>
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">الجدولات</h3>
        <Button variant="brand" size="sm" disabled={!can('app-management.push:create')} onClick={openNew}><CalendarClock className="h-4 w-4" />جدولة جديدة</Button>
      </div>

      {list.isError ? <ErrorState message={apiError(list.error)} onRetry={() => void list.refetch()} /> : list.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !list.data?.length ? (
        <EmptyState title="مفيش جدولات لسه" description="ابدأ بحملة جاهزة من فوق أو اعمل جدولة جديدة." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((c) => (
            <Card key={c.id} className={cn('overflow-hidden', c.status !== 'active' && 'opacity-80')}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.title}</p>
                  </div>
                  <Badge variant={c.status === 'active' ? 'success' : c.status === 'paused' ? 'warning' : 'secondary'}>
                    {c.status === 'active' ? 'شغالة' : c.status === 'paused' ? 'متوقفة' : 'خلصت'}
                  </Badge>
                </div>
                <div className="grid gap-1.5 text-xs">
                  <p className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-primary" />{scheduleText(c.schedule)}</p>
                  <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-primary" />{c.audienceSummary}</p>
                  <p className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-primary" />الجاي: <span className="font-medium">{c.status === 'active' ? fmtDateTime(c.nextRunAt) : '—'}</span></p>
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <ListChecks className="h-3.5 w-3.5" />آخر مرة: {c.lastSend ? `${fmtDateTime(c.lastRunAt)} · وصل ${fmtNumber(c.lastSend.sent)} من ${fmtNumber(c.lastSend.devices)} موبايل${c.lastSend.status === 'skipped' ? ' (اتلغى)' : ''}` : 'لسه ماتبعتتش'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 border-t pt-3">
                  {c.status === 'active' ? (
                    <Button size="sm" variant="outline" disabled={!can('app-management.push:update')} onClick={() => void act(() => api.post(`/app/push/campaigns/${c.id}/pause`), 'اتوقفت')}><Pause className="h-3.5 w-3.5" />إيقاف</Button>
                  ) : c.status === 'paused' ? (
                    <Button size="sm" variant="outline" disabled={!can('app-management.push:update')} onClick={() => void act(() => api.post(`/app/push/campaigns/${c.id}/resume`), 'اشتغلت تاني')}><Play className="h-3.5 w-3.5" />تشغيل</Button>
                  ) : null}
                  <Button size="sm" variant="outline" disabled={!can('app-management.push:update')} onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" />تعديل</Button>
                  <Button size="sm" variant="outline" disabled={!can('app-management.push:create')} onClick={() => void act(() => api.post(`/app/push/campaigns/${c.id}/duplicate`), 'اتعملت نسخة (متوقفة)')}><Copy className="h-3.5 w-3.5" />نسخة</Button>
                  <Button
                    size="sm" variant="ghost" className="ms-auto text-destructive" disabled={!can('app-management.push:delete')}
                    onClick={async () => {
                      if (await confirm({ title: `حذف «${c.name}»؟`, description: 'السجل القديم هيفضل موجود.', variant: 'destructive', confirmLabel: 'احذف' })) {
                        void act(() => api.delete(`/app/push/campaigns/${c.id}`), 'اتحذفت');
                      }
                    }}
                  ><Trash2 className="h-3.5 w-3.5" />حذف</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing ? <ScheduleDialog initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} /> : null}
    </div>
  );
}

function ScheduleDialog({ initial, onClose, onSaved }: {
  initial: { id: number | null; preset: string | null; name: string; message: Message; audience: Audience; schedule: Schedule; inApp: boolean };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [message, setMessage] = useState(initial.message);
  const [audience, setAudience] = useState(initial.audience);
  const [schedule, setSchedule] = useState(initial.schedule);
  const [inApp, setInApp] = useState(initial.inApp);
  const [saving, setSaving] = useState(false);
  const preview = useAudiencePreview(audience, message);
  const sample = preview.data?.sample[0] ?? { name: 'أحمد محمد', branch: 'المعادي' };
  const set = (patch: Partial<Schedule>) => setSchedule((s) => ({ ...s, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        name, preset: initial.preset ?? undefined, ...messagePayload(message), audience: audiencePayload(audience), inApp,
        schedule: {
          kind: schedule.kind,
          runAt: schedule.kind === 'once' ? schedule.runAt : undefined,
          time: schedule.kind !== 'once' ? schedule.time : undefined,
          weekdays: schedule.kind === 'weekly' ? schedule.weekdays : undefined,
          monthDay: schedule.kind === 'monthly' ? schedule.monthDay : undefined,
          intervalDays: schedule.kind === 'interval' ? schedule.intervalDays : undefined,
          startDate: schedule.kind !== 'once' ? schedule.startDate || undefined : undefined,
          endDate: schedule.kind !== 'once' ? schedule.endDate || undefined : undefined,
        },
      };
      if (initial.id) await api.put(`/app/push/campaigns/${initial.id}`, body);
      else await api.post('/app/push/campaigns', body);
      toast.success(initial.id ? 'اتحفظت التعديلات' : 'اتعملت الجدولة');
      onSaved();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent size="lg" className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{initial.id ? 'تعديل الجدولة' : 'جدولة جديدة'}</DialogTitle>
          <DialogDescription>كل المواعيد بتوقيت القاهرة، والجمهور بيتحسب وقت كل إرسال.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-5">
            <div className="grid gap-1.5"><Label>اسم الجدولة</Label><Input value={name} maxLength={150} placeholder="مثلاً: تذكير التجديد" onChange={(e) => setName(e.target.value)} /></div>
            <MessageEditor value={message} onChange={setMessage} />
            <div className="space-y-3 rounded-xl border p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" />المعاد</p>
              <div className="flex flex-wrap gap-1.5">
                {SCHEDULE_KINDS.map((k) => (
                  <button key={k.kind} type="button" onClick={() => set({ kind: k.kind })} className={cn('rounded-full border px-3 py-1 text-xs font-medium', schedule.kind === k.kind ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}>{k.label}</button>
                ))}
              </div>
              {schedule.kind === 'once' ? (
                <div className="grid gap-1.5 sm:max-w-xs"><Label>التاريخ والوقت</Label><Input type="datetime-local" className="nums" value={schedule.runAt} onChange={(e) => set({ runAt: e.target.value })} /></div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5"><Label>الساعة</Label><Input type="time" className="nums" value={schedule.time} onChange={(e) => set({ time: e.target.value })} /></div>
                  {schedule.kind === 'monthly' ? (
                    <div className="grid gap-1.5"><Label>يوم في الشهر</Label><Input type="number" min={1} max={31} className="nums" value={schedule.monthDay} onChange={(e) => set({ monthDay: Number(e.target.value) })} /></div>
                  ) : null}
                  {schedule.kind === 'interval' ? (
                    <div className="grid gap-1.5"><Label>كل (يوم)</Label><Input type="number" min={1} max={365} className="nums" value={schedule.intervalDays} onChange={(e) => set({ intervalDays: Number(e.target.value) })} /></div>
                  ) : null}
                </div>
              )}
              {schedule.kind === 'weekly' ? (
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d, i) => (
                    <button key={d} type="button" onClick={() => set({ weekdays: schedule.weekdays.includes(i) ? schedule.weekdays.filter((x) => x !== i) : [...schedule.weekdays, i] })} className={cn('rounded-lg border px-2.5 py-1.5 text-xs font-medium', schedule.weekdays.includes(i) ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent')}>{d}</button>
                  ))}
                </div>
              ) : null}
              {schedule.kind !== 'once' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5"><Label>على مدار فترة: من (اختياري)</Label><Input type="date" className="nums" value={schedule.startDate} onChange={(e) => set({ startDate: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>لحد (اختياري)</Label><Input type="date" className="nums" value={schedule.endDate} onChange={(e) => set({ endDate: e.target.value })} /></div>
                </div>
              ) : null}
            </div>
            <div className="space-y-3 rounded-xl border p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" />الجمهور</p>
              <AudienceEditor value={audience} onChange={setAudience} />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border p-4">
              <span><span className="block text-sm font-semibold">يظهر جوه التطبيق كمان</span><span className="text-xs text-muted-foreground">يتسجل في قايمة إشعارات العضو.</span></span>
              <Switch checked={inApp} onCheckedChange={setInApp} />
            </label>
          </div>
          <div className="space-y-4 lg:sticky lg:top-0 lg:self-start">
            <PhonePreview message={message} sample={sample} />
            <EstimateCard preview={preview.data} isFetching={preview.isFetching} error={preview.error} />
            <p className="text-xs text-muted-foreground">ده العدد لو اتبعت دلوقتي — وقت الإرسال الفعلي بيتحسب من جديد.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button variant="brand" disabled={saving || !name.trim() || !message.title.trim() || !message.body.trim()} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── history tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [trigger, setTrigger] = useState<string>('all');
  const [detailId, setDetailId] = useState<number | null>(null);
  const debounced = useDebounced(search, 350);
  const list = useQuery({
    queryKey: ['member-push', 'sends', page, pageSize, debounced, trigger],
    queryFn: async () => (await api.get<{ data: SendRow[]; total: number }>('/app/push/sends', { params: { page, pageSize, search: debounced || undefined, trigger: trigger === 'all' ? undefined : trigger } })).data,
    refetchInterval: (q) => (q.state.data?.data.some((r) => r.status === 'running') ? 3000 : 30_000),
  });

  const columns = useMemo<ColumnDef<SendRow, unknown>[]>(() => [
    { id: 'when', header: 'الوقت', cell: ({ row }) => <span className="nums whitespace-nowrap text-xs">{fmtDateTime(row.original.createdAt)}</span> },
    {
      id: 'source', header: 'المصدر', cell: ({ row }) => (
        <div className="space-y-0.5">
          <Badge variant={row.original.trigger === 'schedule' ? 'default' : row.original.trigger === 'test' ? 'secondary' : 'outline'}>{TRIGGER[row.original.trigger]}</Badge>
          <p className="max-w-[140px] truncate text-xs text-muted-foreground">{row.original.campaignName ?? row.original.createdBy ?? ''}</p>
        </div>
      ),
    },
    { id: 'title', header: 'الإشعار', cell: ({ row }) => <div className="max-w-[220px]"><p className="truncate text-sm font-medium">{row.original.title}</p><p className="truncate text-xs text-muted-foreground">{row.original.body}</p></div> },
    { id: 'audience', header: 'الجمهور', cell: ({ row }) => <span className="block max-w-[200px] truncate text-xs">{row.original.audienceSummary}</span> },
    { id: 'devices', header: 'موبايلات', cell: ({ row }) => <span className="nums">{fmtNumber(row.original.devices)}</span> },
    { id: 'sent', header: 'وصل', cell: ({ row }) => <span className="nums font-semibold text-success">{fmtNumber(row.original.sent)}</span> },
    { id: 'failed', header: 'فشل / قديم', cell: ({ row }) => <span className="nums text-destructive">{fmtNumber(row.original.failed)} / {fmtNumber(row.original.invalid)}</span> },
    { id: 'opened', header: 'فتحوه', cell: ({ row }) => <span className="nums">{fmtNumber(row.original.opened)}</span> },
    {
      id: 'status', header: 'الحالة', cell: ({ row }) => (
        <Badge variant={STATUS[row.original.status].variant}>{row.original.status === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}{STATUS[row.original.status].label}</Badge>
      ),
    },
    { id: 'actions', header: '', cell: ({ row }) => <Button size="sm" variant="ghost" onClick={() => setDetailId(row.original.id)}><Eye className="h-4 w-4" />تفاصيل</Button> },
  ], []);

  return (
    <>
      <DataTable
        columns={columns}
        data={list.data?.data ?? []}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="دوّر في العنوان أو النص…"
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => void list.refetch()}
        emptyTitle="مفيش إرسال لسه"
        emptyDescription="أول إشعار تبعته هيظهر هنا بأرقامه."
        toolbar={(
          <Select value={trigger} onValueChange={(v) => { setTrigger(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="manual">يدوي</SelectItem>
              <SelectItem value="schedule">مجدول</SelectItem>
              <SelectItem value="test">تجربة</SelectItem>
            </SelectContent>
          </Select>
        )}
      />
      {detailId != null ? <SendDetailDialog id={detailId} onClose={() => setDetailId(null)} /> : null}
    </>
  );
}

function SendDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['member-push', 'send', id],
    queryFn: async () => (await api.get<SendDetail>(`/app/push/sends/${id}`)).data,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 3000 : false),
  });
  const d = q.data;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تفاصيل الإرسال <span className="nums text-muted-foreground">#{id}</span></DialogTitle>
          {d ? <DialogDescription>{fmtDateTime(d.createdAt)} · {TRIGGER[d.trigger]}{d.campaignName ? ` · ${d.campaignName}` : ''}{d.createdBy ? ` · ${d.createdBy}` : ''}</DialogDescription> : null}
        </DialogHeader>
        {q.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : q.isError || !d ? <ErrorState message={apiError(q.error)} onRetry={() => void q.refetch()} /> : (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="mb-1 flex flex-wrap items-center gap-1.5"><Badge variant={STATUS[d.status].variant}>{STATUS[d.status].label}</Badge><Badge variant="outline">{typeLabel(d.type)}</Badge><Badge variant="secondary">{d.delivery === 'topic' ? `Topic: ${d.topic}` : 'لكل عضو لوحده'}</Badge></div>
              <p className="font-semibold">{d.title}</p>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{d.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">الجمهور: {d.audienceSummary}{d.link ? ` · يفتح: ${d.link}` : ''}{d.inApp ? ' · ظاهر جوه التطبيق' : ''}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <MiniStat label="أعضاء" value={d.members} />
              <MiniStat label="موبايلات" value={d.devices} />
              <MiniStat label="وصل" value={d.sent} tone="text-success" />
              <MiniStat label="فشل" value={d.failed} tone="text-destructive" />
              <MiniStat label="جهاز قديم" value={d.invalid} tone="text-warning" />
              <MiniStat label="فتحوه" value={d.opened} tone="text-primary" />
            </div>
            {d.limited ? <p className="text-xs text-muted-foreground">{fmtNumber(d.limited)} عضو ماوصلهمش عشان وصلوا للحد اليومي.</p> : null}
            {d.error ? <p className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive" dir="auto">{d.error}</p> : null}
            {d.recipients.length ? (
              <div className="overflow-hidden rounded-xl border">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground backdrop-blur"><tr><th className="p-2 text-start">العضو</th><th className="p-2 text-start">الفرع</th><th className="p-2 text-start">النتيجة</th></tr></thead>
                    <tbody>
                      {d.recipients.map((r) => (
                        <tr key={r.memberId} className="border-t">
                          <td className="p-2">{r.name} <span className="nums text-xs text-muted-foreground">{r.code}</span></td>
                          <td className="p-2 text-xs">{r.branch}</td>
                          <td className="p-2 text-xs">{RECIPIENT_STATUS[r.status] ?? r.status}{r.openedAt ? ' · فتحه' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : d.delivery === 'topic' ? <p className="text-xs text-muted-foreground">إرسال جماعي على Topic — مفيش نتيجة لكل عضو، بس عدد اللي فتحوه بيتحدث لما التطبيق يبلغ.</p> : null}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>قفل</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── settings tab ──────────────────────────────────────────────────────────────

function SettingsTab({ settings, loading, error, onRetry }: { settings?: Settings; loading: boolean; error: boolean; onRetry: () => void }) {
  const { can } = usePermission();
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings | null>(settings ?? null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  if (error) return <ErrorState message="مقدرناش نجيب الإعدادات" onRetry={onRetry} />;
  if (loading || !form) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const fb = form.firebase;

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/app/push/settings', {
        quietEnabled: form.quietEnabled, quietStart: form.quietStart, quietEnd: form.quietEnd, quietMode: form.quietMode,
        defaultType: form.defaultType, dailyLimit: form.dailyLimit,
      });
      toast.success('اتحفظت الإعدادات');
      void qc.invalidateQueries({ queryKey: ['member-push', 'settings'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <SectionCard title="ربط Firebase" icon={fb.configured ? CheckCircle2 : ShieldAlert} description="مفتاح الخدمة بيتحط على السيرفر — مش من هنا.">
        <div className={cn('flex items-center gap-3 rounded-xl p-3', fb.configured ? 'bg-success/10' : 'bg-warning/15')}>
          {fb.configured ? <CheckCircle2 className="h-6 w-6 text-success" /> : <ShieldAlert className="h-6 w-6 text-warning" />}
          <div>
            <p className="text-sm font-semibold">{fb.configured ? 'متوصل وجاهز للإرسال' : fb.keyFileSet ? 'ملف المفتاح متحدد بس مش سليم' : 'مش متوصل'}</p>
            <p className="text-xs text-muted-foreground">{fb.configured ? `المشروع: ${fb.projectId}` : 'الإرسال بيتسجل في اللوج بس لحد ما يتحط FIREBASE_SERVICE_ACCOUNT_FILE.'}</p>
          </div>
        </div>
        <div className="text-xs">
          <p className="mb-1 font-medium">آخر خطأ</p>
          {fb.lastError ? <p className="rounded-lg bg-destructive/10 p-2 text-destructive" dir="auto">{fmtDateTime(fb.lastErrorAt)} — {fb.lastError}</p> : <p className="text-muted-foreground">مفيش أخطاء 🎉</p>}
        </div>
        <p className="text-xs text-muted-foreground">الساعة دلوقتي في القاهرة: <span className="nums">{form.now.time}</span></p>
      </SectionCard>

      <SectionCard title="ساعات الهدوء" icon={MoonStar} description="مفيش إشعارات بتوصل للأعضاء في الوقت ده.">
        <label className="flex items-center justify-between gap-3"><span className="text-sm">مفعّلة</span><Switch checked={form.quietEnabled} onCheckedChange={(v) => setForm({ ...form, quietEnabled: v })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5"><Label>من</Label><Input type="time" className="nums" value={form.quietStart} disabled={!form.quietEnabled} onChange={(e) => setForm({ ...form, quietStart: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>لحد</Label><Input type="time" className="nums" value={form.quietEnd} disabled={!form.quietEnabled} onChange={(e) => setForm({ ...form, quietEnd: e.target.value })} /></div>
        </div>
        <div className="grid gap-2">
          {([['defer', 'أجّل الإرسال لحد ما تخلص ساعات الهدوء'], ['skip', 'الغي الإرسال ده خالص']] as const).map(([mode, label]) => (
            <label key={mode} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm', form.quietMode === mode && 'border-primary bg-primary/5')}>
              <input type="radio" className="accent-[hsl(var(--primary))]" checked={form.quietMode === mode} disabled={!form.quietEnabled} onChange={() => setForm({ ...form, quietMode: mode })} />{label}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">ده للجدولات. الإرسال اليدوي بيسألك الأول.</p>
        </div>
      </SectionCard>

      <SectionCard title="الافتراضي والحدود" icon={Settings2}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>النوع الافتراضي</Label>
            <Select value={form.defaultType} onValueChange={(v) => setForm({ ...form, defaultType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>أقصى عدد إشعارات للعضو في اليوم</Label>
            <Input type="number" min={0} max={50} className="nums" value={form.dailyLimit} onChange={(e) => setForm({ ...form, dailyLimit: Number(e.target.value) })} />
            <p className="text-xs text-muted-foreground">0 = من غير حد. بيتطبق على الإرسال لكل عضو لوحده (يدوي ومجدول).</p>
          </div>
        </div>
      </SectionCard>

      <div className="flex items-end justify-end lg:col-span-2">
        <Button variant="brand" disabled={saving || !can('app-management.push:update')} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}حفظ الإعدادات</Button>
      </div>
    </div>
  );
}
