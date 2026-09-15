import { CalendarCheck, DollarSign, HandCoins, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StatCard } from '@/components/common/stat-card';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { DateRangeFilter, firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { toArabicDigits } from '@/lib/utils';
import type { ClassManagementReports, ClubClassType, ClubTrainerRow } from '@/types/fitness';

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const money = (value: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(value);

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ClassReportsPanel() {
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayLocal);
  const [branch, setBranch] = useState('all');
  const [trainerId, setTrainerId] = useState('all');
  const [classTypeId, setClassTypeId] = useState('all');

  const { data: trainers } = useArrayResource<ClubTrainerRow>('club-trainers');
  const { data: classTypes } = useArrayResource<ClubClassType>('club-class-types');

  const trainerOptions = useMemo(
    () =>
      (trainers ?? [])
        .filter((t) => t.isActive !== false)
        .map((t) => ({ value: String(t.id), label: t.name })),
    [trainers],
  );
  const classTypeOptions = useMemo(
    () =>
      (classTypes ?? [])
        .filter((t) => t.isActive !== false)
        .map((t) => ({ value: String(t.id), label: t.name })),
    [classTypes],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['club-classes', 'management-reports', dateFrom, dateTo, branch, trainerId, classTypeId],
    queryFn: async () =>
      (
        await api.get<ClassManagementReports>('/club-classes/management-reports', {
          params: {
            dateFrom,
            dateTo,
            branchId: normalizeBranchParam(branch),
            trainerId: trainerId !== 'all' ? trainerId : undefined,
            classTypeId: classTypeId !== 'all' ? classTypeId : undefined,
          },
        })
      ).data,
  });
  const totalCommissions = (data?.trainers ?? []).reduce((sum, trainer) => sum + trainer.commissionValue, 0);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-3 p-4">
          <DateRangeFilter
            startDate={dateFrom}
            endDate={dateTo}
            onStartChange={setDateFrom}
            onEndChange={setDateTo}
            extra={<BranchFilter value={branch} onChange={setBranch} />}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>المدرب</Label>
              <select className={selectCls} value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
                <option value="all">كل المدربين</option>
                {trainerOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>نوع الحصة</Label>
              <select className={selectCls} value={classTypeId} onChange={(e) => setClassTypeId(e.target.value)}>
                <option value="all">كل الحصص</option>
                {classTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="إجمالي الجلسات" value={data?.summary.sessions ?? 0} icon={<CalendarCheck className="size-5" />} loading={isLoading} />
        <StatCard title="إجمالي الحضور" value={data?.summary.attendance ?? 0} icon={<Users className="size-5" />} colorIndex={3} loading={isLoading} />
        <StatCard title="إجمالي التسجيلات" value={data?.summary.demand ?? 0} icon={<Users className="size-5" />} colorIndex={5} loading={isLoading} />
        <StatCard title="إيرادات الحصص" value={`${money(data?.summary.revenue ?? 0)} ج.م`} icon={<DollarSign className="size-5" />} colorIndex={4} loading={isLoading} />
        <StatCard title="مستحقات المدربين" value={`${money(totalCommissions)} ج.م`} icon={<HandCoins className="size-5" />} colorIndex={2} loading={isLoading} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">تقرير أنواع الحصص والإيرادات</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-y bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-3 text-start">الحصة</th><th className="px-4 py-3 text-start">الجلسات</th><th className="px-4 py-3 text-start">الحضور</th><th className="px-4 py-3 text-start">المتوسط</th><th className="px-4 py-3 text-start">أنشط يوم</th><th className="px-4 py-3 text-start">الأكثر تقديمًا</th><th className="px-4 py-3 text-start">التسجيلات</th><th className="px-4 py-3 text-start">الإيراد</th></tr></thead>
            <tbody className="divide-y">{(data?.classTypes ?? []).map((row) => <tr key={`${row.classTypeId ?? 'legacy'}-${row.name}`}><td className="px-4 py-3"><span className="me-2 inline-block size-2.5 rounded-full" style={{ backgroundColor: row.color }} />{row.name}</td><td className="nums px-4 py-3">{toArabicDigits(row.sessions)}</td><td className="nums px-4 py-3">{toArabicDigits(row.totalAttendance)}</td><td className="nums px-4 py-3">{toArabicDigits(row.averageAttendance.toFixed(1))}</td><td className="px-4 py-3">{row.busiestWeekday == null ? '—' : WEEKDAYS[row.busiestWeekday]}</td><td className="px-4 py-3">{row.topTrainer?.name ?? '—'}</td><td className="nums px-4 py-3">{toArabicDigits(row.demand)}</td><td className="nums px-4 py-3 font-medium">{money(row.revenue)} ج.م</td></tr>)}</tbody>
          </table>
          {!data?.classTypes.length ? <p className="py-8 text-center text-sm text-muted-foreground">لا توجد بيانات في الفترة الحالية.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">تسجيلات المدربين والنِّسب</CardTitle>
          <p className="text-sm text-muted-foreground">مستحق الكابتن = إيراد الحضور الفعلي × النسبة المسجلة له.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="border-y bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-3 text-start">الكابتن</th><th className="px-4 py-3 text-start">النوع</th><th className="px-4 py-3 text-start">الحصص</th><th className="px-4 py-3 text-start">التسجيلات</th><th className="px-4 py-3 text-start">الحضور الفعلي</th><th className="px-4 py-3 text-start">عدم حضور</th><th className="px-4 py-3 text-start">إيراد الحضور</th><th className="px-4 py-3 text-start">نسبة الكابتن</th><th className="px-4 py-3 text-start">المستحق</th></tr></thead>
            <tbody className="divide-y">{(data?.trainers ?? []).map((row) => <tr key={row.trainerId} className="hover:bg-muted/20"><td className="px-4 py-3 font-medium">{row.name}</td><td className="px-4 py-3"><span className={row.isExternal ? 'rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground'}>{row.isExternal ? 'كابتن خارجي' : 'من الجيم'}</span></td><td className="nums px-4 py-3">{toArabicDigits(row.sessions)}</td><td className="nums px-4 py-3 font-medium">{toArabicDigits(row.totalTrainees)}</td><td className="nums px-4 py-3">{toArabicDigits(row.attendedRegistrations)}</td><td className="nums px-4 py-3">{toArabicDigits(row.noShows)}</td><td className="nums px-4 py-3">{money(row.revenue)} ج.م</td><td className="nums px-4 py-3">{toArabicDigits(row.commissionPercentage)}%</td><td className="nums px-4 py-3 font-bold text-primary">{money(row.commissionValue)} ج.م</td></tr>)}</tbody>
          </table>
          {!data?.trainers.length ? <p className="py-8 text-center text-sm text-muted-foreground">لا توجد تسجيلات لمدربين في الفترة المحددة.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
