import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Time12Input } from '@/components/common/time-12-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PENDING_SUMMARY_KEY, usePendingExceptions } from '@/components/layout/attendance-pending-banner';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

type CaseType = 'no_punch' | 'missing_checkin' | 'missing_checkout' | 'late' | 'early_leave';
type Decision = 'present' | 'absent' | 'leave' | 'excused' | 'permission';

interface Resolution {
  decision: Decision;
  checkIn: string | null;
  checkOut: string | null;
  reason: string;
  leaveTypeId: number | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
}

interface ExceptionItem {
  key: string;
  empCode: number;
  employeeName: string;
  jobTitle: string | null;
  branchName: string | null;
  date: string;
  weekday: string;
  shiftId: number | null;
  shiftTitle: string | null;
  source: 'main' | 'replacement' | 'extra';
  expectedIn: string | null;
  expectedOut: string | null;
  checkIn: string | null;
  checkOut: string | null;
  lateMin: number;
  earlyLeaveMin: number;
  minutes: number;
  caseType: CaseType;
  caseTypes: CaseType[];
  pendingLeave: boolean;
  resolution: Resolution | null;
}

type Gender = 'all' | 'male' | 'female';

interface ExceptionsResponse {
  from: string;
  to: string;
  gender: Gender;
  staleAfterDays: number;
  branchOptions: Array<{ id: number; name: string | null }>;
  items: ExceptionItem[];
  counters: { total: number; open: number; resolved: number; byType: Record<CaseType, number> };
}

const CASE_LABELS: Record<CaseType, string> = {
  no_punch: 'لم يبصم',
  missing_checkin: 'بدون بصمة حضور',
  missing_checkout: 'بدون بصمة انصراف',
  late: 'تأخير',
  early_leave: 'انصراف مبكر',
};
const CASE_VARIANT: Record<CaseType, 'destructive' | 'warning' | 'secondary'> = {
  no_punch: 'destructive',
  missing_checkin: 'warning',
  missing_checkout: 'warning',
  late: 'secondary',
  early_leave: 'secondary',
};
const DECISIONS: Array<{ value: Decision; label: string; hint: string }> = [
  { value: 'present', label: 'حاضر', hint: 'كان موجودًا؛ تُسجَّل الأوقات التقريبية كبصمة يدوية ولا يُخصم غياب أو نسيان بصمة' },
  { value: 'absent', label: 'غائب', hint: 'يُحتسب غياب في الراتب' },
  { value: 'leave', label: 'إجازة', hint: 'تُحتسب إجازة من النوع المختار بدل الغياب' },
  { value: 'permission', label: 'إذن', hint: 'خرج أو تأخر بإذن؛ لا غياب ولا نسيان بصمة، والتأخير يُحسب كتأخير بإذن' },
  { value: 'excused', label: 'معذور', hint: 'لا يُخصم أي شيء لهذه الحالة' },
];
const DECISION_LABEL = Object.fromEntries(DECISIONS.map((d) => [d.value, d.label])) as Record<Decision, string>;

const todayCairo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** Same look-back as the server's pending summary (PENDING_LOOKBACK_DAYS). */
const LOOKBACK_DAYS = 14;

type Filter = CaseType | 'all' | 'open' | 'stale';

interface FormState {
  decision: Decision;
  checkIn: string;
  checkOut: string;
  reason: string;
  leaveTypeId: string;
}

function emptyForm(item?: ExceptionItem): FormState {
  const r = item?.resolution;
  return {
    decision: r?.decision ?? (item?.caseType === 'no_punch' ? 'absent' : 'present'),
    checkIn: '',
    checkOut: '',
    reason: r?.reason ?? '',
    leaveTypeId: r?.leaveTypeId ? String(r.leaveTypeId) : '',
  };
}

