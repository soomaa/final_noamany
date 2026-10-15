import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertOctagon, AlertTriangle, ArchiveRestore, Boxes, CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck,
  FileWarning, History, Info, Link2, PackageX, Pencil, PlusCircle, RefreshCw, Trash2, Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/common/states';
import { api } from '@/lib/api';
import { CLUB_ROUTES as CR } from '@/lib/club-routes';
import { formatDate, formatDateTime, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { InventoryPageShell } from './inventory-shell';

type Severity = 'critical' | 'warning' | 'info';
type IssueKind =
  | 'deleted_ingredient_in_recipe' | 'ready_product_unlinked' | 'prepared_without_recipe'
  | 'inventory_tracking_disabled' | 'negative_stock' | 'ghost_balance' | 'duplicate_count_lines';
interface IssueItem { id: number | string; title: string; detail?: string; date?: string | null; subItems?: string[] }
interface StockIssue { kind: IssueKind; severity: Severity; count: number; items: IssueItem[] }
type Category = 'delete' | 'restore' | 'recipe' | 'edit' | 'count' | 'maintenance' | 'create';
interface TimelineEvent {
  id: string; at: string; category: Category; actor: string | null; entityName: string | null;
  entityCode: string | null; action: string; detail: string | null; source: 'audit' | 'derived';
}
interface Summary {
  generatedAt: string;
  counts: { critical: number; warning: number; info: number; blockedProducts: number };
  lastApprovedCount: { reference: string; at: string } | null;
  issues: StockIssue[];
  timeline: TimelineEvent[];
}

/** Plain-language explanation for each issue: what is happening, why it matters, how to fix it. */
const ISSUE_COPY: Record<IssueKind, { title: string; what: string; impact: string; fix: string; link?: { to: string; label: string }; icon: typeof AlertOctagon }> = {
  deleted_ingredient_in_recipe: {
    title: 'خامات محذوفة لسه موجودة في وصفات',
    what: 'الخامات دي اتحذفت أو اتوقفت من المخزون، لكن مشروبات لسه بتستخدمها في وصفتها.',
    impact: 'المشروبات دي بتترفض في الكاشير برسالة «وصفة البيع تستخدم خامة محذوفة». لو الموظفين عملوها من غير فاتورة، مكوناتها بتخرج من غير ما تتخصم فيظهر عجز في الجرد.',
    fix: 'لو الخامة اتحذفت بالغلط رجّعيها. لو ليها بديل جديد: من «خامات الكافيه» افتحي «استبدال الخامات» واختاري المحذوفة كمصدر والجديدة كبديل.',
    link: { to: CR.cafe.rawMaterials, label: 'فتح خامات الكافيه' },
    icon: PackageX,
  },
  ready_product_unlinked: {
    title: 'منتجات جاهزة مش مربوطة بصنف مخزون',
    what: 'منتج جاهز في قائمة الكافيه مش مربوط بأي صنف مخزون، أو مربوط بصنف اتحذف.',
    impact: 'الكاشير مش هيقدر يبيع المنتج ده لحد ما يتربط، وأي كمية بتخرج منه ما بتتسجلش.',
    fix: 'افتحي المنتج من «منتجات الكافيه» واربطيه بصنف المخزون الصحيح.',
    link: { to: CR.cafe.products, label: 'فتح منتجات الكافيه' },
    icon: Link2,
  },
  prepared_without_recipe: {
    title: 'مشروبات من غير وصفة',
    what: 'منتجات محضّرة مفيهاش أي مكونات، لا في المنتج ولا في أحجامه.',
    impact: 'الكاشير بيرفض بيعها لأن مفيش حاجة تتخصم من المخزون.',
    fix: 'أضيفي مكونات الوصفة للمنتج من «منتجات الكافيه»، أو أوقفي المنتج لو مش مستخدم.',
    link: { to: CR.cafe.products, label: 'فتح منتجات الكافيه' },
    icon: FileWarning,
  },
  inventory_tracking_disabled: {
    title: 'تتبع المخزون متوقف (وضع كاشير فقط)',
    what: 'الفرع شغال في وضع «كاشير فقط».',
    impact: 'الفواتير بتتسجل والفلوس بتتحسب، لكن ولا حاجة بتتخصم من المخزون، فالرصيد ما بيتحركش خالص مع البيع.',
    fix: 'من «إعدادات نقطة البيع» فعّلي تتبع المخزون.',
    link: { to: '/sales/pos-admin', label: 'فتح إعدادات نقطة البيع' },
    icon: AlertTriangle,
  },
  negative_stock: {
    title: 'أرصدة بالسالب',
    what: 'أصناف رصيدها على السيستم أقل من صفر.',
    impact: 'اتباع أو اتصرف منها أكتر من اللي السيستم فاكره موجود. غالباً توريد ما اتسجلش، أو جرد قديم.',
    fix: 'سجّلي التوريد الناقص من «مشتريات الكافيه»، أو اعملي جرد للصنف ده.',
    link: { to: CR.cafe.stockTaking, label: 'فتح الجرد' },
    icon: AlertTriangle,
  },
  duplicate_count_lines: {
    title: 'صنف مكرر في جلسة جرد مفتوحة',
    what: 'نفس الصنف متسجل أكتر من مرة في جلسة جرد لسه ما اتعتمدتش.',
    impact: 'لو الجلسة اتعتمدت كده، العجز أو الزيادة هيتحسبوا مرتين على الرصيد.',
    fix: 'افتحي جلسة الجرد واحذفي البند المكرر قبل الإرسال للاعتماد.',
    link: { to: CR.cafe.stockTaking, label: 'فتح الجرد' },
    icon: ClipboardCheck,
  },
  ghost_balance: {
    title: 'أرصدة على أصناف محذوفة',
    what: 'أصناف اتحذفت وهي لسه عليها رصيد في السيستم.',
    impact: 'الرصيد ده مش بيظهر في الجرد ولا بيتحسب. وجوده معناه إن الصنف اتحذف وهو فيه بضاعة، أو إن مبيعات كانت بتخصم منه بعد حذفه.',
    fix: 'لو الصنف لسه مستخدم رجّعيه. لو مش مستخدم، مفيش مطلوب.',
    icon: Info,
  },
};

const SEVERITY: Record<Severity, { label: string; badge: 'destructive' | 'warning' | 'secondary'; ring: string; icon: typeof AlertOctagon }> = {
  critical: { label: 'حرجة', badge: 'destructive', ring: 'border-destructive/40', icon: AlertOctagon },
  warning: { label: 'تحذير', badge: 'warning', ring: 'border-warning/40', icon: AlertTriangle },
  info: { label: 'للعلم', badge: 'secondary', ring: 'border-border', icon: Info },
};

const CATEGORY: Record<Category, { label: string; icon: typeof Trash2; tone: string }> = {
  delete: { label: 'حذف', icon: Trash2, tone: 'bg-destructive/10 text-destructive' },
  restore: { label: 'استرجاع', icon: ArchiveRestore, tone: 'bg-success/12 text-success' },
  recipe: { label: 'وصفات ومنتجات', icon: Wrench, tone: 'bg-primary/10 text-primary' },
  edit: { label: 'تعديل', icon: Pencil, tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  create: { label: 'إضافة', icon: PlusCircle, tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  count: { label: 'جرد', icon: ClipboardCheck, tone: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  maintenance: { label: 'صيانة النظام', icon: Wrench, tone: 'bg-muted text-muted-foreground' },
};

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function InventoryStockHealthPage() {
  const { ui } = useLocale();
  const [dateFrom, setDateFrom] = useState(daysAgo(90));
  const [dateTo, setDateTo] = useState(localToday());
  const [applied, setApplied] = useState({ dateFrom: daysAgo(90), dateTo: localToday() });
  const [category, setCategory] = useState<Category | 'all'>('all');

  const query = useQuery({
    queryKey: ['inventory-audit', applied.dateFrom, applied.dateTo],
    queryFn: async () => (await api.get<Summary>('/inventory-audit', { params: applied })).data,
  });
  const data = query.data;

  return (
    <InventoryPageShell
      title={ui('سجل ومشاكل المخزون')}
      description={ui('كل حاجة ممكن تخلي أرقام المخزون غلط، بشرح بسيط وطريقة الحل، وسجل بكل اللي اتغير ومين غيّره')}
      actions={(
        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`} />{ui('تحديث')}
        </Button>
      )}
    >
      {query.isLoading ? <PageSkeleton /> : query.isError || !data ? (
        <ErrorState title={ui('تعذر تحميل السجل')} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <StatusBanner data={data} />
          <SummaryCards data={data} />
          <IssuesSection issues={data.issues} />
          <TimelineSection
            events={data.timeline}
            category={category}
            onCategory={setCategory}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFrom={setDateFrom}
            onDateTo={setDateTo}
            onApply={() => setApplied({ dateFrom, dateTo })}
          />
        </>
      )}
    </InventoryPageShell>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

function StatusBanner({ data }: { data: Summary }) {
  const { ui } = useLocale();
  const ok = data.counts.critical === 0 && data.counts.warning === 0;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${ok ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'}`}>
      {ok ? <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" /> : <AlertOctagon className="mt-0.5 size-6 shrink-0 text-destructive" />}
      <div className="min-w-0">
        <p className="font-bold">
          {ok
            ? ui('المخزون سليم: مفيش مشكلة بتأثر على الخصم من المخزون دلوقتي')
            : `${ui('فيه مشاكل بتأثر على المخزون دلوقتي')}: ${toArabicDigits(data.counts.critical)} ${ui('حرجة')} · ${toArabicDigits(data.counts.warning)} ${ui('تحذير')}`}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {ui('الصفحة بتفحص البيانات الحالية كل مرة تتفتح. أول ما تصلحي السبب، المشكلة بتختفي من هنا تلقائياً.')}
          {' '}{ui('آخر فحص')}: <span className="nums">{formatDateTime(data.generatedAt)}</span>
        </p>
      </div>
    </div>
  );
}

function SummaryCards({ data }: { data: Summary }) {
  const { ui } = useLocale();
  const cards = [
    { title: ui('مشاكل حرجة'), value: data.counts.critical, note: ui('بتوقف البيع أو بتخلي الخصم غلط'), tone: data.counts.critical ? 'text-destructive' : 'text-success', icon: AlertOctagon },
    { title: ui('منتجات مش بتتباع'), value: data.counts.blockedProducts, note: ui('الكاشير بيرفضها بسبب وصفة أو ربط'), tone: data.counts.blockedProducts ? 'text-destructive' : 'text-success', icon: PackageX },
    { title: ui('تحذيرات'), value: data.counts.warning, note: ui('محتاجة مراجعة'), tone: data.counts.warning ? 'text-warning' : 'text-success', icon: AlertTriangle },
    { title: ui('آخر جرد معتمد'), value: data.lastApprovedCount ? formatDate(data.lastApprovedCount.at) : '—', note: data.lastApprovedCount?.reference ?? ui('مفيش جرد معتمد لسه'), tone: 'text-foreground', icon: Boxes },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.title} className="rounded-2xl">
          <CardContent className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{c.title}</p>
              <p className={`nums mt-1 text-2xl font-black ${c.tone}`}>{typeof c.value === 'number' ? toArabicDigits(c.value) : c.value}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{c.note}</p>
            </div>
            <c.icon className={`size-6 shrink-0 ${c.tone}`} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function IssuesSection({ issues }: { issues: StockIssue[] }) {
  const { ui } = useLocale();
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold"><AlertTriangle className="size-5 text-warning" />{ui('المشاكل الحالية وطريقة حلها')}</h2>
      {issues.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={ui('مفيش مشاكل')} description={ui('كل الوصفات مربوطة بخامات موجودة، ومفيش أرصدة سالبة ولا جرد فيه تكرار.')} compact />
      ) : issues.map((issue) => <IssueCard key={issue.kind} issue={issue} />)}
    </section>
  );
}

function IssueCard({ issue }: { issue: StockIssue }) {
  const { ui } = useLocale();
  const [open, setOpen] = useState(issue.severity === 'critical');
  const copy = ISSUE_COPY[issue.kind];
  const sev = SEVERITY[issue.severity];
  const shown = open ? issue.items : issue.items.slice(0, 0);
  return (
    <Card className={`rounded-2xl border-2 ${sev.ring}`}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <copy.icon className="size-5 shrink-0" />
            {ui(copy.title)}
            <span className="nums text-muted-foreground">({toArabicDigits(issue.count)})</span>
          </CardTitle>
          <Badge variant={sev.badge}>{ui(sev.label)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid gap-2 md:grid-cols-3">
          <div className="rounded-xl bg-muted/50 p-3"><dt className="mb-1 text-xs font-bold text-muted-foreground">{ui('إيه اللي بيحصل')}</dt><dd>{ui(copy.what)}</dd></div>
          <div className="rounded-xl bg-muted/50 p-3"><dt className="mb-1 text-xs font-bold text-muted-foreground">{ui('ليه ده مشكلة')}</dt><dd>{ui(copy.impact)}</dd></div>
          <div className="rounded-xl bg-primary/5 p-3"><dt className="mb-1 text-xs font-bold text-primary">{ui('إزاي تصلحيها')}</dt><dd>{ui(copy.fix)}</dd></div>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {open ? ui('إخفاء التفاصيل') : `${ui('عرض التفاصيل')} (${toArabicDigits(issue.items.length)})`}
          </Button>
          {copy.link ? <Button asChild size="sm" variant="secondary"><Link to={copy.link.to}>{ui(copy.link.label)}</Link></Button> : null}
        </div>
        {shown.length ? (
          <ul className="divide-y rounded-xl border">
            {shown.map((item) => (
              <li key={String(item.id)} className="p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{issueItemTitle(issue.kind, item, ui)}</span>
                  <span className="text-xs text-muted-foreground">{issueItemMeta(issue.kind, item, ui)}</span>
                </div>
                {item.subItems?.length ? (
                  <div className="mt-2">
                    <p className="mb-1 text-xs text-muted-foreground">{ui(issue.kind === 'duplicate_count_lines' ? 'الأصناف المكررة' : 'موجودة في وصفات')}:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {item.subItems.map((s) => <span key={s} className="rounded-lg bg-muted px-2 py-1 text-xs">{s}</span>)}
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function issueItemTitle(kind: IssueKind, item: IssueItem, ui: (s: string) => string) {
  if (kind === 'inventory_tracking_disabled') return item.title === 'all' ? ui('كل الفروع') : `${ui('فرع رقم')} ${toArabicDigits(item.title)}`;
  return item.title;
}

function issueItemMeta(kind: IssueKind, item: IssueItem, ui: (s: string) => string) {
  switch (kind) {
    case 'deleted_ingredient_in_recipe':
      return `${ui(item.detail === 'inactive' ? 'موقوفة' : 'اتحذفت')}${item.date ? ` ${formatDateTime(item.date)}` : ''}`;
    case 'ghost_balance':
      return `${ui('الرصيد')}: ${item.detail ?? ''}${item.date ? ` · ${ui('اتحذف')} ${formatDate(item.date)}` : ''}`;
    case 'negative_stock':
      return `${ui('الرصيد')}: ${item.detail ?? ''}`;
    case 'ready_product_unlinked':
      return item.detail ? `${ui('مربوط بصنف محذوف')}: ${item.detail}` : ui('مش مربوط بأي صنف');
    case 'duplicate_count_lines':
      return item.date ? formatDateTime(item.date) : '';
    case 'inventory_tracking_disabled':
      return item.date ? `${ui('من')} ${formatDateTime(item.date)}` : '';
    default:
      return item.detail ?? '';
  }
}

// --------------------------------------------------------------- timeline

function describe(event: TimelineEvent, ui: (s: string) => string): { text: string; extra?: string[] } {
  const name = event.entityName ? `«${event.entityName}»${event.entityCode ? ` (${event.entityCode})` : ''}` : '';
  const [entity, verb, failed] = event.action.split('|');
  const fail = failed ? ` — ${ui('العملية فشلت ومتنفذتش')}` : '';
  switch (event.action) {
    case 'relink': return { text: ui('نقل وصفات من خامة محذوفة لخامة جديدة'), extra: event.detail ? [event.detail] : undefined };
    case 'ingredient_swap': return { text: ui('استبدل خامة بخامة تانية في الوصفات من شاشة استبدال الخامات'), extra: event.detail ? [event.detail] : undefined };
    case 'restore': return { text: ui('رجّع خامات كانت محذوفة عشان وصفاتها تشتغل تاني'), extra: event.detail ? [event.detail] : undefined };
    case 'recipe_remove_ingredient': return { text: ui('شال خامات محذوفة من الوصفات'), extra: event.detail ? [event.detail] : undefined };
    case 'system_correction': {
      let parsed: { lines: number; shortage: string[]; surplus: string[] } | null = null;
      try { parsed = event.detail ? JSON.parse(event.detail) : null; } catch { parsed = null; }
      const extra = [ui('ده تصحيح من النظام لأرقام الحركات، مش جرد فعلي للرف. الكمية المكتوبة هي رصيد السيستم بعد التصحيح.')];
      if (parsed?.shortage.length) extra.push(`${ui('خصم')}: ${parsed.shortage.join('، ')}`);
      if (parsed?.surplus.length) extra.push(`${ui('إضافة')}: ${parsed.surplus.join('، ')}`);
      return { text: `${ui('تصحيح من النظام')} ${event.entityName ?? ''}`, extra };
    }
    case 'count_approved': {
      let parsed: { lines: number; shortage: string[]; surplus: string[] } | null = null;
      try { parsed = event.detail ? JSON.parse(event.detail) : null; } catch { parsed = null; }
      const extra: string[] = [];
      if (parsed?.shortage.length) extra.push(`${ui('عجز')}: ${parsed.shortage.join('، ')}`);
      if (parsed?.surplus.length) extra.push(`${ui('زيادة')}: ${parsed.surplus.join('، ')}`);
      return { text: `${ui('اعتمد الجرد')} ${event.entityName ?? ''} (${toArabicDigits(parsed?.lines ?? 0)} ${ui('صنف')})`, extra };
    }
  }
  if (entity === 'products') {
    if (verb === 'delete') return { text: `${ui('حذف الخامة')} ${name}${fail}` };
    if (verb === 'post') return { text: `${ui('أضاف خامة جديدة')} ${name}${fail}` };
    return { text: `${ui('عدّل بيانات الخامة')} ${name}${fail}` };
  }
  if (entity === 'cafe-products') {
    if (verb === 'delete') return { text: `${ui('حذف منتج الكافيه')} ${name}${fail}` };
    if (verb === 'post') return { text: `${ui('أضاف أو عدّل منتج كافيه')} ${name}${fail}` };
    return { text: `${ui('عدّل منتج أو وصفة')} ${name}${fail}` };
  }
  if (entity === 'cafe-bundles') return { text: `${ui('عدّل باندل')}${fail}` };
  if (entity === 'stock-taking') return { text: `${ui('عملية على الجرد')}${fail}` };
  if (entity === 'opening-stocks') return { text: `${ui('سجّل رصيد أول المدة')}${fail}` };
  if (entity === 'cafe-waste') return { text: `${ui('سجّل أو عدّل هالك')}${fail}` };
  return { text: event.action };
}

function TimelineSection(props: {
  events: TimelineEvent[]; category: Category | 'all'; onCategory: (c: Category | 'all') => void;
  dateFrom: string; dateTo: string; onDateFrom: (v: string) => void; onDateTo: (v: string) => void; onApply: () => void;
}) {
  const { ui } = useLocale();
  const filtered = props.category === 'all' ? props.events : props.events.filter((e) => e.category === props.category);
  const counts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const e of props.events) m.set(e.category, (m.get(e.category) ?? 0) + 1);
    return m;
  }, [props.events]);
  const byDay = useMemo(() => {
    const m = new Map<string, TimelineEvent[]>();
    for (const e of filtered) { const k = formatDate(e.at); m.set(k, [...(m.get(k) ?? []), e]); }
    return [...m.entries()];
  }, [filtered]);

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold"><History className="size-5 text-primary" />{ui('سجل كل اللي اتغير في المخزون')}</h2>
      <Card className="rounded-2xl">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm font-semibold"><span>{ui('من يوم')}</span><Input type="date" value={props.dateFrom} max={props.dateTo} onChange={(e) => props.onDateFrom(e.target.value)} className="nums min-h-10" /></label>
            <label className="grid gap-1 text-sm font-semibold"><span>{ui('إلى يوم')}</span><Input type="date" value={props.dateTo} min={props.dateFrom} onChange={(e) => props.onDateTo(e.target.value)} className="nums min-h-10" /></label>
            <Button onClick={props.onApply}>{ui('عرض')}</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip active={props.category === 'all'} onClick={() => props.onCategory('all')}>{ui('الكل')} ({toArabicDigits(props.events.length)})</Chip>
            {(Object.keys(CATEGORY) as Category[]).filter((c) => counts.get(c)).map((c) => (
              <Chip key={c} active={props.category === c} onClick={() => props.onCategory(c)}>{ui(CATEGORY[c].label)} ({toArabicDigits(counts.get(c) ?? 0)})</Chip>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{ui('العمليات اللي حصلت قبل تفعيل السجل بتظهر من غير اسم مستخدم، لأن السيستم ما كانش بيسجله وقتها.')}</p>
        </CardContent>
      </Card>
      {byDay.length === 0 ? (
        <EmptyState icon={History} title={ui('مفيش عمليات في الفترة دي')} compact />
      ) : (
        <div className="space-y-4">
          {byDay.map(([day, events]) => (
            <div key={day}>
              <p className="nums mb-2 text-sm font-bold text-muted-foreground">{day}</p>
              <ol className="space-y-2">
                {events.map((e) => {
                  const cat = CATEGORY[e.category];
                  const { text, extra } = describe(e, ui);
                  return (
                    <li key={e.id} className="flex gap-3 rounded-xl border bg-card p-3">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${cat.tone}`}><cat.icon className="size-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="font-semibold">{text}</p>
                          <span className="nums shrink-0 text-xs text-muted-foreground">{formatDateTime(e.at)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {ui('بواسطة')}: <span className="font-semibold text-foreground">{e.actor ?? ui('غير مسجل')}</span>
                          {e.source === 'derived' && !e.actor ? ` · ${ui('قبل تفعيل السجل')}` : ''}
                        </p>
                        {extra?.length ? <ul className="mt-1.5 space-y-0.5 text-xs">{extra.map((x) => <li key={x} className="break-words">{x}</li>)}</ul> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`min-h-9 rounded-full border px-3 text-sm font-semibold transition ${active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>
      {children}
    </button>
  );
}
