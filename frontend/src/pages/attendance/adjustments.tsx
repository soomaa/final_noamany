import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Fingerprint, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { minutesLabel } from '@/lib/minutes';
import { confirm } from '@/lib/confirm';
import { useLocale } from '@/store/locale';
import type { EmployeeListItem } from '@/types/employees';
import { SearchableSelect } from '@/components/common/searchable-select';
import { Textarea } from '@/components/ui/textarea';

interface SwapRow { id: number; empCode: number; empName: string; sheftDate: string; ttypeName: string; dwamTitle?: string; punchStatus?: 'no_punch' | 'confirmed' | 'pending'; warning?: string; }
/** numHours = hours the fingerprint confirmed (what payroll pays); requestedHours = what the manager entered. */
interface ExtraRow { id: number; empCode: number; empName: string; edafaDate: string; numHours: number; requestedHours?: number; confirmedMinutes?: number | null; warning?: string; }
interface CompDayCredit { id: number; workDate: string; minutes: number; status: 'earned' | 'used'; statusLabel: string; }
interface CompDaySummary { empCode: number; empName: string; earned: number; used: number; balance: number; credits: CompDayCredit[]; }

function WarningNote({ text }: { text?: string }) {
  if (!text) return null;
  return <span className="mt-0.5 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{text}</span>;
}

interface ShiftOption { id: number; title?: string; hdoorFromTime?: string; ensrafToTime?: string; }
interface TeamResponse { scope: 'all' | 'team'; recordsDirectly: boolean; employees: { id: number; emp_code: number | null; employee: string | null; edara_n?: string | null; qsm_n?: string | null }[] }
interface OvertimePreview { message: string; confirmedMinutes: number; confirmedHours: number; hasPunch: boolean; openPunch: boolean; future: boolean; isOffDay: boolean; punches: { shiftTitle?: string | null; in?: string | null; out?: string | null }[] }
interface ManagerEntryResult { queued?: boolean; autoApproved?: boolean; message?: string; warning?: string }

