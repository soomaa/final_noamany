import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiError } from '@/lib/api';
import { useResource } from '@/lib/api-hooks';
import { queryClient } from '@/lib/query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface EmployeeIdentity {
  emp_code?: string | number;
  emp_name?: string;
  employee?: string;
}

interface WeeklyLeaveRow {
  id: number;
  title?: string;
  employeeName?: string;
  empId?: number;
}

const OFF_DAYS = [
  { value: 'Sunday', label: 'الأحد' },
  { value: 'Monday', label: 'الإثنين' },
  { value: 'Tuesday', label: 'الثلاثاء' },
  { value: 'Wednesday', label: 'الأربعاء' },
  { value: 'Thursday', label: 'الخميس' },
  { value: 'Friday', label: 'الجمعة' },
  { value: 'Saturday', label: 'السبت' },
];

export function EmployeeWeeklyLeavePage() {
  const { ui } = useLocale();
  const { id } = useParams<{ id: string }>();
  const employeeId = Number(id);
  const { data: employee, isLoading: employeeLoading, isError, refetch } = useResource<EmployeeIdentity>('employees', id, 'identity');
  const { data: current, isLoading: leaveLoading } = useQuery({
    queryKey: ['weekly-leaves', 'employee', employeeId],
    enabled: Number.isInteger(employeeId) && employeeId > 0,
    queryFn: async () => {
      const { data } = await api.get<{ data: WeeklyLeaveRow[] }>('/weekly-leaves', {
        params: { empId: employeeId, page: 1, pageSize: 10 },
      });
      return data.data?.[0] ?? null;
    },
  });
  const [offDay, setOffDay] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOffDay(current?.title ?? '');
  }, [current]);

  const save = async () => {
    if (!id || !offDay) {
      toast.error(ui('يرجى اختيار يوم الإجازة'));
      return;
    }
    setSaving(true);
    try {
      if (current?.id) {
        await api.patch(`/weekly-leaves/${current.id}`, { empId: employeeId, offDay });
      } else {
        await api.post('/weekly-leaves', { empId: employeeId, offDay });
      }
      toast.success(ui('تم حفظ إجازة الموظف'));
      void queryClient.invalidateQueries({ queryKey: ['weekly-leaves'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  if (isError) return <ErrorState onRetry={() => void refetch()} />;
  if (employeeLoading || leaveLoading) return <Skeleton className="h-64 w-full" />;

  const employeeName = employee?.emp_name ?? employee?.employee ?? '—';

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('إضافة / تعديل يوم إجازة الموظف')}
        description={`${employeeName} · ${ui('كود الموظف')}: ${toArabicDigits(employee?.emp_code ?? '—')}`}
        actions={<Button variant="outline" asChild><Link to="/employees"><ArrowRight className="size-4" />{ui('رجوع')}</Link></Button>}
      />

      <Card>
        <CardContent className="mx-auto max-w-2xl space-y-6 pt-6">
          <div className="space-y-2">
            <Label>{ui('اسم الموظف')}</Label>
            <div className="rounded-md border bg-muted px-3 py-2.5 font-medium">{employeeName}</div>
          </div>
          <div className="space-y-2">
            <Label>{ui('اليوم')}</Label>
            <Select value={offDay} onValueChange={setOffDay}>
              <SelectTrigger><SelectValue placeholder={ui('اختر اليوم')} /></SelectTrigger>
              <SelectContent>
                {OFF_DAYS.map((day) => <SelectItem key={day.value} value={day.value}>{ui(day.label)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end border-t pt-6">
            <Button variant="brand" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {ui('حفظ')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
