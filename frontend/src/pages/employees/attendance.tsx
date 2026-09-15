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
import type { DwamData } from '@/types/employees';

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
  const { data: dwam, isLoading: dwamLoading } = useResource<DwamData>('employees', id, 'dwam');
  const { data: branches } = useBranches();
  const { data: shifts = [] } = useQuery({
    queryKey: ['attendance', 'shifts', 'employee-assignment'],
    queryFn: () => fetchAllReportRows<ShiftRow>('/attendance/shifts', {}, 100),
  });
  const [form, setForm] = useState<AttendanceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!employee) return;
    setForm((current) => current.branchId
      ? current
      : { ...current, branchId: String(employee.branch_id_fk ?? '') });
  }, [employee]);

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

  const save = async () => {
    if (!id) return;
    const missing = !form.shiftId || !form.branchId || TIME_FIELDS.some((field) => !form[field.key]);
    if (missing) {
      toast.error(ui('يرجى استكمال اسم الدوام والتوقيتات والفرع'));
      return;
    }
    setSaving(true);
    try {
      await api.put(`/employees/${id}/dwam`, form);
      toast.success(ui('تمت إضافة الدوام للموظف'));
      void queryClient.invalidateQueries({ queryKey: ['employees', id, 'dwam'] });
      setForm((current) => ({ ...EMPTY_FORM, branchId: current.branchId }));
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (assignmentId: number) => {
    if (!id) return;
    try {
      await api.delete(`/employees/${id}/dwam/${assignmentId}`);
      toast.success(ui('تم حذف ربط الدوام'));
      void queryClient.invalidateQueries({ queryKey: ['employees', id, 'dwam'] });
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (employeeLoading || dwamLoading) return <Skeleton className="h-72 w-full" />;

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

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {TIME_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{ui(field.label)}</Label>
                <Time12Input disabled value={form[field.key]} onValueChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))} />
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">{ui('المواعيد تُعرض من إعدادات الدوام، ويمكن تعديلها من شاشة إعدادات الدوام')}</p>

          <div className="flex justify-end border-t pt-6">
            <Button variant="brand" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {ui('إضافة الدوام')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold">{ui('الدوامات المرتبط بها الموظف')}</h2>
            <p className="text-sm text-muted-foreground">{ui('يمكن ربط الموظف بأكثر من دوام وفرع')}</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ui('اسم الدوام')}</TableHead>
                <TableHead>{ui('الفرع')}</TableHead>
                <TableHead>{ui('فترة الحضور')}</TableHead>
                <TableHead>{ui('فترة الانصراف')}</TableHead>
                <TableHead className="w-20">{ui('الإجراء')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(dwam?.assignments ?? []).map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-semibold">{assignment.shiftName ?? assignment.shiftId}</TableCell>
                  <TableCell>{assignment.branchId === 'all' ? ui('إدارة') : (assignment.branchName ?? assignment.branchId)}</TableCell>
                  <TableCell className="nums">{assignment.hdoorFromTime} – {assignment.hdoorToTime}</TableCell>
                  <TableCell className="nums">{assignment.ensrafFromTime} – {assignment.ensrafToTime}</TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      aria-label={ui('حذف')}
                      onClick={() => void removeAssignment(assignment.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!dwam?.assignments?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {ui('لا توجد دوامات مرتبطة بالموظف حتى الآن')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
