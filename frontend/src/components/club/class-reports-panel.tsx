import { formatDisplayNumber } from '@/lib/number-display';
import { formatMoneyNumber } from '@/lib/formatters';
import { CalendarCheck, DollarSign, Eye, HandCoins, Users } from 'lucide-react';
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
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/common/states';
import { Skeleton } from '@/components/ui/skeleton';

const WEEKDAYS = [uiStatic('الأحد'), uiStatic('الاثنين'), uiStatic('الثلاثاء'), uiStatic('الأربعاء'), uiStatic('الخميس'), uiStatic('الجمعة'), uiStatic('السبت')];
const money = (value: number) => formatMoneyNumber(value);

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ClassReportsPanel() {
  const { ui } = useLocale();
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(todayLocal);
  const [branch, setBranch] = useState('all');
  const [trainerId, setTrainerId] = useState('all');
  const [classTypeId, setClassTypeId] = useState('all');
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

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

  const { data, isLoading, isError, refetch } = useQuery({
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
  const selectedSession = data?.sessionHistory?.find((row) => row.id === selectedSessionId);

  if (isError) return <ErrorState onRetry={() => void refetch()} />;

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
              <Label htmlFor="class-report-trainer">{ui('المدرب')}</Label>
              <Combobox id="class-report-trainer" value={trainerId} onValueChange={(value) => { setTrainerId(value); setSelectedSessionId(null); }} options={[{ value: 'all', label: ui('كل المدربين') }, ...trainerOptions]} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="class-report-type">{ui('نوع الحصة')}</Label>
              <Combobox id="class-report-type" value={classTypeId} onValueChange={(value) => { setClassTypeId(value); setSelectedSessionId(null); }} options={[{ value: 'all', label: ui('كل الحصص') }, ...classTypeOptions]} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title={ui('إجمالي الجلسات')} value={data?.summary.sessions ?? 0} icon={<CalendarCheck className="size-5" />} loading={isLoading} />
        <StatCard title={ui('إجمالي الحضور')} value={data?.summary.attendance ?? 0} icon={<Users className="size-5" />} colorIndex={3} loading={isLoading} />
        <StatCard title={ui('إجمالي التسجيلات')} value={data?.summary.demand ?? 0} icon={<Users className="size-5" />} colorIndex={5} loading={isLoading} />
        <StatCard title={ui('إيرادات الحصص')} value={`${money(data?.summary.revenue ?? 0)} EGP`} icon={<DollarSign className="size-5" />} colorIndex={4} loading={isLoading} />
        <StatCard title={ui('مستحقات المدربين')} value={`${money(totalCommissions)} EGP`} icon={<HandCoins className="size-5" />} colorIndex={2} loading={isLoading} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{ui('سجل حصص المدرب حسب اليوم')}</CardTitle><p className="text-sm text-muted-foreground">{ui('الإيراد هنا هو قيمة الحصص المستهلكة من الباقات، وليس تحصيل قيمة الاشتراك مرة أخرى.')}</p></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-sm">
            <caption className="sr-only">{ui('سجل الحصص والإيراد والمستحق حسب التاريخ')}</caption>
            <thead className="border-y bg-muted/40 text-muted-foreground"><tr>{['التاريخ', 'الحصة', 'الكابتن', 'من', 'إلى', 'الحاضرين', 'قيمة الحضور', 'مستحق الكابتن', 'التفاصيل'].map((label) => <th key={label} scope="col" className="px-4 py-3 text-start">{ui(label)}</th>)}</tr></thead>
            <tbody className="divide-y">
              {isLoading ? <tr><td colSpan={9} className="p-4"><Skeleton className="h-12 w-full" /></td></tr> : (data?.sessionHistory ?? []).map((row) => <tr key={row.id} className="hover:bg-muted/20">
                <td className="nums whitespace-nowrap px-4 py-3">{row.classDate}</td><td className="px-4 py-3">{row.className}</td><td className="px-4 py-3">{row.trainerName}</td>
                <td className="nums px-4 py-3">{row.startTime}</td><td className="nums px-4 py-3">{row.endTime}</td><td className="nums px-4 py-3">{toArabicDigits(row.attendance)}</td>
                <td className="nums px-4 py-3">{money(row.revenue)} EGP{row.unresolvedValues > 0 && <span className="block text-xs text-amber-700 dark:text-amber-300">{ui('غير مكتمل')}</span>}</td>
                <td className="nums px-4 py-3 font-semibold">{money(row.commission)} EGP</td>
                <td className="px-4 py-3"><Button permissionAction={null} variant="ghost" size="icon" className="size-11" aria-label={`${ui('تفاصيل الحصة')} ${row.className} ${row.classDate}`} onClick={() => setSelectedSessionId(row.id)}><Eye className="size-5" /></Button></td>
              </tr>)}
              {!isLoading && !data?.sessionHistory?.length && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{ui('لا توجد حصص لهذا المدرب في الفترة المحددة.')}</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Dialog open={selectedSessionId != null} onOpenChange={(open) => { if (!open) setSelectedSessionId(null); }}>
        <DialogContent size="form" aria-describedby="class-report-detail-description">
          <DialogHeader><DialogTitle>{selectedSession?.className} — {selectedSession?.classDate}</DialogTitle></DialogHeader>
          <p id="class-report-detail-description" className="text-sm text-muted-foreground">{selectedSession?.trainerName} · {ui('قيمة الحصة = صافي قيمة الباقة بعد الخصم ÷ عدد حصصها. المستحق = قيمة حضور كل عضو × النسبة المحفوظة لحضوره.')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard title={ui('قيمة حضور الحصة')} value={`${money(selectedSession?.revenue ?? 0)} EGP`} />
            <StatCard title={ui('مستحق الكابتن')} value={`${money(selectedSession?.commission ?? 0)} EGP`} />
            <StatCard title={ui('الحاضرين')} value={selectedSession?.attendance ?? 0} />
          </div>
          {!!selectedSession?.unresolvedValues && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{ui('في حضور قديم بدون باقة محددة أو عدد حصص. لم نفترض له قيمة؛ الإجمالي غير مكتمل لحين المراجعة.')}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-sm">
              <caption className="sr-only">{ui('الحاضرين وحساب نصيب المدرب لكل حضور')}</caption>
              <thead className="border-b bg-muted/40"><tr>{['العضو', 'الاشتراك', 'صافي الباقة', 'حصص الباقة', 'قيمة الحصة', 'النسبة', 'المستحق'].map((label) => <th key={label} scope="col" className="px-3 py-3 text-start">{ui(label)}</th>)}</tr></thead>
              <tbody className="divide-y">{selectedSession?.attendees.map((row) => <tr key={row.enrollmentId}>
                <td className="px-3 py-3">{row.memberName}</td><td className="px-3 py-3">{row.subscriptionType ?? '—'}<span className="nums block text-xs text-muted-foreground">{row.subscriptionNumber}</span></td>
                <td className="nums px-3 py-3">{row.packageValue == null ? '—' : money(row.packageValue)}</td><td className="nums px-3 py-3">{row.packageSessions ?? '—'}</td>
                <td className="nums px-3 py-3">{row.sessionValue == null ? ui('يلزم مراجعة') : money(row.sessionValue)}{row.historicalEstimate && row.sessionValue != null && <span className="block text-xs text-muted-foreground">{ui('محسوبة من بيانات الباقة الحالية')}</span>}</td>
                <td className="nums px-3 py-3">{formatDisplayNumber(row.percentage)}%</td><td className="nums px-3 py-3">{row.commission == null ? '—' : money(row.commission)}</td>
              </tr>)}{!selectedSession?.attendees.length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{ui('لا يوجد حضور مسجل لهذه الحصة.')}</td></tr>}</tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle className="text-base">{ui('تقرير أنواع الحصص والإيرادات')}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-y bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-3 text-start">{ui('الحصة')}</th><th className="px-4 py-3 text-start">{ui('الجلسات')}</th><th className="px-4 py-3 text-start">{ui('الحضور')}</th><th className="px-4 py-3 text-start">{ui('المتوسط')}</th><th className="px-4 py-3 text-start">{ui('أنشط يوم')}</th><th className="px-4 py-3 text-start">{ui('الأكثر تقديمًا')}</th><th className="px-4 py-3 text-start">{ui('التسجيلات')}</th><th className="px-4 py-3 text-start">{ui('الإيراد')}</th></tr></thead>
            <tbody className="divide-y">{(data?.classTypes ?? []).map((row) => <tr key={`${row.classTypeId ?? 'legacy'}-${row.name}`}><td className="px-4 py-3"><span className="me-2 inline-block size-2.5 rounded-full" style={{ backgroundColor: row.color }} />{row.name}</td><td className="nums px-4 py-3">{toArabicDigits(row.sessions)}</td><td className="nums px-4 py-3">{toArabicDigits(row.totalAttendance)}</td><td className="nums px-4 py-3">{toArabicDigits(row.averageAttendance.toFixed(1))}</td><td className="px-4 py-3">{row.busiestWeekday == null ? '—' : WEEKDAYS[row.busiestWeekday]}</td><td className="px-4 py-3">{row.topTrainer?.name ?? '—'}</td><td className="nums px-4 py-3">{toArabicDigits(row.demand)}</td><td className="nums px-4 py-3 font-medium">{money(row.revenue)} EGP</td></tr>)}</tbody>
          </table>
          {!data?.classTypes.length ? <p className="py-8 text-center text-sm text-muted-foreground">{ui('لا توجد بيانات في الفترة الحالية.')}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ui('تسجيلات المدربين والنِّسب')}</CardTitle>
          <p className="text-sm text-muted-foreground">{ui('مستحق الكابتن = إيراد الحضور الفعلي × النسبة المسجلة له.')}</p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="border-y bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-3 text-start">{ui('الكابتن')}</th><th className="px-4 py-3 text-start">{ui('النوع')}</th><th className="px-4 py-3 text-start">{ui('الحصص')}</th><th className="px-4 py-3 text-start">{ui('التسجيلات')}</th><th className="px-4 py-3 text-start">{ui('الحضور الفعلي')}</th><th className="px-4 py-3 text-start">{ui('عدم حضور')}</th><th className="px-4 py-3 text-start">{ui('إيراد الحضور')}</th><th className="px-4 py-3 text-start">{ui('نسبة الكابتن')}</th><th className="px-4 py-3 text-start">{ui('المستحق')}</th></tr></thead>
            <tbody className="divide-y">{(data?.trainers ?? []).map((row) => <tr key={row.trainerId} className="hover:bg-muted/20"><td className="px-4 py-3 font-medium">{row.name}</td><td className="px-4 py-3"><span className={row.isExternal ? 'rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground'}>{row.isExternal ? ui('كابتن خارجي') : ui('من الجيم')}</span></td><td className="nums px-4 py-3">{toArabicDigits(row.sessions)}</td><td className="nums px-4 py-3 font-medium">{toArabicDigits(row.totalTrainees)}</td><td className="nums px-4 py-3">{toArabicDigits(row.attendedRegistrations)}</td><td className="nums px-4 py-3">{toArabicDigits(row.noShows)}</td><td className="nums px-4 py-3">{money(row.revenue)} EGP</td><td className="nums px-4 py-3">{toArabicDigits(row.commissionPercentage)}%</td><td className="nums px-4 py-3 font-bold text-primary">{money(row.commissionValue)} EGP</td></tr>)}</tbody>
          </table>
          {!data?.trainers.length ? <p className="py-8 text-center text-sm text-muted-foreground">{ui('لا توجد تسجيلات لمدربين في الفترة المحددة.')}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
