import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBranches } from '@/hooks/use-branches';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { useAuth } from '@/store/auth';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { Pencil, Trash2, Eye } from 'lucide-react';

type Locker = { id: number; locker_number: string; is_available: boolean };
type InventoryLocker = {
  id: number;
  lockerNumber: string;
  isAvailable: boolean;
  latestCustomerName: string | null;
  latestCustomerPhone: string | null;
  previousCustomerName: string | null;
  previousCustomerPhone: string | null;
  latestSubscriptionStartDate: string | null;
  latestSubscriptionEndDate: string | null;
};
type ReportItem = {
  id: number;
  observed_status: string;
  notes: string | null;
  locker: Locker;
  latest_customer_name: string | null;
  latest_customer_phone: string | null;
  previous_customer_name: string | null;
  previous_customer_phone: string | null;
  latest_subscription_start_date: string | null;
  latest_subscription_end_date: string | null;
};
type Report = { id: number; branch_id: number; employee_id: number | null; employee_name: string | null; notes: string | null; status: string; created_at: string; items: ReportItem[] };

const STATUS_MAP: Record<string, string> = { pending_review: 'قيد المراجعة', approved: 'تمت الموافقة', rejected: 'مرفوض' };

function utcDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function cairoDay(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(value('year'), value('month') - 1, value('day')) / 86_400_000;
}

function reportItemLocker(item: ReportItem): InventoryLocker {
  return {
    id: item.locker.id,
    lockerNumber: item.locker.locker_number,
    isAvailable: item.locker.is_available,
    latestCustomerName: item.latest_customer_name,
    latestCustomerPhone: item.latest_customer_phone,
    previousCustomerName: item.previous_customer_name,
    previousCustomerPhone: item.previous_customer_phone,
    latestSubscriptionStartDate: item.latest_subscription_start_date,
    latestSubscriptionEndDate: item.latest_subscription_end_date,
  };
}

type InventoryFinding = { status: string; notes: string };
type InventoryFindings = Record<number, InventoryFinding>;

