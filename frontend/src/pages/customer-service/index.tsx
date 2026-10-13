import type { ColumnDef } from '@tanstack/react-table';
import { Eye, MessageSquarePlus, Pencil, Printer, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { useLocale } from '@/store/locale';

type Question = { id: number; question_text: string; question_type: 'stars' | 'yes_no' | 'multiple_choice' | 'text'; options?: string[] };
type Row = { subscriptionId: number; clientId: number; clientName: string; clientCode: string; phone: string; subscription: string; startDate: string; endDate: string; lastFeedbackAt?: string; feedbackId?: number; callStatus?: string; hasRecentFeedback?: boolean };
type FeedbackDetails = { id: number; call_status: string; created_at: string; answers: Array<{ id: number; answer_text?: string | null; question: { question_text: string } }> };
const arabicTime = (value?: string | null) => value ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', hour12: true }).format(new Date(value)) : 'لا يوجد رد سابق';
const statusText = (value?: string | null) => ({ answered: 'تم أخذ الرأي', no_answer: 'لم يتم الرد', call_later: 'طلب الاتصال لاحقاً' }[value ?? ''] ?? 'لم يتم التواصل');

function Filters({ onSearch, contactFilters = false }: { onSearch: (filters: Record<string, string>) => void; contactFilters?: boolean }) {
  const { ui } = useLocale();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const change = (key: string, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const noContact = filters.contactStatus === 'not_contacted';
  return (
    <form className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6" onSubmit={(event) => { event.preventDefault(); onSearch(filters); }}>
      <div className="space-y-2"><Label>{ui('حالة الاشتراك')}</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.subscriptionStatus ?? ''} onChange={(event) => change('subscriptionStatus', event.target.value)}><option value="">{ui('كل الحالات')}</option><option value="active">{ui('جاري')}</option><option value="expired">{ui('منتهي')}</option></select></div>
      <div className="space-y-2"><Label>{ui('الفئة')}</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.category ?? ''} onChange={(event) => change('category', event.target.value)}><option value="">{ui('كل الفئات')}</option><option value="women">{ui('حريمي')}</option><option value="men">{ui('رجالي')}</option></select></div>
      {contactFilters && <div className="space-y-2"><Label>{ui('حالة الاتصال')}</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.contactStatus ?? ''} onChange={(event) => setFilters((current) => ({ ...current, contactStatus: event.target.value, ...(event.target.value === 'not_contacted' ? { contactFromDate: '', contactToDate: '' } : {}) }))}><option value="">{ui('كل الحالات')}</option><option value="contacted">{ui('تم التواصل')}</option><option value="not_contacted">{ui('لم يتم التواصل')}</option></select></div>}
      <div className="space-y-2"><Label>{ui(contactFilters ? 'من تاريخ التواصل' : 'من تاريخ')}</Label><Input type="date" disabled={noContact} value={filters[contactFilters ? 'contactFromDate' : 'fromDate'] ?? ''} onChange={(event) => change(contactFilters ? 'contactFromDate' : 'fromDate', event.target.value)} /></div>
      <div className="space-y-2"><Label>{ui(contactFilters ? 'إلى تاريخ التواصل' : 'إلى تاريخ')}</Label><Input type="date" disabled={noContact} value={filters[contactFilters ? 'contactToDate' : 'toDate'] ?? ''} onChange={(event) => change(contactFilters ? 'contactToDate' : 'toDate', event.target.value)} /></div>
      <Button type="submit" className="self-end">{ui('بحث')}</Button>
    </form>
  );
}

