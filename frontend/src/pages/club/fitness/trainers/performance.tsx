import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/common/combobox';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { isSystemAdminUser } from '@/lib/user-scope';
import { useAuth } from '@/store/auth';
import { toArabicDigits } from '@/lib/utils';
import { SELECT_CLS } from '../shared';
import { cairoMonth, fmtNumber as number, fmtPercent, useClientTable } from './trainer-shared';
import { SearchableSelect } from '@/components/common/searchable-select';

type Trainer = { id: number; name: string; employee_id: number | null; branchIds: number[] };
type Criterion = { id: number; title: string; description: string | null; max_score: number; sort_order: number; is_active: boolean };
type TargetValues = { privateSalesTarget: number; subscriptionsTarget: number };
type ResolvedTarget = TargetValues & { source: 'override' | 'default' | 'legacy' };
type TargetResponse = { fixed: TargetValues | null; override: TargetValues | null; resolved: ResolvedTarget | null; overrides: Array<TargetValues & { month: string }> };
type Evaluation = { id: number; branch_id: number; notes: string | null; total_score: number; max_score: number; items: Array<{ criterion_id: number; score: number }> };
type HistoryRow = { month: string; target: ResolvedTarget; privateSales: number; subscriptions: number; privateAchievement: number; subscriptionsAchievement: number; evaluation: { totalScore: number; maxScore: number } | null };
type Profile = { month: string; target: ResolvedTarget; privateSales: number; subscriptions: number; privateAchievement: number; subscriptionsAchievement: number; history: HistoryRow[] };

const SOURCE_LABEL: Record<ResolvedTarget['source'], string> = { override: 'تعديل لهذا الشهر', default: 'التارجت الثابت', legacy: 'التارجت القديم من ملف الموظف' };

function TrainerSelect({ value, onChange, trainers, locked = false }: { value: string; onChange: (value: string) => void; trainers: Trainer[]; locked?: boolean }) {
  return <Combobox
    value={value}
    onValueChange={onChange}
    disabled={locked}
    options={trainers.map((trainer) => ({ value: String(trainer.id), label: trainer.name }))}
    placeholder="اختر المدرب"
    searchPlaceholder="ابحث باسم المدرب…"
    emptyText="لا يوجد مدرب مطابق"
  />;
}

function useTrainers() {
  return useQuery({ queryKey: ['trainer-performance-trainers'], queryFn: async () => (await api.get<Trainer[]>('/club-trainer-performance/trainers')).data });
}

function useProfile(trainerId: string, month: string) {
  return useQuery({
    queryKey: ['trainer-performance', 'profile', trainerId, month],
    queryFn: async () => (await api.get<Profile>(`/club-trainer-performance/trainers/${trainerId}/profile`, { params: { month } })).data,
    enabled: Boolean(trainerId && month),
  });
}

/**
 * A trainer signed in to their own account sees only themselves: the server returns just their
 * row, so it is preselected and the picker is locked. Managers and admins choose freely.
 */
function useTrainerChoice(trainers: Trainer[]) {
  const user = useAuth((state) => state.user);
  const [trainerId, setTrainerId] = useState('');
  const selfOnly = !isSystemAdminUser(user) && user?.trainer_id != null && trainers.length === 1 && trainers[0].id === user.trainer_id;
  useEffect(() => {
    if (selfOnly) setTrainerId(String(trainers[0].id));
  }, [selfOnly, trainers]);
  return { trainerId, setTrainerId, selfOnly };
}

function HistoryTable({ rows, showEvaluation = true }: { rows: HistoryRow[]; showEvaluation?: boolean }) {
  return <div className="overflow-x-auto rounded-lg border">
    <table className="w-full text-sm">
      <thead className="bg-muted/50"><tr>
        <th className="p-2 text-start">الشهر</th>
        <th className="p-2 text-start">تارجت البرايفت</th>
        <th className="p-2 text-start">المحقق</th>
        <th className="p-2 text-start">النسبة</th>
        <th className="p-2 text-start">تارجت العدد</th>
        <th className="p-2 text-start">المحقق</th>
        {showEvaluation && <th className="p-2 text-start">التقييم</th>}
      </tr></thead>
      <tbody>{rows.map((row) => <tr key={row.month} className="border-t">
        <td className="p-2 nums">{toArabicDigits(row.month)}</td>
        <td className="p-2 nums">{number(row.target.privateSalesTarget)}</td>
        <td className="p-2 nums">{number(row.privateSales)}</td>
        <td className="p-2 nums">{row.target.privateSalesTarget ? fmtPercent(row.privateAchievement) : '—'}</td>
        <td className="p-2 nums">{number(row.target.subscriptionsTarget)}</td>
        <td className="p-2 nums">{number(row.subscriptions)}</td>
        {showEvaluation && <td className="p-2 nums">{row.evaluation ? `${number(row.evaluation.totalScore)} / ${number(row.evaluation.maxScore)}` : '—'}</td>}
      </tr>)}</tbody>
    </table>
  </div>;
}