function InventoryRowsTable({ lockers, findings, onChange, day, blankLockerIds }: {
  lockers: InventoryLocker[];
  findings: InventoryFindings;
  onChange: (value: InventoryFindings | ((current: InventoryFindings) => InventoryFindings)) => void;
  day: number;
  blankLockerIds?: Set<number>;
}) {
  return <div className="overflow-x-auto">
    <Table className="min-w-[1280px]">
      <TableHeader><TableRow>
        <TableHead>رقم اللوكر</TableHead>
        <TableHead>إسم أحدث عميل مشترك باللوكر</TableHead>
        <TableHead>هاتف العميل الحالي</TableHead>
        <TableHead>إسم العميل السابق</TableHead>
        <TableHead>هاتف العميل السابق</TableHead>
        <TableHead>تاريخ بياني</TableHead>
        <TableHead>حالة اللوكر</TableHead>
        <TableHead>ملاحظات</TableHead>
      </TableRow></TableHeader>
      <TableBody>{lockers.map((locker) => {
        const dateSummary = inventoryDateSummary(locker, day);
        const blank = blankLockerIds?.has(locker.id);
        return <TableRow key={locker.id}>
          <TableCell className="font-mono font-semibold">{locker.lockerNumber}</TableCell>
          <TableCell>{locker.latestCustomerName || (blank ? '—' : 'غير مشغول')}</TableCell>
          <TableCell><span dir="ltr" className="inline-block font-mono">{locker.latestCustomerPhone || '—'}</span></TableCell>
          <TableCell>{locker.previousCustomerName || (blank ? '—' : 'غير مشغول')}</TableCell>
          <TableCell><span dir="ltr" className="inline-block font-mono">{locker.previousCustomerPhone || '—'}</span></TableCell>
          <TableCell><span className={dateSummary.tone}>{blank && !locker.latestSubscriptionStartDate ? '—' : dateSummary.label}</span><span dir="ltr" className="block text-xs text-muted-foreground">{dateSummary.detail}</span></TableCell>
          <TableCell><select aria-label={`حالة اللوكر ${locker.lockerNumber}`} className="h-10 w-40 rounded-md border bg-background px-3 text-sm" value={findings[locker.id]?.status ?? ''} onChange={(event) => onChange((current) => ({ ...current, [locker.id]: { status: event.target.value, notes: current[locker.id]?.notes ?? '' } }))}><option value="">— اختر الحالة —</option><option value="available">متاح</option><option value="occupied">مشغول</option><option value="maintenance">صيانة</option><option value="missing">غير موجود</option></select></TableCell>
          <TableCell><Input aria-label={`ملاحظات اللوكر ${locker.lockerNumber}`} className="min-w-48" placeholder="ملاحظة على اللوكر (اختياري)" value={findings[locker.id]?.notes ?? ''} onChange={(event) => onChange((current) => ({ ...current, [locker.id]: { status: current[locker.id]?.status ?? '', notes: event.target.value } }))} /></TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
  </div>;
}

function inventoryDateSummary(locker: InventoryLocker, today: number) {
  const start = locker.latestSubscriptionStartDate;
  const end = locker.latestSubscriptionEndDate;
  if (!start || !end) return { label: 'لا يوجد اشتراك', detail: '—', tone: 'text-muted-foreground' };
  const startsIn = utcDay(start) - today;
  const remaining = utcDay(end) - today;
  const label = startsIn > 0
    ? `يبدأ بعد ${startsIn} يوم`
    : remaining > 0
      ? `متبقي ${remaining} يوم`
      : remaining === 0
        ? 'ينتهي اليوم'
        : `انتهى منذ ${Math.abs(remaining)} يوم`;
  return {
    label,
    detail: `${start} — ${end}`,
    tone: startsIn > 0 ? 'text-sky-600 dark:text-sky-400' : remaining >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
  };
}

export function ClubLockerInventoryPage() {
  const { data: branches = [] } = useBranches();
  const { data: employeeOptions = [] } = useEmployeeOptions();
  const user = useAuth((s) => s.user);
  const empCode = user?.emp_code ?? null;
  const [branchId, setBranchId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Record<number, { status: string; notes: string }>>({});
  const [detailReport, setDetailReport] = useState<Report | null>(null);
  const [editReport, setEditReport] = useState<Report | null>(null);

  useEffect(() => { if (empCode) setEmployeeId(String(empCode)); }, [empCode]);
  const employeeLocked = !!empCode;

  const { data: lockers = [], refetch: refetchLockers } = useQuery({ queryKey: ['locker-inventory-lockers', branchId], enabled: !!branchId, queryFn: async () => (await api.get<InventoryLocker[]>('/club-lockers/inventory-snapshot', { params: { branchId } })).data });
  const { data: reports = [], refetch: refetchReports } = useQuery({ queryKey: ['locker-inventory-reports', branchId], queryFn: async () => (await api.get<Report[]>('/club-lockers/inventory-reports', { params: branchId ? { branchId } : {} })).data });

  const branchName = useMemo(() => branches.find((b) => String(b.id) === branchId)?.name ?? '—', [branches, branchId]);
  const todayDay = cairoDay();
  const ready = lockers.length > 0 && lockers.some((l) => items[l.id]?.status);

  const submit = async () => {
    const filled = lockers.filter((l) => items[l.id]?.status);
    if (!filled.length) return;
    try {
      await api.post('/club-lockers/inventory-reports', {
        branchId: Number(branchId),
        employeeId: employeeId ? Number(employeeId) : null,
        notes,
        items: filled.map((l) => ({ lockerId: l.id, observedStatus: items[l.id].status, notes: items[l.id].notes || undefined })),
      });
      toast.success('تم رفع تقرير الجرد للمراجعة');
      setNotes(''); setItems({});
      void refetchReports(); void refetchLockers();
    } catch (e) { toast.error(apiError(e)); }
  };

  const handleDelete = async (r: Report) => {
    const ok = await confirm({ title: 'حذف تقرير الجرد', description: `هل تريد حذف تقرير الجرد #${r.id}؟`, variant: 'destructive' });
    if (!ok) return;
    try { await api.delete(`/club-lockers/inventory-reports/${r.id}`); toast.success('تم الحذف'); void refetchReports(); } catch (e) { toast.error(apiError(e)); }
  };

  if (editReport) return <EditReportForm
    key={editReport.id}
    report={editReport}
    branches={branches}
    employeeOptions={employeeOptions}
    onClose={() => { setEditReport(null); void refetchReports(); }}
  />;

  return <div className="space-y-5"><PageHeader title="جرد اللوكر" description="سجل الحالة الفعلية لكل لوكر وارفع التقرير للمراجعة" />

    <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2"><div><Label>الفرع</Label><select className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">اختر الفرع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div><Label>الموظف المسؤول عن الجرد</Label><select className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={employeeId} disabled={employeeLocked} onChange={(e) => setEmployeeId(e.target.value)}><option value="">— اختر الموظف —</option>{employeeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div></div>

    {branchId && <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 font-medium">لوكرات فرع {branchName}</p>
      <InventoryRowsTable lockers={lockers} findings={items} onChange={setItems} day={todayDay} />
      <Textarea className="mt-4" placeholder="ملاحظات عامة للتقرير (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button className="mt-3" disabled={!ready} onClick={() => void submit()}>رفع الجرد للمراجعة</Button>
    </div>}

    <div className="rounded-xl border bg-card p-4">
      <h2 className="mb-3 font-semibold">تقارير الجرد</h2>
      {reports.length ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>التاريخ والوقت</TableHead><TableHead>الموظف</TableHead><TableHead>الفرع</TableHead><TableHead>الحالة</TableHead><TableHead className="text-center">عدد اللوكرات</TableHead><TableHead className="text-center">الإجراءات</TableHead></TableRow></TableHeader>
            <TableBody>{reports.map((r) => <TableRow key={r.id}>
              <TableCell className="font-mono">{r.id}</TableCell>
              <TableCell>{new Date(r.created_at).toLocaleString('ar-EG')}</TableCell>
              <TableCell>{r.employee_name ?? '—'}</TableCell>
              <TableCell>{branches.find((b) => b.id === r.branch_id)?.name ?? r.branch_id}</TableCell>
              <TableCell><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'approved' ? 'bg-green-100 text-green-700' : r.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{STATUS_MAP[r.status] ?? r.status}</span></TableCell>
              <TableCell className="text-center">{r.items.length}</TableCell>
              <TableCell>
                <div className="flex min-w-max items-center justify-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setDetailReport(r)}><Eye className="size-4" /> تفاصيل</Button>
                  <Button variant="outline" size="sm" onClick={() => setEditReport(r)}><Pencil className="size-4" /> تعديل</Button>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => void handleDelete(r)}><Trash2 className="size-4" /> حذف</Button>
                </div>
              </TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>
      ) : <p className="text-sm text-muted-foreground">لا توجد تقارير لهذا الفرع.</p>}
    </div>

    <Dialog open={!!detailReport} onOpenChange={(o) => { if (!o) setDetailReport(null); }}>
      <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto"><DialogHeader><DialogTitle>تفاصيل تقرير الجرد #{detailReport?.id}</DialogTitle></DialogHeader>
        {detailReport && <div className="space-y-3">
          <div className="grid gap-3 text-sm md:grid-cols-2"><div><span className="text-muted-foreground">التاريخ:</span> {new Date(detailReport.created_at).toLocaleString('ar-EG')}</div><div><span className="text-muted-foreground">الفرع:</span> {branches.find((branch) => branch.id === detailReport.branch_id)?.name ?? detailReport.branch_id}</div><div><span className="text-muted-foreground">الموظف:</span> {detailReport.employee_name ?? '—'}</div><div><span className="text-muted-foreground">الحالة:</span> {STATUS_MAP[detailReport.status] ?? detailReport.status}</div><div className="md:col-span-2"><span className="text-muted-foreground">ملاحظات عامة:</span> {detailReport.notes || 'بدون'}</div></div>
          <div className="overflow-x-auto"><Table className="min-w-[1280px]"><TableHeader><TableRow><TableHead>رقم اللوكر</TableHead><TableHead>إسم أحدث عميل مشترك باللوكر</TableHead><TableHead>هاتف العميل الحالي</TableHead><TableHead>إسم العميل السابق</TableHead><TableHead>هاتف العميل السابق</TableHead><TableHead>تاريخ بياني</TableHead><TableHead>حالة اللوكر</TableHead><TableHead>ملاحظات</TableHead></TableRow></TableHeader>
            <TableBody>{detailReport.items.map((item) => {
              const locker = reportItemLocker(item);
              const dateSummary = inventoryDateSummary(locker, cairoDay(new Date(detailReport.created_at)));
              return <TableRow key={item.id}><TableCell className="font-mono font-semibold">{locker.lockerNumber}</TableCell><TableCell>{locker.latestCustomerName || '—'}</TableCell><TableCell dir="ltr">{locker.latestCustomerPhone || '—'}</TableCell><TableCell>{locker.previousCustomerName || '—'}</TableCell><TableCell dir="ltr">{locker.previousCustomerPhone || '—'}</TableCell><TableCell><span className={dateSummary.tone}>{locker.latestSubscriptionStartDate ? dateSummary.label : '—'}</span><span dir="ltr" className="block text-xs text-muted-foreground">{dateSummary.detail}</span></TableCell><TableCell>{item.observed_status === 'available' ? 'متاح' : item.observed_status === 'occupied' ? 'مشغول' : item.observed_status === 'maintenance' ? 'صيانة' : item.observed_status === 'missing' ? 'غير موجود' : item.observed_status}</TableCell><TableCell>{item.notes || '—'}</TableCell></TableRow>;
            })}</TableBody></Table></div>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}

function EditReportForm({ report, branches, employeeOptions, onClose }: { report: Report; branches: { id: number; name: string | null }[]; employeeOptions: { value: string; label: string }[]; onClose: () => void }) {
  const [notes, setNotes] = useState(report.notes ?? '');
  const [employeeId, setEmployeeId] = useState(report.employee_id ? String(report.employee_id) : '');
  const [items, setItems] = useState<Record<number, { status: string; notes: string }>>(() =>
    Object.fromEntries(report.items.map((item) => [item.locker.id, { status: item.observed_status, notes: item.notes ?? '' }])),
  );
  const [saving, setSaving] = useState(false);
  const { data: currentLockers = [], isLoading: lockersLoading } = useQuery({
    queryKey: ['locker-inventory-edit-lockers', report.branch_id],
    queryFn: async () => (await api.get<InventoryLocker[]>('/club-lockers/inventory-snapshot', { params: { branchId: report.branch_id } })).data,
  });
  const lockers = useMemo(() => {
    const saved = report.items.map(reportItemLocker);
    const savedIds = new Set(saved.map((locker) => locker.id));
    const collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });
    return [...saved, ...currentLockers.filter((locker) => !savedIds.has(locker.id))]
      .sort((a, b) => collator.compare(a.lockerNumber, b.lockerNumber));
  }, [currentLockers, report.items]);

  const handleSave = async () => {
    const editedItems = lockers
      .filter((locker) => items[locker.id]?.status)
      .map((locker) => ({
        lockerId: locker.id,
        observedStatus: items[locker.id].status,
        notes: items[locker.id].notes || undefined,
      }));
    if (!editedItems.length) {
      toast.error('يجب تحديد حالة لوكر واحد على الأقل');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/club-lockers/inventory-reports/${report.id}`, {
        notes,
        employeeId: employeeId ? Number(employeeId) : null,
        items: editedItems,
      });
      toast.success('تم حفظ التعديلات');
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-5">
    <PageHeader title={`تعديل تقرير الجرد #${report.id}`} description="راجع نفس بيانات المحضر المسجلة وعدّل الحالة أو الملاحظات ثم احفظ التغييرات" />
    <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2">
      <div><Label>الفرع</Label><Input className="mt-2" value={branches.find((branch) => branch.id === report.branch_id)?.name ?? String(report.branch_id)} readOnly /></div>
      <div><Label>الموظف المسؤول عن الجرد</Label><select className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">— اختر الموظف —</option>{employeeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
    </div>
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 font-medium">لوكرات فرع {branches.find((branch) => branch.id === report.branch_id)?.name ?? report.branch_id}</p>
      {lockersLoading ? <p className="py-4 text-sm text-muted-foreground">جاري تحميل اللوكرات...</p> : <InventoryRowsTable lockers={lockers} findings={items} onChange={setItems} day={cairoDay(new Date(report.created_at))} blankLockerIds={new Set(report.items.map((item) => item.locker.id))} />}
      <Textarea className="mt-4" placeholder="ملاحظات عامة للتقرير (اختياري)" value={notes} onChange={(event) => setNotes(event.target.value)} />
      <div className="mt-3 flex gap-2"><Button onClick={() => void handleSave()} disabled={saving || lockersLoading}>{saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}</Button><Button variant="outline" onClick={onClose}>إلغاء</Button></div>
    </div>
  </div>;
}