export function CustomerServiceQuestionsPage() {
  const { ui } = useLocale();
  const [items, setItems] = useState<Question[]>([]);
  const [text, setText] = useState('');
  const [type, setType] = useState<Question['question_type']>('text');
  const [options, setOptions] = useState('');
  const [editing, setEditing] = useState<Question | null>(null);
  const [saving, setSaving] = useState(false);
  const load = async () => { try { setItems((await api.get<Question[]>('/customer-service/questions')).data); } catch (error) { toast.error(apiError(error)); } };
  useEffect(() => { void load(); }, []);
  const resetForm = () => { setText(''); setOptions(''); setType('text'); setEditing(null); };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); try { const payload = { questionText: text.trim(), questionType: type, options: options.split(',').map((option) => option.trim()).filter(Boolean) }; if (editing) await api.put(`/customer-service/questions/${editing.id}`, payload); else await api.post('/customer-service/questions', payload); resetForm(); await load(); toast.success(ui(editing ? 'تم تعديل السؤال' : 'تم حفظ السؤال')); } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); } };
  const edit = (item: Question) => { setEditing(item); setText(item.question_text); setType(item.question_type); setOptions((item.options ?? []).join(', ')); };
  const remove = async (item: Question) => { const ok = await confirm({ title: ui('حذف السؤال'), description: `${ui('هل تريد حذف السؤال «')}${item.question_text}${ui('»؟')}`, confirmLabel: ui('حذف'), variant: 'destructive' }); if (!ok) return; try { await api.delete(`/customer-service/questions/${item.id}`); await load(); toast.success(ui('تم حذف السؤال')); } catch (error) { toast.error(apiError(error)); } };
  const questionTypeLabel: Record<Question['question_type'], string> = { stars: ui('تقييم بالنجوم'), yes_no: ui('نعم / لا'), multiple_choice: ui('اختيار متعدد'), text: ui('نص حر') };
  const columns = useMemo<ColumnDef<Question>[]>(() => [
    { accessorKey: 'id', header: '#' },
    { accessorKey: 'question_text', header: ui('نص السؤال') },
    { accessorKey: 'question_type', header: ui('نوع الإجابة'), cell: ({ row }) => <Badge variant="secondary">{questionTypeLabel[row.original.question_type]}</Badge> },
    { id: 'actions', header: ui('إجراء'), cell: ({ row }) => <div className="flex items-center justify-center gap-1"><Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => edit(row.original)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void remove(row.original)}><Trash2 className="size-4 text-destructive" /></Button></div> },
  ], [ui]);
  return <ListPageShell title={ui('بنك أسئلة العملاء')} description={ui('إعداد الأسئلة المستخدمة عند تسجيل آراء العملاء')} eyebrow={ui('إدارة خدمة العملاء')}><form onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-4"><div className="space-y-2 md:col-span-2"><Label>{ui('نص السؤال')}</Label><Input required value={text} onChange={(event) => setText(event.target.value)} /></div><div className="space-y-2"><Label>{ui('نوع الإجابة')}</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as Question['question_type'])}><option value="stars">{ui('تقييم بالنجوم (1-5)')}</option><option value="yes_no">{ui('نعم / لا')}</option><option value="multiple_choice">{ui('اختيار متعدد')}</option><option value="text">{ui('نص حر')}</option></select></div>{type === 'multiple_choice' && <div className="space-y-2"><Label>{ui('الخيارات')}</Label><Input required value={options} onChange={(event) => setOptions(event.target.value)} placeholder={ui('مفصولة بفاصلة')} /></div>}<div className="flex items-end gap-2">{editing && <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>{ui('إلغاء')}</Button>}<Button disabled={!text.trim() || saving}>{saving ? ui('جارٍ الحفظ…') : ui(editing ? 'حفظ التعديل' : 'حفظ')}</Button></div></form><DataTable columns={columns} data={items} total={items.length} page={1} pageSize={50} onPageChange={() => {}} enableExport={false} emptyTitle={ui('لا توجد أسئلة مضافة')} /></ListPageShell>;
}

