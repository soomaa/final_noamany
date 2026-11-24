import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

type Status = 'pending' | 'approved' | 'rejected' | 'all';
type Flag = 'late_sync' | 'outside_geofence' | 'near_geofence_edge' | 'edited' | 'comp_day';

interface OfflinePunch {
  id: number;
  hodoorId: number | null;
  empCode: number | null;
  employeeName: string;
  branchId: number;
  branchName: string | null;
  type: 'in' | 'out';
  actionDate: string;
  punchTime: string;
  currentTime: string | null;
  lateMin: number;
  earlyLeaveMin: number;
  capturedAt: string;
  receivedAt: string;
  timezone: string;
  delayMinutes: number;
  distanceMeters: number | null;
  radiusMeters: number | null;
  flags: Flag[];
  review: { decision: 'approved' | 'rejected'; reason: string | null; reviewedByName: string | null; reviewedAt: string } | null;
}

interface ListResponse {
  from: string;
  to: string;
  items: OfflinePunch[];
  counters: { pending: number; suspicious: number; approved: number; rejected: number };
}

const FLAG_LABEL: Record<Flag, string> = {
  late_sync: 'مزامنة متأخرة',
  outside_geofence: 'خارج النطاق الجغرافي',
  near_geofence_edge: 'على حافة النطاق',
  edited: 'عُدّل بعد المزامنة',
  comp_day: 'سجلت بدل راحة',
};
const FLAG_VARIANT: Record<Flag, 'destructive' | 'warning' | 'secondary'> = {
  late_sync: 'warning',
  outside_geofence: 'destructive',
  near_geofence_edge: 'warning',
  edited: 'secondary',
  comp_day: 'secondary',
};

