import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/states';
import { Time12Input } from '@/components/common/time-12-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { useResource } from '@/lib/api-hooks';
import { queryClient } from '@/lib/query';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

type WeeklySlot = { weekday: number; branchId: number | null; shiftId: number | null };
type WeeklySchedule = { effectiveFrom?: string; slots: WeeklySlot[] };
const WEEKDAYS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

interface EmployeeIdentity {
  emp_code?: string | number;
  emp_name?: string;
  employee?: string;
  branch_id_fk?: string | number;
}

interface ShiftRow {
  id: number;
  title?: string;
  hdoorFromTime?: string;
  hdoorToTime?: string;
  hdoorKhasmFrom?: string;
  ensrafFromTime?: string;
  ensrafToTime?: string;
  ensrafKhasmFrom?: string;
}

interface AttendanceForm {
  shiftId: string;
  branchId: string;
  hdoorFromTime: string;
  hdoorToTime: string;
  hdoorKhasmFrom: string;
  ensrafFromTime: string;
  ensrafToTime: string;
  ensrafKhasmFrom: string;
}

const EMPTY_FORM: AttendanceForm = {
  shiftId: '',
  branchId: '',
  hdoorFromTime: '',
  hdoorToTime: '',
  hdoorKhasmFrom: '',
  ensrafFromTime: '',
  ensrafToTime: '',
  ensrafKhasmFrom: '',
};

const TIME_FIELDS: Array<{ key: keyof Omit<AttendanceForm, 'shiftId' | 'branchId'>; label: string }> = [
  { key: 'hdoorFromTime', label: 'بداية الحضور' },
  { key: 'hdoorToTime', label: 'نهاية الحضور' },
  { key: 'hdoorKhasmFrom', label: 'بداية الخصم' },
  { key: 'ensrafFromTime', label: 'بداية الانصراف' },
  { key: 'ensrafToTime', label: 'نهاية الانصراف' },
  { key: 'ensrafKhasmFrom', label: 'احتساب الإضافي من' },
];

function toInputTime(raw?: string): string {
  if (!raw) return '';
  const ampm = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[3].toLowerCase() === 'pm') hour += 12;
    return `${String(hour).padStart(2, '0')}:${ampm[2]}`;
  }
  const hm = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  return hm ? `${hm[1].padStart(2, '0')}:${hm[2]}` : '';
}

