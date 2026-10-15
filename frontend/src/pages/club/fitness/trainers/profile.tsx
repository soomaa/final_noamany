import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Coins, Save, Star, Target, UserRound, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CommissionTiersEditor } from '@/components/club/commission-tiers-editor';
import { CommissionCalculationPreview } from '@/components/club/commission-calculation-preview';
import { TargetPeriodFields, type TargetPeriodValue } from '@/components/club/target-period-fields';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/states';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { defaultCommissionTiers } from '@/lib/sales-commission';
import { formatMoney, localToday } from '@/lib/formatters';
import { cn, toArabicDigits, formatDigits } from '@/lib/utils';
import type { TrainerCommissionTier, TrainerWorkspace } from '@/types/fitness';
import { resolveTrainerTab, starRows, type TrainerProfileTab } from './trainer-workspace-model';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const TAB_LABELS: Record<TrainerProfileTab, string> = {
  overview: uiStatic('نظرة عامة'),
  schedule: uiStatic('الحصص والجدول'),
  targets: uiStatic('التارجت والعمولات'),
  earnings: uiStatic('المستحقات والدفعات'),
  ratings: uiStatic('التقييمات'),
};

export function FitnessTrainerProfilePage() {
  const { ui } = useLocale();
  const id = Number(useParams().id);
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const permitted = useMemo<TrainerProfileTab[]>(() => [
    'overview',
    'schedule',
    ...(can('club.fitness.trainer_settings:view') ? ['targets' as const] : []),
    ...(can('club.fitness.trainer_payments:view') ? ['earnings' as const] : []),
    ...(can('club.fitness.trainer_ratings:view') ? ['ratings' as const] : []),
  ], [can]);
  const tab = resolveTrainerTab(searchParams.get('tab'), permitted);
  const workspace = useQuery({
    queryKey: ['club-trainers', id, 'workspace', dateFrom, dateTo],
    queryFn: async () => (await api.get<TrainerWorkspace>(`/club-trainers/${id}/workspace`, {
      params: dateFrom && dateTo ? { dateFrom, dateTo } : undefined,
    })).data,
    enabled: Number.isInteger(id) && id > 0,
    retry: false,
  });

  useEffect(() => {
    if (!workspace.data || dateFrom || dateTo) return;
    setDateFrom(workspace.data.currentCycle.startDate);
    setDateTo(workspace.data.currentCycle.endDate < localToday() ? workspace.data.currentCycle.endDate : localToday());
  }, [workspace.data, dateFrom, dateTo]);

  if (workspace.isLoading) return <ProfileSkeleton />;
  if (workspace.isError || !workspace.data) return <ErrorState onRetry={() => void workspace.refetch()} />;
  const data = workspace.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.trainer.name}
        description={data.trainer.specialization || ui('ملف المدرب وإدارته التشغيلية والمالية')}
        actions={<>
          <StatusBadge status={data.trainer.isActive ? 'active' : 'suspended'} />
          <Button asChild variant="outline"><Link to="/club/fitness/trainers"><ArrowRight className="size-4" /> {ui('العودة للمدربين')}</Link></Button>
        </>}
      />

      <div className="surface-card flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <div className="grid gap-1"><Label>{ui('من')}</Label><Input type="date" className="nums w-40" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
        <div className="grid gap-1"><Label>{ui('إلى')}</Label><Input type="date" className="nums w-40" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
        <p className="text-sm text-muted-foreground">{ui('الأرقام المعروضة تخص الفترة المحددة.')}</p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}>
        <TabsList className="mx-auto h-auto w-fit max-w-full flex-wrap justify-center">
          {permitted.map((item) => <TabsTrigger key={item} value={item}>{TAB_LABELS[item]}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="overview"><Overview workspace={data} /></TabsContent>
        <TabsContent value="schedule"><Schedule workspace={data} /></TabsContent>
        {permitted.includes('targets') ? <TabsContent value="targets"><Targets workspace={data} onSaved={() => void workspace.refetch()} /></TabsContent> : null}
        {permitted.includes('earnings') ? <TabsContent value="earnings"><Earnings workspace={data} dateFrom={dateFrom} dateTo={dateTo} onSaved={() => void workspace.refetch()} /></TabsContent> : null}
        {permitted.includes('ratings') ? <TabsContent value="ratings"><Ratings workspace={data} /></TabsContent> : null}
      </Tabs>
    </div>
  );
}

