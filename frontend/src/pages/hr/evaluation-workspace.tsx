import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, ClipboardList, History, Plus, Save, UsersRound } from 'lucide-react';
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useBranches } from '@/hooks/use-branches';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { calculateEvaluationTotal, compatibleEvaluationTemplates, normalizeTask8Tab } from '../task8-workspace-model';
import { EvaluationsPage } from './evaluations';

type RoleKey = 'trainer' | 'reception' | 'branch_manager';
type Question = { id: number; title: string; maxScore: number };
type Template = { id: number; role_key: RoleKey; title: string; version: number; branch_id?: number | null; questions: Question[] };
type MonthlyEvaluation = { id: number; employee_id: number; employeeName?: string | null; employeeCode?: number | null; template_id: number; templateTitle?: string | null; roleKey?: RoleKey | null; month_key: string; total_score: number | string; max_score: number | string; status: string };
type Filters = { monthKey: string; roleKey: string; branchId: string; employeeId: string };

const roleLabels: Record<RoleKey, string> = { trainer: 'المدربون', reception: 'الاستقبال', branch_manager: 'مديرو الفروع' };
const selectCls = 'flex h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm';
const tabs = ['criteria', 'monthly', 'reports', 'legacy'] as const;
const currentMonth = () => localToday().slice(0, 7);

