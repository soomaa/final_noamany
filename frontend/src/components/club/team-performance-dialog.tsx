import { Activity, CalendarDays, Clock3, Dumbbell, MessageSquareText, Phone, ReceiptText, Target, Users } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/common/states';
import { CommissionCalculationPreview } from '@/components/club/commission-calculation-preview';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney, formatNum, formatTime } from '@/lib/formatters';
import type { SalesTeamKind } from '@/pages/club/sales-team-view-model';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface SalesDrilldown {
  salesRepId: number;
  pipeline: Record<'new' | 'in_progress' | 'follow_later' | 'qualified' | 'converted' | 'lost', number>;
  avgResponseHours: number | null;
  activitySummary: { total: number; calls: number; answeredCalls: number; conversations: number; meetings: number };
  leads: Array<{
    id: number;
    fullName: string;
    phone: string;
    status: string;
    assignedToId: number | null;
    createdAt: string;
    lastContactedAt: string | null;
    notes: string | null;
  }>;
  activity: Array<{
    id: number;
    leadId: number;
    leadName: string;
    note: string;
    status: string | null;
    activityType: string;
    answered: boolean | null;
    interests: string | null;
    nextFollowUpAt: string | null;
    createdAt: string;
  }>;
  closedDeals: Array<{ id: number; subscriptionNumber: string; customerName: string; paidAmount: number; date: string; type: string | null }>;
}

interface TrainerDrilldown {
  trainer: { id: number; name: string; specialization: string | null; rating: number };
  summary: {
    scheduledClasses: number;
    completedClasses: number;
    totalTrainees: number;
    attended: number;
    absent: number;
    privateSessions: number;
    sessions: number;
    revenue: number;
    target: number;
    targetUnit: string;
    achievementPct: number;
    attendanceRate: number;
    commissionDue: number;
    commissionPercent: number;
    achievedTier: string;
  };
  classes: Array<{
    id: number;
    name: string;
    date: string;
    startTime: string;
    status: string;
    hall: string | null;
    registered: number;
    attended: number;
    absent: number;
    attendanceRate: number;
    revenue: number;
  }>;
  privateSessions: Array<{
    id: number;
    memberName: string;
    subscriptionNumber: string;
    subscriptionType: string | null;
    date: string;
    revenue: number;
    commissionDue: number;
  }>;
}

const leadStatus: Record<string, string> = {
  new: uiStatic('جديد'),
  in_progress: uiStatic('تم الاتصال'),
  follow_later: uiStatic('متابعة لاحقًا'),
  qualified: uiStatic('مهتم / حجز زيارة'),
  converted: uiStatic('تم الدفع والاشتراك'),
  lost: uiStatic('غير مهتم'),
};