export function FitnessTrainerTargetsPage() {
  const qc = useQueryClient();
  const { data: trainers = [] } = useTrainers();
  const { trainerId, setTrainerId, selfOnly } = useTrainerChoice(trainers);
  const [month, setMonth] = useState(cairoMonth);
  const [scope, setScope] = useState<'month' | 'fixed'>('fixed');
  const [privateSalesTarget, setPrivateSalesTarget] = useState('0');
  const [subscriptionsTarget, setSubscriptionsTarget] = useState('0');
  const { data: target, isFetching } = useQuery({
    queryKey: ['trainer-performance', 'target', trainerId, month],
    queryFn: async () => (await api.get<TargetResponse>('/club-trainer-performance/targets', { params: { trainerId, month } })).data,
    enabled: Boolean(trainerId && month),
  });
  const { data: profile } = useProfile(trainerId, month);

  // Always show what is saved for the chosen trainer/month/scope, never the previous selection's values.
  useEffect(() => {
    const values = scope === 'month' ? target?.override ?? target?.resolved : target?.fixed;
    setPrivateSalesTarget(String(values?.privateSalesTarget ?? 0));
    setSubscriptionsTarget(String(values?.subscriptionsTarget ?? 0));
  }, [target, scope, trainerId, month]);

  const refresh = () => void qc.invalidateQueries({ queryKey: ['trainer-performance'] });
  const save = useMutation({ mutationFn: () => api.post('/club-trainer-performance/targets', { trainerId: Number(trainerId), month: scope === 'month' ? month : undefined, privateSalesTarget: Number(privateSalesTarget), subscriptionsTarget: Number(subscriptionsTarget) }), onSuccess: () => { toast.success('تم حفظ التارجت'); refresh(); }, onError: (error) => toast.error(apiError(error)) });
  const removeOverride = useMutation({ mutationFn: (m: string) => api.delete('/club-trainer-performance/targets/override', { params: { trainerId, month: m } }), onSuccess: () => { toast.success('تم إلغاء تعديل الشهر'); refresh(); }, onError: (error) => toast.error(apiError(error)) });

  return <div className="space-y-6">
    <PageHeader title="تارجت المدربين" description="تارجت ثابت لكل مدرب، أو تعديل استثنائي لشهر واحد. المحقق = اشتراكات البرايفت التي باعها المدرب في الشهر (بعد الخصم، بدون المسترد)." />
    <Card className="max-w-4xl"><CardHeader><CardTitle>تارجت مدرب</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2"><Label>المدرب</Label><TrainerSelect value={trainerId} onChange={setTrainerId} trainers={trainers} locked={selfOnly} /></div>
      <div className="space-y-2"><Label>الشهر</Label><Input type="month" value={selfOnly ? cairoMonth() : month} disabled={selfOnly} title={selfOnly ? 'الشهر الحالي' : undefined} onChange={(event) => setMonth(event.target.value || cairoMonth())} /></div>
      {!selfOnly && <div className="space-y-2 md:col-span-2"><Label>يُطبَّق على</Label>
        <SearchableSelect className={SELECT_CLS} value={scope} onChange={(event) => setScope(event.target.value as 'month' | 'fixed')}>
          <option value="fixed">التارجت الثابت (كل الشهور بدون تعديل)</option>
          <option value="month">هذا الشهر فقط ({toArabicDigits(month)})</option>
        </SearchableSelect></div>}
      <div className="space-y-2"><Label>تارجت مبيعات البرايفت (ج.م)</Label><Input inputMode="decimal" className="nums" disabled={selfOnly} value={privateSalesTarget} onChange={(event) => setPrivateSalesTarget(event.target.value)} /></div>
      <div className="space-y-2"><Label>تارجت عدد اشتراكات البرايفت</Label><Input type="number" min="0" className="nums" disabled={selfOnly} value={subscriptionsTarget} onChange={(event) => setSubscriptionsTarget(event.target.value)} /></div>
      {target?.resolved && <p className="text-sm text-muted-foreground md:col-span-2">المطبَّق على {toArabicDigits(month)}: {SOURCE_LABEL[target.resolved.source]} — <span className="nums">{number(target.resolved.privateSalesTarget)}</span> ج.م و<span className="nums">{number(target.resolved.subscriptionsTarget)}</span> اشتراك.</p>}
      {selfOnly ? null : <div className="md:col-span-2"><Button disabled={!trainerId || isFetching || save.isPending} onClick={() => save.mutate()}><Save className="size-4" />حفظ التارجت</Button></div>}
    </CardContent></Card>
    {trainerId && profile && <Card className="max-w-4xl"><CardHeader><CardTitle>{selfOnly ? 'الإنجاز في الشهر الحالي' : 'الإنجاز وآخر ٦ شهور'}</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Metric label={`مبيعات البرايفت في ${toArabicDigits(month)}`} value={profile.privateSales} hint={profile.target.privateSalesTarget ? `${fmtPercent(profile.privateAchievement)} من ${number(profile.target.privateSalesTarget)}` : 'لا يوجد تارجت'} />
        <Metric label="عدد اشتراكات البرايفت" value={profile.subscriptions} hint={profile.target.subscriptionsTarget ? `${fmtPercent(profile.subscriptionsAchievement)} من ${number(profile.target.subscriptionsTarget)}` : 'لا يوجد تارجت'} />
      </div>
      {!selfOnly && <HistoryTable rows={profile.history} />}
      {!!target?.overrides.length && <div className="space-y-2"><p className="text-sm font-medium">تعديلات الشهور</p>
        <ul className="divide-y rounded-lg border text-sm">{target.overrides.map((row) => <li key={row.month} className="flex items-center justify-between p-2">
          <span className="nums">{toArabicDigits(row.month)}: {number(row.privateSalesTarget)} ج.م — {number(row.subscriptionsTarget)} اشتراك</span>
          {!selfOnly && <Button size="sm" variant="ghost" disabled={removeOverride.isPending} onClick={() => removeOverride.mutate(row.month)}><Trash2 className="size-4" />إلغاء</Button>}
        </li>)}</ul></div>}
    </CardContent></Card>}
  </div>;
}