function SubscriptionTable({ rows, onAddFeedback, onViewDetails, showCallStatus = false }: { rows: Row[]; onAddFeedback?: (row: Row) => void; onViewDetails?: (feedbackId: number) => void; showCallStatus?: boolean }) {
  const { ui } = useLocale();
  const columns = useMemo<ColumnDef<Row>[]>(() => [
    { accessorKey: 'clientName', header: ui('اسم العميل') },
    { accessorKey: 'clientCode', header: ui('كود العميل'), cell: ({ getValue }) => <span className="nums">{getValue() as string}</span> },
    { accessorKey: 'phone', header: ui('رقم الهاتف'), cell: ({ getValue }) => <span className="nums" dir="ltr">{getValue() as string}</span> },
    { accessorKey: 'subscription', header: ui('الاشتراك') },
    { accessorKey: 'startDate', header: ui('بداية الاشتراك') },
    { accessorKey: 'endDate', header: ui('نهاية الاشتراك') },
    { accessorKey: 'lastFeedbackAt', header: ui('آخر تواصل'), cell: ({ row }) => arabicTime(row.original.lastFeedbackAt) },
    ...(showCallStatus ? [{ id: 'callStatus', header: ui('حالة الاتصال'), cell: ({ row }: { row: { original: Row } }) => <Badge variant={row.original.callStatus === 'answered' ? 'success' : row.original.callStatus ? 'warning' : 'secondary'}>{statusText(row.original.callStatus)}</Badge> } as ColumnDef<Row>] : []),
    ...(onViewDetails ? [{ id: 'details', header: ui('التفاصيل'), cell: ({ row }: { row: { original: Row } }) => row.original.feedbackId ? <Button variant="ghost" size="sm" onClick={() => onViewDetails(row.original.feedbackId!)}><Eye className="size-4" />{ui('تفاصيل')}</Button> : <span className="text-muted-foreground">{ui('لا يوجد تواصل')}</span> } as ColumnDef<Row>] : []),
    ...(onAddFeedback ? [{ id: 'actions', header: ui('إجراء'), cell: ({ row }: { row: { original: Row } }) => <Button size="sm" onClick={() => onAddFeedback(row.original)}><MessageSquarePlus className="size-4" />{ui('تسجيل رأي')}</Button> } as ColumnDef<Row>] : []),
  ], [onAddFeedback, onViewDetails, showCallStatus, ui]);
  return <DataTable columns={columns} data={rows} total={rows.length} page={1} pageSize={20} onPageChange={() => {}} emptyTitle={ui('لا توجد نتائج مطابقة')} />;
}

export function CustomerServiceFeedbackPage() {
  const { ui } = useLocale();
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [callStatus, setCallStatus] = useState('answered');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const search = async (filters: Record<string, string> = {}) => { try { setRows((await api.get('/customer-service/subscriptions', { params: { ...filters, page: 1, pageSize: 20 } })).data.data); } catch (error) { toast.error(apiError(error)); } };
  useEffect(() => { void search(); void api.get<Question[]>('/customer-service/questions').then((response) => setQuestions(response.data)).catch((error) => toast.error(apiError(error))); }, []);
  const selectRow = (row: Row) => { setSelected(row); setCallStatus('answered'); setAnswers({}); };
  const save = async () => { if (!selected) return; if (callStatus === 'answered' && questions.some((question) => !answers[question.id])) { toast.error(ui('الرجاء الإجابة على جميع الأسئلة')); return; } setSaving(true); try { await api.post('/customer-service/feedback', { clientId: selected.clientId, subscriptionId: selected.subscriptionId, callStatus, answers: Object.entries(answers).map(([questionId, answerText]) => ({ questionId: Number(questionId), answerText })) }); setSelected(null); setAnswers({}); await search(); toast.success(ui('تم حفظ رأي العميل')); } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); } };
  return <ListPageShell title={ui('تسجيل رأي العميل')} description={ui('تواصل مع العملاء وسجل ملاحظاتهم على الاشتراك')} eyebrow={ui('إدارة خدمة العملاء')}><Filters onSearch={(filters) => void search(filters)} /><SubscriptionTable rows={rows} onAddFeedback={selectRow} /><Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent size="lg"><DialogHeader><DialogTitle>{ui('تسجيل رأي العميل')} {selected ? `— ${selected.clientName}` : ''}</DialogTitle><DialogDescription>{ui('سجل نتيجة الاتصال وإجابات العميل على أسئلة المتابعة.')}</DialogDescription></DialogHeader>{selected?.hasRecentFeedback && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">{ui('تنبيه: تم التواصل مع هذا العميل مؤخراً في')} {arabicTime(selected.lastFeedbackAt)}</div>}<div className="space-y-5"><div className="space-y-2"><Label>{ui('نتيجة الاتصال')}</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={callStatus} onChange={(event) => setCallStatus(event.target.value)}><option value="answered">{ui('تم أخذ الرأي')}</option><option value="no_answer">{ui('لم يتم الرد / مغلق')}</option><option value="call_later">{ui('طلب الاتصال لاحقاً')}</option></select></div>{callStatus === 'answered' && questions.map((question) => <div key={question.id} className="space-y-3 rounded-lg border bg-muted/20 p-4"><Label>{question.question_text}</Label>{question.question_type === 'text' ? <Textarea value={answers[question.id] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} /> : question.question_type === 'multiple_choice' ? <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={answers[question.id] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}><option value="">{ui('اختر')}</option>{(question.options ?? []).map((option) => <option key={option}>{option}</option>)}</select> : <div className="flex flex-wrap gap-2">{(question.question_type === 'stars' ? ['1', '2', '3', '4', '5'] : ['yes', 'no']).map((value) => <Button key={value} type="button" variant={answers[question.id] === value ? 'default' : 'outline'} size="sm" onClick={() => setAnswers((current) => ({ ...current, [question.id]: value }))}>{question.question_type === 'stars' ? `★ ${value}` : value === 'yes' ? ui('نعم') : ui('لا')}</Button>)}</div>}</div>)}</div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setSelected(null)}>{ui('إلغاء')}</Button><Button disabled={saving} onClick={() => void save()}>{saving ? ui('جارٍ الحفظ…') : ui('حفظ')}</Button></DialogFooter></DialogContent></Dialog></ListPageShell>;
}