export function TeamPerformanceDialog({
  open,
  onOpenChange,
  teamKind,
  profileId,
  profileName,
  params,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamKind: SalesTeamKind;
  profileId: number | null;
  profileName: string;
  params: { dateFrom: string; dateTo: string; range: 'custom' };
}) {
  const { ui } = useLocale();
  const path = teamKind === 'sales'
    ? `/club-sales-dashboard/${profileId}`
    : `/club-sales-reports/trainers/${profileId}/performance`;
  const details = useQuery({
    queryKey: ['team-performance', teamKind, profileId, params],
    queryFn: async () => (await api.get<SalesDrilldown | TrainerDrilldown>(path, { params })).data,
    enabled: open && profileId != null,
    retry: false,
    refetchInterval: open ? 15_000 : false,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" dir="rtl" aria-describedby="team-performance-description">
        <DialogHeader>
          <DialogTitle>{profileName || ui(teamKind === 'sales' ? uiStatic('ملف أداء أخصائي المبيعات') : uiStatic('ملف أداء المدرب'))}</DialogTitle>
          <DialogDescription id="team-performance-description">
            {ui('الأداء التفصيلي خلال النطاق الزمني المحدد، مع النشاط والنتائج الفعلية.')}
          </DialogDescription>
        </DialogHeader>
        {details.isLoading ? <PerformanceLoading /> : null}
        {details.isError ? <ErrorState inline onRetry={() => void details.refetch()} /> : null}
        {details.data && teamKind === 'sales'
          ? <SalesPerformance data={details.data as SalesDrilldown} params={params} />
          : null}
        {details.data && teamKind === 'trainers'
          ? <TrainerPerformance data={details.data as TrainerDrilldown} />
          : null}
      </DialogContent>
    </Dialog>
  );
}

function PerformanceLoading() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-20 rounded-xl" />)}</div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Activity }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="nums mt-2 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function SalesPerformance({ data, params }: { data: SalesDrilldown; params: { dateFrom: string; dateTo: string } }) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [movingLeadId, setMovingLeadId] = useState<number | null>(null);
  const reps = useQuery({
    queryKey: ['employees-sales-reps'],
    queryFn: async () => (await api.get<Array<{ id: number; name: string }>>('/employees/sales-reps')).data,
  });
  const converted = data.pipeline.converted;
  const total = Object.values(data.pipeline).reduce((sum, value) => sum + value, 0);

  const reassign = async (leadId: number, assignedToId: number) => {
    setMovingLeadId(leadId);
    try {
      await api.post(`/club-leads/${leadId}/assign`, { assignedToId, assignmentMode: 'manual' });
      toast.success(ui('تم نقل العميل إلى مسؤول المبيعات المحدد'));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['team-performance', 'sales'] }),
        qc.invalidateQueries({ queryKey: ['club-sales-dashboard'] }),
        qc.invalidateQueries({ queryKey: ['club-leads'] }),
      ]);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setMovingLeadId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={ui('العملاء المسندون')} value={formatNum(data.leads.length)} icon={Users} />
        <Metric label={ui('نسبة التحويل')} value={`${formatNum(total ? (converted / total) * 100 : 0)}%`} icon={Target} />
        <Metric label={ui('متوسط سرعة الاستجابة')} value={data.avgResponseHours == null ? '—' : `${formatNum(data.avgResponseHours)} ${ui('ساعة')}`} icon={Clock3} />
        <Metric label={ui('الاشتراكات المغلقة')} value={formatNum(data.closedDeals.length)} icon={ReceiptText} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {Object.entries(data.pipeline).map(([status, value]) => (
          <div key={status} className="rounded-[10px] bg-muted/45 px-3 py-3 text-center">
            <p className="text-xs font-semibold text-muted-foreground">{ui(leadStatus[status] ?? status)}</p>
            <p className="nums mt-1 text-lg font-bold">{formatNum(value)}</p>
          </div>
        ))}
      </div>

      <section aria-label={ui('تكرار أنشطة المتابعة')} className="grid gap-3 sm:grid-cols-3">
        <Metric label={ui('الاتصالات')} value={formatNum(data.activitySummary.calls)} icon={Phone} />
        <Metric label={ui('المحادثات')} value={formatNum(data.activitySummary.conversations)} icon={MessageSquareText} />
        <Metric label={ui('المقابلات الشخصية')} value={formatNum(data.activitySummary.meetings)} icon={Users} />
      </section>

      <Tabs defaultValue="leads">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="leads">{ui('العملاء والمتابعة')}</TabsTrigger>
          <TabsTrigger value="activity">{ui('سجل النشاط')}</TabsTrigger>
          <TabsTrigger value="deals">{ui('الاشتراكات المغلقة')}</TabsTrigger>
        </TabsList>
        <TabsContent value="leads">
          {!data.leads.length ? <EmptyState compact title={ui('لا يوجد عملاء مسندون في هذه الفترة')} /> : (
            <TableShell headers={[ui('العميل'), ui('الحالة'), ui('آخر تواصل'), ui('آخر ملاحظة'), ui('إعادة التوزيع')]}>
              {data.leads.map((lead) => (
                <tr key={lead.id} className="border-t">
                  <td className="px-3 py-3"><p className="font-semibold">{lead.fullName}</p><p className="nums text-xs text-muted-foreground">{lead.phone}</p></td>
                  <td className="px-3 py-3">{ui(leadStatus[lead.status] ?? lead.status)}</td>
                  <td className="px-3 py-3 nums">{formatDateTime(lead.lastContactedAt ?? lead.createdAt)}</td>
                  <td className="max-w-[260px] px-3 py-3 text-muted-foreground"><p className="line-clamp-2">{lead.notes || '—'}</p></td>
                  <td className="px-3 py-3">
                    <select
                      aria-label={ui('إعادة توزيع العميل')}
                      className="h-9 min-w-40 rounded-[10px] border border-input bg-background px-2 text-sm"
                      value={lead.assignedToId ?? ''}
                      disabled={movingLeadId === lead.id || reps.isLoading}
                      onChange={(event) => void reassign(lead.id, Number(event.target.value))}
                    >
                      {(reps.data ?? []).map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </TabsContent>
        <TabsContent value="activity">
          {!data.activity.length ? <EmptyState compact title={ui('لا توجد متابعات مسجلة في هذه الفترة')} /> : (
            <TableShell headers={[ui('العميل'), ui('نوع النشاط'), ui('النتيجة'), ui('الملاحظة والاهتمامات'), ui('المتابعة القادمة'), ui('التاريخ')]}> 
              {data.activity.map((item) => (
                <tr key={item.id} className="border-t align-top">
                  <td className="px-3 py-3 font-semibold">{item.leadName}</td>
                  <td className="px-3 py-3">{ui(item.activityType === 'call' ? ui('اتصال هاتفي') : item.activityType === 'conversation' ? ui('محادثة') : item.activityType === 'meeting' ? ui('مقابلة شخصية') : ui('تحديث'))}</td>
                  <td className="px-3 py-3">{item.activityType === 'call' && item.answered != null ? ui(item.answered ? ui('تم الرد') : ui('لم يتم الرد')) : ui(leadStatus[item.status ?? ''] ?? item.status ?? '—')}</td>
                  <td className="max-w-[300px] px-3 py-3"><p>{item.note}</p>{item.interests ? <p className="mt-1 text-xs text-muted-foreground">{ui('الاهتمامات:')} {item.interests}</p> : null}</td>
                  <td className="nums px-3 py-3">{item.nextFollowUpAt ? formatDateTime(item.nextFollowUpAt) : '—'}</td>
                  <td className="nums px-3 py-3">{formatDateTime(item.createdAt)}</td>
                </tr>
              ))}
            </TableShell>
          )}
        </TabsContent>
        <TabsContent value="deals">
          {!data.closedDeals.length ? <EmptyState compact title={ui('لا توجد اشتراكات مغلقة في هذه الفترة')} /> : (
            <TableShell headers={[ui('العميل'), ui('رقم الاشتراك'), ui('الباقة'), ui('التاريخ'), ui('القيمة')]}>
              {data.closedDeals.map((deal) => <tr key={deal.id} className="border-t"><td className="px-3 py-3 font-semibold">{deal.customerName}</td><td className="nums px-3 py-3">{deal.subscriptionNumber}</td><td className="px-3 py-3">{deal.type || '—'}</td><td className="nums px-3 py-3">{formatDate(deal.date)}</td><td className="px-3 py-3 font-semibold">{formatMoney(deal.paidAmount)}</td></tr>)}
            </TableShell>
          )}
        </TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">{formatDate(params.dateFrom)} — {formatDate(params.dateTo)}</p>
    </div>
  );
}

function TrainerPerformance({ data }: { data: TrainerDrilldown }) {
  const { ui } = useLocale();
  const summary = data.summary;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={ui('إجمالي الحصص')} value={formatNum(summary.sessions)} icon={CalendarDays} />
        <Metric label={ui('إجمالي المتدربين')} value={formatNum(summary.totalTrainees)} icon={Users} />
        <Metric label={ui('الإيراد')} value={formatMoney(summary.revenue)} icon={ReceiptText} />
        <Metric label={ui('نسبة الإنجاز')} value={`${formatNum(summary.achievementPct)}%`} icon={Target} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label={ui('نسبة الحضور')} value={`${formatNum(summary.attendanceRate)}%`} icon={Activity} />
        <Metric label={ui('التارجت')} value={summary.targetUnit === 'money' ? formatMoney(summary.target) : `${formatNum(summary.target)} ${ui('عضو')}`} icon={Dumbbell} />
        <Metric label={ui('العمولة المستحقة')} value={formatMoney(summary.commissionDue)} icon={ReceiptText} />
      </div>
      <CommissionCalculationPreview baseAmount={summary.revenue} percent={summary.commissionPercent} label={ui('معادلة العمولة المستحقة')} />
      <Tabs defaultValue="classes">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="classes">{ui('الحصص والحضور')}</TabsTrigger>
          <TabsTrigger value="private">{ui('جلسات Private')}</TabsTrigger>
        </TabsList>
        <TabsContent value="classes">
          {!data.classes.length ? <EmptyState compact title={ui('لا توجد حصص في هذه الفترة')} /> : (
            <TableShell headers={[ui('الحصة'), ui('التاريخ'), ui('الحالة'), ui('مسجل'), ui('حضر'), ui('غاب'), ui('الحضور')]}>
              {data.classes.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-3"><p className="font-semibold">{row.name}</p><p className="text-xs text-muted-foreground">{row.hall || '—'}</p></td><td className="nums px-3 py-3">{formatDate(row.date)} · {formatTime(row.startTime)}</td><td className="px-3 py-3">{row.status}</td><td className="nums px-3 py-3">{formatNum(row.registered)}</td><td className="nums px-3 py-3">{formatNum(row.attended)}</td><td className="nums px-3 py-3">{formatNum(row.absent)}</td><td className="nums px-3 py-3 font-semibold">{formatNum(row.attendanceRate)}%</td></tr>)}
            </TableShell>
          )}
        </TabsContent>
        <TabsContent value="private">
          {!data.privateSessions.length ? <EmptyState compact title={ui('لا توجد جلسات Private في هذه الفترة')} /> : (
            <TableShell headers={[ui('العضو'), ui('الاشتراك'), ui('التاريخ'), ui('الإيراد'), ui('العمولة')]}>
              {data.privateSessions.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-3 font-semibold">{row.memberName}</td><td className="px-3 py-3"><p className="nums">{row.subscriptionNumber}</p><p className="text-xs text-muted-foreground">{row.subscriptionType || '—'}</p></td><td className="nums px-3 py-3">{formatDate(row.date)}</td><td className="px-3 py-3">{formatMoney(row.revenue)}</td><td className="px-3 py-3 font-semibold">{formatMoney(row.commissionDue)}</td></tr>)}
            </TableShell>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TableShell({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/50"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-3 text-start font-semibold">{header}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
