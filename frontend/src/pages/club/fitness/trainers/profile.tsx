import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, Star, Target, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { formatMoney, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import {
  monthBounds,
  resolveTargetPeriod,
  resolveTrainerTab,
  type TrainerProfileTab,
} from './trainer-workspace-model';

const labels: Record<TrainerProfileTab, string> = { overview: 'نظرة عامة', schedule: 'الحصص والجدول', targets: 'التارجت والعمولات', earnings: 'المستحقات والدفعات', ratings: 'التقييمات' };

/** One profile, five permission-aware tabs — no duplicate trainer-management sidebar page. */
export function FitnessTrainerProfilePage() {
  const id = Number(useParams().id); const { can } = usePermission(); const qc = useQueryClient(); const [params, setParams] = useSearchParams();
  const permitted = useMemo<TrainerProfileTab[]>(() => ['overview', 'schedule', ...(can('club.fitness.trainer_settings:view') ? ['targets'] as TrainerProfileTab[] : []), ...(can('club.fitness.trainer_payments:view') ? ['earnings'] as TrainerProfileTab[] : []), ...(can('club.fitness.trainer_ratings:view') ? ['ratings'] as TrainerProfileTab[] : [])], [can]);
  const tab = resolveTrainerTab(params.get('tab'), permitted);
  const data = useQuery({ queryKey: ['club-trainers', id, 'workspace'], queryFn: async () => (await api.get<any>(`/club-trainers/${id}/workspace`)).data, enabled: id > 0, retry: false });
  if (data.isLoading) return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  if (data.isError || !data.data) return <ErrorState onRetry={() => void data.refetch()} />;
  const workspace = data.data;
  return <div className="space-y-5"><PageHeader title={workspace.trainer.name} description={workspace.trainer.specialization || 'ملف المدرب وإدارته التشغيلية والمالية'} actions={<Button asChild variant="outline"><Link to="/club/fitness/trainers"><ArrowRight className="size-4" />العودة للمدربين</Link></Button>} />
    <Tabs value={tab} onValueChange={(value) => setParams({ tab: resolveTrainerTab(value, permitted) })}><TabsList className="h-auto flex-wrap">{permitted.map((key) => <TabsTrigger key={key} value={key}>{labels[key]}</TabsTrigger>)}</TabsList>
      <TabsContent value="overview"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="الحصص" value={workspace.stats.sessions} /><Metric label="الأعضاء" value={workspace.stats.uniqueMembers} />{can('club.fitness.trainer_settings:view') ? <Metric label="تحقيق التارجت" value={`${workspace.stats.achievementPct ?? 0}%`} /> : null}{can('club.fitness.trainer_payments:view') ? <Metric label="المستحق" value={formatMoney(workspace.stats.remaining ?? 0)} /> : null}</div></TabsContent>
      <TabsContent value="schedule"><Card><CardHeader><CardTitle>الحصص والجدول</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[600px] text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-start">الحصة</th><th className="p-3">التاريخ</th><th className="p-3">الوقت</th><th className="p-3">الحضور</th><th className="p-3">الحالة</th></tr></thead><tbody>{workspace.classes.map((row: any) => <tr className="border-t" key={row.id}><td className="p-3 font-medium">{row.className}</td><td className="p-3 nums">{toArabicDigits(row.classDate)}</td><td className="p-3 nums">{toArabicDigits(row.startTime)}</td><td className="p-3 text-center nums">{toArabicDigits(row.enrollmentCount)}</td><td className="p-3">{row.status}</td></tr>)}</tbody></table></CardContent></Card></TabsContent>
      <TabsContent value="targets"><TargetSettings workspace={workspace} onSaved={() => void qc.invalidateQueries({ queryKey: ['club-trainers', id, 'workspace'] })} /></TabsContent>
      <TabsContent value="earnings"><Card><CardHeader><CardTitle>المستحقات والدفعات</CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 sm:grid-cols-3"><Metric label="المكتسب" value={formatMoney(workspace.stats.earned)} /><Metric label="المصروف" value={formatMoney(workspace.stats.paid)} /><Metric label="المتبقي" value={formatMoney(workspace.stats.remaining)} /></div>{workspace.payments.map((row: any) => <div className="flex justify-between rounded-xl border p-3" key={row.id}><b>{formatMoney(row.amount)}</b><span className="nums text-muted-foreground">{toArabicDigits(row.paymentDate)}</span></div>)}</CardContent></Card></TabsContent>
      <TabsContent value="ratings"><Card><CardHeader><CardTitle>التقييمات</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-2"><Star className="size-6 fill-primary text-primary" /><b className="nums text-2xl">{toArabicDigits(workspace.stats.ratingAvg)}</b><span className="text-muted-foreground">من {toArabicDigits(workspace.stats.ratingCount)} تقييم</span></div>{workspace.ratings.map((row: any) => <article className="rounded-xl border p-3" key={row.id}><span className="text-primary">{'★'.repeat(Math.round(row.rating))}</span>{row.comment ? <p className="mt-1 text-sm">{row.comment}</p> : null}</article>)}</CardContent></Card></TabsContent>
    </Tabs></div>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><b className="mt-2 block text-2xl nums">{typeof value === 'number' ? toArabicDigits(value) : value}</b></CardContent></Card>; }
function TargetSettings({ workspace, onSaved }: { workspace: any; onSaved: () => void }) {
  const { can } = usePermission();
  const qc = useQueryClient();
  const editable = can('club.fitness.trainer_settings:configure') || can('club.fitness.trainer_settings:update');
  const [month, setMonth] = useState(localToday().slice(0, 7));
  const [target, setTarget] = useState('0');
  const [unit, setUnit] = useState<'members' | 'money'>('members');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const history = useQuery({
    queryKey: ['club-trainers', workspace.trainer.id, 'target-periods'],
    queryFn: async () => (await api.get<TrainerTargetPeriod[]>(`/club-trainers/${workspace.trainer.id}/target-periods`)).data,
  });
  const selected = resolveTargetPeriod(history.data ?? [], month);
  const bounds = monthBounds(month);
  const monthWorkspace = useQuery({
    queryKey: ['club-trainers', workspace.trainer.id, 'workspace', month],
    queryFn: async () => (await api.get<any>(`/club-trainers/${workspace.trainer.id}/workspace`, { params: { dateFrom: bounds?.start, dateTo: bounds?.end } })).data,
    enabled: Boolean(bounds),
  });
  useEffect(() => {
    setTarget(String(selected?.targetValue ?? 0));
    setUnit(selected?.targetUnit ?? 'members');
    setNotes(selected?.notes ?? '');
  }, [selected?.id, selected?.targetValue, selected?.targetUnit, selected?.notes, month]);
  const save = async () => {
    if (!workspace.trainer.employeeId) return toast.error('يجب ربط المدرب بموظف أولاً');
    const value = Number(target);
    if (!Number.isFinite(value) || value < 0) return toast.error('أدخل قيمة تارجت صحيحة');
    setSaving(true);
    try {
      await api.put(`/club-trainers/${workspace.trainer.id}/target-periods/${month}`, {
        targetValue: value,
        targetUnit: unit,
        notes: notes.trim() || undefined,
      });
      toast.success(selected ? 'تم تحديث تارجت الشهر' : 'تم حفظ تارجت الشهر');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['club-trainers', workspace.trainer.id, 'target-periods'] }),
        qc.invalidateQueries({ queryKey: ['club-trainers', workspace.trainer.id, 'workspace'] }),
      ]);
      onSaved();
    } catch (error) { toast.error(apiError(error)); }
    finally { setSaving(false); }
  };
  const salary = workspace.activeSalary;
  return <div className="space-y-4">
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Target className="size-5 text-primary" />التارجت والعمولات</CardTitle><p className="text-sm text-muted-foreground">اختاري الشهر المطلوب؛ كل شهر له سجل مستقل يمكن الرجوع إليه أو تحديثه بدون تغيير الشهور السابقة.</p></CardHeader>
      <CardContent className="space-y-5">
        {!workspace.trainer.employeeId ? <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">هذا المدرب غير مرتبط بموظف. اربطيه بموظف أولًا لحفظ التارجت.</p> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2"><Label htmlFor="trainer-target-month">الشهر المحدد *</Label><Input id="trainer-target-month" type="month" className="nums" value={month} onChange={(event) => setMonth(event.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor="trainer-target-unit">وحدة التارجت *</Label><select id="trainer-target-unit" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={unit} disabled={!editable} onChange={(event) => setUnit(event.target.value as 'members' | 'money')}><option value="members">عدد أعضاء</option><option value="money">مبلغ بالجنيه</option></select></div>
          <div className="grid gap-2"><Label htmlFor="trainer-target-value">قيمة التارجت *</Label><Input id="trainer-target-value" type="number" min={0} step={unit === 'members' ? 1 : 0.01} className="nums" value={target} disabled={!editable} onChange={(event) => setTarget(event.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor="trainer-target-notes">ملاحظات</Label><Input id="trainer-target-notes" maxLength={500} value={notes} disabled={!editable} onChange={(event) => setNotes(event.target.value)} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="المحقق في الشهر" value={unit === 'money' ? formatMoney(monthWorkspace.data?.stats.revenue ?? 0) : toArabicDigits(monthWorkspace.data?.stats.uniqueMembers ?? 0)} />
          <Metric label="نسبة التحقيق" value={`${toArabicDigits(monthWorkspace.data?.stats.achievementPct ?? 0)}%`} />
          <Metric label="التارجت المحفوظ" value={unit === 'money' ? formatMoney(Number(target) || 0) : toArabicDigits(Number(target) || 0)} />
        </div>
        {editable ? <div className="flex justify-end"><Button variant="brand" disabled={saving || !month || !workspace.trainer.employeeId} onClick={() => void save()}><Save className="size-4" />{saving ? 'جارٍ الحفظ…' : selected ? 'تحديث تارجت الشهر' : 'حفظ تارجت الشهر'}</Button></div> : null}
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle>نسب العمولة الحالية</CardTitle><p className="text-sm text-muted-foreground">النسب من فترة راتب المدرب السارية، وتظهر هنا للمرجعية بجانب التارجت.</p></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Metric label="عمولة الحصص" value={`${toArabicDigits(salary?.classCommissionPercentage ?? 0)}%`} /><Metric label="عمولة الاشتراكات" value={`${toArabicDigits(salary?.subscriptionCommissionPercentage ?? 0)}%`} /></CardContent></Card>
    <Card><CardHeader><CardTitle>سجل التارجت الشهري</CardTitle></CardHeader><CardContent>{history.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">جارٍ تحميل سجل التارجت…</p> : history.isError ? <div className="flex flex-wrap items-center justify-center gap-2 py-8"><p className="text-sm text-destructive">تعذر تحميل السجل.</p><Button variant="outline" onClick={() => void history.refetch()}>إعادة المحاولة</Button></div> : !(history.data ?? []).length ? <p className="py-8 text-center text-sm text-muted-foreground">لم يتم حفظ تارجت لأي شهر بعد.</p> : <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-start">الشهر</th><th className="p-3 text-start">الفترة</th><th className="p-3 text-start">التارجت</th><th className="p-3 text-start">ملاحظات</th></tr></thead><tbody>{history.data?.map((row) => <tr key={row.id} className="border-t"><td className="p-3 font-semibold nums">{toArabicDigits(row.periodMonth)}</td><td className="p-3 nums">{toArabicDigits(row.periodStart)} — {toArabicDigits(row.periodEnd)}</td><td className="p-3 font-semibold nums">{row.targetUnit === 'money' ? formatMoney(row.targetValue) : `${toArabicDigits(row.targetValue)} عضو`}</td><td className="p-3 text-muted-foreground">{row.notes || '—'}</td></tr>)}</tbody></table></div>}</CardContent></Card>
  </div>;
}

interface TrainerTargetPeriod {
  id: number;
  trainerId: number;
  periodMonth: string;
  periodStart: string;
  periodEnd: string;
  targetValue: number;
  targetUnit: 'members' | 'money';
  notes: string | null;
}
