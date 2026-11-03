import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Pencil, Search, Target, Users, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFitnessT } from '@/hooks/use-fitness-t';
import { api, apiError } from '@/lib/api';
import { FITNESS_ROUTES } from '@/lib/fitness-routes';
import { toArabicDigits } from '@/lib/utils';
import type { ClubTrainerRow, ClubTrainerSalaryRow } from '@/types/fitness';
import { cairoToday, fmtNumber, useClientTable } from './trainer-shared';

const LINKS = [
  { to: FITNESS_ROUTES.trainers.list, icon: Users, title: 'إدارة المدربين', desc: 'بيانات المدربين والربط بالموظفين' },
  { to: FITNESS_ROUTES.trainers.payments, icon: Wallet, title: 'مستحقات المدربين', desc: 'حساب المستحق وتسجيل الصرف' },
  { to: FITNESS_ROUTES.trainers.search, icon: Search, title: 'بحث عن المدرب', desc: 'حصص وحضور ومستحقات مدرب' },
  { to: FITNESS_ROUTES.trainers.targets, icon: Target, title: 'تارجت المدربين', desc: 'التارجت والإنجاز الشهري' },
  { to: FITNESS_ROUTES.trainers.evaluations, icon: ClipboardCheck, title: 'تقييم المدربين', desc: 'تقييم مدير الفرع الشهري' },
] as const;

type Row = ClubTrainerRow & { current: ClubTrainerSalaryRow | null; history: ClubTrainerSalaryRow[] };

/** The record whose dates cover `date` (latest start wins). */
function recordAt(rows: ClubTrainerSalaryRow[], date: string) {
  return rows
    .filter((r) => r.effectiveDate <= date && (!r.endDate || r.endDate >= date))
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? null;
}

const pct = (value: number | undefined) => `${fmtNumber(value ?? 0)}٪`;