export function FitnessTrainerEvaluationCriteriaPage() {
  const qc = useQueryClient();
  const { data: criteria = [], isLoading } = useQuery({ queryKey: ['trainer-performance-criteria'], queryFn: async () => (await api.get<Criterion[]>('/club-trainer-performance/criteria')).data });
  const table = useClientTable(criteria, 50);
  const [title, setTitle] = useState(''); const [maxScore, setMaxScore] = useState('10'); const [description, setDescription] = useState('');
  const save = useMutation({ mutationFn: () => api.post('/club-trainer-performance/criteria', { title, maxScore: Number(maxScore), description }), onSuccess: () => { setTitle(''); setDescription(''); toast.success('تمت إضافة بند التقييم'); void qc.invalidateQueries({ queryKey: ['trainer-performance-criteria'] }); }, onError: (error) => toast.error(apiError(error)) });
  const toggle = useMutation({ mutationFn: (row: Criterion) => api.post('/club-trainer-performance/criteria', { id: row.id, title: row.title, description: row.description, maxScore: row.max_score, sortOrder: row.sort_order, isActive: !row.is_active }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['trainer-performance-criteria'] }), onError: (error) => toast.error(apiError(error)) });
  const columns = useMemo<ColumnDef<Criterion>[]>(() => [{ accessorKey: 'title', header: 'البند' }, { accessorKey: 'description', header: 'الوصف', cell: ({ getValue }) => getValue<string | null>() ?? '—' }, { accessorKey: 'max_score', header: 'الدرجة القصوى', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'is_active', header: 'الحالة', cell: ({ row }) => <Button size="sm" variant="outline" onClick={() => toggle.mutate(row.original)}>{row.original.is_active ? 'مفعل — إيقاف' : 'غير مفعل — تفعيل'}</Button> }], [toggle]);
  return <div className="space-y-6"><PageHeader title="بنود تقييم المدربين" description="تُحدَّد من الإدارة، ويستخدمها مدير الفرع عند إدخال تقييم المدرب الشهري." />
    <Card><CardHeader><CardTitle>إضافة بند</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-4"><div className="space-y-2"><Label>اسم البند</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} /></div><div className="space-y-2"><Label>الدرجة القصوى</Label><Input type="number" min="1" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} /></div><div className="space-y-2 md:col-span-2"><Label>وصف البند</Label><Input value={description} onChange={(event) => setDescription(event.target.value)} /></div><Button className="w-fit" disabled={!title.trim() || save.isPending} onClick={() => save.mutate()}><Plus className="size-4" />إضافة البند</Button></CardContent></Card>
    <DataTable columns={columns} {...table} isLoading={isLoading} emptyTitle="لا توجد بنود تقييم" />
  </div>;
}

