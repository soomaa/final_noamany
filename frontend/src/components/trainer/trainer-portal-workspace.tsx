import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  PersonStanding,
  ReceiptText,
  Users,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState } from '@/components/common/states';
import { TrainerScheduleCalendar } from '@/components/trainer/trainer-schedule-calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import { formatDate, formatMoney, formatNum, localToday } from '@/lib/formatters';
import {
  monthRange,
  resolveTrainerPortalSection,
  shiftPortalMonth,
  type TrainerPortalDashboard,
  type TrainerPortalSection,
  type TrainerScheduleItem,
  type TrainerPrivateClient,
  canPrivateCheckIn,
  sortPrivateClients,
} from '@/pages/trainer/trainer-portal-model';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const sectionLabels: Record<TrainerPortalSection, string> = {
  calendar: uiStatic('التقويم والحصص'),
  attendance: uiStatic('الحضور'),
  earnings: uiStatic('المستحقات'),
  private: 'Private Sessions',
};

export function TrainerPortalWorkspace() {
  const { locale, ui } = useLocale();
  const [monthAnchor, setMonthAnchor] = useState(localToday());
  const [section, setSection] = useState<TrainerPortalSection>('calendar');
  const [checkingIn, setCheckingIn] = useState<number | null>(null);
  const range = useMemo(() => monthRange(monthAnchor), [monthAnchor]);
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ar-EG-u-nu-latn', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${range.dateFrom}T12:00:00`)),
    [locale, range.dateFrom],
  );

  const portal = useQuery({
    queryKey: ['trainer-portal-workspace', range.dateFrom, range.dateTo],
    queryFn: async () => {
      const [dashboard, schedule, privateClients] = await Promise.all([
        api.get<TrainerPortalDashboard>('/trainer-portal/dashboard', { params: range }),
        api.get<TrainerScheduleItem[]>('/trainer-portal/schedule', { params: range }),
        api.get<TrainerPrivateClient[]>('/trainer-portal/private-clients'),
      ]);
      return { dashboard: dashboard.data, schedule: schedule.data, privateClients: privateClients.data };
    },
    retry: false,
  });

  const goToMonth = (offset: number) => setMonthAnchor((current) => shiftPortalMonth(current, offset));
  const checkIn = async (client: TrainerPrivateClient) => {
    setCheckingIn(client.id);
    try {
      await api.post(`/trainer-portal/private-clients/${client.id}/check-in`);
      await portal.refetch();
      toast.success(ui('تم تسجيل حضور العميل'));
    } catch (error) { toast.error(apiError(error)); } finally { setCheckingIn(null); }
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={ui('بوابة المدرب')}
        description={ui('جدولك، حضور المتدربين، الحصص الخاصة ومستحقاتك في مكان واحد.')}
        actions={(
          <div className="flex items-center rounded-xl border bg-card p-1 shadow-sm" aria-label={ui('اختيار الشهر')}>
            <Button variant="ghost" size="icon" onClick={() => goToMonth(-1)} aria-label={ui('الشهر السابق')}>
              <ChevronRight className="size-4" />
            </Button>
            <div className="min-w-36 px-3 text-center text-sm font-bold nums tabular-nums">{monthLabel}</div>
            <Button variant="ghost" size="icon" onClick={() => goToMonth(1)} aria-label={ui('الشهر التالي')}>
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        )}
      />

      {portal.isLoading ? <TrainerPortalLoading /> : null}
      {portal.isError ? <ErrorState onRetry={() => void portal.refetch()} /> : null}
      {portal.data ? (
        <TrainerPortalContent
          data={portal.data.dashboard}
          schedule={portal.data.schedule}
          privateClients={portal.data.privateClients}
          range={range}
          section={section}
          onSectionChange={setSection}
          onMonthChange={setMonthAnchor}
          onPrivateCheckIn={checkIn}
          checkingIn={checkingIn}
        />
      ) : null}
    </div>
  );
}