export function EmployeeAttendancePage() {
  const { ui } = useLocale();
  const { id } = useParams<{ id: string }>();
  const { data: employee, isLoading: employeeLoading, isError, refetch } = useResource<EmployeeIdentity>('employees', id, 'identity');
  const { data: weekly, isLoading: weeklyLoading } = useQuery({
    queryKey: ['employees', id, 'weekly-schedule'],
    queryFn: async () => (await api.get<WeeklySchedule>(`/employees/${id}/weekly-schedule`)).data,
    enabled: Boolean(id),
  });
  const { data: branches } = useBranches();
  const { data: shifts = [] } = useQuery({
    queryKey: ['attendance', 'shifts', 'employee-assignment'],
    queryFn: () => fetchAllReportRows<ShiftRow>('/attendance/shifts', {}, 100),
  });
  const [form, setForm] = useState<AttendanceForm>(EMPTY_FORM);
  const [slots, setSlots] = useState<Record<number, WeeklySlot>>({});
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!employee) return;
    setForm((current) => current.branchId
      ? current
      : { ...current, branchId: String(employee.branch_id_fk ?? '') });
  }, [employee]);

  useEffect(() => {
    if (!weekly?.slots) return;
    setSlots(Object.fromEntries(weekly.slots.map((slot) => [slot.weekday, slot])));
  }, [weekly]);

  const selectShift = (shiftId: string) => {
    const shift = shifts.find((item) => String(item.id) === shiftId);
    setForm((current) => ({
      ...current,
      shiftId,
      hdoorFromTime: toInputTime(shift?.hdoorFromTime),
      hdoorToTime: toInputTime(shift?.hdoorToTime),
      hdoorKhasmFrom: toInputTime(shift?.hdoorKhasmFrom),
      ensrafFromTime: toInputTime(shift?.ensrafFromTime),
      ensrafToTime: toInputTime(shift?.ensrafToTime),
      ensrafKhasmFrom: toInputTime(shift?.ensrafKhasmFrom),
    }));
  };

  const addSelectedDays = (rest = false) => {
    if (!rest && (!form.shiftId || !form.branchId || form.branchId === 'all')) {
      toast.error(ui('اختر الفرع والدوام أولاً'));
      return;
    }
    if (!selectedDays.length) return toast.error(ui('اختر يومًا واحدًا على الأقل'));
    setSlots((current) => ({ ...current, ...Object.fromEntries(selectedDays.map((weekday) => [weekday, {
      weekday,
      branchId: rest ? null : Number(form.branchId),
      shiftId: rest ? null : Number(form.shiftId),
    }])) }));
    setSelectedDays([]);
  };

  const save = async () => {
    if (!id) return;
    if (Object.keys(slots).length !== 7) {
      toast.error(ui('يجب تحديد دوام أو راحة لكل أيام الأسبوع'));
      return;
    }
    setSaving(true);
    try {
      await api.put(`/employees/${id}/weekly-schedule`, {
        effectiveFrom: weekly?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
        slots: Object.values(slots),
      });
      toast.success(ui('تم حفظ الجدول الأسبوعي للموظف'));
      void queryClient.invalidateQueries({ queryKey: ['employees', id, 'weekly-schedule'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (employeeLoading || weeklyLoading) return <Skeleton className="h-72 w-full" />;

  const employeeName = employee?.emp_name ?? employee?.employee ?? '—';

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('بيانات دوام الموظف')}
        description={`${employeeName} · ${ui('كود الموظف')}: ${toArabicDigits(employee?.emp_code ?? '—')}`}
        actions={<Button variant="outline" asChild><Link to="/employees"><ArrowRight className="size-4" />{ui('رجوع')}</Link></Button>}
      />

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{ui('اسم الدوام')}</Label>
              <Select value={form.shiftId} onValueChange={selectShift}>
                <SelectTrigger><SelectValue placeholder={ui('اختر الدوام')} /></SelectTrigger>
                <SelectContent>
                  {shifts.map((shift) => <SelectItem key={shift.id} value={String(shift.id)}>{shift.title ?? String(shift.id)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{ui('الفرع')}</Label>
              <Select value={form.branchId} onValueChange={(branchId) => setForm((current) => ({ ...current, branchId }))}>
                <SelectTrigger><SelectValue placeholder={ui('اختر الفرع')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ui('إدارة')}</SelectItem>
                  {(branches ?? []).map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name ?? String(branch.id)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {WEEKDAYS.map((day, weekday) => {
              const used = Boolean(slots[weekday]);
              return <label key={day} className="flex items-center gap-2 rounded border p-3 text-sm">
                <Checkbox checked={selectedDays.includes(weekday)} disabled={used} onCheckedChange={(checked) => setSelectedDays((current) => checked ? [...current, weekday] : current.filter((value) => value !== weekday))} />
                {ui(day)} {used ? `(${slots[weekday].shiftId == null ? ui('راحة') : ui('محدد')})` : ''}
              </label>;
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => addSelectedDays()}><Plus className="size-4" />{ui('إضافة للأيام المختارة')}</Button>
            <Button type="button" variant="outline" onClick={() => addSelectedDays(true)}>{ui('تحديد راحة')}</Button>
          </div>

          <div className="flex justify-end border-t pt-6">
            <Button variant="brand" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {ui('حفظ الجدول الأسبوعي')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold">{ui('جدول الدوام الأسبوعي')}</h2>
            <p className="text-sm text-muted-foreground">{ui('لا يمكن اختيار اليوم أكثر من مرة')}</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ui('اليوم')}</TableHead>
                <TableHead>{ui('اسم الدوام')}</TableHead>
                <TableHead>{ui('الفرع')}</TableHead>
                <TableHead className="w-20">{ui('الإجراء')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {WEEKDAYS.map((day, weekday) => {
                const slot = slots[weekday];
                const shift = shifts.find((item) => item.id === slot?.shiftId);
                const branch = (branches ?? []).find((item) => item.id === slot?.branchId);
                return <TableRow key={day}>
                  <TableCell>{ui(day)}</TableCell>
                  <TableCell className="font-semibold">{slot ? (slot.shiftId == null ? ui('راحة') : (shift?.title ?? slot.shiftId)) : '—'}</TableCell>
                  <TableCell>{slot?.branchId == null ? '—' : (branch?.name ?? slot.branchId)}</TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      aria-label={ui('حذف')}
                      disabled={!slot}
                      onClick={() => setSlots((current) => { const next = { ...current }; delete next[weekday]; return next; })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>;
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
