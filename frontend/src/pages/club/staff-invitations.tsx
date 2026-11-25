import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  History,
  Loader2,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Settings2,
  Sparkles,
  Ticket,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MaskedPhone } from '@/components/club/masked-phone';
import { STAFF_INVITATIONS_KEY, StaffInvitationButton } from '@/components/club/staff-invitation-dialog';
import { PageHeader } from '@/components/common/page-header';
import { SearchableSelect } from '@/components/common/searchable-select';
import { StatCard } from '@/components/common/stat-card';
import { ErrorState } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { afterMenuClose, confirm } from '@/lib/confirm';
import { cn, toArabicDigits } from '@/lib/utils';

interface CodeRow {
  employeeId: number;
  employeeName: string;
  empCode: number | null;
  jobTitle: string | null;
  branchId: number | null;
  branchName: string | null;
  codeId: number | null;
  code: string | null;
  suggestedCode: string;
  isActive: boolean;
  monthlyQuota: number;
  monthAdjustment: number;
  quota: number;
  usedThisMonth: number;
  remaining: number;
  totalGuests: number;
  convertedGuests: number;
  /** false = suspended or left (shown only with the «الموقوفين» / «الكل» filter). */
  isEmployeeActive?: boolean;
}

interface ListResponse {
  period: string;
  canManage: boolean;
  canOverride: boolean;
  scope: 'all' | 'branches' | 'manager' | 'self';
  rows: CodeRow[];
  totals: { employees: number; withCode: number; usedThisMonth: number; totalGuests: number; convertedGuests: number };
}

interface EmployeeSummary {
  employeeId: number;
  employeeName: string;
  jobTitle: string | null;
  codeId: number | null;
  code: string | null;
  isActive: boolean;
  monthlyQuota: number;
  monthAdjustment: number;
  quota: number;
  usedThisMonth: number;
  remaining: number;
  totalGuests: number;
  convertedGuests: number;
  period: string;
}

interface GuestRow {
  id: number;
  code: string;
  guestName: string;
  guestPhone: string;
  visitDate: string;
  branchName: string | null;
  notes: string | null;
  overQuota: boolean;
  overrideReason: string | null;
  createdAt: string;
  createdByName: string | null;
  leadId: number | null;
  leadStatusLabel: string | null;
  outcome: 'converted' | 'subscribed' | 'lost' | 'open' | 'no_lead';
  outcomeLabel: string;
  assignedToName: string | null;
  followUps: Array<{ id: number; note: string; activityType: string; createdByName: string | null; createdAt: string }>;
}

interface AdjustmentRow {
  id: number;
  kind: string;
  kindLabel: string;
  delta: number;
  quotaBefore: number | null;
  quotaAfter: number | null;
  period: string | null;
  reason: string;
  createdByName: string | null;
  createdAt: string;
}

const OUTCOME_STYLE: Record<GuestRow['outcome'], 'success' | 'warning' | 'destructive' | 'default' | 'secondary'> = {
  converted: 'success',
  subscribed: 'warning',
  lost: 'destructive',
  open: 'default',
  no_lead: 'secondary',
};

const dateTime = (value: string) => new Date(value).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
const n = (value: number) => toArabicDigits(value);

// ─── shared: guests of one employee ──────────────────────────────────────────