function TrainerPortalLoading() {
  const { ui } = useLocale();
  return (
    <div className="space-y-5" aria-label={ui('جاري تحميل بوابة المدرب')}>
      <Skeleton className="h-44 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}

function TrainerPortalContent({
  data,
  schedule,
  privateClients,
  range,
  section,
  onSectionChange,
  onMonthChange,
  onPrivateCheckIn,
  checkingIn,
}: {
  data: TrainerPortalDashboard;
  schedule: TrainerScheduleItem[];
  privateClients: TrainerPrivateClient[];
  range: { dateFrom: string; dateTo: string };
  section: TrainerPortalSection;
  onSectionChange: (section: TrainerPortalSection) => void;
  onMonthChange: (anchor: string) => void;
  onPrivateCheckIn: (client: TrainerPrivateClient) => void;
  checkingIn: number | null;
}) {
  const { ui } = useLocale();
  const metrics = [
    { label: ui('الحصص المجدولة'), value: data.statistics.scheduledClasses, icon: CalendarDays },
    { label: ui('الحصص المكتملة'), value: data.statistics.completedClasses, icon: CheckCircle2 },
    { label: ui('إجمالي المتدربين'), value: data.statistics.totalTrainees, icon: Users },
    { label: ui('مرات الحضور'), value: data.statistics.totalAttendance, icon: Dumbbell },
    { label: ui('جلسات Private'), value: data.statistics.privateSessions, icon: PersonStanding },
  ];

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(125deg,#050505_0%,#17130a_62%,#5f4700_100%)] px-5 py-6 text-white shadow-[0_18px_45px_-28px_rgba(0,0,0,0.8)] sm:px-7 sm:py-7">
        <div className="absolute inset-x-0 top-0 h-px bg-primary/80" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/15">
              <Dumbbell className="size-7" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white/70">{ui('مرحبًا بك')}</p>
              <h2 className="mt-1 truncate text-2xl font-bold tracking-tight">{data.trainer.name}</h2>
              <p className="mt-1 truncate text-sm text-white/70">{data.trainer.specialization || ui('مدرب لياقة بدنية')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
            <MoneyReadout label={ui('إجمالي المستحق')} value={data.earnings.total} />
            <MoneyReadout label={ui('تم صرفه')} value={data.earnings.paid} />
            <MoneyReadout label={ui('المتبقي')} value={data.earnings.remaining} accent />
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="overflow-hidden">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground dark:text-white/80">{label}</p>
                <p className="mt-2 text-3xl font-bold nums tabular-nums">{formatNum(value)}</p>
              </div>
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
                <Icon className="size-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs
        value={section}
        onValueChange={(value) => onSectionChange(resolveTrainerPortalSection(value))}
        className="space-y-4"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl p-1 sm:grid-cols-4">
          {(Object.keys(sectionLabels) as TrainerPortalSection[]).map((value) => (
            <TabsTrigger key={value} value={value} className="min-h-10 whitespace-normal px-3 py-2 text-center">
              {ui(sectionLabels[value])}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="calendar" className="mt-0">
          <TrainerScheduleCalendar
            schedule={schedule}
            dateFrom={range.dateFrom}
            dateTo={range.dateTo}
            onRangeChange={(dateFrom) => onMonthChange(dateFrom)}
          />
        </TabsContent>

        <TabsContent value="attendance" className="mt-0">
          <AttendancePanel rows={data.attendance} />
        </TabsContent>

        <TabsContent value="earnings" className="mt-0 space-y-5">
          <EarningsPanel earnings={data.earnings} />
        </TabsContent>

        <TabsContent value="private" className="mt-0">
          <PrivateSessionsPanel items={data.earnings.privateItems} clients={privateClients} onCheckIn={onPrivateCheckIn} checkingIn={checkingIn} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function AttendancePanel({ rows }: { rows: TrainerPortalDashboard['attendance'] }) {
  const { ui } = useLocale();
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-lg"><Users className="size-5 text-primary" />{ui('حضور المتدربين')}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!rows.length ? <EmptyState compact title={ui('لا توجد سجلات حضور في هذا الشهر')} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/55 text-muted-foreground dark:text-white/80">
                <tr><th className="px-5 py-3 text-start">{ui('الحصة')}</th><th className="px-5 py-3 text-start">{ui('التاريخ')}</th><th className="px-5 py-3 text-center">{ui('مسجل')}</th><th className="px-5 py-3 text-center">{ui('حضر')}</th><th className="px-5 py-3 text-center">{ui('غاب')}</th><th className="px-5 py-3 text-center">{ui('نسبة الحضور')}</th></tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.classId} className="hover:bg-muted/35">
                    <td className="px-5 py-4 font-semibold">{row.className}</td><td className="px-5 py-4 nums text-muted-foreground">{formatDate(row.classDate)}</td><td className="px-5 py-4 text-center nums">{formatNum(row.registered)}</td><td className="px-5 py-4 text-center nums text-success">{formatNum(row.attended)}</td><td className="px-5 py-4 text-center nums text-destructive">{formatNum(row.absent)}</td><td className="px-5 py-4 text-center font-bold nums">{formatNum(Math.round(row.attendanceRate))}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EarningsPanel({ earnings }: { earnings: TrainerPortalDashboard['earnings'] }) {
  const { ui } = useLocale();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <EarningSummary label={ui('إجمالي المستحق')} value={earnings.total} icon={Wallet} />
        <EarningSummary label={ui('تم صرفه')} value={earnings.paid} icon={Banknote} />
        <EarningSummary label={ui('المتبقي')} value={earnings.remaining} icon={ReceiptText} accent />
        <EarningSummary label={ui('مصروف زائد يحتاج تسوية')} value={earnings.overpaid} icon={Banknote} accent={earnings.overpaid > 0} />
      </div>
      {earnings.overpaid > 0 ? <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{ui('انخفض المستحق بعد استرداد؛ سيظل الرصيد ظاهرًا حتى تتم تسويته.')}</p> : null}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-lg">{ui('تفاصيل مستحقات الحصص')}</CardTitle>
          <p className="text-sm text-muted-foreground">{ui('الحضور الفعلي × سعر الحصة × نسبة عمولة المدرب.')}</p>
        </CardHeader>
        <CardContent className="p-0">
          {!earnings.items.length ? <EmptyState compact title={ui('لا توجد حصص منفذة أو حضور مسجل في هذا الشهر')} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-muted/55 text-muted-foreground"><tr><th className="px-5 py-3 text-start">{ui('الحصة')}</th><th className="px-5 py-3 text-start">{ui('التاريخ')}</th><th className="px-5 py-3 text-center">{ui('الحضور')}</th><th className="px-5 py-3 text-center">{ui('سعر الحصة')}</th><th className="px-5 py-3 text-center">{ui('إجمالي الحضور')}</th><th className="px-5 py-3 text-center">{ui('العمولة')}</th><th className="px-5 py-3 text-center">{ui('المستحق')}</th></tr></thead>
                <tbody className="divide-y">
                  {earnings.items.map((row) => <tr key={row.classId} className="hover:bg-muted/35"><td className="px-5 py-4 font-semibold">{row.className}</td><td className="px-5 py-4 nums text-muted-foreground">{formatDate(row.classDate)}</td><td className="px-5 py-4 text-center nums">{formatNum(row.attended)}</td><td className="px-5 py-4 text-center nums">{formatMoney(row.unitPrice)}</td><td className="px-5 py-4 text-center nums">{formatMoney(row.revenue)}</td><td className="px-5 py-4 text-center nums">{formatNum(row.commissionPercentage)}%</td><td className="px-5 py-4 text-center font-bold text-primary nums">{formatMoney(row.amount)}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-lg"><ReceiptText className="size-5 text-primary" />{ui('سجل المبالغ المصروفة')}</CardTitle></CardHeader>
        <CardContent className="p-5">
          {!earnings.payments.length ? <EmptyState compact icon={Banknote} title={ui('لا توجد دفعات مسجلة')} /> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {earnings.payments.map((payment) => <div key={payment.id} className="flex items-start justify-between gap-4 rounded-xl border p-3"><div><p className="font-semibold nums">{formatMoney(payment.amount)}</p><p className="mt-1 text-xs text-muted-foreground">{payment.notes || ui('دفعة مستحقات')}</p></div><time className="shrink-0 text-xs text-muted-foreground nums">{formatDate(payment.paymentDate)}</time></div>)}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function PrivateSessionsPanel({ items, clients, onCheckIn, checkingIn }: { items: TrainerPortalDashboard['earnings']['privateItems']; clients: TrainerPrivateClient[]; onCheckIn: (client: TrainerPrivateClient) => void; checkingIn: number | null }) {
  const { ui, locale } = useLocale();
  return (
    <div className="space-y-4">
    <Card>
      <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-lg"><Users className="size-5 text-primary" />{ui('عملاء Private النشطون')}</CardTitle><p className="text-sm text-muted-foreground">{ui('سجّل حضور العميل من اشتراكه الصحيح؛ خصم الجلسة والعمولة يتمان مرة واحدة.')}</p></CardHeader>
      <CardContent className="p-0">
        {!clients.length ? <EmptyState compact title={ui('لا يوجد عملاء Private نشطون')} /> : <div className="divide-y">{sortPrivateClients(clients).map((client) => <article key={client.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div className="min-w-0"><h3 className="break-words font-bold">{client.memberName}</h3><p className="mt-1 text-xs text-muted-foreground">{client.memberCode} · {client.packageName} · {ui('ينتهي')} {formatDate(client.endDate)}</p><p className="mt-1 text-xs font-semibold">{client.sessionsRemaining == null ? ui('اشتراك بمدة') : `${formatNum(client.sessionsRemaining)} ${ui('جلسة متبقية')}`}</p></div><div className="flex flex-wrap gap-2"><Button asChild permissionAction={null} variant="outline"><Link to={`/trainer/training?member=${client.memberId}&code=${encodeURIComponent(client.memberCode)}`}><Dumbbell className="size-4" />{locale === "ar" ? "الخطة والمتابعة" : "Plan & progress"}</Link></Button><Button variant="brand" disabled={!canPrivateCheckIn(client) || checkingIn != null} onClick={() => onCheckIn(client)}>{client.checkedInToday ? ui('مسجل اليوم') : checkingIn === client.id ? ui('جارٍ التسجيل…') : ui('تسجيل حضور')}</Button></div></article>)}</div>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-lg"><PersonStanding className="size-5 text-primary" />{ui('جلسات وعمولات Private')}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {!items.length ? <EmptyState compact title={ui('لا توجد جلسات Private في هذا الشهر')} description={ui('تظهر الجلسة تلقائيًا بعد تسجيل حضور العضو.')} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/55 text-muted-foreground"><tr><th className="px-5 py-3 text-start">{ui('العضو')}</th><th className="px-5 py-3 text-start">{ui('الاشتراك')}</th><th className="px-5 py-3 text-start">{ui('التاريخ')}</th><th className="px-5 py-3 text-center">{ui('قيمة الجلسة')}</th><th className="px-5 py-3 text-center">{ui('نسبة العمولة')}</th><th className="px-5 py-3 text-center">{ui('المستحق')}</th></tr></thead>
              <tbody className="divide-y">
                {items.map((item) => <tr key={item.id} className="hover:bg-muted/35"><td className="px-5 py-4 font-semibold">{item.memberName}</td><td className="px-5 py-4"><p className="font-medium nums">{item.subscriptionNumber}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.subscriptionType || ui('تدريب خاص')}</p>{item.refundedAmount ? <p className="mt-1 text-xs font-semibold text-destructive">{ui('مخصوم بعد الاسترداد')}: {formatMoney(item.refundedAmount)}</p> : null}</td><td className="px-5 py-4 nums text-muted-foreground">{formatDate(item.attendanceDate)}</td><td className="px-5 py-4 text-center nums">{formatMoney(item.revenue)}</td><td className="px-5 py-4 text-center nums">{formatNum(item.commissionPercentage)}%</td><td className="px-5 py-4 text-center font-bold text-primary nums">{formatMoney(item.amount)}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}

function EarningSummary({ label, value, icon: Icon, accent }: { label: string; value: number; icon: typeof Wallet; accent?: boolean }) {
  return <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 text-xl font-bold nums ${accent ? 'text-primary' : ''}`}>{formatMoney(value)}</p></div><Icon className="size-5 text-primary" /></CardContent></Card>;
}

function MoneyReadout({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return <div><p className="text-xs text-white/65">{label}</p><p className={`mt-1 whitespace-nowrap text-base font-bold nums tabular-nums ${accent ? 'text-primary' : 'text-white'}`}>{formatMoney(value)}</p></div>;
}
