import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw } from 'lucide-react';
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
import { useBranches } from '@/hooks/use-branches';
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

interface ExceptionsResponse {
  from: string;
  to: string;
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
  const [date, setDate] = useState(todayCairo());
  const [branchId, setBranchId] = useState('');
  const [typeFilter, setTypeFilter] = useState<CaseType | 'all' | 'open'>('open');
  const { data: branches = [] } = useBranches();
  const query = useQuery({
    queryKey: ['attendance', 'exceptions', date, branchId],
    queryFn: async () => (await api.get<ExceptionsResponse>('/attendance/exceptions', {
      params: { date, ...(branchId ? { branchId } : {}) },
    })).data,
  });
  const leaveTypes = useQuery({
    queryKey: ['attendance', 'exceptions', 'leave-types'],
    queryFn: async () => (await api.get<Array<{ id: number; name: string }>>('/attendance/exceptions/leave-types')).data,
    staleTime: 5 * 60_000,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const visible = useMemo(() => items.filter((item) => {
    if (typeFilter === 'all') return true;
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
      const refreshed = await query.refetch();
      if (goNext) {
        const next = (refreshed.data?.items ?? []).find((item) => !item.resolution && item.key !== active.key);
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
  const chip = (value: typeof typeFilter, label: string, count?: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setTypeFilter(value)}
      className={`rounded-lg border px-4 py-3 text-start transition ${typeFilter === value ? 'border-primary bg-primary/10' : 'bg-card hover:bg-muted'}`}
    >
      <div className="text-xs text-muted-foreground">{ui(label)}</div>
      <div className="nums text-2xl font-bold">{toArabicDigits(String(count ?? 0))}</div>
    </button>
  );
  const time = (value: string | null) => value ? <span className="nums">{toArabicDigits(value)}</span> : <span className="text-muted-foreground">—</span>;

  return <div className="space-y-4">
    <PageHeader
      title={ui('الحالات اليومية')}
      description={ui('كل حالة غير طبيعية في الحضور لفرعك؛ راجعها يوميًا واحسم كل حالة بقرار وسبب')}
      actions={<Button variant="outline" onClick={() => void query.refetch()}><RefreshCw className="size-4" />{ui('تحديث')}</Button>}
    />

    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      <div>
        <Label>{ui('التاريخ')}</Label>
        <Input type="date" className="mt-1.5 w-44" value={date} max={todayCairo()} onChange={(event) => event.target.value && setDate(event.target.value)} />
      </div>
      <div>
        <Label>{ui('الفرع')}</Label>
        <select
          className="mt-1.5 flex h-10 w-56 rounded-md border border-input bg-background px-3 text-sm"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
        >
          <option value="">{ui('كل الفروع المتاحة')}</option>
          {branches.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name ?? `#${branch.id}`}</option>)}
        </select>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {chip('open', 'لم تُحسم بعد', counters?.open)}
      {chip('all', 'كل الحالات', counters?.total)}
      {(Object.keys(CASE_LABELS) as CaseType[]).map((type) => chip(type, CASE_LABELS[type], counters?.byType[type]))}
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
            <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">{ui(typeFilter === 'open' ? 'لا توجد حالات مفتوحة' : 'لا توجد حالات')}</td></tr>
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
                <Button size="sm" variant={item.resolution ? 'outline' : 'default'} onClick={() => setActive(item)}>
                  {ui(item.resolution ? 'تعديل' : 'حسم')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
      <DialogContent className="max-w-lg">
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
            <Textarea className="mt-1.5" rows={2} value={form.reason} onChange={(event) => setForm((f) => ({ ...f, reason: event.target.value }))} placeholder={ui('مثال: نسي البصمة وحضر الساعة ٨')} />
          </div>
        </div>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setActive(null)} disabled={saving}>{ui('إلغاء')}</Button>
          <Button variant="outline" onClick={() => void save(false)} disabled={saving}>{ui('حفظ')}</Button>
          <Button onClick={() => void save(true)} disabled={saving}>{ui('حفظ والتالي')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
