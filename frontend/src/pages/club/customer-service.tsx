import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Download, MessageSquareText, Pencil, PhoneCall, Plus, Save, Star, UsersRound } from 'lucide-react';
import { useState } from 'react';
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
import { api, apiError } from '@/lib/api';
import { toCsvWithBom } from '@/lib/csv';
import { localToday } from '@/lib/formatters';
import { buildCustomerServiceParams, normalizeTask8Tab } from '../task8-workspace-model';

type CustomerTab = 'customers' | 'follow-up' | 'questions' | 'opinions';
type Filters = { branchId: string; gender: string; membershipStatus: string; dateFrom: string; dateTo: string };
type RosterFilters = { branchId: string; gender: string; status: 'ongoing' | 'expired'; dateFrom: string; dateTo: string };
type RosterRow = {
  subscriptionId: number;
  subscriptionNumber: string | null;
  subscriptionType: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string | null;
  branchId: number;
  memberId: number;
  memberName: string | null;
  memberCode: string | null;
  memberPhone: string | null;
  gender: string | null;
};
type FollowUp = { id: number; member_id?: number | null; memberName?: string | null; memberCode?: string | null; memberPhone?: string | null; subscriptionNumber?: string | null; subscriptionStartDate?: string | null; subscriptionEndDate?: string | null; contact_date: string; note?: string | null; opinion?: string | null; membership_status?: string | null; gender?: string | null };
type Question = { id: number; title: string; version: number; branch_id?: number | null; is_active: boolean };
type Member = { id: number; name: string; memberCode?: string; member_code?: string; phone?: string | null; branchId?: number; branch_id?: number };
type Answer = { id: number; question_title: string; question_version: number; answer: string };
type Detail = FollowUp & { answers: Answer[] };

const tabs = ['customers', 'follow-up', 'questions', 'opinions'] as const;
const selectCls = 'flex h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm';
const genderLabels: Record<string, string> = { male: 'رجالي', female: 'حريمي' };
const statusLabels: Record<string, string> = { active: 'اشتراك جارٍ', expired: 'اشتراك منتهٍ' };