function Overview({ workspace }: { workspace: TrainerWorkspace }) {
  const { ui } = useLocale();
  const s = workspace.stats;
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric icon={CalendarDays} label={ui('الحصص')} value={toArabicDigits(s.sessions)} />
      <Metric icon={UserRound} label={ui('الأعضاء')} value={toArabicDigits(s.uniqueMembers)} />
      <Metric icon={Target} label={ui('تحقيق التارجت')} value={`${toArabicDigits(s.achievementPct)}%`} />
      <Metric icon={Wallet} label={ui('المتبقي للمدرب')} value={formatMoney(s.remaining)} alert={s.remaining > 0} />
      <Metric icon={Wallet} label={ui('رصيد مصروف زائد')} value={formatMoney(s.overpaid)} alert={s.overpaid > 0} />
    </div>
    <Card><CardHeader><CardTitle>{ui('بيانات المدرب')}</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
      <Info label={ui('رقم الجوال')} value={workspace.trainer.phone} />
      <Info label={ui('البريد الإلكتروني')} value={workspace.trainer.email} />
      <Info label={ui('التخصص')} value={workspace.trainer.specialization} />
      <Info label={ui('الخبرة')} value={workspace.trainer.experience} />
      <Info label={ui('متوسط التقييم')} value={workspace.stats.ratingCount ? `${toArabicDigits(workspace.stats.ratingAvg)} / 5` : ui('لا توجد تقييمات')} />
      <Info label={ui('الإيراد')} value={formatMoney(workspace.stats.revenue)} />
    </CardContent></Card>
  </div>;
}

function Schedule({ workspace }: { workspace: TrainerWorkspace }) {
  const { ui } = useLocale();
  return <Card><CardHeader><CardTitle>{ui('الحصص خلال الفترة')}</CardTitle></CardHeader><CardContent>
    {!workspace.classes.length ? <p className="py-10 text-center text-sm text-muted-foreground">{ui('لا توجد حصص للمدرب في الفترة المحددة.')}</p> : <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted/40"><tr>{[ui('الحصة'), ui('التاريخ'), ui('الوقت'), ui('الحضور'), ui('الحالة')].map((label) => <th key={label} className="px-3 py-3 text-start">{label}</th>)}</tr></thead><tbody>{workspace.classes.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-3 font-semibold">{row.className}</td><td className="nums px-3 py-3">{toArabicDigits(row.classDate)}</td><td className="nums px-3 py-3">{toArabicDigits(row.startTime)}–{toArabicDigits(row.endTime)}</td><td className="nums px-3 py-3">{toArabicDigits(row.enrollmentCount)}</td><td className="px-3 py-3"><StatusBadge status="info" label={row.status} /></td></tr>)}</tbody></table></div>}
  </CardContent></Card>;
}

