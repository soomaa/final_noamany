import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';

type Trainer = { id: number; name: string };
type Criterion = { id: number; title: string; description: string | null; max_score: number; sort_order: number; is_active: boolean };
const currentMonth = () => new Date().toISOString().slice(0, 7);
const number = (value: number) => toArabicDigits(value.toLocaleString('en-US', { maximumFractionDigits: 2 }));

function TrainerSelect({ value, onChange, trainers }: { value: string; onChange: (value: string) => void; trainers: Trainer[] }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
    <option value="">اختر المدرب</option>
    {trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}
  </select>;
}

function useTrainers() {
  return useQuery({ queryKey: ['trainer-performance-trainers'], queryFn: async () => (await api.get<Trainer[]>('/club-trainer-performance/trainers')).data });
}

export function FitnessTrainerTargetsPage() {
  const qc = useQueryClient();
  const { data: trainers = [] } = useTrainers();
  const [trainerId, setTrainerId] = useState('');
  const [month, setMonth] = useState('');
  const [privateSalesTarget, setPrivateSalesTarget] = useState('0');
  const [subscriptionsTarget, setSubscriptionsTarget] = useState('0');
  const save = useMutation({ mutationFn: () => api.post('/club-trainer-performance/targets', { trainerId: Number(trainerId), month: month || undefined, privateSalesTarget: Number(privateSalesTarget), subscriptionsTarget: Number(subscriptionsTarget) }), onSuccess: () => { toast.success('تم حفظ التارجت'); void qc.invalidateQueries({ queryKey: ['trainer-performance'] }); }, onError: (error) => toast.error(apiError(error)) });

  return <div className="space-y-6">
    <PageHeader title="تارجت المدربين" description="تحديد تارجت ثابت لكل مدرب، أو تعديل استثنائي لشهر واحد مع الاحتفاظ بتاريخ الأشهر السابقة." />
    <Card className="max-w-3xl"><CardHeader><CardTitle>تارجت مدرب</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2"><Label>المدرب</Label><TrainerSelect value={trainerId} onChange={setTrainerId} trainers={trainers} /></div>
      <div className="space-y-2"><Label>تعديل لشهر محدد (اختياري)</Label><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div>
      <div className="space-y-2"><Label>تارجت مبيعات الخاص</Label><Input inputMode="decimal" value={privateSalesTarget} onChange={(event) => setPrivateSalesTarget(event.target.value)} /></div>
      <div className="space-y-2"><Label>تارجت عدد الاشتراكات</Label><Input type="number" min="0" value={subscriptionsTarget} onChange={(event) => setSubscriptionsTarget(event.target.value)} /></div>
      <div className="md:col-span-2"><Button disabled={!trainerId || save.isPending} onClick={() => save.mutate()}><Save className="size-4" />حفظ التارجت</Button></div>
    </CardContent></Card>
  </div>;
}

export function FitnessTrainerEvaluationCriteriaPage() {
  const qc = useQueryClient();
  const { data: criteria = [], isLoading } = useQuery({ queryKey: ['trainer-performance-criteria'], queryFn: async () => (await api.get<Criterion[]>('/club-trainer-performance/criteria')).data });
  const [title, setTitle] = useState(''); const [maxScore, setMaxScore] = useState('10'); const [description, setDescription] = useState('');
  const save = useMutation({ mutationFn: () => api.post('/club-trainer-performance/criteria', { title, maxScore: Number(maxScore), description }), onSuccess: () => { setTitle(''); setDescription(''); toast.success('تمت إضافة بند التقييم'); void qc.invalidateQueries({ queryKey: ['trainer-performance-criteria'] }); }, onError: (error) => toast.error(apiError(error)) });
  const columns = useMemo<ColumnDef<Criterion>[]>(() => [{ accessorKey: 'title', header: 'البند' }, { accessorKey: 'description', header: 'الوصف', cell: ({ getValue }) => getValue<string | null>() ?? '—' }, { accessorKey: 'max_score', header: 'الدرجة القصوى', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'is_active', header: 'الحالة', cell: ({ getValue }) => getValue<boolean>() ? 'مفعل' : 'غير مفعل' }], []);
  return <div className="space-y-6"><PageHeader title="بنود تقييم المدربين" description="تُحدَّد من الإدارة، ويستخدمها مدير الفرع عند إدخال تقييم المدرب الشهري." />
    <Card><CardHeader><CardTitle>إضافة بند</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-4"><div className="space-y-2"><Label>اسم البند</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} /></div><div className="space-y-2"><Label>الدرجة القصوى</Label><Input type="number" min="1" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} /></div><div className="space-y-2 md:col-span-2"><Label>وصف البند</Label><Input value={description} onChange={(event) => setDescription(event.target.value)} /></div><Button className="w-fit" disabled={!title.trim() || save.isPending} onClick={() => save.mutate()}><Plus className="size-4" />إضافة البند</Button></CardContent></Card>
    <DataTable columns={columns} data={criteria} total={criteria.length} page={1} pageSize={50} onPageChange={() => {}} onPageSizeChange={() => {}} isLoading={isLoading} emptyTitle="لا توجد بنود تقييم" />
  </div>;
}