export function FitnessTrainerSettingsPage() {
  const ft = useFitnessT();
  const qc = useQueryClient();
  const today = cairoToday();
  const { data: trainers, isLoading: loadingTrainers, isError, refetch } = useQuery({
    queryKey: ['club-trainers', 'compensation'],
    queryFn: async () => (await api.get<{ data: ClubTrainerRow[] }>('/club-trainers', { params: { page: 1, pageSize: 500 } })).data.data,
  });
  const { data: salaries, isLoading: loadingSalaries } = useQuery({
    queryKey: ['club-trainer-salaries', 'all'],
    queryFn: async () => (await api.get<{ data: ClubTrainerSalaryRow[] }>('/club-trainer-salaries', { params: { page: 1, pageSize: 500 } })).data.data,
  });
  const [search, setSearch] = useState('');
  const rows = useMemo<Row[]>(() => {
    const byTrainer = new Map<number, ClubTrainerSalaryRow[]>();
    for (const s of salaries ?? []) byTrainer.set(s.trainerId, [...(byTrainer.get(s.trainerId) ?? []), s]);
    const q = search.trim().toLowerCase();
    return (trainers ?? [])
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .map((t) => {
        const history = (byTrainer.get(t.id) ?? []).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
        return { ...t, history, current: recordAt(history, today) };
      });
  }, [trainers, salaries, search, today]);
  const table = useClientTable(rows);

  const [editing, setEditing] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ baseSalary: '0', classCommissionPercentage: '0', subscriptionCommissionPercentage: '0', effectiveDate: today, notes: '' });
  const openEdit = (row: Row) => {
    setEditing(row);
    setForm({
      baseSalary: String(row.current?.baseSalary ?? 0),
      classCommissionPercentage: String(row.current?.classCommissionPercentage ?? 0),
      subscriptionCommissionPercentage: String(row.current?.subscriptionCommissionPercentage ?? 0),
      effectiveDate: today,
      notes: '',
    });
  };
  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.post('/club-trainer-salaries', {
        trainerId: editing.id,
        baseSalary: Number(form.baseSalary || 0),
        classCommissionPercentage: Number(form.classCommissionPercentage || 0),
        subscriptionCommissionPercentage: Number(form.subscriptionCommissionPercentage || 0),
        effectiveDate: form.effectiveDate,
        notes: form.notes || undefined,
      });
      toast.success('تم حفظ نسب المدرب');
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ['club-trainer-salaries'] });
      await qc.invalidateQueries({ queryKey: ['club-trainer-earnings-summary'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<Row>[]>(() => [
    { accessorKey: 'name', header: 'المدرب', cell: ({ row }) => <span>{row.original.name}{row.original.isActive ? '' : <span className="ms-1 text-xs text-muted-foreground">(غير نشط)</span>}</span> },
    { id: 'kind', header: 'النوع', cell: ({ row }) => (row.original.employeeId ? 'موظف' : 'كابتن خارجي') },
    { id: 'classPct', header: 'عمولة الحصص', cell: ({ row }) => <span className="nums">{row.original.current ? pct(row.original.current.classCommissionPercentage) : '—'}</span> },
    { id: 'privatePct', header: 'نسبة البرايفت', cell: ({ row }) => <span className="nums">{row.original.current ? pct(row.original.current.subscriptionCommissionPercentage) : '—'}</span> },
    { id: 'base', header: 'الراتب الأساسي', cell: ({ row }) => <span className="nums">{row.original.current ? fmtNumber(row.original.current.baseSalary) : '—'}</span> },
    { id: 'since', header: 'سارية من', cell: ({ row }) => <span className="nums">{row.original.current ? toArabicDigits(row.original.current.effectiveDate) : <span className="text-amber-700">لم تُحدَّد — مستحقاته صفر</span>}</span> },
    { id: 'actions', header: ft('common.actions'), cell: ({ row }) => <Button size="sm" variant="outline" onClick={() => openEdit(row.original)}><Pencil className="size-4" />تعديل النسب</Button> },
  ], [ft, today]);

  return (
    <div className="space-y-6">
      <PageHeader title={ft('trainerSettings.title')} description="نسب العمولة لكل مدرب. أي تعديل يبدأ من تاريخ السريان، ويبقى الحساب القديم كما هو للأيام السابقة." />
      <DataTable
        columns={columns}
        {...table}
        search={search}
        onSearchChange={setSearch}
        isLoading={loadingTrainers || loadingSalaries}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ft('common.noData')}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map(({ to, icon: Icon, title, desc }) => (
          <Link key={to} to={to}>
            <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
      <Dialog open={editing != null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>نسب المدرب: {editing?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>عمولة الحصص الجماعية %</Label><Input type="number" min={0} max={100} step="0.01" className="nums" value={form.classCommissionPercentage} onChange={(e) => setForm((f) => ({ ...f, classCommissionPercentage: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>نسبة جلسات البرايفت %</Label><Input type="number" min={0} max={100} step="0.01" className="nums" value={form.subscriptionCommissionPercentage} onChange={(e) => setForm((f) => ({ ...f, subscriptionCommissionPercentage: e.target.value }))} /></div>
            </div>
            <p className="text-xs text-muted-foreground">عمولة الحصص تُحسب على سعر الحصة × عدد الأعضاء الحاضرين. نسبة البرايفت تُحسب عند كل حضور لجلسة برايفت.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>الراتب الأساسي</Label><Input type="number" min={0} step="0.01" className="nums" value={form.baseSalary} onChange={(e) => setForm((f) => ({ ...f, baseSalary: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>سارية من *</Label><Input type="date" className="nums" value={form.effectiveDate} onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))} /></div>
            </div>
            <p className="text-xs text-muted-foreground">الراتب الأساسي للعلم فقط ولا يدخل في مستحقات العمولات؛ راتب المدرب الموظف يُصرف من المرتبات.</p>
            <div className="grid gap-2"><Label>ملاحظات</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            {!!editing?.history.length && (
              <div className="space-y-1">
                <p className="text-sm font-medium">السجل</p>
                <ul className="max-h-40 divide-y overflow-y-auto rounded-lg border text-xs">
                  {editing.history.map((h) => (
                    <li key={h.id} className="flex flex-wrap justify-between gap-2 p-2 nums">
                      <span>{toArabicDigits(h.effectiveDate)} → {h.endDate ? toArabicDigits(h.endDate) : 'مستمر'}</span>
                      <span>حصص {pct(h.classCommissionPercentage)} — برايفت {pct(h.subscriptionCommissionPercentage)} — أساسي {fmtNumber(h.baseSalary)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{ft('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void save()} disabled={saving || !form.effectiveDate}>{ft('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