export function CustomerServiceReportsPage() {
  const { ui } = useLocale();
  const [rows, setRows] = useState<Row[]>([]);
  const [details, setDetails] = useState<FeedbackDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const search = async (filters: Record<string, string> = {}) => { try { setRows((await api.get('/customer-service/reports', { params: { ...filters, page: 1, pageSize: 20 } })).data.data); } catch (error) { toast.error(apiError(error)); } };
  const viewDetails = async (feedbackId: number) => { setDetailsLoading(true); try { setDetails((await api.get<FeedbackDetails>(`/customer-service/feedback/${feedbackId}`)).data); } catch (error) { toast.error(apiError(error)); } finally { setDetailsLoading(false); } };
  useEffect(() => { void search(); }, []);
  return <ListPageShell title={ui('تقارير خدمة العملاء')} description={ui('متابعة نتائج التواصل وآخر ردود العملاء')} eyebrow={ui('إدارة خدمة العملاء')} actions={<Button variant="outline" onClick={() => window.print()}><Printer className="size-4" />{ui('طباعة')}</Button>}><Filters contactFilters onSearch={(filters) => void search(filters)} /><SubscriptionTable rows={rows} showCallStatus onViewDetails={(feedbackId) => void viewDetails(feedbackId)} /><p className="text-sm text-muted-foreground">{ui('تعرض حالة الاتصال وفق آخر تواصل مسجل مع العميل.')}</p><Dialog open={detailsLoading || details !== null} onOpenChange={(open) => { if (!open && !detailsLoading) setDetails(null); }}><DialogContent size="lg"><DialogHeader><DialogTitle>{ui('تفاصيل التواصل')}</DialogTitle><DialogDescription>{details ? `${ui('تاريخ التواصل')}: ${arabicTime(details.created_at)}` : ui('جارٍ تحميل تفاصيل التواصل…')}</DialogDescription></DialogHeader>{details && <div className="space-y-4"><div className="rounded-lg border bg-muted/20 p-3 text-sm"><span className="text-muted-foreground">{ui('حالة الاتصال')}: </span><Badge variant={details.call_status === 'answered' ? 'success' : 'warning'}>{statusText(details.call_status)}</Badge></div>{details.answers.length ? <div className="space-y-3">{details.answers.map((answer) => <div key={answer.id} className="rounded-lg border p-3"><p className="font-medium">{answer.question.question_text}</p><p className="mt-1 text-sm text-muted-foreground">{answer.answer_text || '—'}</p></div>)}</div> : <p className="text-sm text-muted-foreground">{ui('لا توجد إجابات مسجلة لهذا التواصل.')}</p>}</div>}<DialogFooter><Button variant="outline" disabled={detailsLoading} onClick={() => setDetails(null)}>{ui('إغلاق')}</Button></DialogFooter></DialogContent></Dialog></ListPageShell>;
}
