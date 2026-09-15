import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  Contact,
  LogOut,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ClubStatCard } from '@/components/club/stat-card';
import { LOGO_SRC } from '@/components/brand/logo';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { TrainerScheduleCalendar, type TrainerScheduleItem } from '@/components/trainer/trainer-schedule-calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import { localDateStr } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useAuth } from '@/store/auth';

interface TrainerPortalData {
  trainer: { id: number; name: string; specialization: string | null; imageUrl: string | null };
  statistics: {
    scheduledClasses: number;
    completedClasses: number;
    totalTrainees: number;
    totalAttendance: number;
    averageAttendance: number;
    adherenceRate: number;
    totalEarnings: number;
    privateSessions?: number;
    privateClients?: number;
  };
  attendance: Array<{
    classId: number;
    className: string;
    classDate: string;
    attended: number;
    absent: number;
    registered: number;
    attendanceRate: number;
  }>;
  privateClients?: Array<{
    subscriptionId: number; subscriptionNumber: string; memberName: string; memberCode: string | null; memberPhone: string | null;
    packageName: string; startDate: string; endDate: string; isLinkedToSessions: boolean; sessionsCount: number | null; sessionsUsed: number; sessionsRemaining: number | null; isActive: boolean;
  }>;
  earnings: {
    total: number;
    paid: number;
    remaining: number;
    items: Array<{
      classId: number;
      className: string;
      classDate: string;
      attended: number;
      unitPrice: number;
      commissionPercentage: number;
      revenue: number;
      amount: number;
    }>;
    privateItems: Array<{ id: number; subscriptionType: string | null; attendanceDate: string; sequence: number; commissionPercentage: number; amount: number }>;
    payments: Array<{ id: number; amount: number; paymentDate: string; notes: string | null }>;
  };
}

const money = (value: number) => `${toArabicDigits(value.toFixed(2))} ج.م`;