export function FitnessTrainerEvaluationsPage() {
  const qc = useQueryClient(); const { data: trainers = [] } = useTrainers();
  const { data: branches = [] } = useBranches();
  const { data: criteria = [] } = useQuery({ queryKey: ['trainer-performance-criteria'], queryFn: async () => (await api.get<Criterion[]>('/club-trainer-performance/criteria')).data });
  const { trainerId, setTrainerId, selfOnly } = useTrainerChoice(trainers);
  const [month, setMonth] = useState(cairoMonth); const [notes, setNotes] = useState(''); const [scores, setScores] = useState<Record<number, string>>({}); const [branchId, setBranchId] = useState('');
  const trainer = trainers.find((row) => String(row.id) === trainerId);
  const { data: saved, isFetching } = useQuery({
    queryKey: ['trainer-performance', 'evaluation', trainerId, month],
    queryFn: async () => (await api.get<Evaluation | null>('/club-trainer-performance/evaluations', { params: { trainerId, month } })).data,
    enabled: Boolean(trainerId && month),
  });
  const { data: profile } = useProfile(trainerId, month);

  // Load the saved evaluation of the chosen trainer/month; start empty when there is none.
  useEffect(() => {
    setScores(Object.fromEntries((saved?.items ?? []).map((item) => [item.criterion_id, String(item.score)])));
    setNotes(saved?.notes ?? '');
    setBranchId(saved?.branch_id ? String(saved.branch_id) : trainer?.branchIds.length === 1 ? String(trainer.branchIds[0]) : '');
  }, [saved, trainerId, month, trainer]);

  // A trainer with no employee link may work in several branches (or none yet): the manager picks one.
  const needsBranch = Boolean(trainer) && trainer!.branchIds.length !== 1;
  const branchOptions = trainer?.branchIds.length ? branches.filter((b) => trainer.branchIds.includes(b.id)) : branches;
  const activeCriteria = criteria.filter((item) => item.is_active);
  const total = activeCriteria.reduce((sum, item) => sum + Number(scores[item.id] ?? 0), 0); const max = activeCriteria.reduce((sum, item) => sum + item.max_score, 0);
  const complete = activeCriteria.every((item) => scores[item.id] !== undefined && scores[item.id] !== '' && Number(scores[item.id]) >= 0 && Number(scores[item.id]) <= item.max_score);
  const save = useMutation({ mutationFn: () => api.post('/club-trainer-performance/evaluations', { trainerId: Number(trainerId), month, notes, branchId: branchId ? Number(branchId) : undefined, items: activeCriteria.map((item) => ({ criterionId: item.id, score: Number(scores[item.id]) })) }), onSuccess: () => { toast.success('تم حفظ التقييم الشهري'); void qc.invalidateQueries({ queryKey: ['trainer-performance'] }); }, onError: (error) => toast.error(apiError(error)) });
  return <div className="space-y-6"><PageHeader title="تقييم المدربين الشهري" description="يدخل مدير الفرع الدرجات للمدربين التابعين لفرعه فقط وفق البنود التي حددتها الإدارة. لو للمدرب تقييم محفوظ للشهر يظهر هنا ويمكن تعديله." />
    <Card className="max-w-4xl"><CardContent className="grid gap-4 pt-5 md:grid-cols-2"><div className="space-y-2"><Label>المدرب</Label><TrainerSelect value={trainerId} onChange={setTrainerId} trainers={trainers} locked={selfOnly} /></div><div className="space-y-2"><Label>الشهر</Label><Input type="month" value={selfOnly ? cairoMonth() : month} disabled={selfOnly} title={selfOnly ? 'الشهر الحالي' : undefined} onChange={(event) => setMonth(event.target.value || cairoMonth())} /></div>
      {needsBranch && <div className="space-y-2 md:col-span-2"><Label>الفرع *</Label><SearchableSelect className={SELECT_CLS} value={branchId} disabled={selfOnly} onChange={(event) => setBranchId(event.target.value)}><option value="">اختر الفرع</option>{branchOptions.map((b) => <option key={b.id} value={b.id}>{b.name ?? `#${b.id}`}</option>)}</SearchableSelect></div>}
      {trainerId && !isFetching && <p className="text-sm text-muted-foreground md:col-span-2">{saved ? 'يوجد تقييم محفوظ لهذا الشهر — التعديل يستبدله.' : 'لا يوجد تقييم لهذا الشهر بعد.'}</p>}
      {activeCriteria.map((item) => <div key={item.id} className="space-y-2"><Label>{item.title} — من {number(item.max_score)}</Label><Input type="number" min="0" max={item.max_score} className="nums" disabled={selfOnly || !trainerId} value={scores[item.id] ?? ''} onChange={(event) => setScores((old) => ({ ...old, [item.id]: event.target.value }))} /></div>)}
      <div className="space-y-2 md:col-span-2"><Label>ملاحظات</Label><Input value={notes} disabled={selfOnly} onChange={(event) => setNotes(event.target.value)} /></div><p className="font-semibold md:col-span-2">إجمالي التقييم: {number(total)} من {number(max)}</p>{selfOnly ? null : <Button className="w-fit" disabled={!trainerId || !activeCriteria.length || !complete || (needsBranch && !branchId) || isFetching || save.isPending} onClick={() => save.mutate()}><Save className="size-4" />حفظ التقييم</Button>}
    </CardContent></Card>
    {trainerId && profile && !selfOnly && <Card className="max-w-4xl"><CardHeader><CardTitle>تقييمات وإنجاز آخر ٦ شهور</CardTitle></CardHeader><CardContent><HistoryTable rows={profile.history} /></CardContent></Card>}
  </div>;
}