function GuestNotes({ guest, onAdded }: { guest: GuestRow; onAdded: () => void }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const add = async () => {
    if (note.trim().length < 2) return toast.error('اكتب الملاحظة');
    setSaving(true);
    try {
      await api.post(`/club-staff-invitations/guests/${guest.id}/notes`, { note: note.trim() });
      setNote('');
      toast.success('اتضافت الملاحظة — بتظهر عند السيلز');
      onAdded();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-3 rounded-xl bg-muted/30 p-3">
      {guest.notes ? <p className="text-sm"><span className="text-muted-foreground">ملاحظة التسجيل: </span>{guest.notes}</p> : null}
      {guest.overQuota ? <p className="text-xs text-destructive">اتسجلت فوق الحصة — {guest.overrideReason}</p> : null}
      <ul className="space-y-2">
        {guest.followUps.length ? guest.followUps.map((f) => (
          <li key={f.id} className="rounded-lg border bg-card p-2 text-sm">
            <p className="whitespace-pre-wrap break-words">{f.note}</p>
            <p className="mt-1 text-xs text-muted-foreground">{f.createdByName ?? '—'} · {dateTime(f.createdAt)}</p>
          </li>
        )) : <li className="text-sm text-muted-foreground">لسه مفيش ملاحظات أو متابعات.</li>}
      </ul>
      {guest.leadId ? (
        <div className="flex gap-2">
          <Textarea rows={2} value={note} placeholder="ملاحظة على الضيف (بتظهر عند السيلز)" onChange={(event) => setNote(event.target.value)} />
          <Button variant="outline" className="self-end" disabled={saving} onClick={() => void add()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} إضافة
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function EmployeeGuestsTable({ employeeId }: { employeeId: number }) {
  const [period, setPeriod] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const guests = useQuery({
    queryKey: [...STAFF_INVITATIONS_KEY, 'guests', employeeId, period],
    queryFn: async () => (await api.get<GuestRow[]>(`/club-staff-invitations/employees/${employeeId}/guests`, { params: period ? { period } : {} })).data,
  });
  const rows = guests.data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="guest-period">الشهر</Label>
          <Input id="guest-period" type="month" className="mt-1 h-9 w-44" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </div>
        {period ? <Button variant="ghost" size="sm" onClick={() => setPeriod('')}><X className="size-4" /> كل الشهور</Button> : null}
        <p className="ms-auto text-sm text-muted-foreground">{n(rows.length)} ضيف</p>
      </div>
      {guests.isError ? <ErrorState inline message={apiError(guests.error)} onRetry={() => void guests.refetch()} /> : null}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الضيف</TableHead>
              <TableHead>الموبايل</TableHead>
              <TableHead>تاريخ الزيارة</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>أخصائي المبيعات</TableHead>
              <TableHead>الفرع</TableHead>
              <TableHead className="text-center">ملاحظات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {guests.isLoading ? (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground"><Loader2 className="mx-auto size-5 animate-spin" /></TableCell></TableRow>
            ) : rows.length ? rows.flatMap((guest) => [
              <TableRow key={guest.id} className={cn(openId === guest.id && 'bg-muted/30')}>
                <TableCell className="font-medium">
                  {guest.guestName}
                  {guest.overQuota ? <Badge variant="destructive" className="ms-2">فوق الحصة</Badge> : null}
                </TableCell>
                <TableCell><MaskedPhone value={guest.guestPhone} leadId={guest.leadId} /></TableCell>
                <TableCell className="nums">{guest.visitDate}</TableCell>
                <TableCell>
                  <Badge variant={OUTCOME_STYLE[guest.outcome]}>{guest.outcomeLabel}</Badge>
                  {guest.outcome === 'open' && guest.leadStatusLabel ? <span className="ms-1 text-xs text-muted-foreground">({guest.leadStatusLabel})</span> : null}
                </TableCell>
                <TableCell>{guest.assignedToName ?? <span className="text-muted-foreground">غير مسند</span>}</TableCell>
                <TableCell>{guest.branchName ?? '—'}</TableCell>
                <TableCell className="text-center">
                  <Button variant="ghost" size="sm" onClick={() => setOpenId(openId === guest.id ? null : guest.id)}>
                    {n(guest.followUps.length)} {openId === guest.id ? 'إخفاء' : 'عرض'}
                  </Button>
                </TableCell>
              </TableRow>,
              ...(openId === guest.id
                ? [<TableRow key={`${guest.id}-notes`}><TableCell colSpan={7}><GuestNotes guest={guest} onAdded={() => void guests.refetch()} /></TableCell></TableRow>]
                : []),
            ]) : (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">مفيش ضيوف جم من خلال الكود ده{period ? ' في الشهر ده' : ''}.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SummaryCards({ summary }: { summary: Pick<EmployeeSummary, 'quota' | 'usedThisMonth' | 'remaining' | 'totalGuests' | 'convertedGuests' | 'monthlyQuota' | 'monthAdjustment'> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="رصيد الشهر" value={n(summary.quota)} subtitle={`الأساسي ${n(summary.monthlyQuota)}${summary.monthAdjustment ? ` ${summary.monthAdjustment > 0 ? '+' : '−'} ${n(Math.abs(summary.monthAdjustment))}` : ''}`} icon={<Ticket className="size-5" />} colorIndex={0} />
      <StatCard title="المستخدم الشهر ده" value={n(summary.usedThisMonth)} icon={<Users className="size-5" />} colorIndex={2} />
      <StatCard title="المتبقي" value={n(summary.remaining)} icon={<Sparkles className="size-5" />} colorIndex={3} />
      <StatCard title="اشتركوا من الضيوف" value={`${n(summary.convertedGuests)} / ${n(summary.totalGuests)}`} icon={<UserCheck className="size-5" />} colorIndex={5} />
    </div>
  );
}

function EmployeeGuestsDialog({ row, onClose }: { row: CodeRow | null; onClose: () => void }) {
  return (
    <Dialog open={!!row} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent size="form" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>الناس اللي جت من خلال {row?.employeeName}</DialogTitle>
          <DialogDescription>
            {row?.code ? <>الكود <b dir="ltr">{row.code}</b> — </> : null}
            كل ضيف بيتسجل عميل محتمل عند السيلز، والملاحظات هنا بتظهر في سجل متابعته.
          </DialogDescription>
        </DialogHeader>
        {row ? (
          <div className="space-y-4">
            <SummaryCards summary={row} />
            <EmployeeGuestsTable employeeId={row.employeeId} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── management dialogs ──────────────────────────────────────────────────────

function CodeEditDialog({ row, onClose, onSaved }: { row: CodeRow | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState('');
  const [quota, setQuota] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState<number | null>(null);
  if (row && row.employeeId !== lastId) {
    setLastId(row.employeeId);
    setCode(row.code ?? row.suggestedCode);
    setQuota(row.codeId ? String(row.monthlyQuota) : '');
    setReason('');
  }
  const save = async () => {
    if (!row) return;
    const q = quota.trim() === '' ? undefined : Number(quota);
    if (q !== undefined && (!Number.isInteger(q) || q < 0)) return toast.error('الحصة لازم تكون رقم صحيح');
    setSaving(true);
    try {
      if (row.codeId) await api.put(`/club-staff-invitations/codes/${row.codeId}`, { code: code.trim(), monthlyQuota: q, reason: reason.trim() || undefined });
      else await api.post('/club-staff-invitations/codes', { employeeId: row.employeeId, code: code.trim() || undefined, monthlyQuota: q, reason: reason.trim() || undefined });
      toast.success('اتحفظ الكود');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={!!row} onOpenChange={(value) => { if (!value && !saving) { onClose(); setLastId(null); } }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{row?.codeId ? 'تعديل الكود والحصة' : 'إنشاء كود دعوات'}</DialogTitle>
          <DialogDescription>{row?.employeeName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-code">الكود</Label>
            <Input id="edit-code" dir="ltr" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
            <p className="text-xs text-muted-foreground">حروف إنجليزي وأرقام (3–30)، لازم يكون مش مكرر.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-quota">الحصة الشهرية (عدد الدعوات)</Label>
            <Input id="edit-quota" type="number" min={0} value={quota} placeholder="الافتراضي من الإعدادات" onChange={(event) => setQuota(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-reason">السبب (اختياري)</Label>
            <Input id="edit-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => { onClose(); setLastId(null); }}>إلغاء</Button>
          <Button variant="brand" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="size-4 animate-spin" /> : null} حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ target, onClose, onSaved }: { target: { row: CodeRow; sign: 1 | -1 } | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('1');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const close = () => { if (!saving) { onClose(); setAmount('1'); setReason(''); } };
  const save = async () => {
    if (!target?.row.codeId) return;
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 1) return toast.error('العدد لازم يكون رقم صحيح أكبر من صفر');
    if (reason.trim().length < 3) return toast.error('اكتب السبب');
    setSaving(true);
    try {
      await api.post(`/club-staff-invitations/codes/${target.row.codeId}/adjust`, { delta: value * target.sign, reason: reason.trim() });
      toast.success(target.sign > 0 ? 'اتزود الرصيد' : 'اتنقص الرصيد');
      onSaved();
      setSaving(false);
      close();
    } catch (error) {
      toast.error(apiError(error));
      setSaving(false);
    }
  };
  return (
    <Dialog open={!!target} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{target?.sign === 1 ? 'زوّد رصيد الشهر' : 'نقّص رصيد الشهر'}</DialogTitle>
          <DialogDescription>
            {target?.row.employeeName} — رصيد الشهر الحالي {n(target?.row.quota ?? 0)}، المستخدم {n(target?.row.usedThisMonth ?? 0)}. التعديل للشهر ده بس ومتسجل في السجل.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="adjust-amount">العدد</Label>
            <Input id="adjust-amount" type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adjust-reason">السبب (إجباري)</Label>
            <Input id="adjust-reason" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={close}>إلغاء</Button>
          <Button variant={target?.sign === 1 ? 'brand' : 'destructive'} disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : target?.sign === 1 ? <Plus className="size-4" /> : <Minus className="size-4" />}
            تأكيد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivationDialog({ row, onClose, onSaved }: { row: CodeRow | null; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const activate = !row?.isActive;
  const close = () => { if (!saving) { onClose(); setReason(''); } };
  const save = async () => {
    if (!row?.codeId) return;
    if (reason.trim().length < 3) return toast.error('اكتب السبب');
    setSaving(true);
    try {
      await api.post(`/club-staff-invitations/codes/${row.codeId}/${activate ? 'activate' : 'deactivate'}`, { reason: reason.trim() });
      toast.success(activate ? 'اتفعّل الكود' : 'اتوقف الكود');
      onSaved();
      setSaving(false);
      close();
    } catch (error) {
      toast.error(apiError(error));
      setSaving(false);
    }
  };
  return (
    <Dialog open={!!row} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{activate ? 'تفعيل الكود' : 'إيقاف الكود'}</DialogTitle>
          <DialogDescription>{row?.employeeName} — <span dir="ltr">{row?.code}</span>{activate ? '' : '. الكود الموقوف مش بيقبل دعوات جديدة، والضيوف القدام بيفضلوا زي ما هم.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="activation-reason">السبب (إجباري)</Label>
          <Input id="activation-reason" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={close}>إلغاء</Button>
          <Button variant={activate ? 'brand' : 'destructive'} disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />} تأكيد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ row, onClose }: { row: CodeRow | null; onClose: () => void }) {
  const history = useQuery({
    queryKey: [...STAFF_INVITATIONS_KEY, 'adjustments', row?.codeId],
    queryFn: async () => (await api.get<AdjustmentRow[]>(`/club-staff-invitations/codes/${row!.codeId}/adjustments`)).data,
    enabled: !!row?.codeId,
  });
  return (
    <Dialog open={!!row} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent size="lg" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>سجل تعديلات الكود</DialogTitle>
          <DialogDescription>{row?.employeeName} — <span dir="ltr">{row?.code}</span></DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>العملية</TableHead>
                <TableHead className="text-center">+/−</TableHead>
                <TableHead className="text-center">قبل ← بعد</TableHead>
                <TableHead>السبب</TableHead>
                <TableHead>بواسطة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.isLoading ? (
                <TableRow><TableCell colSpan={6} className="py-6 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></TableCell></TableRow>
              ) : (history.data ?? []).length ? (history.data ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="nums whitespace-nowrap">{dateTime(item.createdAt)}</TableCell>
                  <TableCell>{item.kindLabel}{item.period ? <span className="ms-1 text-xs text-muted-foreground nums">({item.period})</span> : null}</TableCell>
                  <TableCell className={cn('nums text-center font-semibold', item.delta > 0 ? 'text-success' : item.delta < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {item.delta ? `${item.delta > 0 ? '+' : '−'}${n(Math.abs(item.delta))}` : '—'}
                  </TableCell>
                  <TableCell className="nums text-center">{item.quotaBefore != null || item.quotaAfter != null ? `${item.quotaBefore != null ? n(item.quotaBefore) : '—'} ← ${item.quotaAfter != null ? n(item.quotaAfter) : '—'}` : '—'}</TableCell>
                  <TableCell className="max-w-xs whitespace-pre-wrap break-words">{item.reason}</TableCell>
                  <TableCell>{item.createdByName ?? '—'}</TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">مفيش تعديلات.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: [...STAFF_INVITATIONS_KEY, 'settings'],
    queryFn: async () => (await api.get<{ duplicateWindowDays: number; defaultMonthlyQuota: number }>('/club-staff-invitations/settings')).data,
    enabled: open,
  });
  const [windowDays, setWindowDays] = useState<string | null>(null);
  const [defaultQuota, setDefaultQuota] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const close = () => { onClose(); setWindowDays(null); setDefaultQuota(null); };
  const save = async () => {
    setSaving(true);
    try {
      await api.put('/club-staff-invitations/settings', {
        duplicateWindowDays: Number(windowDays ?? settings.data?.duplicateWindowDays ?? 30),
        defaultMonthlyQuota: Number(defaultQuota ?? settings.data?.defaultMonthlyQuota ?? 5),
      });
      toast.success('اتحفظت الإعدادات');
      void qc.invalidateQueries({ queryKey: STAFF_INVITATIONS_KEY });
      close();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !saving) close(); }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>إعدادات أكواد الدعوات</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="window-days">منع تكرار نفس الرقم خلال (يوم)</Label>
            <Input id="window-days" type="number" min={0} value={windowDays ?? String(settings.data?.duplicateWindowDays ?? '')} onChange={(event) => setWindowDays(event.target.value)} />
            <p className="text-xs text-muted-foreground">0 = تحذير بس من غير منع.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="default-quota">الحصة الشهرية الافتراضية للكود الجديد</Label>
            <Input id="default-quota" type="number" min={0} value={defaultQuota ?? String(settings.data?.defaultMonthlyQuota ?? '')} onChange={(event) => setDefaultQuota(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={close}>إلغاء</Button>
          <Button variant="brand" disabled={saving || settings.isLoading} onClick={() => void save()}>{saving ? <Loader2 className="size-4 animate-spin" /> : null} حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── admin page ──────────────────────────────────────────────────────────────

/** «٤ من ٥» remaining of this month's allowance, with the quick −/+ beside it. */
function QuotaCell({ row, canManage, onAdjust }: { row: CodeRow; canManage: boolean; onAdjust: (sign: 1 | -1) => void }) {
  if (!row.codeId) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="inline-flex flex-col items-center">
      <div className="inline-flex items-center gap-1">
        {canManage ? <Button variant="ghost" size="icon" className="size-7" aria-label="نقّص" onClick={() => onAdjust(-1)}><Minus className="size-3.5" /></Button> : null}
        <span className="nums whitespace-nowrap text-sm">
          <b className={cn(row.remaining < 1 ? 'text-destructive' : 'text-foreground')}>{n(row.remaining)}</b>
          <span className="text-muted-foreground"> من {n(row.quota)}</span>
        </span>
        {canManage ? <Button variant="ghost" size="icon" className="size-7" aria-label="زوّد" onClick={() => onAdjust(1)}><Plus className="size-3.5" /></Button> : null}
      </div>
      <span className="nums whitespace-nowrap text-[11px] text-muted-foreground">
        اتستخدم {n(row.usedThisMonth)} · أساسي {n(row.monthlyQuota)}
        {row.monthAdjustment ? <span className={cn(row.monthAdjustment > 0 ? 'text-success' : 'text-destructive')}> ({row.monthAdjustment > 0 ? '+' : '−'}{n(Math.abs(row.monthAdjustment))})</span> : null}
      </span>
    </div>
  );
}

function CodeCell({ row }: { row: CodeRow }) {
  if (!row.code) return <span className="text-xs text-muted-foreground">مالوش كود</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={row.isActive ? 'default' : 'secondary'} dir="ltr">{row.code}</Badge>
      {!row.isActive ? <span className="text-xs text-destructive">موقوف</span> : null}
    </span>
  );
}

function RowActions({
  row,
  canManage,
  onGuests,
  onEdit,
  onHistory,
  onToggle,
}: {
  row: CodeRow;
  canManage: boolean;
  onGuests: () => void;
  onEdit: () => void;
  onHistory: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={onGuests}><Users className="size-4" /> الضيوف</Button>
      {canManage || row.codeId ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-9" aria-label="المزيد"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canManage ? (
              <DropdownMenuItem onSelect={() => afterMenuClose(onEdit)}>
                <Pencil className="size-4" /> {row.codeId ? 'تعديل الكود والحصة' : 'إنشاء كود'}
              </DropdownMenuItem>
            ) : null}
            {row.codeId ? <DropdownMenuItem onSelect={() => afterMenuClose(onHistory)}><History className="size-4" /> سجل التعديلات</DropdownMenuItem> : null}
            {canManage && row.codeId ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className={row.isActive ? 'text-destructive' : ''} onSelect={() => afterMenuClose(onToggle)}>
                  <Power className="size-4" /> {row.isActive ? 'إيقاف الكود' : 'تفعيل الكود'}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function ClubStaffInvitationsPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const { data: branches = [] } = useBranches();
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const [withCode, setWithCode] = useState('');
  const [status, setStatus] = useState('active');
  const [guestsOf, setGuestsOf] = useState<CodeRow | null>(null);
  const [editing, setEditing] = useState<CodeRow | null>(null);
  const [adjusting, setAdjusting] = useState<{ row: CodeRow; sign: 1 | -1 } | null>(null);
  const [toggling, setToggling] = useState<CodeRow | null>(null);
  const [historyOf, setHistoryOf] = useState<CodeRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const list = useQuery({
    queryKey: [...STAFF_INVITATIONS_KEY, 'list', branchId, search, withCode, status],
    queryFn: async () => (await api.get<ListResponse>('/club-staff-invitations', {
      params: { ...(branchId ? { branchId } : {}), ...(search.trim() ? { search: search.trim() } : {}), ...(withCode ? { withCode } : {}), status },
    })).data,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: STAFF_INVITATIONS_KEY });
  const canManage = list.data?.canManage ?? can('club.staff_invitations:update');
  const rows = useMemo(() => list.data?.rows ?? [], [list.data]);
  const totals = list.data?.totals;

  const generate = async () => {
    const body = branchId ? { branchId: Number(branchId) } : {};
    setGenerating(true);
    try {
      const { data: preview } = await api.post<{ wouldCreate: number; monthlyQuota: number }>('/club-staff-invitations/codes/generate-missing', { ...body, dryRun: true });
      if (!preview.wouldCreate) {
        toast.info('كل الموظفين النشطين في الفروع ليهم أكواد بالفعل');
        return;
      }
      const branchName = branchId ? branches.find((b) => String(b.id) === branchId)?.name : null;
      const ok = await confirm({
        title: 'إنشاء أكواد دعوات',
        description: `هيتعمل ${n(preview.wouldCreate)} كود جديد للموظفين النشطين${branchName ? ` في ${branchName}` : ' في الفروع'} اللي مالهمش كود، بحصة ${n(preview.monthlyQuota)} دعوات في الشهر. موظفين الإدارة اللي مالهمش فرع بيتعملهم كود يدوي من قائمة الصف.`,
        confirmLabel: `إنشاء ${n(preview.wouldCreate)} كود`,
      });
      if (!ok) return;
      const { data } = await api.post<{ created: number }>('/club-staff-invitations/codes/generate-missing', body);
      toast.success(`اتعمل ${n(data.created)} كود جديد`);
      refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setGenerating(false);
    }
  };

  const actionsFor = (row: CodeRow) => ({
    row,
    canManage,
    onGuests: () => setGuestsOf(row),
    onEdit: () => setEditing(row),
    onHistory: () => setHistoryOf(row),
    onToggle: () => setToggling(row),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="أكواد الدعوات للموظفين"
        description="كل كابتن أو موظف ليه كود بيدعي بيه ضيوف — الضيف بيروح للسيلز كعميل محتمل ومربوط بصاحب الكود، والحصة الشهرية بتتجدد أول كل شهر."
        actions={(
          <div className="flex flex-wrap gap-2">
            <StaffInvitationButton variant="brand" defaultBranchId={branchId ? Number(branchId) : null} />
            {canManage ? (
              <>
                <Button variant="outline" disabled={generating} onClick={() => void generate()}>
                  {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} أكواد للي مالهمش
                </Button>
                <Button variant="outline" size="icon" aria-label="الإعدادات" onClick={() => setSettingsOpen(true)}><Settings2 className="size-4" /></Button>
              </>
            ) : null}
          </div>
        )}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="موظفين ليهم كود" value={totals ? `${n(totals.withCode)} / ${n(totals.employees)}` : '—'} icon={<Ticket className="size-5" />} loading={list.isLoading} colorIndex={0} />
        <StatCard title="دعوات الشهر ده" value={totals ? n(totals.usedThisMonth) : '—'} subtitle={list.data?.period} icon={<Users className="size-5" />} loading={list.isLoading} colorIndex={2} />
        <StatCard title="إجمالي الضيوف" value={totals ? n(totals.totalGuests) : '—'} icon={<Users className="size-5" />} loading={list.isLoading} colorIndex={3} />
        <StatCard title="اشتركوا" value={totals ? n(totals.convertedGuests) : '—'} icon={<UserCheck className="size-5" />} loading={list.isLoading} colorIndex={5} />
      </div>

      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <Label htmlFor="staff-search">بحث</Label>
          <Input id="staff-search" className="mt-2 h-10" placeholder="اسم الموظف أو كوده أو كود الدعوات" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div>
          <Label>الفرع</Label>
          <SearchableSelect className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="">كل الفروع</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name ?? `#${branch.id}`}</option>)}
          </SearchableSelect>
        </div>
        <div>
          <Label>الكود</Label>
          <SearchableSelect className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={withCode} onChange={(event) => setWithCode(event.target.value)}>
            <option value="">الكل</option>
            <option value="yes">ليهم كود</option>
            <option value="no">مالهمش كود</option>
          </SearchableSelect>
        </div>
        <div>
          <Label>حالة الموظف</Label>
          <SearchableSelect className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={status} onChange={(event) => setStatus(event.target.value || 'active')}>
            <option value="active">النشطين</option>
            <option value="inactive">الموقوفين / تاركي العمل</option>
            <option value="all">الكل</option>
          </SearchableSelect>
        </div>
      </div>

      {list.isError ? <ErrorState message={apiError(list.error)} onRetry={() => void list.refetch()} /> : list.isLoading ? (
        <div className="rounded-xl border bg-card py-10 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></div>
      ) : !rows.length ? (
        <div className="rounded-xl border bg-card py-10 text-center text-muted-foreground">مفيش موظفين مطابقين.</div>
      ) : (
        <>
          {/* Desktop / tablet: five columns, the actions column pinned so it never scrolls away. */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الموظف</TableHead>
                  <TableHead>الكود</TableHead>
                  <TableHead className="text-center">رصيد الشهر</TableHead>
                  <TableHead className="text-center">الضيوف</TableHead>
                  <TableHead className="sticky left-0 z-10 bg-card text-center">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.employeeId} className={cn(row.codeId && !row.isActive && 'opacity-60')}>
                    <TableCell className="max-w-[18rem]">
                      <button type="button" className="text-start font-medium hover:underline" onClick={() => setGuestsOf(row)}>{row.employeeName}</button>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.branchName ?? '—'}{row.jobTitle ? ` · ${row.jobTitle}` : ''}{row.empCode ? ` · ${row.empCode}` : ''}
                      </p>
                      {row.isEmployeeActive === false ? <Badge variant="destructive" className="mt-1">موقوف / ترك العمل</Badge> : null}
                    </TableCell>
                    <TableCell><CodeCell row={row} /></TableCell>
                    <TableCell className="text-center"><QuotaCell row={row} canManage={canManage} onAdjust={(sign) => setAdjusting({ row, sign })} /></TableCell>
                    <TableCell className="nums whitespace-nowrap text-center">
                      <button type="button" className="hover:underline" onClick={() => setGuestsOf(row)}>{n(row.totalGuests)}</button>
                      <span className="block text-[11px] text-muted-foreground">اشترك {n(row.convertedGuests)}</span>
                    </TableCell>
                    <TableCell className="sticky left-0 z-10 bg-card text-center shadow-[8px_0_8px_-8px_rgba(0,0,0,.12)_inset]">
                      <RowActions {...actionsFor(row)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Phones: one card per employee. */}
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <div key={row.employeeId} className={cn('space-y-3 rounded-xl border bg-card p-4', row.codeId && !row.isActive && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button type="button" className="text-start font-semibold hover:underline" onClick={() => setGuestsOf(row)}>{row.employeeName}</button>
                    <p className="text-xs text-muted-foreground">{row.branchName ?? '—'}{row.jobTitle ? ` · ${row.jobTitle}` : ''}</p>
                  </div>
                  <CodeCell row={row} />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2 py-1">
                  <QuotaCell row={row} canManage={canManage} onAdjust={(sign) => setAdjusting({ row, sign })} />
                  <span className="nums text-center text-sm">
                    {n(row.totalGuests)} ضيف
                    <span className="block text-[11px] text-muted-foreground">اشترك {n(row.convertedGuests)}</span>
                  </span>
                </div>
                <div className="flex justify-end"><RowActions {...actionsFor(row)} /></div>
              </div>
            ))}
          </div>
        </>
      )}

      <EmployeeGuestsDialog row={guestsOf} onClose={() => setGuestsOf(null)} />
      <CodeEditDialog row={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <AdjustDialog target={adjusting} onClose={() => setAdjusting(null)} onSaved={refresh} />
      <ActivationDialog row={toggling} onClose={() => setToggling(null)} onSaved={refresh} />
      <HistoryDialog row={historyOf} onClose={() => setHistoryOf(null)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

// ─── the employee's own page ─────────────────────────────────────────────────

export function MyInvitationCodePage() {
  const mine = useQuery({
    queryKey: [...STAFF_INVITATIONS_KEY, 'me'],
    queryFn: async () => (await api.get<{ linked?: boolean; summary: EmployeeSummary | null }>('/club-staff-invitations/me')).data,
  });
  const summary = mine.data?.summary;
  const notLinked = mine.data?.linked === false;
  return (
    <div className="space-y-5">
      <PageHeader title="كود الدعوات الخاص بي" description="ادّي الكود ده لأي حد عايز تعزمه — بيتسجل عند الاستقبال وبيروح للسيلز باسمك." />
      {mine.isError ? <ErrorState message={apiError(mine.error)} onRetry={() => void mine.refetch()} /> : null}
      {mine.isLoading ? <div className="py-10 text-center"><Loader2 className="mx-auto size-6 animate-spin" /></div> : null}
      {notLinked ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          الحساب ده مش مربوط بموظف، فمالوش كود دعوات. أكواد الموظفين بتتدار من «أكواد الدعوات للموظفين».
        </div>
      ) : null}
      {summary ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <div>
              <p className="text-sm text-muted-foreground">{summary.employeeName}{summary.jobTitle ? ` · ${summary.jobTitle}` : ''}</p>
              {summary.code ? (
                <p className="mt-1 text-3xl font-bold tracking-wider" dir="ltr">{summary.code}</p>
              ) : (
                <p className="mt-1 text-lg font-semibold text-muted-foreground">لسه مالكش كود — كلم الإدارة</p>
              )}
            </div>
            {summary.code && !summary.isActive ? <Badge variant="destructive">الكود موقوف</Badge> : null}
          </div>
          <SummaryCards summary={summary} />
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">الناس اللي جت من خلالي</h2>
            <EmployeeGuestsTable employeeId={summary.employeeId} />
          </section>
        </>
      ) : null}
    </div>
  );
}