export function CustomerServicePage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = normalizeTask8Tab(params.get('tab'), tabs, 'customers');
  const { data: branches = [] } = useBranches();
  const [filters, setFilters] = useState<Filters>({ branchId: '', gender: '', membershipStatus: '', dateFrom: '', dateTo: '' });
  const [rosterFilters, setRosterFilters] = useState<RosterFilters>({ branchId: '', gender: '', status: 'ongoing', dateFrom: '', dateTo: '' });
  const [callOpen, setCallOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [questionTitle, setQuestionTitle] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [callForm, setCallForm] = useState({ branchId: '', subscriptionId: '', contactDate: localToday(), gender: '', membershipStatus: '', note: '', opinion: '', answers: {} as Record<number, string> });
  const questionBranch = callOpen ? callForm.branchId : filters.branchId;
  const questionsComplete = (questionsQueryData: Question[] | undefined) => (questionsQueryData ?? []).every((question) => callForm.answers[question.id]?.trim());

  const listQuery = useQuery({
    queryKey: ['customer-service', tab, filters],
    queryFn: async ({ signal }) => (await api.get<{ data: FollowUp[]; total: number }>(tab === 'opinions' ? '/club/customer-service/opinions' : '/club/customer-service/follow-ups', { signal, params: { ...buildCustomerServiceParams(tab === 'opinions' ? 'opinions' : 'follow-up', filters), pageSize: 100 } })).data,
    enabled: tab === 'follow-up' || tab === 'opinions',
  });
  const rosterQuery = useQuery({
    queryKey: ['customer-service/customers', rosterFilters],
    queryFn: async ({ signal }) => (await api.get<{ data: RosterRow[]; total: number }>('/club/customer-service/customers', {
      signal,
      params: {
        status: rosterFilters.status,
        branchId: rosterFilters.branchId ? Number(rosterFilters.branchId) : undefined,
        gender: rosterFilters.gender || undefined,
        dateFrom: rosterFilters.dateFrom || undefined,
        dateTo: rosterFilters.dateTo || undefined,
        pageSize: 100,
      },
    })).data,
    enabled: tab === 'customers',
  });
  const questionsQuery = useQuery({
    queryKey: ['customer-service/questions', questionBranch],
    queryFn: async ({ signal }) => (await api.get<Question[]>('/club/customer-service/questions', { signal, params: { branchId: questionBranch ? Number(questionBranch) : undefined } })).data,
  });
  const memberQuery = useQuery({
    queryKey: ['customer-service/member-search', memberSearch],
    queryFn: async ({ signal }) => (await api.get<{ data: Member[] }>('/club-members', { signal, params: { search: memberSearch.trim(), pageSize: 10 } })).data.data,
    enabled: callOpen && memberSearch.trim().length >= 2,
  });
  const detailQuery = useQuery({ queryKey: ['customer-service/follow-up', detailId], queryFn: async ({ signal }) => (await api.get<Detail>(`/club/customer-service/follow-ups/${detailId}`, { signal })).data, enabled: detailId != null });

  const interactionMutation = useMutation({
    mutationFn: () => api.post('/club/customer-service/follow-ups', { memberId: selectedMember?.id, subscriptionId: callForm.subscriptionId ? Number(callForm.subscriptionId) : undefined, branchId: Number(callForm.branchId), gender: callForm.gender || undefined, membershipStatus: callForm.membershipStatus || undefined, contactDate: callForm.contactDate, note: callForm.note || undefined, opinion: callForm.opinion || undefined, answers: (questionsQuery.data ?? []).map((question) => ({ questionId: question.id, answer: callForm.answers[question.id] ?? '' })).filter((answer) => answer.answer.trim()) }),
    onSuccess: () => { toast.success('تم تسجيل المكالمة وإجاباتها'); setCallOpen(false); void qc.invalidateQueries({ queryKey: ['customer-service'] }); },
    onError: (error) => toast.error(apiError(error)),
  });
  const questionMutation = useMutation({
    mutationFn: () => editingQuestion ? api.patch(`/club/customer-service/questions/${editingQuestion.id}`, { title: questionTitle.trim() }) : api.post('/club/customer-service/questions', { title: questionTitle.trim(), branchId: filters.branchId ? Number(filters.branchId) : undefined }),
    onSuccess: () => { toast.success(editingQuestion ? 'تم إنشاء إصدار جديد من السؤال' : 'تمت إضافة السؤال'); setQuestionOpen(false); void qc.invalidateQueries({ queryKey: ['customer-service/questions'] }); },
    onError: (error) => toast.error(apiError(error)),
  });

  const changeTab = (value: string) => { const next = new URLSearchParams(params); next.set('tab', value); setParams(next, { replace: true }); };
  const openCall = () => { setSelectedMember(null); setMemberSearch(''); setCallForm({ branchId: filters.branchId || (branches[0]?.id ? String(branches[0].id) : ''), subscriptionId: '', contactDate: localToday(), gender: filters.gender, membershipStatus: filters.membershipStatus, note: '', opinion: '', answers: {} }); setCallOpen(true); };
  const openCallForCustomer = (row: RosterRow) => {
    setSelectedMember({ id: row.memberId, name: row.memberName ?? '', memberCode: row.memberCode ?? undefined, phone: row.memberPhone, branchId: row.branchId });
    setMemberSearch(row.memberName ?? '');
    setCallForm({ branchId: String(row.branchId), subscriptionId: String(row.subscriptionId), contactDate: localToday(), gender: row.gender ?? '', membershipStatus: row.status === 'active' ? 'active' : row.status ?? '', note: '', opinion: '', answers: {} });
    setCallOpen(true);
  };
  const openQuestion = (question?: Question) => { setEditingQuestion(question ?? null); setQuestionTitle(question?.title ?? ''); setQuestionOpen(true); };
  const exportRows = () => {
    if (tab === 'customers') {
      const rows = rosterQuery.data?.data ?? [];
      if (!rows.length) return toast.error('لا توجد بيانات للتصدير');
      const csv = toCsvWithBom([['العميل', 'الكود', 'الهاتف', 'الاشتراك', 'من', 'إلى', 'القسم'], ...rows.map((row) => [row.memberName ?? '', row.memberCode ?? '', row.memberPhone ?? '', row.subscriptionNumber ?? '', row.startDate ?? '', row.endDate ?? '', genderLabels[row.gender ?? ''] ?? ''])]);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `customer-service-customers-${rosterFilters.status}-${localToday()}.csv`; link.click(); URL.revokeObjectURL(url);
      return;
    }
    const rows = listQuery.data?.data ?? [];
    if (!rows.length) return toast.error('لا توجد بيانات للتصدير');
    const csv = toCsvWithBom([['التاريخ', 'العميل', 'الكود', 'الهاتف', 'الاشتراك', 'الملاحظة', 'الرأي'], ...rows.map((row) => [row.contact_date, row.memberName ?? '', row.memberCode ?? '', row.memberPhone ?? '', row.subscriptionNumber ?? '', row.note ?? '', row.opinion ?? ''])]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `customer-service-${tab}-${localToday()}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <main className="space-y-5" dir="rtl">
    <PageHeader title="خدمة العملاء" description="قائمة العملاء بحسب حالة الاشتراك، وسجل المتابعات، وأسئلة المكالمات، وآراء العملاء." />
    <Tabs value={tab} onValueChange={changeTab}>
      <div className="flex flex-wrap items-center justify-between gap-3"><TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto sm:w-fit" aria-label="أقسام خدمة العملاء"><TabsTrigger value="customers" className="min-h-11 gap-2"><UsersRound />العملاء</TabsTrigger><TabsTrigger value="follow-up" className="min-h-11 gap-2"><MessageSquareText />سجل المتابعات</TabsTrigger><TabsTrigger value="questions" className="min-h-11 gap-2"><ClipboardCheck />الأسئلة والردود</TabsTrigger><TabsTrigger value="opinions" className="min-h-11 gap-2"><Star />آراء العملاء</TabsTrigger></TabsList><div className="flex gap-2">{tab !== 'questions' ? <Button variant="outline" onClick={exportRows}><Download />تصدير</Button> : null}<Button variant="brand" onClick={tab === 'questions' ? () => openQuestion() : openCall}><Plus />{tab === 'questions' ? 'سؤال جديد' : 'تسجيل مكالمة'}</Button></div></div>
      <TabsContent value="customers" className="mt-5 space-y-4"><RosterFiltersPanel filters={rosterFilters} setFilters={setRosterFilters} branches={branches} /><RosterList query={rosterQuery} onCall={openCallForCustomer} status={rosterFilters.status} /></TabsContent>
      <TabsContent value="follow-up" className="mt-5 space-y-4"><CustomerFilters filters={filters} setFilters={setFilters} branches={branches} /><InteractionList query={listQuery} onDetail={setDetailId} opinionOnly={false} /></TabsContent>
      <TabsContent value="questions" className="mt-5">{questionsQuery.isLoading ? <PageSkeleton /> : questionsQuery.isError ? <ErrorState onRetry={() => void questionsQuery.refetch()} /> : !(questionsQuery.data?.length) ? <EmptyState title="لا توجد أسئلة متابعة" description="أضف البنود التي يجيب عنها موظف خدمة العملاء في كل مكالمة." /> : <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3 text-start">السؤال</th><th className="p-3 text-start">الإصدار</th><th className="p-3 text-start">النطاق</th><th className="p-3 text-start">الإجراء</th></tr></thead><tbody>{questionsQuery.data.map((question) => <tr key={question.id} className="border-t"><td className="max-w-xl break-words p-3 font-medium">{question.title}</td><td className="p-3 tabular-nums">{question.version}</td><td className="p-3">{question.branch_id ? `فرع ${question.branch_id}` : 'كل الفروع'}</td><td className="p-3"><Button variant="ghost" size="sm" onClick={() => openQuestion(question)}><Pencil />إصدار معدل</Button></td></tr>)}</tbody></table></div>}</TabsContent>
      <TabsContent value="opinions" className="mt-5 space-y-4"><CustomerFilters filters={filters} setFilters={setFilters} branches={branches} /><InteractionList query={listQuery} onDetail={setDetailId} opinionOnly /></TabsContent>
    </Tabs>

    <Dialog open={callOpen} onOpenChange={setCallOpen}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}><DialogHeader><DialogTitle>تسجيل مكالمة خدمة عملاء</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="cs-branch">الفرع</Label><select id="cs-branch" className={selectCls} value={callForm.branchId} onChange={(event) => setCallForm((form) => ({ ...form, branchId: event.target.value }))}><option value="">اختر الفرع</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div><div><Label htmlFor="cs-contact-date">تاريخ المتابعة</Label><Input id="cs-contact-date" type="date" value={callForm.contactDate} onChange={(event) => setCallForm((form) => ({ ...form, contactDate: event.target.value }))} /></div></div>
      <div><Label htmlFor="cs-member-search">العميل</Label><Input id="cs-member-search" placeholder="ابحث بالاسم أو الكود أو الهاتف" value={memberSearch} onChange={(event) => { setMemberSearch(event.target.value); setSelectedMember(null); }} />{selectedMember ? <p className="mt-2 rounded-lg bg-primary/10 p-3 text-sm">تم اختيار: <strong>{selectedMember.name}</strong> · {selectedMember.memberCode ?? selectedMember.member_code ?? '—'} · {selectedMember.phone ?? '—'}</p> : memberQuery.data?.length ? <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border p-1">{memberQuery.data.map((member) => <button key={member.id} type="button" className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 text-start text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setSelectedMember(member); setMemberSearch(member.name); setCallForm((form) => ({ ...form, branchId: String(member.branchId ?? member.branch_id ?? form.branchId) })); }}><span>{member.name}</span><span className="text-muted-foreground">{member.memberCode ?? member.member_code ?? member.phone}</span></button>)}</div> : null}</div>
      <div className="grid gap-4 sm:grid-cols-3"><div><Label htmlFor="cs-subscription">رقم سجل الاشتراك (اختياري)</Label><Input id="cs-subscription" inputMode="numeric" value={callForm.subscriptionId} onChange={(event) => setCallForm((form) => ({ ...form, subscriptionId: event.target.value }))} /></div><div><Label htmlFor="cs-gender">القسم</Label><select id="cs-gender" className={selectCls} value={callForm.gender} onChange={(event) => setCallForm((form) => ({ ...form, gender: event.target.value }))}><option value="">غير محدد</option><option value="male">رجالي</option><option value="female">حريمي</option></select></div><div><Label htmlFor="cs-status">حالة الاشتراك</Label><select id="cs-status" className={selectCls} value={callForm.membershipStatus} onChange={(event) => setCallForm((form) => ({ ...form, membershipStatus: event.target.value }))}><option value="">غير محدد</option><option value="active">جارٍ</option><option value="expired">منتهٍ</option></select></div></div>
      <div><Label htmlFor="cs-note">ملاحظة المتابعة</Label><Textarea id="cs-note" className="text-base sm:text-sm" value={callForm.note} onChange={(event) => setCallForm((form) => ({ ...form, note: event.target.value }))} maxLength={4000} /></div><div><Label htmlFor="cs-opinion">رأي العميل</Label><Textarea id="cs-opinion" className="text-base sm:text-sm" value={callForm.opinion} onChange={(event) => setCallForm((form) => ({ ...form, opinion: event.target.value }))} maxLength={4000} /></div>
      {(questionsQuery.data?.length ?? 0) > 0 ? <fieldset className="space-y-3"><legend className="font-medium">إجابات أسئلة المتابعة</legend>{questionsQuery.data!.map((question) => <div key={question.id}><Label htmlFor={`cs-answer-${question.id}`}>{question.title}</Label><Textarea id={`cs-answer-${question.id}`} className="mt-1 text-base sm:text-sm" value={callForm.answers[question.id] ?? ''} onChange={(event) => setCallForm((form) => ({ ...form, answers: { ...form.answers, [question.id]: event.target.value } }))} /></div>)}</fieldset> : null}
      <DialogFooter><Button variant="outline" onClick={() => setCallOpen(false)}>إلغاء</Button><Button onClick={() => interactionMutation.mutate()} disabled={interactionMutation.isPending || !callForm.branchId || !questionsComplete(questionsQuery.data) || (!callForm.note.trim() && !callForm.opinion.trim() && !Object.values(callForm.answers).some((answer) => answer.trim()))}><PhoneCall />{interactionMutation.isPending ? 'جارٍ التسجيل…' : 'تسجيل المكالمة'}</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={questionOpen} onOpenChange={setQuestionOpen}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>{editingQuestion ? 'إصدار معدل من السؤال' : 'سؤال متابعة جديد'}</DialogTitle></DialogHeader><div><Label htmlFor="cs-question-title">نص السؤال</Label><Textarea id="cs-question-title" className="text-base sm:text-sm" value={questionTitle} onChange={(event) => setQuestionTitle(event.target.value)} maxLength={500} /></div><DialogFooter><Button variant="outline" onClick={() => setQuestionOpen(false)}>إلغاء</Button><Button onClick={() => questionMutation.mutate()} disabled={questionMutation.isPending || !questionTitle.trim()}><Save />حفظ</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={detailId != null} onOpenChange={(open) => !open && setDetailId(null)}><DialogContent className="max-h-[88dvh] overflow-y-auto" aria-describedby={undefined}><DialogHeader><DialogTitle>تفاصيل المتابعة</DialogTitle></DialogHeader>{detailQuery.isLoading ? <PageSkeleton /> : detailQuery.isError ? <ErrorState onRetry={() => void detailQuery.refetch()} /> : detailQuery.data ? <div className="space-y-4 text-sm"><div className="grid gap-3 sm:grid-cols-2"><Info label="التاريخ" value={detailQuery.data.contact_date} /><Info label="الملاحظة" value={detailQuery.data.note} /><Info label="رأي العميل" value={detailQuery.data.opinion} /></div>{detailQuery.data.answers.length ? <div><h3 className="font-medium">الإجابات المحفوظة</h3><div className="mt-2 space-y-2">{detailQuery.data.answers.map((answer) => <div key={answer.id} className="rounded-lg border p-3"><p className="font-medium">{answer.question_title} <span className="text-xs text-muted-foreground">(إصدار {answer.question_version})</span></p><p className="mt-1 break-words text-muted-foreground">{answer.answer}</p></div>)}</div></div> : <p className="text-muted-foreground">لا توجد إجابات مسجلة.</p>}</div> : null}</DialogContent></Dialog>
  </main>;
}

function RosterFiltersPanel({ filters, setFilters, branches }: { filters: RosterFilters; setFilters: (next: RosterFilters) => void; branches: Array<{ id: number; name: string | null }> }) {
  const field = <K extends keyof RosterFilters>(key: K, value: RosterFilters[K]) => setFilters({ ...filters, [key]: value });
  return <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="فلاتر تقرير العملاء">
    <div><Label htmlFor="cs-roster-status">حالة الاشتراك</Label><select id="cs-roster-status" className={selectCls} value={filters.status} onChange={(event) => field('status', event.target.value as RosterFilters['status'])}><option value="ongoing">اشتراكات جارية</option><option value="expired">اشتراكات منتهية</option></select></div>
    <div><Label htmlFor="cs-roster-from">من</Label><Input id="cs-roster-from" type="date" value={filters.dateFrom} onChange={(event) => field('dateFrom', event.target.value)} /></div>
    <div><Label htmlFor="cs-roster-to">إلى</Label><Input id="cs-roster-to" type="date" value={filters.dateTo} onChange={(event) => field('dateTo', event.target.value)} /></div>
    <div><Label htmlFor="cs-roster-branch">الفرع</Label><select id="cs-roster-branch" className={selectCls} value={filters.branchId} onChange={(event) => field('branchId', event.target.value)}><option value="">الفروع المسموحة</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
    <div><Label htmlFor="cs-roster-gender">القسم</Label><select id="cs-roster-gender" className={selectCls} value={filters.gender} onChange={(event) => field('gender', event.target.value)}><option value="">الكل</option><option value="male">رجالي</option><option value="female">حريمي</option></select></div>
  </section>;
}

function RosterList({ query, onCall, status }: { query: { data?: { data: RosterRow[]; total: number }; isLoading: boolean; isError: boolean; refetch: () => unknown }; onCall: (row: RosterRow) => void; status: 'ongoing' | 'expired' }) {
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  const rows = query.data?.data ?? [];
  if (!rows.length) return <EmptyState title={status === 'ongoing' ? 'لا يوجد عملاء باشتراكات جارية ضمن النطاق' : 'لا يوجد عملاء باشتراكات منتهية ضمن النطاق'} />;
  return <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[820px] text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3 text-start">العميل</th><th className="p-3 text-start">الكود</th><th className="p-3 text-start">الهاتف</th><th className="p-3 text-start">الاشتراك</th><th className="p-3 text-start">من — إلى</th><th className="p-3 text-start">القسم</th><th className="p-3 text-start">الإجراء</th></tr></thead><tbody>{rows.map((row) => <tr key={row.subscriptionId} className="border-t align-top"><td className="p-3 font-medium">{row.memberName ?? `عضو #${row.memberId}`}</td><td className="p-3 tabular-nums">{row.memberCode ?? '—'}</td><td className="p-3 tabular-nums">{row.memberPhone ?? '—'}</td><td className="p-3">{row.subscriptionType ?? row.subscriptionNumber ?? '—'}</td><td className="p-3 tabular-nums">{row.startDate ?? '—'} — {row.endDate ?? '—'}</td><td className="p-3">{genderLabels[row.gender ?? ''] ?? '—'}</td><td className="p-3"><Button variant="ghost" size="sm" onClick={() => onCall(row)}><PhoneCall />إضافة ملاحظة</Button></td></tr>)}</tbody></table></div>;
}

function CustomerFilters({ filters, setFilters, branches }: { filters: Filters; setFilters: (next: Filters) => void; branches: Array<{ id: number; name: string | null }> }) {
  const field = (key: keyof Filters, value: string) => setFilters({ ...filters, [key]: value });
  return <section className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="فلاتر خدمة العملاء"><div><Label htmlFor="cs-filter-from">من</Label><Input id="cs-filter-from" type="date" value={filters.dateFrom} onChange={(event) => field('dateFrom', event.target.value)} /></div><div><Label htmlFor="cs-filter-to">إلى</Label><Input id="cs-filter-to" type="date" value={filters.dateTo} onChange={(event) => field('dateTo', event.target.value)} /></div><div><Label htmlFor="cs-filter-branch">الفرع</Label><select id="cs-filter-branch" className={selectCls} value={filters.branchId} onChange={(event) => field('branchId', event.target.value)}><option value="">الفروع المسموحة</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div><div><Label htmlFor="cs-filter-gender">القسم</Label><select id="cs-filter-gender" className={selectCls} value={filters.gender} onChange={(event) => field('gender', event.target.value)}><option value="">الكل</option><option value="male">رجالي</option><option value="female">حريمي</option></select></div><div><Label htmlFor="cs-filter-status">الاشتراك</Label><select id="cs-filter-status" className={selectCls} value={filters.membershipStatus} onChange={(event) => field('membershipStatus', event.target.value)}><option value="">الكل</option><option value="active">جارٍ</option><option value="expired">منتهٍ</option></select></div></section>;
}

function InteractionList({ query, onDetail, opinionOnly }: { query: { data?: { data: FollowUp[]; total: number }; isLoading: boolean; isError: boolean; refetch: () => unknown }; onDetail: (id: number) => void; opinionOnly: boolean }) {
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  const rows = query.data?.data ?? [];
  if (!rows.length) return <EmptyState title={opinionOnly ? 'لا توجد آراء ضمن النطاق' : 'لا توجد متابعات ضمن النطاق'} />;
  return <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full min-w-[880px] text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3 text-start">العميل</th><th className="p-3 text-start">الاتصال</th><th className="p-3 text-start">الاشتراك</th><th className="p-3 text-start">التاريخ والنطاق</th><th className="p-3 text-start">{opinionOnly ? 'الرأي' : 'الملاحظة'}</th><th className="p-3 text-start">التفاصيل</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t align-top"><td className="p-3"><p className="font-medium">{row.memberName ?? `عضو #${row.member_id ?? '—'}`}</p><p className="text-xs text-muted-foreground">{row.memberCode ?? '—'}</p></td><td className="p-3 tabular-nums">{row.memberPhone ?? '—'}</td><td className="p-3"><p>{row.subscriptionNumber ?? '—'}</p><p className="text-xs text-muted-foreground">{row.subscriptionStartDate && row.subscriptionEndDate ? `${row.subscriptionStartDate} — ${row.subscriptionEndDate}` : statusLabels[row.membership_status ?? ''] ?? '—'}</p></td><td className="p-3"><p className="tabular-nums">{row.contact_date}</p><p className="text-xs text-muted-foreground">{genderLabels[row.gender ?? ''] ?? 'غير محدد'}</p></td><td className="max-w-sm break-words p-3 text-muted-foreground">{opinionOnly ? row.opinion : row.note || row.opinion || '—'}</td><td className="p-3"><Button variant="ghost" size="sm" onClick={() => onDetail(row.id)}>عرض الردود</Button></td></tr>)}</tbody></table></div>;
}

function Info({ label, value }: { label: string; value?: string | null }) { return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words">{value || '—'}</p></div>; }