export function TrainerPortalPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(() => {
    const today = new Date();
    return localDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
  });
  const [dateTo, setDateTo] = useState(() => {
    return localDateStr(new Date());
  });
  const [calendarDateFrom, setCalendarDateFrom] = useState(() => {
    const today = new Date();
    return localDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
  });
  const [calendarDateTo, setCalendarDateTo] = useState(() => {
    const today = new Date();
    return localDateStr(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  });
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['trainer-portal', dateFrom, dateTo],
    queryFn: async () =>
      (await api.get<TrainerPortalData>('/trainer-portal/dashboard', { params: { dateFrom, dateTo } })).data,
    enabled: !!user?.is_trainer,
  });
  const {
    data: calendarSchedule,
    isLoading: isCalendarLoading,
    isError: isCalendarError,
    error: calendarError,
    refetch: refetchCalendar,
  } = useQuery({
    queryKey: ['trainer-portal-schedule', calendarDateFrom, calendarDateTo],
    queryFn: async () =>
      (await api.get<TrainerScheduleItem[]>('/trainer-portal/schedule', {
        params: { dateFrom: calendarDateFrom, dateTo: calendarDateTo },
      })).data,
    enabled: !!user?.is_trainer,
  });

  if (!user?.is_trainer) return <Navigate to="/" replace />;

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <img src={LOGO_SRC} alt="Noamany Fitness Center" className="h-16 w-auto max-w-[14rem] object-contain drop-shadow-[0_8px_20px_rgba(237,28,36,0.3)]" />
          <div className="min-w-0">
            <p className="font-bold">بوابة المدرب</p>
            <p className="truncate text-xs text-muted-foreground">{data?.trainer.name ?? user.name}</p>
          </div>
          <Button variant="outline" className="ms-auto" onClick={() => void signOut()}>
            <LogOut className="size-4" /> تسجيل الخروج
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <section className="overflow-hidden rounded-2xl border bg-gradient-to-l from-primary/15 via-card to-card p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-end gap-4">
            <div className="me-auto">
              <p className="text-sm text-muted-foreground">مرحبًا بك</p>
              <h1 className="mt-1 text-2xl font-bold">{data?.trainer.name ?? user.name}</h1>
              {data?.trainer.specialization ? <p className="mt-1 text-sm text-muted-foreground">{data.trainer.specialization}</p> : null}
            </div>
            <div className="grid gap-2">
              <Label>من</Label>
              <Input type="date" className="nums" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>إلى</Label>
              <Input type="date" className="nums" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
            <Button variant="brand" onClick={() => void refetch()}>تحديث</Button>
          </div>
        </section>

        {isLoading ? <PageSkeleton /> : null}
        {isError ? (
          <Card className="border-destructive/30"><CardContent className="flex flex-wrap items-center gap-3 p-5"><p className="text-sm text-destructive">{apiError(error)}</p><Button variant="outline" onClick={() => void refetch()}>إعادة المحاولة</Button></CardContent></Card>
        ) : null}

        {data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <ClubStatCard label="الحصص المجدولة" value={data.statistics.scheduledClasses} icon={CalendarDays} />
              <ClubStatCard label="الحصص المنفذة" value={data.statistics.completedClasses} icon={CheckCircle2} />
              <ClubStatCard label="إجمالي المتدربين" value={data.statistics.totalTrainees} icon={Users} />
              <ClubStatCard label="متوسط الحضور" value={data.statistics.averageAttendance.toFixed(1)} icon={UserCheck} />
              <ClubStatCard label="نسبة الالتزام" value={data.statistics.adherenceRate.toFixed(0)} suffix="%" icon={TrendingUp} />
              <ClubStatCard label="إجمالي المستحقات" value={money(data.statistics.totalEarnings)} icon={Wallet} />
              <ClubStatCard label="جلسات برايفت" value={data.statistics.privateSessions ?? 0} icon={Contact} />
            </div>

            <Tabs defaultValue="clients">
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger value="clients"><Contact className="me-2 size-4" /> مشتركين البرايفت</TabsTrigger>
                <TabsTrigger value="schedule"><CalendarDays className="me-2 size-4" /> التقويم والحصص</TabsTrigger>
                <TabsTrigger value="attendance"><UserCheck className="me-2 size-4" /> الحضور</TabsTrigger>
                <TabsTrigger value="private"><Contact className="me-2 size-4" /> جلسات وعمولات Private</TabsTrigger>
                <TabsTrigger value="earnings"><Wallet className="me-2 size-4" /> المستحقات</TabsTrigger>
              </TabsList>

              <TabsContent value="clients">
                <Card><CardHeader><CardTitle>المشتركين معك برايفت</CardTitle><p className="text-sm text-muted-foreground">الأعضاء والباقة والحصص المتبقية فقط؛ قيمة الاشتراك ومديونيته لا تظهر في بوابة المدرب.</p></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[700px] text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-start">العضو</th><th className="p-3 text-start">الباقة</th><th className="p-3 text-start">المدة</th><th className="p-3 text-center">الحصص</th><th className="p-3 text-center">الحالة</th></tr></thead><tbody>{(data.privateClients ?? []).map((row) => <tr key={row.subscriptionId} className="border-t"><td className="p-3 font-medium">{row.memberName}<p className="text-xs font-normal text-muted-foreground nums">{row.memberCode ?? '—'}{row.memberPhone ? ` · ${row.memberPhone}` : ''}</p></td><td className="p-3">{row.packageName}</td><td className="p-3 nums">{toArabicDigits(row.startDate)} — {toArabicDigits(row.endDate)}</td><td className="p-3 text-center nums">{row.isLinkedToSessions ? `${toArabicDigits(row.sessionsRemaining ?? 0)} / ${toArabicDigits(row.sessionsCount ?? 0)}` : 'بالمدة'}</td><td className="p-3 text-center">{row.isActive ? 'نشط' : 'منتهي'}</td></tr>)}</tbody></table>{!(data.privateClients ?? []).length ? <p className="py-10 text-center text-sm text-muted-foreground">لا يوجد مشتركين برايفت معك.</p> : null}</CardContent></Card>
              </TabsContent>

              <TabsContent value="schedule" className="pt-2">
                {isCalendarLoading ? <PageSkeleton /> : null}
                {isCalendarError ? (
                  <Card className="border-destructive/30">
                    <CardContent className="flex flex-wrap items-center gap-3 p-5">
                      <p className="text-sm text-destructive">{apiError(calendarError)}</p>
                      <Button variant="outline" onClick={() => void refetchCalendar()}>إعادة المحاولة</Button>
                    </CardContent>
                  </Card>
                ) : null}
                {calendarSchedule ? (
                  <TrainerScheduleCalendar
                    schedule={calendarSchedule}
                    dateFrom={calendarDateFrom}
                    dateTo={calendarDateTo}
                    onRangeChange={(nextFrom, nextTo) => {
                      setCalendarDateFrom(nextFrom);
                      setCalendarDateTo(nextTo);
                    }}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="attendance">
                <Card><CardContent className="overflow-x-auto p-0"><table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-start">الحصة</th><th className="p-3 text-start">التاريخ</th><th className="p-3 text-start">الحضور</th><th className="p-3 text-start">الغياب</th><th className="p-3 text-start">النسبة</th></tr></thead><tbody>{data.attendance.map((row) => <tr key={row.classId} className="border-t"><td className="p-3 font-medium">{row.className}</td><td className="p-3 nums">{toArabicDigits(row.classDate)}</td><td className="p-3 nums">{toArabicDigits(row.attended)}</td><td className="p-3 nums">{toArabicDigits(row.absent)}</td><td className="p-3 nums">{toArabicDigits(row.attendanceRate.toFixed(0))}%</td></tr>)}</tbody></table>{!data.attendance.length ? <p className="py-10 text-center text-sm text-muted-foreground">لا توجد بيانات حضور.</p> : null}</CardContent></Card>
              </TabsContent>

              <TabsContent value="earnings" className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3"><ClubStatCard label="إجمالي المستحقات" value={money(data.earnings.total)} /><ClubStatCard label="تم صرفه" value={money(data.earnings.paid)} /><ClubStatCard label="المتبقي المستحق" value={money(data.earnings.remaining)} /></div>
                <Card>
                  <CardHeader>
                    <CardTitle>تفاصيل احتساب المستحقات</CardTitle>
                    <p className="text-sm text-muted-foreground">تُحتسب العمولة من الحضور الفعلي: عدد الحضور × سعر الحصة × نسبة عمولة المدرب.</p>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-3 text-start">الحصة</th>
                          <th className="p-3 text-start">التاريخ</th>
                          <th className="p-3 text-start">الحضور</th>
                          <th className="p-3 text-start">سعر الحصة</th>
                          <th className="p-3 text-start">إجمالي الحضور</th>
                          <th className="p-3 text-start">العمولة</th>
                          <th className="p-3 text-start">المستحق</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.earnings.items.map((row) => (
                          <tr key={row.classId} className="border-t">
                            <td className="p-3 font-medium">{row.className}</td>
                            <td className="p-3 nums">{toArabicDigits(row.classDate)}</td>
                            <td className="p-3 nums">{toArabicDigits(row.attended)}</td>
                            <td className="p-3 nums">{money(row.unitPrice)}</td>
                            <td className="p-3 nums">{money(row.revenue)}</td>
                            <td className="p-3 nums">{toArabicDigits(row.commissionPercentage.toFixed(2))}%</td>
                            <td className="p-3 font-bold text-primary nums">{money(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!data.earnings.items.length ? <p className="py-10 text-center text-sm text-muted-foreground">لا توجد حصص منفذة أو حضور مسجل في الفترة.</p> : null}
                  </CardContent>
                </Card>
                <Card><CardHeader><CardTitle>سجل المبالغ المصروفة</CardTitle></CardHeader><CardContent className="space-y-2">{data.earnings.payments.map((row) => <div key={row.id} className="flex items-center gap-3 rounded-xl border p-3"><Wallet className="size-4 text-primary" /><div><b className="nums">{money(row.amount)}</b><p className="text-xs text-muted-foreground nums">{toArabicDigits(row.paymentDate)}</p></div>{row.notes ? <span className="ms-auto text-sm text-muted-foreground">{row.notes}</span> : null}</div>)}{!data.earnings.payments.length ? <p className="py-8 text-center text-sm text-muted-foreground">لم يتم تسجيل مبالغ مصروفة في الفترة.</p> : null}</CardContent></Card>
              </TabsContent>

              <TabsContent value="private">
                <Card><CardHeader><CardTitle>جلسات وعمولات Private</CardTitle><p className="text-sm text-muted-foreground">تظهر الجلسات التي سجّلها الاستقبال فقط، والعمولة المحفوظة وقت الحضور.</p></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[640px] text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-start">الباقة</th><th className="p-3 text-start">التاريخ</th><th className="p-3 text-center">رقم الجلسة</th><th className="p-3 text-center">النسبة</th><th className="p-3 text-start">المستحق</th></tr></thead><tbody>{data.earnings.privateItems.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{row.subscriptionType ?? 'Private'}</td><td className="p-3 nums">{toArabicDigits(row.attendanceDate)}</td><td className="p-3 text-center nums">{toArabicDigits(row.sequence)}</td><td className="p-3 text-center nums">{toArabicDigits(row.commissionPercentage.toFixed(2))}%</td><td className="p-3 font-bold nums">{money(row.amount)}</td></tr>)}</tbody></table>{!data.earnings.privateItems.length ? <p className="py-10 text-center text-sm text-muted-foreground">لا توجد جلسات برايفت في الفترة المحددة.</p> : null}</CardContent></Card>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </main>
    </div>
  );
}