function Targets({ workspace, onSaved }: { workspace: TrainerWorkspace; onSaved: () => void }) {
  const { can } = usePermission();
  const editable = can('club.fitness.trainer_settings:configure') || can('club.fitness.trainer_settings:update');
  const [saving, setSaving] = useState(false);
  const [targetUnit, setTargetUnit] = useState<'members' | 'money'>(workspace.commissionSetting?.targetUnit ?? 'members');
  const [baseTarget, setBaseTarget] = useState(workspace.commissionSetting?.baseTarget ?? 0);
  const [tiers, setTiers] = useState<TrainerCommissionTier[]>(workspace.commissionSetting?.tiers.length ? workspace.commissionSetting.tiers : defaultCommissionTiers());
  const [period, setPeriod] = useState<TargetPeriodValue>({
    targetPeriodMode: workspace.commissionSetting?.targetPeriodMode ?? 'monthly',
    targetStartDate: workspace.commissionSetting?.targetStartDate ?? null,
    targetEndDate: workspace.commissionSetting?.targetEndDate ?? null,
    targetDays: workspace.commissionSetting?.targetDays ?? null,
  });
  const save = async () => {
    if (!workspace.trainer.employeeId) { toast.error(uiStatic('يجب ربط المدرب بموظف قبل ضبط التارجت')); return; }
    setSaving(true);
    try {
      if (editable) await api.put('/club-sales-settings/trainers', { employeeId: workspace.trainer.employeeId, trainerId: workspace.trainer.id, targetUnit, baseTarget, tiers, ...period });
      toast.success(uiStatic('تم حفظ إعدادات المدرب')); onSaved();
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };
  return <div className="space-y-4">
    {!workspace.trainer.employeeId ? <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">{uiStatic('هذا المدرب غير مرتبط بموظف؛ اربطه بموظف لتفعيل التارجت والعمولات.')}</div> : null}
    <Card><CardHeader><CardTitle>{uiStatic('التارجت وشرائح العمولة')}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label>{uiStatic('وحدة التارجت')}</Label><select className="h-10 rounded-md border bg-background px-3" value={targetUnit} disabled={!editable} onChange={(event) => setTargetUnit(event.target.value as 'members' | 'money')}><option value="members">{uiStatic('عدد أعضاء')}</option><option value="money">{uiStatic('مبلغ')}</option></select></div><div className="grid gap-2"><Label>التارجت الأساسي ({targetUnit === 'members' ? uiStatic('عضو') : 'EGP'})</Label><Input className="nums" type="number" min={0} value={baseTarget} disabled={!editable} onChange={(event) => setBaseTarget(Number(event.target.value))} /></div></div><TargetPeriodFields value={period} cycle={workspace.currentCycle} disabled={!editable} onChange={setPeriod} /><CommissionTiersEditor tiers={tiers} disabled={!editable} onChange={setTiers} /><CommissionCalculationPreview baseAmount={workspace.stats.revenue} percent={workspace.stats.commissionPercent} label={uiStatic('العمولة على إيراد الفترة الحالية')} /></CardContent></Card>
    {editable ? <div className="flex justify-end"><Button variant="brand" disabled={saving || !workspace.trainer.employeeId} onClick={() => void save()}><Save className="size-4" /> {uiStatic('حفظ إعدادات المدرب')}</Button></div> : null}
  </div>;
}

function Earnings({ workspace, dateFrom, dateTo, onSaved }: { workspace: TrainerWorkspace; dateFrom: string; dateTo: string; onSaved: () => void }) {
  const { can } = usePermission();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(workspace.stats.remaining || ''));
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); try { await api.post(`/club-trainers/${workspace.trainer.id}/earning-payments`, { amount: Number(amount), paymentDate: localToday(), periodFrom: dateFrom, periodTo: dateTo }); toast.success(uiStatic('تم تسجيل صرف المستحقات')); setOpen(false); onSaved(); } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); } };
  return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Coins} label={uiStatic('المكتسب')} value={formatMoney(workspace.stats.earned)} /><Metric icon={Wallet} label={uiStatic('المصروف')} value={formatMoney(workspace.stats.paid)} /><Metric icon={Target} label={uiStatic('المتبقي')} value={formatMoney(workspace.stats.remaining)} alert={workspace.stats.remaining > 0} /><Metric icon={Wallet} label={uiStatic('مصروف زائد يحتاج تسوية')} value={formatMoney(workspace.stats.overpaid)} alert={workspace.stats.overpaid > 0} /></div>{workspace.stats.overpaid > 0 ? <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{uiStatic('يوجد مبلغ مصروف أعلى من المستحق الحالي بعد الاستردادات. سوِّ الرصيد قبل أي صرف جديد.')}</p> : null}<Card><CardHeader className="flex-row items-center justify-between"><CardTitle>{uiStatic('سجل الدفعات')}</CardTitle>{can('club.fitness.trainer_payments:create') ? <Button variant="brand" disabled={workspace.stats.remaining <= 0} onClick={() => { setAmount(String(workspace.stats.remaining)); setOpen(true); }}>{uiStatic('تسجيل صرف')}</Button> : null}</CardHeader><CardContent>{!workspace.payments.length ? <p className="py-8 text-center text-sm text-muted-foreground">{uiStatic('لا توجد دفعات مسجلة.')}</p> : <div className="space-y-2">{workspace.payments.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border px-4 py-3"><span className="font-semibold">{formatMoney(row.amount)}</span><span className="nums text-sm text-muted-foreground">{toArabicDigits(row.paymentDate)}</span><span className="text-sm text-muted-foreground">{row.notes || '—'}</span></div>)}</div>}</CardContent></Card><Dialog open={open} onOpenChange={setOpen}><DialogContent size="sm" aria-describedby={undefined}><DialogHeader><DialogTitle>{uiStatic('تسجيل صرف للمدرب')}</DialogTitle></DialogHeader><div className="grid gap-2"><Label>{uiStatic('المبلغ')}</Label><Input type="number" min={0.01} max={workspace.stats.remaining} className="nums" value={amount} onChange={(event) => setAmount(event.target.value)} /><p className="text-xs text-muted-foreground">الحد الأقصى {formatMoney(workspace.stats.remaining)}</p></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{uiStatic('إلغاء')}</Button><Button variant="brand" disabled={saving || Number(amount) <= 0 || Number(amount) > workspace.stats.remaining} onClick={() => void save()}>{uiStatic('حفظ')}</Button></DialogFooter></DialogContent></Dialog></div>;
}

function Ratings({ workspace }: { workspace: TrainerWorkspace }) {
  const { ui } = useLocale();
  const rows = starRows(workspace.ratingDistribution);
  return <div className="grid gap-4 lg:grid-cols-[280px_1fr]"><Card><CardHeader><CardTitle>{ui('ملخص التقييم')}</CardTitle></CardHeader><CardContent><div className="text-center"><Star className="mx-auto size-8 fill-primary text-primary" /><p className="nums mt-2 text-4xl font-bold">{toArabicDigits(workspace.stats.ratingAvg)}</p><p className="text-sm text-muted-foreground">من {toArabicDigits(workspace.stats.ratingCount)} تقييم</p></div><div className="mt-5 space-y-2">{rows.map((row) => <div key={row.stars} className="flex items-center gap-2 text-sm"><span className="nums w-8">{toArabicDigits(row.stars)}★</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${workspace.stats.ratingCount ? (row.count / workspace.stats.ratingCount) * 100 : 0}%` }} /></div><span className="nums w-6 text-end">{toArabicDigits(row.count)}</span></div>)}</div></CardContent></Card><Card><CardHeader><CardTitle>{ui('آراء الأعضاء')}</CardTitle></CardHeader><CardContent className="space-y-2">{!workspace.ratings.length ? <p className="py-10 text-center text-sm text-muted-foreground">{ui('لم تُسجّل تقييمات بعد.')}</p> : workspace.ratings.map((row) => <article key={row.id} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{row.memberName || `${ui('عضو #')}${formatDigits(row.memberId ?? '')}`}</span><span className="text-primary">{'★'.repeat(Math.round(row.rating))}</span></div>{row.comment ? <p className="mt-2 text-sm leading-relaxed">{row.comment}</p> : null}<p className="nums mt-2 text-xs text-muted-foreground">{toArabicDigits(String(row.createdAt).slice(0, 10))}</p></article>)}</CardContent></Card></div>;
}

function Metric({ icon: Icon, label, value, alert }: { icon: typeof Star; label: string; value: string; alert?: boolean }) { return <div className="surface-card rounded-xl border p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-muted-foreground">{label}</p><Icon className={cn('size-4', alert ? 'text-warning' : 'text-primary')} /></div><p className="nums mt-2 text-2xl font-bold tracking-tight">{value}</p></div>; }
function Info({ label, value }: { label: string; value?: string | null }) { return <div><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value || '—'}</p></div>; }
function ProfileSkeleton() { return <div className="space-y-4"><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-12 w-full rounded-xl" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}</div></div>; }