export function EvaluationWorkspacePage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') === 'report' ? 'reports' : params.get('tab');
  const tab = normalizeTask8Tab(requestedTab, tabs, 'criteria');
  const { data: branches = [] } = useBranches();
  const { data: employees = [] } = useEmployeeOptions(tab === 'monthly' || tab === 'reports');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState<{ roleKey: RoleKey; title: string; branchId: string; questions: Array<{ title: string; maxScore: string }> }>({ roleKey: 'trainer', title: '', branchId: '', questions: [{ title: '', maxScore: '5' }] });
  const [monthlyForm, setMonthlyForm] = useState({ employeeId: '', templateId: '', monthKey: currentMonth(), scores: {} as Record<number, string>, notes: {} as Record<number, string> });
  const [filters, setFilters] = useState<Filters>({ monthKey: currentMonth(), roleKey: '', branchId: '', employeeId: '' });

  const templatesQuery = useQuery({ queryKey: ['hr/evaluations/templates'], queryFn: async ({ signal }) => (await api.get<Template[]>('/hr/evaluations/templates', { signal })).data });
  const monthlyQuery = useQuery({
    queryKey: ['hr/evaluations/monthly', filters],
    queryFn: async ({ signal }) => (await api.get<MonthlyEvaluation[]>('/hr/evaluations/monthly', { signal, params: { monthKey: filters.monthKey || undefined, roleKey: filters.roleKey || undefined, branchId: filters.branchId ? Number(filters.branchId) : undefined, employeeId: filters.employeeId ? Number(filters.employeeId) : undefined } })).data,
    enabled: tab === 'monthly' || tab === 'reports',
  });
  const activeTemplates = templatesQuery.data ?? [];
  const selectedEmployee = employees.find((item) => item.value === monthlyForm.employeeId);
  const compatibleTemplates = compatibleEvaluationTemplates(activeTemplates, {
    branchId: selectedEmployee?.branchId ?? null,
    jobTitle: selectedEmployee?.jobTitle,
  });
  const selectedTemplate = compatibleTemplates.find((item) => String(item.id) === monthlyForm.templateId);
  const totals = useMemo(() => calculateEvaluationTotal(selectedTemplate?.questions ?? [], monthlyForm.scores), [selectedTemplate, monthlyForm.scores]);

  const templateMutation = useMutation({
    mutationFn: () => api.post('/hr/evaluations/templates', { roleKey: templateForm.roleKey, title: templateForm.title.trim(), branchId: templateForm.branchId ? Number(templateForm.branchId) : undefined, questions: templateForm.questions.map((item) => ({ title: item.title.trim(), maxScore: Number(item.maxScore) })) }),
    onSuccess: () => { toast.success('تم حفظ إصدار جديد من النموذج'); setTemplateOpen(false); void qc.invalidateQueries({ queryKey: ['hr/evaluations/templates'] }); },
    onError: (error) => toast.error(apiError(error)),
  });
  const monthlyMutation = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) throw new Error('اختر نموذج التقييم');
      return api.post('/hr/evaluations/monthly', { employeeId: Number(monthlyForm.employeeId), templateId: selectedTemplate.id, templateVersion: selectedTemplate.version, monthKey: monthlyForm.monthKey, answers: selectedTemplate.questions.map((question) => ({ questionId: question.id, score: Number(monthlyForm.scores[question.id]), note: monthlyForm.notes[question.id] || undefined })) });
    },
    onSuccess: () => { toast.success('تم نشر التقييم الشهري في «تقييماتي»'); setMonthlyOpen(false); void qc.invalidateQueries({ queryKey: ['hr/evaluations/monthly'] }); },
    onError: (error) => toast.error(apiError(error)),
  });
  const openTemplate = (existing?: Template) => {
    setTemplateForm(existing ? { roleKey: existing.role_key, title: existing.title, branchId: existing.branch_id ? String(existing.branch_id) : '', questions: existing.questions.map((question) => ({ title: question.title, maxScore: String(question.maxScore) })) } : { roleKey: 'trainer', title: '', branchId: '', questions: [{ title: '', maxScore: '5' }] });
    setTemplateOpen(true);
  };
  const openMonthly = () => { setMonthlyForm({ employeeId: '', templateId: '', monthKey: currentMonth(), scores: {}, notes: {} }); setMonthlyOpen(true); };
  const changeTab = (value: string) => { const next = new URLSearchParams(params); next.set('tab', value); setParams(next, { replace: true }); };

  return <main className="space-y-5" dir="rtl">
    <PageHeader title="إدارة التقييمات" description="نماذج مستقلة حسب الدور، تقييم شهري منشور للموظف، وتقارير قابلة للمراجعة." />
    <Tabs value={tab} onValueChange={changeTab}>
      <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto sm:w-fit" aria-label="أقسام التقييمات">
        <TabsTrigger value="criteria" className="min-h-11 gap-2"><ClipboardList />المعايير والنماذج</TabsTrigger>
        <TabsTrigger value="monthly" className="min-h-11 gap-2"><CalendarCheck2 />التقييم الشهري</TabsTrigger>
        <TabsTrigger value="reports" className="min-h-11 gap-2"><UsersRound />التقارير</TabsTrigger>
        <TabsTrigger value="legacy" className="min-h-11 gap-2"><History />سجل فترة التجربة</TabsTrigger>
      </TabsList>
      <TabsContent value="criteria" className="mt-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm leading-6 text-muted-foreground">تعديل البنود ينشئ إصدارًا جديدًا؛ التقييمات السابقة تظل مرتبطة بالإصدار الذي استُخدم عند تسجيلها.</p><Button variant="brand" onClick={() => openTemplate()}><Plus />نموذج جديد</Button></div>
        {templatesQuery.isLoading ? <PageSkeleton /> : templatesQuery.isError ? <ErrorState onRetry={() => void templatesQuery.refetch()} /> : !activeTemplates.length ? <EmptyState title="لا توجد نماذج تقييم" description="أنشئ نموذجًا للمدربين أو الاستقبال أو مديري الفروع." action={<Button onClick={() => openTemplate()}>إنشاء أول نموذج</Button>} /> : <section className="grid gap-4 lg:grid-cols-3">{(['trainer', 'reception', 'branch_manager'] as RoleKey[]).map((role) => <RoleTemplates key={role} role={role} templates={activeTemplates.filter((item) => item.role_key === role)} onVersion={openTemplate} />)}</section>}
      </TabsContent>
      <TabsContent value="monthly" className="mt-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">كل تقييم منشور يظهر تلقائيًا للموظف في «تقييماتي».</p><Button variant="brand" onClick={openMonthly}><Plus />تقييم شهري جديد</Button></div><EvaluationFilters filters={filters} setFilters={setFilters} branches={branches} employees={employees} /><MonthlyTable query={monthlyQuery} /></TabsContent>
      <TabsContent value="reports" className="mt-5 space-y-4"><EvaluationFilters filters={filters} setFilters={setFilters} branches={branches} employees={employees} /><MonthlyTable query={monthlyQuery} report /></TabsContent>
      <TabsContent value="legacy" className="mt-5"><EvaluationsPage /></TabsContent>
    </Tabs>

    <Dialog open={templateOpen} onOpenChange={setTemplateOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}><DialogHeader><DialogTitle>إصدار نموذج تقييم</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="evaluation-role">الدور</Label><select id="evaluation-role" className={selectCls} value={templateForm.roleKey} onChange={(event) => setTemplateForm((form) => ({ ...form, roleKey: event.target.value as RoleKey }))}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><Label htmlFor="evaluation-branch">الفرع (اختياري)</Label><select id="evaluation-branch" className={selectCls} value={templateForm.branchId} onChange={(event) => setTemplateForm((form) => ({ ...form, branchId: event.target.value }))}><option value="">كل الفروع المسموحة</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div></div>
      <div><Label htmlFor="evaluation-template-title">اسم النموذج</Label><Input id="evaluation-template-title" value={templateForm.title} onChange={(event) => setTemplateForm((form) => ({ ...form, title: event.target.value }))} maxLength={255} /></div>
      <fieldset className="space-y-3"><legend className="font-medium">بنود التقييم</legend>{templateForm.questions.map((question, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_8rem_auto]"><div><Label htmlFor={`question-${index}`}>البند {index + 1}</Label><Input id={`question-${index}`} value={question.title} onChange={(event) => setTemplateForm((form) => ({ ...form, questions: form.questions.map((item, i) => i === index ? { ...item, title: event.target.value } : item) }))} maxLength={500} /></div><div><Label htmlFor={`question-score-${index}`}>الدرجة القصوى</Label><Input id={`question-score-${index}`} type="number" min="1" max="100" value={question.maxScore} onChange={(event) => setTemplateForm((form) => ({ ...form, questions: form.questions.map((item, i) => i === index ? { ...item, maxScore: event.target.value } : item) }))} /></div><Button type="button" variant="ghost" className="self-end" disabled={templateForm.questions.length === 1} onClick={() => setTemplateForm((form) => ({ ...form, questions: form.questions.filter((_, i) => i !== index) }))}>حذف</Button></div>)}<Button type="button" variant="outline" onClick={() => setTemplateForm((form) => ({ ...form, questions: [...form.questions, { title: '', maxScore: '5' }] }))}><Plus />إضافة بند</Button></fieldset>
      <DialogFooter><Button variant="outline" onClick={() => setTemplateOpen(false)}>إلغاء</Button><Button onClick={() => templateMutation.mutate()} disabled={templateMutation.isPending || !templateForm.title.trim() || templateForm.questions.some((item) => !item.title.trim() || Number(item.maxScore) <= 0)}><Save />{templateMutation.isPending ? 'جارٍ الحفظ…' : 'حفظ الإصدار'}</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={monthlyOpen} onOpenChange={setMonthlyOpen}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}><DialogHeader><DialogTitle>تقييم شهري جديد</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="monthly-employee">الموظف</Label><select id="monthly-employee" className={selectCls} value={monthlyForm.employeeId} onChange={(event) => setMonthlyForm((form) => ({ ...form, employeeId: event.target.value, templateId: '', scores: {}, notes: {} }))}><option value="">اختر الموظف</option>{employees.map((employee) => <option key={employee.value} value={employee.value}>{employee.label}</option>)}</select></div><div><Label htmlFor="monthly-month">الشهر</Label><Input id="monthly-month" type="month" value={monthlyForm.monthKey} onChange={(event) => setMonthlyForm((form) => ({ ...form, monthKey: event.target.value }))} /></div></div>
      <div><Label htmlFor="monthly-template">النموذج المطابق للدور والفرع</Label><select id="monthly-template" className={selectCls} value={monthlyForm.templateId} disabled={!selectedEmployee || compatibleTemplates.length === 0} onChange={(event) => setMonthlyForm((form) => ({ ...form, templateId: event.target.value, scores: {}, notes: {} }))}><option value="">{!selectedEmployee ? 'اختر الموظف أولًا' : compatibleTemplates.length ? 'اختر النموذج' : 'لا يوجد نموذج يطابق دور الموظف وفرعه'}</option>{compatibleTemplates.map((item) => <option key={item.id} value={item.id}>{roleLabels[item.role_key]} — {item.title} (الإصدار {item.version})</option>)}</select></div>
      {selectedTemplate ? <fieldset className="space-y-3"><legend className="font-medium">الدرجات</legend>{selectedTemplate.questions.map((question) => <div key={question.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_7rem]"><div className="min-w-0"><Label htmlFor={`monthly-score-${question.id}`} className="break-words">{question.title}</Label><Textarea aria-label={`ملاحظة ${question.title}`} placeholder="ملاحظة اختيارية" className="mt-2 min-h-16 text-base sm:text-sm" value={monthlyForm.notes[question.id] ?? ''} onChange={(event) => setMonthlyForm((form) => ({ ...form, notes: { ...form.notes, [question.id]: event.target.value } }))} /></div><div><Label htmlFor={`monthly-score-${question.id}`}>من {question.maxScore}</Label><Input id={`monthly-score-${question.id}`} type="number" min="0" max={question.maxScore} value={monthlyForm.scores[question.id] ?? ''} onChange={(event) => setMonthlyForm((form) => ({ ...form, scores: { ...form.scores, [question.id]: event.target.value } }))} /></div></div>)}<p className="rounded-lg bg-muted/50 p-3 text-sm font-medium" role="status">الإجمالي: <span className="tabular-nums">{totals.total} / {totals.maximum}</span></p></fieldset> : null}
      <DialogFooter><Button variant="outline" onClick={() => setMonthlyOpen(false)}>إلغاء</Button><Button onClick={() => monthlyMutation.mutate()} disabled={monthlyMutation.isPending || !monthlyForm.employeeId || !selectedTemplate || selectedTemplate.questions.some((question) => monthlyForm.scores[question.id] == null || monthlyForm.scores[question.id] === '')}><Save />{monthlyMutation.isPending ? 'جارٍ النشر…' : 'حفظ ونشر'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </main>;
}

function RoleTemplates({ role, templates, onVersion }: { role: RoleKey; templates: Template[]; onVersion: (item: Template) => void }) {
  return <article className="min-w-0 rounded-xl border bg-card p-4"><h2 className="font-semibold">{roleLabels[role]}</h2><p className="mt-1 text-xs text-muted-foreground">{templates.length ? `${templates.length} نموذج نشط` : 'لا يوجد نموذج نشط'}</p><div className="mt-4 space-y-3">{templates.map((item) => <div key={item.id} className="rounded-lg bg-muted/35 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">الإصدار {item.version} · {item.questions.length} بنود</p></div><Button variant="ghost" size="sm" onClick={() => onVersion(item)}>إصدار جديد</Button></div><ul className="mt-3 space-y-1.5 text-sm">{item.questions.map((question) => <li key={question.id} className="flex justify-between gap-3"><span className="min-w-0 break-words">{question.title}</span><span className="shrink-0 tabular-nums text-muted-foreground">/{question.maxScore}</span></li>)}</ul></div>)}</div></article>;
}

function EvaluationFilters({ filters, setFilters, branches, employees }: { filters: Filters; setFilters: Dispatch<SetStateAction<Filters>>; branches: Array<{ id: number; name: string | null }>; employees: Array<{ value: string; label: string }> }) {
  return <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="فلاتر تقرير التقييمات"><div><Label htmlFor="evaluation-filter-month">الشهر</Label><Input id="evaluation-filter-month" type="month" value={filters.monthKey} onChange={(event) => setFilters((value) => ({ ...value, monthKey: event.target.value }))} /></div><div><Label htmlFor="evaluation-filter-role">الدور</Label><select id="evaluation-filter-role" className={selectCls} value={filters.roleKey} onChange={(event) => setFilters((value) => ({ ...value, roleKey: event.target.value }))}><option value="">كل الأدوار</option>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><Label htmlFor="evaluation-filter-branch">الفرع</Label><select id="evaluation-filter-branch" className={selectCls} value={filters.branchId} onChange={(event) => setFilters((value) => ({ ...value, branchId: event.target.value }))}><option value="">الفروع المسموحة</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div><div><Label htmlFor="evaluation-filter-employee">الموظف</Label><select id="evaluation-filter-employee" className={selectCls} value={filters.employeeId} onChange={(event) => setFilters((value) => ({ ...value, employeeId: event.target.value }))}><option value="">كل الموظفين</option>{employees.map((employee) => <option key={employee.value} value={employee.value}>{employee.label}</option>)}</select></div></section>;
}

function MonthlyTable({ query, report = false }: { query: { data?: MonthlyEvaluation[]; isLoading: boolean; isError: boolean; refetch: () => unknown }; report?: boolean }) {
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  const rows = query.data ?? [];
  if (!rows.length) return <EmptyState title={report ? 'لا توجد نتائج ضمن الفلاتر' : 'لا توجد تقييمات لهذا الشهر'} />;
  return <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[720px] text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3 text-start">الموظف</th><th className="p-3 text-start">الدور والنموذج</th><th className="p-3 text-start">الشهر</th><th className="p-3 text-start">النتيجة</th><th className="p-3 text-start">الحالة</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><td className="p-3"><p className="font-medium">{row.employeeName || `موظف #${row.employee_id}`}</p><p className="text-xs text-muted-foreground">{row.employeeCode ? `كود ${row.employeeCode}` : '—'}</p></td><td className="p-3"><p>{row.roleKey ? roleLabels[row.roleKey] : '—'}</p><p className="text-xs text-muted-foreground">{row.templateTitle || `نموذج #${row.template_id}`}</p></td><td className="p-3 tabular-nums">{row.month_key}</td><td className="p-3 font-semibold tabular-nums">{Number(row.total_score)} / {Number(row.max_score)}</td><td className="p-3"><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">منشور</span></td></tr>)}</tbody></table></div>;
}