export function FitnessTrainerEvaluationsPage() {
  const qc = useQueryClient(); const { data: trainers = [] } = useTrainers();
  const { data: criteria = [] } = useQuery({ queryKey: ['trainer-performance-criteria'], queryFn: async () => (await api.get<Criterion[]>('/club-trainer-performance/criteria')).data });
  const [trainerId, setTrainerId] = useState(''); const [month, setMonth] = useState(currentMonth); const [notes, setNotes] = useState(''); const [scores, setScores] = useState<Record<number, string>>({});
  const save = useMutation({ mutationFn: () => api.post('/club-trainer-performance/evaluations', { trainerId: Number(trainerId), month, notes, items: criteria.filter((item) => item.is_active).map((item) => ({ criterionId: item.id, score: Number(scores[item.id] ?? 0) })) }), onSuccess: () => { toast.success('تم حفظ التقييم الشهري'); void qc.invalidateQueries({ queryKey: ['trainer-performance'] }); }, onError: (error) => toast.error(apiError(error)) });
  const activeCriteria = criteria.filter((item) => item.is_active); const total = activeCriteria.reduce((sum, item) => sum + Number(scores[item.id] ?? 0), 0); const max = activeCriteria.reduce((sum, item) => sum + item.max_score, 0);
  return <div className="space-y-6"><PageHeader title="تقييم المدربين الشهري" description="يدخل مدير الفرع الدرجات للمدربين التابعين لفرعه فقط وفق البنود التي حددتها الإدارة." />
    <Card className="max-w-3xl"><CardContent className="grid gap-4 pt-5 md:grid-cols-2"><div className="space-y-2"><Label>المدرب</Label><TrainerSelect value={trainerId} onChange={setTrainerId} trainers={trainers} /></div><div className="space-y-2"><Label>الشهر</Label><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div>
      {activeCriteria.map((item) => <div key={item.id} className="space-y-2"><Label>{item.title} — من {number(item.max_score)}</Label><Input type="number" min="0" max={item.max_score} value={scores[item.id] ?? ''} onChange={(event) => setScores((old) => ({ ...old, [item.id]: event.target.value }))} /></div>)}
      <div className="space-y-2 md:col-span-2"><Label>ملاحظات</Label><Input value={notes} onChange={(event) => setNotes(event.target.value)} /></div><p className="font-semibold md:col-span-2">إجمالي التقييم: {number(total)} من {number(max)}</p><Button className="w-fit" disabled={!trainerId || !activeCriteria.length || save.isPending} onClick={() => save.mutate()}><Save className="size-4" />حفظ التقييم</Button>
    </CardContent></Card>
  </div>;
}

type BranchRow = { branchId: number; branchName: string; subscriptions: number; quickSales: number; totalValue: number };
type ReceptionRow = { id: number; date: string; receptionist: string; shift: string; subscriptions: number; otherSales: number; totalSales: number; transactions: number; status: string };
type ShiftRow = { shiftId: number; shift: string; sessions: number; sales: number; transactions: number; averageSales: number };

function MonthInput({ month, setMonth }: { month: string; setMonth: (value: string) => void }) { return <Input aria-label="الشهر" className="w-40" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />; }