type BranchRow = { branchId: number; branchName: string; subscriptions: number; subscriptionValue: number; subscriptionCash: number; refunds: number; netSubscriptionCash: number; quickSales: number; quickSalesValue: number; totalValue: number };
type BranchTotals = { subscriptions: number; subscriptionCash: number; refunds: number; quickSales: number; quickSalesValue: number; totalValue: number };
type ReceptionRow = { id: number; date: string; receptionist: string; shift: string; subscriptions: number; subscriptionsValue: number; otherSales: number; totalSales: number; transactions: number; status: string };
type ShiftRow = { shiftId: number; shift: string; sessions: number; sales: number; transactions: number; averageSales: number };

function MonthInput({ month, setMonth }: { month: string; setMonth: (value: string) => void }) { return <Input aria-label="الشهر" className="w-40" type="month" value={month} onChange={(event) => setMonth(event.target.value || cairoMonth())} />; }

export function FitnessBranchAnalysisPage() {
  const [month, setMonth] = useState(cairoMonth); const { data, isLoading } = useQuery({ queryKey: ['trainer-performance', 'branches', month], queryFn: async () => (await api.get<{ rows: BranchRow[]; totals: BranchTotals }>('/club-trainer-performance/analytics/branches', { params: { month } })).data }); const rows = data?.rows ?? [];
  const table = useClientTable(rows, 50);
  const columns = useMemo<ColumnDef<BranchRow>[]>(() => [
    { accessorKey: 'branchName', header: 'الفرع' },
    { accessorKey: 'subscriptions', header: 'اشتراكات جديدة', cell: ({ getValue }) => number(getValue<number>()) },
    { accessorKey: 'subscriptionCash', header: 'تحصيل الاشتراكات', cell: ({ getValue }) => number(getValue<number>()) },
    { accessorKey: 'refunds', header: 'المرتجعات', cell: ({ getValue }) => number(getValue<number>()) },
    { accessorKey: 'quickSales', header: 'عدد المبيعات الأخرى', cell: ({ getValue }) => number(getValue<number>()) },
    { accessorKey: 'quickSalesValue', header: 'قيمة المبيعات الأخرى', cell: ({ getValue }) => number(getValue<number>()) },
    { accessorKey: 'totalValue', header: 'صافي التحصيل', cell: ({ getValue }) => <b className="nums">{number(getValue<number>())}</b> },
  ], []);
  const t = data?.totals;
  return <div className="space-y-6"><PageHeader title="تحليل الفروع" description="ما تم تحصيله فعلًا خلال الشهر: إيصالات الاشتراكات ناقص المرتجعات المصروفة + مبيعات الكافيه والخدمات. الاشتراكات الجديدة = المسجلة في الشهر بدون التحويلات." actions={<MonthInput month={month} setMonth={setMonth} />} /><div className="grid gap-4 md:grid-cols-4"><Metric label="الاشتراكات الجديدة" value={t?.subscriptions ?? 0} /><Metric label="صافي تحصيل الاشتراكات" value={(t?.subscriptionCash ?? 0) - (t?.refunds ?? 0)} hint={`مرتجعات ${number(t?.refunds ?? 0)}`} /><Metric label="المبيعات الأخرى (ج.م)" value={t?.quickSalesValue ?? 0} hint={`${number(t?.quickSales ?? 0)} عملية`} /><Metric label="صافي التحصيل" value={t?.totalValue ?? 0} /></div><DataTable columns={columns} {...table} isLoading={isLoading} emptyTitle="لا توجد بيانات للفترة المختارة" /></div>;
}