export function AttendanceExceptionsPage() {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const today = todayCairo();
  const [date, setDate] = useState(today);
  const [branchId, setBranchId] = useState('');
  /** '' = the server default (a men/women section manager opens on their own section). */
  const [gender, setGender] = useState<Gender | ''>('');
  const [typeFilter, setTypeFilter] = useState<Filter>('open');
  const staleMode = typeFilter === 'stale';
  const pending = usePendingExceptions();
  const query = useQuery({
    queryKey: ['attendance', 'exceptions', staleMode ? 'stale' : date, branchId, gender],
    queryFn: async () => (await api.get<ExceptionsResponse>('/attendance/exceptions', {
      params: {
        ...(staleMode ? { from: pending.data?.since ?? addDays(today, -(LOOKBACK_DAYS - 1)), to: today, status: 'stale' } : { date }),
        ...(branchId ? { branchId } : {}),
        ...(gender ? { gender } : {}),
      },
    })).data,
    placeholderData: keepPreviousData,
  });
  const branchOptions = query.data?.branchOptions ?? [];
  const genderValue: Gender = gender || query.data?.gender || 'all';
  const leaveTypes = useQuery({
    queryKey: ['attendance', 'exceptions', 'leave-types'],
    queryFn: async () => (await api.get<Array<{ id: number; name: string }>>('/attendance/exceptions/leave-types')).data,
    staleTime: 5 * 60_000,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const visible = useMemo(() => items.filter((item) => {
    if (typeFilter === 'all' || typeFilter === 'stale') return true;
    if (typeFilter === 'open') return !item.resolution;
    return item.caseTypes.includes(typeFilter);
  }), [items, typeFilter]);

  const [active, setActive] = useState<ExceptionItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (active) setForm(emptyForm(active)); }, [active]);

  const needsIn = !!active && form.decision === 'present' && (active.caseTypes.includes('no_punch') || active.caseTypes.includes('missing_checkin'));
  const needsOut = !!active && form.decision === 'present' && (active.caseTypes.includes('no_punch') || active.caseTypes.includes('missing_checkout'));

  const save = async (goNext: boolean) => {
    if (!active) return;
    if (!form.reason.trim()) return toast.error(ui('اكتب السبب'));
    if (needsIn && !form.checkIn) return toast.error(ui('أدخل وقت الحضور التقريبي'));
    if (needsOut && !form.checkOut) return toast.error(ui('أدخل وقت الانصراف التقريبي'));
    if (form.decision === 'leave' && !form.leaveTypeId) return toast.error(ui('اختر نوع الإجازة'));
    setSaving(true);
    try {
      await api.post('/attendance/exceptions/resolve', {
        empCode: active.empCode,
        date: active.date,
        shiftId: active.shiftId ?? undefined,
        decision: form.decision,
        checkIn: needsIn ? form.checkIn : undefined,
        checkOut: needsOut ? form.checkOut : undefined,
        reason: form.reason.trim(),
        leaveTypeId: form.decision === 'leave' ? Number(form.leaveTypeId) : undefined,
      });
      toast.success(ui('تم حفظ القرار'));
      void queryClient.invalidateQueries({ queryKey: PENDING_SUMMARY_KEY });
      const refreshed = await query.refetch();
      if (goNext) {
        const next = (refreshed.data?.items ?? []).find((item) => !item.resolution && item.key !== active.key && visible.some((v) => v.key === item.key));
        setActive(next ?? null);
        if (!next) toast.success(ui('تم حسم كل الحالات'));
      } else {
        setActive(null);
      }
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const counters = query.data?.counters;
  const staleCount = staleMode ? counters?.total : pending.data?.stale;
  const chip = (value: Filter, label: string, count?: number, tone?: 'danger') => (
    <button
      key={value}
      type="button"
      onClick={() => setTypeFilter(value)}
      aria-pressed={typeFilter === value}
      className={`rounded-lg border px-4 py-3 text-start transition ${typeFilter === value ? 'border-primary bg-primary/10' : 'bg-card hover:bg-muted'} ${tone === 'danger' && (count ?? 0) > 0 ? 'border-destructive/50 text-destructive' : ''}`}
    >
      <div className={`text-xs ${tone === 'danger' && (count ?? 0) > 0 ? '' : 'text-muted-foreground'}`}>{ui(label)}</div>
      <div className="nums text-2xl font-bold">{count == null ? '—' : toArabicDigits(String(count))}</div>
    </button>
  );
  const moveDay = (days: number) => {
    const next = addDays(date, days);
    if (next <= today) setDate(next);
  };
  const emptyText = staleMode
    ? 'مفيش حالات قديمة مفتوحة 👌'
    : !items.length
      ? (date === today ? 'مفيش حالات النهاردة 👌' : 'مفيش حالات في اليوم ده 👌')
      : typeFilter === 'open' ? 'كل حالات اليوم اتحسمت 👌' : 'لا توجد حالات';
  const time = (value: string | null) => value ? <span className="nums">{toArabicDigits(value)}</span> : <span className="text-muted-foreground">—</span>;

  return <div className="space-y-4">
    <PageHeader
      title={ui('الحالات اليومية')}
      description={ui('كل حالة غير طبيعية في الحضور لفرعك؛ راجعها يوميًا واحسم كل حالة بقرار وسبب')}
      actions={<Button variant="outline" onClick={() => void query.refetch()}><RefreshCw className="size-4" />{ui('تحديث')}</Button>}
    />

    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      {staleMode ? (
        <div>
          <Label>{ui('الفترة')}</Label>
          <div className="mt-1.5 flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
            <span className="nums">{toArabicDigits(query.data?.from ?? '')}</span>
            <span className="mx-1">←</span>
            <span className="nums">{toArabicDigits(query.data?.to ?? today)}</span>
            <span className="ms-2 text-muted-foreground">{ui('مفتوحة من يومين أو أكتر')}</span>
          </div>
        </div>
      ) : (
        <div>
          <Label>{ui('التاريخ')}</Label>
          <div className="mt-1.5 flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" onClick={() => moveDay(-1)} aria-label={ui('اليوم السابق')} title={ui('اليوم السابق')}>
              <ChevronRight className="size-4" />
            </Button>
            <Input type="date" className="w-44" value={date} max={today} onChange={(event) => event.target.value && setDate(event.target.value)} />
            <Button type="button" variant="outline" size="icon" onClick={() => moveDay(1)} disabled={date >= today} aria-label={ui('اليوم التالي')} title={ui('اليوم التالي')}>
              <ChevronLeft className="size-4" />
            </Button>
            {date !== today && <Button type="button" variant="ghost" size="sm" onClick={() => setDate(today)}>{ui('النهارده')}</Button>}
          </div>
        </div>
      )}
      {branchOptions.length > 1 && <div>
        <Label>{ui('الفرع')}</Label>
        <select
          className="mt-1.5 flex h-10 w-56 rounded-md border border-input bg-background px-3 text-sm"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
        >
          <option value="">{ui('كل الفروع المتاحة')}</option>
          {branchOptions.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name ?? `#${branch.id}`}</option>)}
        </select>
      </div>}
      <div>
        <Label>{ui('القسم')}</Label>
        <div className="mt-1.5 flex h-10 overflow-hidden rounded-md border" role="radiogroup" aria-label={ui('القسم')}>
          {([['all', 'الكل'], ['male', 'رجالي'], ['female', 'حريمي']] as Array<[Gender, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={genderValue === value}
              onClick={() => setGender(value)}
              className={`px-4 text-sm font-medium transition ${genderValue === value ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
            >
              {ui(label)}
            </button>
          ))}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {chip('open', 'لم تُحسم بعد', staleMode ? undefined : counters?.open)}
      {chip('stale', 'قديم مفتوح', staleCount, 'danger')}
      {chip('all', 'كل الحالات', staleMode ? undefined : counters?.total)}
      {(Object.keys(CASE_LABELS) as CaseType[]).map((type) => chip(type, CASE_LABELS[type], staleMode ? undefined : counters?.byType[type]))}
    </div>

    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {['الموظف', 'الفرع', 'اليوم', 'الوردية', 'المتوقع', 'الحضور', 'الانصراف', 'الحالة', 'القرار', ''].map((h) => (
              <th key={h} className="px-3 py-2 text-start font-medium">{ui(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {query.isLoading && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">{ui('جاري التحميل…')}</td></tr>}
          {query.isError && <tr><td colSpan={10} className="p-6 text-center text-destructive">{apiError(query.error)}</td></tr>}
          {!query.isLoading && !query.isError && !visible.length && (
            <tr><td colSpan={10} className="p-8 text-center text-base text-muted-foreground">{ui(emptyText)}</td></tr>
          )}
          {visible.map((item) => (
            <tr key={item.key} className={`border-t ${item.resolution ? '' : 'bg-destructive/5'}`}>
              <td className="px-3 py-2">
                <div className="font-medium text-primary">{item.employeeName}</div>
                <div className="nums text-xs text-muted-foreground">{toArabicDigits(String(item.empCode))}{item.jobTitle ? ` — ${item.jobTitle}` : ''}</div>
              </td>
              <td className="px-3 py-2">{item.branchName ?? '—'}</td>
              <td className="px-3 py-2"><div>{item.weekday}</div><div className="nums text-xs text-muted-foreground">{toArabicDigits(item.date)}</div></td>
              <td className="px-3 py-2">{item.shiftTitle ?? '—'}{item.source !== 'main' && <div className="text-xs text-muted-foreground">{ui(item.source === 'extra' ? 'شيفت إضافي' : 'وردية بديلة')}</div>}</td>
              <td className="px-3 py-2">{time(item.expectedIn)} – {time(item.expectedOut)}</td>
              <td className="px-3 py-2">{time(item.checkIn)}</td>
              <td className="px-3 py-2">{time(item.checkOut)}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {(item.caseTypes.length ? item.caseTypes : [item.caseType]).map((type) => (
                    <Badge key={type} variant={CASE_VARIANT[type] ?? 'secondary'}>
                      {ui(CASE_LABELS[type] ?? type)}
                      {type === 'late' && item.lateMin > 0 && <span className="nums ms-1">{toArabicDigits(String(item.lateMin))} {ui('د')}</span>}
                      {type === 'early_leave' && item.earlyLeaveMin > 0 && <span className="nums ms-1">{toArabicDigits(String(item.earlyLeaveMin))} {ui('د')}</span>}
                    </Badge>
                  ))}
                </div>
                {item.pendingLeave && <div className="mt-1 text-xs text-warning">{ui('توجد إجازة لم تُعتمد نهائيًا بعد')}</div>}
              </td>
              <td className="px-3 py-2">
                {item.resolution ? (
                  <div>
                    <Badge variant="success"><CheckCircle2 className="me-1 size-3" />{ui(DECISION_LABEL[item.resolution.decision] ?? item.resolution.decision)}</Badge>
                    <div className="mt-1 max-w-56 truncate text-xs text-muted-foreground" title={item.resolution.reason}>{item.resolution.reason}</div>
                    <div className="nums text-xs text-muted-foreground">
                      {item.resolution.resolvedByName ?? '—'}{item.resolution.resolvedAt ? ` · ${toArabicDigits(item.resolution.resolvedAt.slice(0, 16).replace('T', ' '))}` : ''}
                    </div>
                  </div>
                ) : <span className="font-medium text-destructive">{ui('لم تُحسم')}</span>}
              </td>
              <td className="px-3 py-2">
                <Button size="sm" variant={item.resolution ? 'outline' : 'default'} onClick={() => setActive(item)} autoFocus={!item.resolution && item.key === visible.find((v) => !v.resolution)?.key}>
                  {ui(item.resolution ? 'تعديل' : 'حسم')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
      <DialogContent
        className="max-w-lg"
        onKeyDown={(event) => {
          // Ctrl/⌘+Enter = حفظ والتالي; Alt+1…5 picks a decision (works while typing the reason).
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            if (!saving) void save(true);
            return;
          }
          const index = event.altKey ? Number(event.code.replace('Digit', '')) - 1 : -1;
          if (index >= 0 && index < DECISIONS.length) {
            event.preventDefault();
            setForm((f) => ({ ...f, decision: DECISIONS[index].value }));
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{ui('حسم الحالة')}: {active?.employeeName}</DialogTitle>
        </DialogHeader>
        {active && <div className="space-y-4">
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div>{active.weekday} <span className="nums">{toArabicDigits(active.date)}</span> — {active.shiftTitle ?? ui('بدون وردية')}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(active.caseTypes.length ? active.caseTypes : [active.caseType]).map((type) => <Badge key={type} variant={CASE_VARIANT[type] ?? 'secondary'}>{ui(CASE_LABELS[type] ?? type)}</Badge>)}
            </div>
            <div className="mt-1 text-muted-foreground">
              {ui('المتوقع')}: {time(active.expectedIn)} – {time(active.expectedOut)} · {ui('الفعلي')}: {time(active.checkIn)} – {time(active.checkOut)}
            </div>
          </div>
          <div>
            <Label>{ui('القرار')}</Label>
            <div className="mt-1.5 grid grid-cols-5 gap-2" role="radiogroup">
              {DECISIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={form.decision === option.value}
                  onClick={() => setForm((f) => ({ ...f, decision: option.value }))}
                  className={`rounded-md border px-2 py-2 text-sm font-medium ${form.decision === option.value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  {ui(option.label)}
                  <span className="ms-1 hidden text-[10px] opacity-60 sm:inline">{toArabicDigits(String(DECISIONS.indexOf(option) + 1))}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{ui(DECISIONS.find((d) => d.value === form.decision)?.hint ?? '')}</p>
          </div>
          {(needsIn || needsOut) && <div className="grid grid-cols-2 gap-3">
            {needsIn && <div><Label>{ui('وقت الحضور التقريبي')}</Label><Time12Input className="mt-1.5" value={form.checkIn} onValueChange={(value) => setForm((f) => ({ ...f, checkIn: value }))} /></div>}
            {needsOut && <div><Label>{ui('وقت الانصراف التقريبي')}</Label><Time12Input className="mt-1.5" value={form.checkOut} onValueChange={(value) => setForm((f) => ({ ...f, checkOut: value }))} /></div>}
          </div>}
          {form.decision === 'leave' && <div>
            <Label>{ui('نوع الإجازة')}</Label>
            <select
              className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.leaveTypeId}
              onChange={(event) => setForm((f) => ({ ...f, leaveTypeId: event.target.value }))}
            >
              <option value="">{ui('اختر نوع الإجازة')}</option>
              {(leaveTypes.data ?? []).map((type) => <option key={type.id} value={String(type.id)}>{type.name}</option>)}
            </select>
          </div>}
          <div>
            <Label>{ui('السبب')} <span className="text-destructive">*</span></Label>
            <Textarea autoFocus={!needsIn && !needsOut} className="mt-1.5" rows={2} value={form.reason} onChange={(event) => setForm((f) => ({ ...f, reason: event.target.value }))} placeholder={ui('مثال: نسي البصمة وحضر الساعة ٨')} />
          </div>
        </div>}
        <p className="text-xs text-muted-foreground">{ui('اختصارات: Alt+1…5 لاختيار القرار، Ctrl+Enter للحفظ والانتقال للحالة التالية')}</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setActive(null)} disabled={saving}>{ui('إلغاء')}</Button>
          <Button variant="outline" onClick={() => void save(false)} disabled={saving}>{ui('حفظ')}</Button>
          <Button onClick={() => void save(true)} disabled={saving}>{ui('حفظ والتالي')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