export function FitnessBranchAnalysisPage() {
  const [month, setMonth] = useState(currentMonth); const { data, isLoading } = useQuery({ queryKey: ['trainer-performance', 'branches', month], queryFn: async () => (await api.get<{ rows: BranchRow[]; totals: { subscriptions: number; quickSales: number; totalValue: number } }>('/club-trainer-performance/analytics/branches', { params: { month } })).data }); const rows = data?.rows ?? [];
  const columns = useMemo<ColumnDef<BranchRow>[]>(() => [{ accessorKey: 'branchName', header: 'الفرع' }, { accessorKey: 'subscriptions', header: 'اشتراكات مسجلة', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'quickSales', header: 'مبيعات أخرى', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'totalValue', header: 'إجمالي المبيعات', cell: ({ getValue }) => number(getValue<number>()) }], []);
  return <div className="space-y-6"><PageHeader title="تحليل الفروع" description="مقارنة عدد الاشتراكات والمبيعات المسجلة بين الفروع خلال الشهر." actions={<MonthInput month={month} setMonth={setMonth} />} /><div className="grid gap-4 md:grid-cols-3"><Metric label="الاشتراكات" value={data?.totals.subscriptions ?? 0} /><Metric label="المبيعات الأخرى" value={data?.totals.quickSales ?? 0} /><Metric label="إجمالي المبيعات" value={data?.totals.totalValue ?? 0} /></div><DataTable columns={columns} data={rows} total={rows.length} page={1} pageSize={50} onPageChange={() => {}} onPageSizeChange={() => {}} isLoading={isLoading} emptyTitle="لا توجد بيانات للفترة المختارة" /></div>;
}

export function FitnessReceptionAnalysisPage() {
  const [month, setMonth] = useState(currentMonth); const { data, isLoading } = useQuery({ queryKey: ['trainer-performance', 'reception', month], queryFn: async () => (await api.get<{ rows: ReceptionRow[] }>('/club-trainer-performance/analytics/reception', { params: { month } })).data }); const rows = data?.rows ?? [];
  const columns = useMemo<ColumnDef<ReceptionRow>[]>(() => [{ accessorKey: 'date', header: 'التاريخ' }, { accessorKey: 'receptionist', header: 'موظف الريسيبشن' }, { accessorKey: 'shift', header: 'الشِفت' }, { accessorKey: 'transactions', header: 'عدد العمليات', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'totalSales', header: 'إجمالي المبيعات', cell: ({ getValue }) => number(getValue<number>()) }], []);
  return <div className="space-y-6"><PageHeader title="تحليل الريسيبشن" description="عرض المبيعات والعمليات المسجلة لكل موظف ريسيبشن في شِفتاته؛ بدون تارجت أو درجات تقييم." actions={<MonthInput month={month} setMonth={setMonth} />} /><DataTable columns={columns} data={rows} total={rows.length} page={1} pageSize={50} onPageChange={() => {}} onPageSizeChange={() => {}} isLoading={isLoading} emptyTitle="لا توجد شِفتات مسجلة للفترة المختارة" /></div>;
}

export function FitnessShiftAnalysisPage() {
  const [month, setMonth] = useState(currentMonth); const { data, isLoading } = useQuery({ queryKey: ['trainer-performance', 'shifts', month], queryFn: async () => (await api.get<{ rows: ShiftRow[] }>('/club-trainer-performance/analytics/shifts', { params: { month } })).data }); const rows = data?.rows ?? [];
  const columns = useMemo<ColumnDef<ShiftRow>[]>(() => [{ accessorKey: 'shift', header: 'الشِفت' }, { accessorKey: 'sessions', header: 'عدد الجلسات', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'transactions', header: 'عدد العمليات', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'sales', header: 'إجمالي المبيعات', cell: ({ getValue }) => number(getValue<number>()) }, { accessorKey: 'averageSales', header: 'متوسط المبيعات', cell: ({ getValue }) => number(getValue<number>()) }], []);
  return <div className="space-y-6"><PageHeader title="تحليل الشِفتات" description="مقارنة الشِفتات حسب عدد الجلسات والعمليات وإجمالي المبيعات." actions={<MonthInput month={month} setMonth={setMonth} />} /><DataTable columns={columns} data={rows} total={rows.length} page={1} pageSize={50} onPageChange={() => {}} onPageSizeChange={() => {}} isLoading={isLoading} emptyTitle="لا توجد شِفتات مسجلة للفترة المختارة" /></div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold nums">{number(value)}</p></CardContent></Card>; }