export function FitnessReceptionAnalysisPage() {
  const [month, setMonth] = useState(cairoMonth); const { data, isLoading } = useQuery({ queryKey: ['trainer-performance', 'reception', month], queryFn: async () => (await api.get<{ rows: ReceptionRow[] }>('/club-trainer-performance/analytics/reception', { params: { month } })).data }); const rows = data?.rows ?? [];
  const table = useClientTable(rows, 50);
  const columns = useMemo<ColumnDef<ReceptionRow>[]>(() => [{ accessorKey: 'date', header: 'التاريخ', cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue<string>())}</span> }, { accessorKey: 'receptionist', header: 'موظف الريسيبشن' }, { accessorKey: 'shift', header: 'الشِفت' }, { accessorKey: 'subscriptions', header: 'اشتراكات سجّلها', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'subscriptionsValue', header: 'تحصيل الاشتراكات', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'otherSales', header: 'مبيعات الشِفت', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'transactions', header: 'عمليات الشِفت', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'totalSales', header: 'الإجمالي', cell: ({ getValue }) => <b className="nums">{number(getValue<number>())}</b> }], []);
  return <div className="space-y-6"><PageHeader title="تحليل الريسيبشن" description="لكل شِفت: الاشتراكات التي سجّلها الموظف وإيصالاتها في نفس اليوم والفرع، ومبيعات الشِفت نفسه؛ بدون تارجت أو درجات تقييم." actions={<MonthInput month={month} setMonth={setMonth} />} /><DataTable columns={columns} {...table} isLoading={isLoading} emptyTitle="لا توجد شِفتات مسجلة للفترة المختارة" /></div>;
}

export function FitnessShiftAnalysisPage() {
  const [month, setMonth] = useState(cairoMonth); const { data, isLoading } = useQuery({ queryKey: ['trainer-performance', 'shifts', month], queryFn: async () => (await api.get<{ rows: ShiftRow[] }>('/club-trainer-performance/analytics/shifts', { params: { month } })).data }); const rows = data?.rows ?? [];
  const table = useClientTable(rows, 50);
  const columns = useMemo<ColumnDef<ShiftRow>[]>(() => [{ accessorKey: 'shift', header: 'الشِفت' }, { accessorKey: 'sessions', header: 'عدد الجلسات', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'transactions', header: 'عدد العمليات', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'sales', header: 'إجمالي المبيعات', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'averageSales', header: 'متوسط المبيعات', cell: ({ getValue }) => number(getValue<number>()) }], []);
  return <div className="space-y-6"><PageHeader title="تحليل الشِفتات" description="مقارنة الشِفتات حسب عدد الجلسات والعمليات وإجمالي المبيعات." actions={<MonthInput month={month} setMonth={setMonth} />} /><DataTable columns={columns} {...table} isLoading={isLoading} emptyTitle="لا توجد شِفتات مسجلة للفترة المختارة" /></div>;
}

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) { return <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold nums">{number(value)}</p>{hint && <p className="mt-1 text-xs text-muted-foreground nums">{hint}</p>}</CardContent></Card>; }