export function AttendanceAdjustmentsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const swaps = usePaginatedList<SwapRow>('attendance/shift-swaps', params);
  const extras = usePaginatedList<ExtraRow>('attendance/extra-hours', params);
  const { data: employees = [] } = useQuery({
    queryKey: ['attendance', 'employee-options'],
    queryFn: async () => (await api.get<EmployeeListItem[]>('/employees/pos-options')).data,
    staleTime: 60_000,
  });
  const { data: shifts = [] } = useQuery({
    queryKey: ['attendance', 'shift-options'],
    queryFn: () => fetchAllReportRows<ShiftOption>('/attendance/shifts', {}, 100),
    staleTime: 60_000,
  });
  const [swap, setSwap] = useState({ empId: '', dwamIdFk: '', sheftDate: '', ttype: '1' });
  const [extra, setExtra] = useState({ empId: '', date: '', kind: 'hours' as 'hours' | 'shift', hours: '1', shiftId: '', reason: '' });
  // Employees this user may enter overtime for: his team (direct manager) or everyone (HR / admin).
  const { data: team } = useQuery({
    queryKey: ['overtime-requests', 'team'],
    queryFn: async () => (await api.get<TeamResponse>('/overtime-requests/team')).data,
    staleTime: 60_000,
  });
  // Live: what the fingerprint confirms for that employee and day.
  const preview = useQuery({
    queryKey: ['overtime-requests', 'preview', extra.empId, extra.date],
    queryFn: async () => (await api.get<OvertimePreview>('/overtime-requests/preview', { params: { empId: extra.empId, date: extra.date } })).data,
    enabled: !!extra.empId && /^\d{4}-\d{2}-\d{2}$/.test(extra.date),
    retry: false,
  });
  const [saving, setSaving] = useState(false);
  const [compEmpCode, setCompEmpCode] = useState('');
  const compDays = useQuery({
    queryKey: ['attendance', 'comp-days', compEmpCode],
    queryFn: async () => {
      if (compEmpCode) {
        const one = (await api.get<CompDaySummary>('/attendance/comp-days', { params: { empCode: compEmpCode } })).data;
        return one.earned ? [one] : [];
      }
      return (await api.get<{ data: CompDaySummary[] }>('/attendance/comp-days')).data.data;
    },
  });
  const employeeOptions = employees.map((employee) => ({
    value: String(employee.id),
    label: `${employee.employee} (${employee.emp_code})`,
    description: [employee.edara_n, employee.qsm_n].filter(Boolean).join(' — '),
  }));
  const shiftOptions = shifts.map((shift) => ({
    value: String(shift.id),
    label: shift.title || `${ui('وردية')} #${shift.id}`,
    description: [shift.hdoorFromTime, shift.ensrafToTime].filter(Boolean).join(' — '),
  }));
  const swapEmployee = employees.find((employee) => String(employee.id) === swap.empId);
  const teamOptions = (team?.employees ?? []).map((employee) => ({
    value: String(employee.id),
    label: `${employee.employee ?? ''} (${employee.emp_code ?? '—'})`,
    description: [employee.edara_n, employee.qsm_n].filter(Boolean).join(' — '),
  }));
  const extraOptions = team ? teamOptions : employeeOptions;
  const saveSwap = async () => {
    if (!swap.empId || !swap.dwamIdFk || !swap.sheftDate) return toast.error(ui('أكمل بيانات الوردية'));
    setSaving(true);
    try {
      const { data } = await api.post<{ warning?: string; queued?: boolean; message?: string }>('/attendance/shift-swaps', { ...swap, empId: Number(swap.empId), dwamIdFk: Number(swap.dwamIdFk), ttype: Number(swap.ttype) });
      // An extra shift from a direct manager waits for HR approval.
      if (data?.queued) toast.success(data.message ?? ui('اتبعت للـ HR للموافقة'), { duration: 8_000 });
      else if (data?.warning) toast.warning(data.warning, { duration: 10_000 });
      else toast.success(ui('تم حفظ تعديل الوردية')); setSwap({ empId: '', dwamIdFk: '', sheftDate: '', ttype: '1' }); void swaps.refetch();
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };
  const saveExtra = async () => {
    if (!extra.empId || !extra.date) return toast.error(ui('اختر الموظف والتاريخ'));
    if (extra.kind === 'hours' && !(Number(extra.hours) >= 1)) return toast.error(ui('عدد الساعات غير صالح'));
    if (extra.kind === 'shift' && !extra.shiftId) return toast.error(ui('اختر الوردية الإضافية'));
    if (!extra.reason.trim()) return toast.error(ui('اكتب السبب'));
    setSaving(true);
    try {
      const { data } = await api.post<ManagerEntryResult>('/overtime-requests/manager', {
        empId: Number(extra.empId),
        date: extra.date,
        kind: extra.kind,
        ...(extra.kind === 'hours' ? { hours: Number(extra.hours) } : { shiftId: Number(extra.shiftId) }),
        reason: extra.reason.trim(),
      });
      // A direct manager's entry is a request for HR; HR / admin entries are recorded (fingerprint rule applies).
      if (data?.queued) toast.success(data.message ?? ui('اتبعت للـ HR للموافقة'), { duration: 8_000 });
      else if (data?.warning) toast.warning(data.warning, { duration: 12_000 });
      else toast.success(data?.message ?? ui('تم حفظ الساعات الإضافية'));
      setExtra({ empId: '', date: '', kind: 'hours', hours: '1', shiftId: '', reason: '' });
      void extras.refetch();
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };
  const remove = async (path: string, id: number, refresh: () => unknown) => {
    const ok = await confirm({ title: ui('حذف السجل؟'), description: ui('السجل هيتشال ومش هيتحسب في الحضور والمرتب.'), confirmLabel: ui('حذف'), variant: 'destructive' });
    if (!ok) return;
    try { await api.delete(`${path}/${id}`); toast.success(ui('تم حذف السجل')); refresh(); } catch (e) { toast.error(apiError(e)); }
  };
  const swapColumns: ColumnDef<SwapRow>[] = [
    { accessorKey: 'empCode', header: ui('الكود'), cell: ({ getValue }) => toArabicDigits(String(getValue())) },
    { accessorKey: 'empName', header: ui('الموظف') }, { accessorKey: 'sheftDate', header: ui('التاريخ') },
    { accessorKey: 'ttypeName', header: ui('النوع'), cell: ({ row }) => <div className="flex flex-col"><span>{row.original.ttypeName}</span><WarningNote text={row.original.warning} /></div> },
    { accessorKey: 'dwamTitle', header: ui('الوردية') },
    { id: 'actions', header: ui('الإجراءات'), cell: ({ row }) => <Button size="sm" variant="destructive" onClick={() => void remove('/attendance/shift-swaps', row.original.id, () => swaps.refetch())}>{ui('حذف')}</Button> },
  ];
  const extraColumns: ColumnDef<ExtraRow>[] = [
    { accessorKey: 'empCode', header: ui('الكود'), cell: ({ getValue }) => toArabicDigits(String(getValue())) },
    { accessorKey: 'empName', header: ui('الموظف') }, { accessorKey: 'edafaDate', header: ui('التاريخ') },
    { accessorKey: 'requestedHours', header: ui('المسجل من المدير'), cell: ({ row }) => toArabicDigits(String(row.original.requestedHours ?? row.original.numHours)) },
    {
      accessorKey: 'numHours',
      header: ui('المؤكد بالبصمة (بيتصرف)'),
      cell: ({ row }) => <div className="flex flex-col">
        <span className="font-medium">{toArabicDigits(String(row.original.numHours))}{row.original.confirmedMinutes != null ? <span className="ms-1 text-xs text-muted-foreground">({minutesLabel(row.original.confirmedMinutes)})</span> : null}</span>
        <WarningNote text={row.original.warning} />
      </div>,
    },
    { id: 'actions', header: ui('الإجراءات'), cell: ({ row }) => <Button size="sm" variant="destructive" onClick={() => void remove('/attendance/extra-hours', row.original.id, () => extras.refetch())}>{ui('حذف')}</Button> },
  ];
  const compColumns: ColumnDef<CompDaySummary>[] = [
    { accessorKey: 'empCode', header: ui('الكود'), cell: ({ getValue }) => toArabicDigits(String(getValue())) },
    { accessorKey: 'empName', header: ui('الموظف') },
    { accessorKey: 'earned', header: ui('أيام اشتغلها في الراحة'), cell: ({ getValue }) => toArabicDigits(String(getValue())) },
    { accessorKey: 'used', header: ui('اتاخد كإجازة بدل'), cell: ({ getValue }) => toArabicDigits(String(getValue())) },
    { accessorKey: 'balance', header: ui('الرصيد المتاح'), cell: ({ getValue }) => <span className="font-semibold">{toArabicDigits(String(getValue()))}</span> },
    {
      id: 'credits',
      header: ui('الأيام'),
      cell: ({ row }) => <div className="flex flex-wrap gap-1">{row.original.credits.map((c) => (
        <span key={c.id} className={`rounded-md border px-1.5 py-0.5 text-xs ${c.status === 'used' ? 'text-muted-foreground line-through' : 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'}`} title={c.statusLabel}>
          {toArabicDigits(c.workDate)} · {minutesLabel(c.minutes)}
        </span>
      ))}</div>,
    },
  ];
  const compEmployeeOptions = employees
    .filter((employee) => employee.emp_code != null)
    .map((employee) => ({ value: String(employee.emp_code), label: `${employee.employee} (${employee.emp_code})` }));
  const tableProps = { page: params.page, pageSize: params.pageSize, onPageChange: (page: number) => setParams({ page }), onPageSizeChange: (pageSize: number) => setParams({ pageSize, page: 1 }) };

  return <div className="space-y-6">
    <PageHeader title={ui('تعديلات الحضور والانصراف')} description={ui('تبديل وإضافة الورديات والساعات الإضافية')} />
    <Tabs defaultValue="swaps">
      <TabsList><TabsTrigger value="swaps">{ui('الورديات')}</TabsTrigger><TabsTrigger value="extra">{ui('الساعات الإضافية')}</TabsTrigger><TabsTrigger value="comp">{ui('أيام البدل')}</TabsTrigger></TabsList>
      <TabsContent value="swaps" className="space-y-4">
        <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
          <div><Label>{ui('الموظف')}</Label><Combobox value={swap.empId} options={employeeOptions} placeholder={ui('اختر الموظف')} searchPlaceholder={ui('ابحث بالاسم أو الكود…')} onValueChange={(empId) => setSwap((x) => ({ ...x, empId }))} /></div>
          <div><Label>{ui('الإدارة')}</Label><Input disabled value={swapEmployee?.edara_n ?? ''} /></div>
          <div><Label>{ui('القسم')}</Label><Input disabled value={swapEmployee?.qsm_n ?? ''} /></div>
          <div><Label>{ui('التاريخ')}</Label><Input type="date" value={swap.sheftDate} onChange={(e) => setSwap((x) => ({ ...x, sheftDate: e.target.value }))} /></div>
          <div><Label>{ui('نوع العملية')}</Label><SearchableSelect className="h-10 w-full rounded-md border bg-background px-3" value={swap.ttype} onChange={(e) => setSwap((x) => ({ ...x, ttype: e.target.value }))}><option value="1">{ui('تبديل وردية')}</option><option value="2">{ui('إضافة وردية')}</option></SearchableSelect></div>
          <div><Label>{ui('الوردية')}</Label><Combobox value={swap.dwamIdFk} options={shiftOptions} placeholder={ui('اختر الوردية')} searchPlaceholder={ui('ابحث في الورديات…')} onValueChange={(dwamIdFk) => setSwap((x) => ({ ...x, dwamIdFk }))} /></div>
          <div className="flex items-end"><Button className="w-full" disabled={saving} onClick={() => void saveSwap()}>{ui('حفظ')}</Button></div>
        </div>
        <DataTable {...tableProps} columns={swapColumns} data={swaps.data?.data ?? []} total={swaps.data?.total ?? 0} isLoading={swaps.isLoading} isError={swaps.isError} onRetry={() => void swaps.refetch()} />
      </TabsContent>
      <TabsContent value="extra" className="space-y-4">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{team?.recordsDirectly ? ui('تسجيل إضافي (الموارد البشرية — يتسجل مباشرة)') : ui('طلب إضافي لموظف في فريقك — بيروح للـ HR للموافقة')}</p>
            <Button variant="outline" size="sm" asChild><Link to="/requests/overtime"><ListChecks className="size-4" />{ui('متابعة الطلبات')}</Link></Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>{ui('الموظف')}</Label><Combobox value={extra.empId} options={extraOptions} placeholder={team?.scope === 'team' ? ui('اختر من فريقك') : ui('اختر الموظف')} searchPlaceholder={ui('ابحث بالاسم أو الكود…')} emptyText={team?.scope === 'team' ? ui('مفيش موظفين تحت إدارتك المباشرة') : undefined} onValueChange={(empId) => setExtra((x) => ({ ...x, empId }))} /></div>
            <div><Label>{ui('التاريخ')}</Label><Input type="date" value={extra.date} onChange={(e) => setExtra((x) => ({ ...x, date: e.target.value }))} /></div>
            <div><Label>{ui('النوع')}</Label><SearchableSelect className="h-10 w-full rounded-md border bg-background px-3" value={extra.kind} onChange={(e) => setExtra((x) => ({ ...x, kind: e.target.value as 'hours' | 'shift' }))}><option value="hours">{ui('ساعات إضافية')}</option><option value="shift">{ui('شيفت إضافي')}</option></SearchableSelect></div>
            {extra.kind === 'hours'
              ? <div><Label>{ui('عدد الساعات')}</Label><Input type="number" min="1" max="12" value={extra.hours} onChange={(e) => setExtra((x) => ({ ...x, hours: e.target.value }))} /></div>
              : <div><Label>{ui('الوردية الإضافية')}</Label><Combobox value={extra.shiftId} options={shiftOptions} placeholder={ui('اختر الوردية')} searchPlaceholder={ui('ابحث في الورديات…')} onValueChange={(shiftId) => setExtra((x) => ({ ...x, shiftId }))} /></div>}
            <div className="sm:col-span-2"><Label>{ui('السبب')}</Label><Textarea rows={2} value={extra.reason} onChange={(e) => setExtra((x) => ({ ...x, reason: e.target.value }))} placeholder={ui('مثال: جرد آخر الشهر')} /></div>
          </div>
          {extra.empId && extra.date && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium"><Fingerprint className="size-4 text-primary" />{ui('البصمة في اليوم ده')}</p>
              {preview.isLoading ? <p className="text-muted-foreground">{ui('جاري التحميل…')}</p> : preview.isError ? <p className="text-muted-foreground">{apiError(preview.error)}</p> : preview.data && <>
                <p className="mt-1">{preview.data.message}</p>
                {preview.data.punches.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {preview.data.punches.map((p, i) => <li key={i}>{p.shiftTitle ?? ui('وردية')}: {ui('حضور')} {toArabicDigits(p.in ?? '—')} — {ui('انصراف')} {toArabicDigits(p.out ?? '—')}</li>)}
                </ul>}
                {extra.kind === 'hours' && Number(extra.hours) > preview.data.confirmedHours && !preview.data.future && (
                  <WarningNote text={ui(`المطلوب ${extra.hours} ساعة والبصمة بتأكد ${preview.data.confirmedHours} بس — هيتصرف المؤكد بس بعد موافقة HR`)} />
                )}
              </>}
            </div>
          )}
          <div className="flex justify-end"><Button disabled={saving} onClick={() => void saveExtra()}>{team?.recordsDirectly ? ui('حفظ') : ui('إرسال للـ HR')}</Button></div>
        </div>
        <p className="text-xs text-muted-foreground">{ui('المرتب بيصرف الساعات المؤكدة بالبصمة بس (بعد ميعاد احتساب الإضافي، أو اليوم كله لو شيفت إضافي أو يوم راحة).')}</p>
        <DataTable {...tableProps} columns={extraColumns} data={extras.data?.data ?? []} total={extras.data?.total ?? 0} isLoading={extras.isLoading} isError={extras.isError} onRetry={() => void extras.refetch()} />
      </TabsContent>
      <TabsContent value="comp" className="space-y-4">
        <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label>{ui('الموظف')}</Label>
            <Combobox value={compEmpCode} options={compEmployeeOptions} placeholder={ui('كل الموظفين')} searchPlaceholder={ui('ابحث بالاسم أو الكود…')} onValueChange={setCompEmpCode} />
          </div>
          <div className="flex items-end">{compEmpCode ? <Button variant="outline" className="w-full" onClick={() => setCompEmpCode('')}>{ui('كل الموظفين')}</Button> : null}</div>
          <p className="text-xs text-muted-foreground sm:col-span-3">{ui('لما الموظف يبصم حضور وانصراف في يوم إجازته الأسبوعية بيتسجل له يوم بدل، وياخده بعدين كإجازة «بدل راحة». الرصيد بيقل مع كل إجازة بدل راحة معتمدة.')}</p>
        </div>
        <DataTable columns={compColumns} data={compDays.data ?? []} total={compDays.data?.length ?? 0} page={1} pageSize={Math.max(10, compDays.data?.length ?? 0)} onPageChange={() => undefined} onPageSizeChange={() => undefined} isLoading={compDays.isLoading} isError={compDays.isError} onRetry={() => void compDays.refetch()} emptyTitle={ui('مفيش أيام بدل مسجلة')} />
      </TabsContent>
    </Tabs>
  </div>;
}