const cairo = (iso: string) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true,
}).format(new Date(iso));
const todayCairo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
const daysAgo = (n: number) => {
  const d = new Date(`${todayCairo()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
function delayText(minutes: number) {
  if (minutes < 60) return `${minutes} د`;
  const h = Math.floor(minutes / 60);
  return `${h} س${minutes % 60 ? ` ${minutes % 60} د` : ''}`;
}

export function AttendanceOfflineReviewPage() {
  const { ui } = useLocale();
  const [status, setStatus] = useState<Status>('pending');
  const [from, setFrom] = useState(daysAgo(13));
  const [to, setTo] = useState(todayCairo());
  const [branchId, setBranchId] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejecting, setRejecting] = useState<OfflinePunch | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: branches = [] } = useBranches();

  const query = useQuery({
    queryKey: ['attendance', 'offline-punches', status, from, to, branchId],
    queryFn: async () => (await api.get<ListResponse>('/attendance/offline-punches', {
      params: { status, dateFrom: from, dateTo: to, ...(branchId ? { branchId } : {}) },
    })).data,
  });
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const selectable = items.filter((i) => i.review?.decision !== 'rejected' && i.review?.decision !== 'approved');
  const allSelected = selectable.length > 0 && selectable.every((i) => selected.has(i.id));

  const toggle = (id: number) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const approve = async (ids: number[]) => {
    if (!ids.length) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ approved: number; skipped: Array<{ id: number; message: string }> }>(
        '/attendance/offline-punches/approve', { ids });
      toast.success(`${ui('تم اعتماد')} ${toArabicDigits(String(data.approved))} ${ui('بصمة')}`);
      if (data.skipped.length) toast.error(`${ui('لم تُعتمد')} ${toArabicDigits(String(data.skipped.length))}: ${data.skipped[0].message}`);
      setSelected(new Set());
      await query.refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    if (reason.trim().length < 3) return toast.error(ui('اكتب سبب الرفض'));
    setBusy(true);
    try {
      const { data } = await api.post<{ effect: string; warning?: string }>(
        `/attendance/offline-punches/${rejecting.id}/reject`, { reason: reason.trim() });
      toast.success(ui(data.effect === 'missing' ? 'تم الرفض (سجل الحضور كان محذوفاً بالفعل)' : 'تم رفض البصمة وإزالتها من الحضور'));
      if (data.warning) toast.warning(data.warning);
      setRejecting(null);
      setReason('');
      setSelected((s) => { const n = new Set(s); n.delete(rejecting.id); return n; });
      await query.refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const counters = query.data?.counters;
  const chip = (value: Status, label: string, count?: number) => (
    <button
      key={value}
      type="button"
      onClick={() => { setStatus(value); setSelected(new Set()); }}
      className={`rounded-lg border px-4 py-3 text-start transition ${status === value ? 'border-primary bg-primary/10' : 'bg-card hover:bg-muted'}`}
    >
      <div className="text-xs text-muted-foreground">{ui(label)}</div>
      <div className="nums text-2xl font-bold">{toArabicDigits(String(count ?? 0))}</div>
    </button>
  );

  return <div className="space-y-4">
    <PageHeader
      title={ui('بصمات أوفلاين للمراجعة')}
      description={ui('بصمات سجلها الموظف من التطبيق بدون إنترنت وتمت مزامنتها لاحقاً بوقت الموبايل؛ اعتمدها أو ارفضها لإزالة أثرها من الحضور')}
      actions={<Button variant="outline" onClick={() => void query.refetch()}><RefreshCw className="size-4" />{ui('تحديث')}</Button>}
    />

    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      <div><Label>{ui('من')}</Label><Input type="date" className="mt-1.5 w-44" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></div>
      <div><Label>{ui('إلى')}</Label><Input type="date" className="mt-1.5 w-44" value={to} min={from} max={todayCairo()} onChange={(e) => e.target.value && setTo(e.target.value)} /></div>
      <div>
        <Label>{ui('الفرع')}</Label>
        <select className="mt-1.5 flex h-10 w-56 rounded-md border border-input bg-background px-3 text-sm" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">{ui('كل الفروع المتاحة')}</option>
          {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name ?? `#${b.id}`}</option>)}
        </select>
      </div>
      <div className="ms-auto">
        <Button disabled={busy || !selected.size} onClick={() => void approve([...selected])}>
          <CheckCircle2 className="size-4" />{ui('اعتماد المحدد')} {selected.size ? `(${toArabicDigits(String(selected.size))})` : ''}
        </Button>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {chip('pending', 'بانتظار المراجعة', counters?.pending)}
      <div className="rounded-lg border bg-card px-4 py-3">
        <div className="text-xs text-muted-foreground">{ui('مشتبه بها (بانتظار المراجعة)')}</div>
        <div className={`nums text-2xl font-bold ${counters?.suspicious ? 'text-warning' : ''}`}>{toArabicDigits(String(counters?.suspicious ?? 0))}</div>
      </div>
      {chip('approved', 'معتمدة', counters?.approved)}
      {chip('rejected', 'مرفوضة', counters?.rejected)}
      {chip('all', 'الكل', (counters?.pending ?? 0) + (counters?.approved ?? 0) + (counters?.rejected ?? 0))}
    </div>

    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2"><Checkbox checked={allSelected} disabled={!selectable.length}
              onCheckedChange={(v) => setSelected(v ? new Set(selectable.map((i) => i.id)) : new Set())} aria-label={ui('تحديد الكل')} /></th>
            {['الموظف', 'الفرع', 'اليوم', 'البصمة', 'وقت الموبايل', 'وقت المزامنة', 'التأخير في المزامنة', 'المسافة', 'تنبيهات', 'القرار', ''].map((h) => (
              <th key={h} className="px-3 py-2 text-start font-medium">{ui(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {query.isLoading && <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">{ui('جاري التحميل…')}</td></tr>}
          {query.isError && <tr><td colSpan={12} className="p-6 text-center text-destructive">{apiError(query.error)}</td></tr>}
          {!query.isLoading && !query.isError && !items.length && (
            <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">{ui(status === 'pending' ? 'لا توجد بصمات أوفلاين بانتظار المراجعة' : 'لا توجد بصمات')}</td></tr>
          )}
          {items.map((item) => {
            const suspicious = item.flags.some((f) => f !== 'comp_day');
            const canSelect = !item.review;
            return <tr key={item.id} className={`border-t ${!item.review && suspicious ? 'bg-warning/5' : ''}`}>
              <td className="px-3 py-2">{canSelect && <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggle(item.id)} aria-label={ui('تحديد')} />}</td>
              <td className="px-3 py-2">
                <div className="font-medium text-primary">{item.employeeName}</div>
                <div className="nums text-xs text-muted-foreground">{item.empCode != null ? toArabicDigits(String(item.empCode)) : '—'}</div>
              </td>
              <td className="px-3 py-2">{item.branchName ?? '—'}</td>
              <td className="nums px-3 py-2">{toArabicDigits(item.actionDate)}</td>
              <td className="px-3 py-2">
                <Badge variant={item.type === 'in' ? 'default' : 'secondary'}>{ui(item.type === 'in' ? 'حضور' : 'انصراف')}</Badge>
                <span className="nums ms-1">{toArabicDigits(item.punchTime)}</span>
                {item.type === 'in' && item.lateMin > 0 && <div className="nums text-xs text-muted-foreground">{ui('تأخير')} {toArabicDigits(String(item.lateMin))} {ui('د')}</div>}
                {item.type === 'out' && item.earlyLeaveMin > 0 && <div className="nums text-xs text-muted-foreground">{ui('انصراف مبكر')} {toArabicDigits(String(item.earlyLeaveMin))} {ui('د')}</div>}
              </td>
              <td className="nums px-3 py-2">{toArabicDigits(cairo(item.capturedAt))}</td>
              <td className="nums px-3 py-2">{toArabicDigits(cairo(item.receivedAt))}</td>
              <td className={`nums px-3 py-2 ${item.flags.includes('late_sync') ? 'font-medium text-warning' : ''}`}>{toArabicDigits(delayText(item.delayMinutes))}</td>
              <td className="nums px-3 py-2">
                {item.distanceMeters != null ? `${toArabicDigits(String(item.distanceMeters))} ${ui('م')}` : '—'}
                {item.radiusMeters ? <div className="text-xs text-muted-foreground">{ui('من')} {toArabicDigits(String(item.radiusMeters))} {ui('م')}</div> : null}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {item.flags.map((flag) => <Badge key={flag} variant={FLAG_VARIANT[flag]}>
                    {flag !== 'edited' && flag !== 'comp_day' && <AlertTriangle className="me-1 size-3" />}{ui(FLAG_LABEL[flag])}
                  </Badge>)}
                </div>
                {item.flags.includes('edited') && <div className="nums mt-1 text-xs text-muted-foreground">{ui('الحالي')}: {item.currentTime ? toArabicDigits(item.currentTime) : ui('محذوف')}</div>}
              </td>
              <td className="px-3 py-2">
                {item.review ? <div>
                  <Badge variant={item.review.decision === 'approved' ? 'success' : 'destructive'}>
                    {item.review.decision === 'approved' ? <CheckCircle2 className="me-1 size-3" /> : <XCircle className="me-1 size-3" />}
                    {ui(item.review.decision === 'approved' ? 'معتمدة' : 'مرفوضة')}
                  </Badge>
                  {item.review.reason && <div className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={item.review.reason}>{item.review.reason}</div>}
                  <div className="nums text-xs text-muted-foreground">{item.review.reviewedByName ?? '—'} · {toArabicDigits(cairo(item.review.reviewedAt))}</div>
                </div> : <span className="text-muted-foreground">{ui('بانتظار المراجعة')}</span>}
              </td>
              <td className="px-3 py-2">
                {item.review?.decision !== 'rejected' && <div className="flex gap-1">
                  {!item.review && <Button size="sm" variant="outline" disabled={busy} onClick={() => void approve([item.id])}>{ui('اعتماد')}</Button>}
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => { setRejecting(item); setReason(''); }}>{ui('رفض')}</Button>
                </div>}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{ui('رفض بصمة أوفلاين')}: {rejecting?.employeeName}</DialogTitle></DialogHeader>
        {rejecting && <div className="space-y-4">
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div>{ui(rejecting.type === 'in' ? 'حضور' : 'انصراف')} <span className="nums">{toArabicDigits(rejecting.punchTime)}</span> — <span className="nums">{toArabicDigits(rejecting.actionDate)}</span></div>
            <div className="mt-1 text-muted-foreground">{ui(rejecting.type === 'in'
              ? 'سيُحذف وقت الحضور من سجل اليوم (ويُحذف السجل كله إن لم يكن فيه انصراف)، ويُعاد حساب الحضور كأن البصمة لم تحدث.'
              : 'سيُحذف وقت الانصراف من سجل اليوم (ويُحذف السجل كله إن لم يكن فيه حضور)، ويُعاد حساب الحضور كأن البصمة لم تحدث.')}</div>
            {rejecting.flags.includes('comp_day') && <div className="mt-1 text-warning">{ui('هذه البصمة سجلت يوم بدل راحة؛ راجع بدل الراحة يدوياً بعد الرفض')}</div>}
          </div>
          <div>
            <Label>{ui('سبب الرفض')} <span className="text-destructive">*</span></Label>
            <Textarea className="mt-1.5" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={ui('مثال: وقت الموبايل غير مطابق لكاميرات الفرع')} />
          </div>
        </div>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setRejecting(null)} disabled={busy}>{ui('إلغاء')}</Button>
          <Button variant="destructive" onClick={() => void reject()} disabled={busy}>{ui('رفض وإزالة البصمة')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
