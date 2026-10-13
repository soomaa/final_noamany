import { ChevronLeft, ChevronRight, Copy, Eye, FileSpreadsheet, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { downloadExcel } from '@/lib/export';
import { formatMoney, localToday } from '@/lib/formatters';
import { useAuth } from '@/store/auth';
import { toArabicDigits } from '@/lib/utils';

export interface RefundHistoryRow {
  id: number;
  invoiceNumber: string;
  subscriptionNumber: string | null;
  memberCode: string | null;
  customerName: string | null;
  branchId: number | null;
  category: string | null;
  subscriptionType: string | null;
  paidAmount: number;
  originalStartDate: string;
  originalEndDate: string;
  stopDate: string;
  refundDate: string;
  refundAmount: number;
  remainingDays: number;
  originalValue: number;
  reason: string | null;
  notes: string | null;
  status: string;
}

interface Props { refunds: RefundHistoryRow[]; onChanged: () => Promise<unknown> }

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/20 p-3"><span className="text-xs text-muted-foreground">{label}</span><b className="mt-1 block font-medium">{value || '—'}</b></div>;
}

export function SubscriptionRefundHistory({ refunds, onChanged }: Props) {
  const { data: branches = [] } = useBranches();
  const { can, superAdmin } = usePermission();
  const user = useAuth((state) => state.user);
  const title = user?.job_title ?? '';
  const todayOnly = !superAdmin && user?.level !== 1 && user?.level !== 3 && /(استقبال|ريسيبشن|ريسبشن|reception)/i.test(title) && !/(مدير|مشرف|رئيس|manager|supervisor|head)/i.test(title);
  const today = localToday();
  const canEdit = can('club.subscriptions:update') || can('club.subscriptions.list:update') || can('club.reception:update');
  const canDelete = can('club.subscriptions:delete') || can('club.subscriptions.list:delete');
  const [branch, setBranch] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<RefundHistoryRow | null>(null);
  const [editing, setEditing] = useState<RefundHistoryRow | null>(null);
  const [amount, setAmount] = useState('');
  const [refundDate, setRefundDate] = useState('');
  const [stopDate, setStopDate] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const branchName = (id: number | null) => branches.find((item) => item.id === id)?.name ?? '—';
  const categoryName = (value: string | null) => value === 'male' ? 'رجالي' : value === 'female' ? 'حريمي' : value ?? '—';
  const filtered = useMemo(() => refunds.filter((item) => {
    if (todayOnly && item.refundDate !== today) return false;
    if (branch && item.branchId !== Number(branch)) return false;
    if (category && item.category !== category) return false;
    if (!todayOnly && from && item.refundDate < from) return false;
    if (!todayOnly && to && item.refundDate > to) return false;
    const term = search.trim().toLowerCase();
    return !term || [item.memberCode, item.customerName, item.subscriptionType, item.subscriptionNumber, item.invoiceNumber]
      .some((value) => String(value ?? '').toLowerCase().includes(term));
  }), [refunds, branch, category, from, to, search, todayOnly, today]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const columns = [
    { key: 'number', header: 'م' }, { key: 'memberCode', header: 'كود العميل' },
    { key: 'customerName', header: 'اسم العميل' }, { key: 'branch', header: 'الفرع' },
    { key: 'category', header: 'الفئة' }, { key: 'subscriptionType', header: 'نوع الاشتراك' },
    { key: 'paidAmount', header: 'المدفوع' }, { key: 'originalStartDate', header: 'بداية الاشتراك' },
    { key: 'stopDate', header: 'نهاية الاشتراك' }, { key: 'refundDate', header: 'تاريخ المرتجع' },
    { key: 'refundAmount', header: 'قيمة المرتجع' }, { key: 'invoiceNumber', header: 'رقم الإيصال' },
  ] as const;
  const exportRows = () => filtered.map((item, index) => ({
    number: index + 1, memberCode: item.memberCode ?? '', customerName: item.customerName ?? '',
    branch: branchName(item.branchId), category: categoryName(item.category),
    subscriptionType: item.subscriptionType ?? '', paidAmount: item.paidAmount,
    originalStartDate: item.originalStartDate, stopDate: item.stopDate,
    refundDate: item.refundDate, refundAmount: item.refundAmount, invoiceNumber: item.invoiceNumber,
  }));
  const openEdit = (item: RefundHistoryRow) => {
    setEditing(item); setAmount(String(item.refundAmount)); setRefundDate(item.refundDate);
    setStopDate(item.stopDate); setReason(item.reason ?? ''); setNotes(item.notes ?? '');
  };
  const save = async () => {
    if (!editing) return;
    if (!(Number(amount) > 0) || !refundDate || !stopDate) { toast.error('أدخلي المبلغ والتواريخ المطلوبة'); return; }
    setSaving(true);
    try {
      await api.patch(`/club-subscription-refunds/${editing.id}`, { refundAmount: Number(amount), refundDate, stopDate, reason, notes });
      toast.success('تم تعديل المرتجع والقيود المالية'); setEditing(null); await onChanged();
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };
  const remove = async (item: RefundHistoryRow) => {
    if (!window.confirm(`حذف مرتجع ${item.customerName ?? item.memberCode ?? item.invoiceNumber}؟ ستُعكس القيود المالية ويُستعاد الاشتراك إذا لم تحدث عليه عمليات لاحقة.`)) return;
    setDeleting(item.id);
    try { await api.delete(`/club-subscription-refunds/${item.id}`); toast.success('تم حذف المرتجع وعكس أثره المالي'); await onChanged(); }
    catch (error) { toast.error(apiError(error)); } finally { setDeleting(null); }
  };

  return <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">قائمة المرتجعات</h2><p className="mt-1 text-sm text-muted-foreground">{toArabicDigits(filtered.length)} مرتجع</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!filtered.length} onClick={() => void downloadExcel(exportRows(), [...columns], 'مرتجعات-الاشتراكات.xlsx', 'المرتجعات')}><FileSpreadsheet className="size-4" /> Excel</Button><Button size="sm" variant="outline" disabled={!filtered.length} onClick={() => { const rows = exportRows(); void navigator.clipboard.writeText([columns.map((column) => column.header).join('\t'), ...rows.map((row) => columns.map((column) => String(row[column.key])).join('\t'))].join('\n')).then(() => toast.success('تم نسخ القائمة')).catch(() => toast.error('تعذر نسخ القائمة')); }}><Copy className="size-4" /> نسخ</Button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="space-y-1"><Label htmlFor="refund-branch">الفرع</Label><select id="refund-branch" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={branch} onChange={(event) => { setBranch(event.target.value); setPage(1); }}><option value="">كل الفروع</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="refund-category">الفئة</Label><select id="refund-category" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">كل الفئات</option><option value="male">رجالي</option><option value="female">حريمي</option></select></div>
      <div className="space-y-1"><Label htmlFor="refund-from">من تاريخ</Label><Input id="refund-from" type="date" disabled={todayOnly} value={todayOnly ? today : from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></div>
      <div className="space-y-1"><Label htmlFor="refund-to">إلى تاريخ</Label><Input id="refund-to" type="date" disabled={todayOnly} value={todayOnly ? today : to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></div>
      <div className="space-y-1"><Label htmlFor="refund-search">بحث</Label><Input id="refund-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="اسم أو كود العميل أو الاشتراك" /></div>
    </div>
    <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>م</TableHead><TableHead>كود العميل</TableHead><TableHead>اسم العميل</TableHead><TableHead>الفرع</TableHead><TableHead>الفئة</TableHead><TableHead>نوع الاشتراك</TableHead><TableHead>المدفوع</TableHead><TableHead>بداية الاشتراك</TableHead><TableHead>نهاية الاشتراك</TableHead><TableHead>تاريخ المرتجع</TableHead><TableHead>قيمة المرتجع</TableHead><TableHead>الإجراء</TableHead></TableRow></TableHeader><TableBody>
      {visible.map((item, index) => <TableRow key={item.id}><TableCell className="nums">{toArabicDigits((currentPage - 1) * pageSize + index + 1)}</TableCell><TableCell className="whitespace-nowrap font-mono">{item.memberCode ?? '—'}</TableCell><TableCell className="min-w-32">{item.customerName ?? '—'}</TableCell><TableCell className="whitespace-nowrap">{branchName(item.branchId)}</TableCell><TableCell>{categoryName(item.category)}</TableCell><TableCell className="min-w-32">{item.subscriptionType ?? '—'}</TableCell><TableCell className="nums whitespace-nowrap">{formatMoney(item.paidAmount)}</TableCell><TableCell className="nums whitespace-nowrap">{toArabicDigits(item.originalStartDate)}</TableCell><TableCell className="nums whitespace-nowrap">{toArabicDigits(item.stopDate)}</TableCell><TableCell className="nums whitespace-nowrap">{toArabicDigits(item.refundDate)}</TableCell><TableCell className="nums whitespace-nowrap">{formatMoney(item.refundAmount)}</TableCell><TableCell><div className="flex gap-1"><Button size="icon" variant="outline" title="تفاصيل" aria-label="تفاصيل المرتجع" onClick={() => setDetails(item)}><Eye className="size-4" /></Button>{canEdit ? <Button size="icon" variant="outline" title="تعديل" aria-label="تعديل المرتجع" onClick={() => openEdit(item)}><Pencil className="size-4" /></Button> : null}{canDelete ? <Button size="icon" variant="destructive" title="حذف" aria-label="حذف المرتجع" disabled={deleting === item.id} onClick={() => void remove(item)}><Trash2 className="size-4" /></Button> : null}</div></TableCell></TableRow>)}
      {!visible.length ? <TableRow><TableCell colSpan={12} className="py-12 text-center text-muted-foreground">لا توجد مرتجعات مطابقة للبحث أو الفلاتر.</TableCell></TableRow> : null}
    </TableBody></Table></div>
    {filtered.length > pageSize ? <div className="flex items-center justify-between text-sm text-muted-foreground"><span>صفحة {toArabicDigits(currentPage)} من {toArabicDigits(pageCount)}</span><div className="flex gap-2"><Button size="icon" variant="outline" disabled={currentPage <= 1} aria-label="الصفحة السابقة" onClick={() => setPage(currentPage - 1)}><ChevronRight className="size-4" /></Button><Button size="icon" variant="outline" disabled={currentPage >= pageCount} aria-label="الصفحة التالية" onClick={() => setPage(currentPage + 1)}><ChevronLeft className="size-4" /></Button></div></div> : null}
    <Dialog open={details !== null} onOpenChange={(open) => !open && setDetails(null)}><DialogContent size="lg" aria-describedby={undefined}><DialogHeader><DialogTitle>تفاصيل المرتجع</DialogTitle></DialogHeader>{details ? <div className="grid gap-3 sm:grid-cols-2"><Detail label="رقم إيصال المرتجع" value={details.invoiceNumber} /><Detail label="رقم الاشتراك" value={details.subscriptionNumber ?? '—'} /><Detail label="كود العميل" value={details.memberCode ?? '—'} /><Detail label="اسم العميل" value={details.customerName ?? '—'} /><Detail label="الفرع" value={branchName(details.branchId)} /><Detail label="الفئة" value={categoryName(details.category)} /><Detail label="نوع الاشتراك" value={details.subscriptionType ?? '—'} /><Detail label="المدفوع" value={formatMoney(details.paidAmount)} /><Detail label="بداية الاشتراك" value={toArabicDigits(details.originalStartDate)} /><Detail label="نهاية الاشتراك الأصلية" value={toArabicDigits(details.originalEndDate)} /><Detail label="تاريخ إيقاف الاشتراك" value={toArabicDigits(details.stopDate)} /><Detail label="تاريخ المرتجع" value={toArabicDigits(details.refundDate)} /><Detail label="قيمة المرتجع" value={formatMoney(details.refundAmount)} /><Detail label="السبب" value={details.reason ?? '—'} /><Detail label="ملاحظات" value={details.notes ?? '—'} /></div> : null}<DialogFooter><Button variant="outline" onClick={() => setDetails(null)}>إغلاق</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}><DialogContent size="md" aria-describedby={undefined}><DialogHeader><DialogTitle>تعديل المرتجع</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="edit-refund-amount">مبلغ الاسترداد *</Label><Input id="edit-refund-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div><div className="space-y-1"><Label htmlFor="edit-refund-date">تاريخ الاسترداد *</Label><Input id="edit-refund-date" type="date" value={refundDate} onChange={(event) => setRefundDate(event.target.value)} /></div><div className="space-y-1"><Label htmlFor="edit-refund-stop">تاريخ إيقاف الاشتراك *</Label><Input id="edit-refund-stop" type="date" value={stopDate} onChange={(event) => setStopDate(event.target.value)} /></div><div className="space-y-1"><Label htmlFor="edit-refund-reason">سبب المرتجع</Label><Input id="edit-refund-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></div><div className="space-y-1 sm:col-span-2"><Label htmlFor="edit-refund-notes">ملاحظات</Label><Textarea id="edit-refund-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div></div><p className="text-xs text-muted-foreground">تعديل المبلغ أو التاريخ يعكس القيد المالي القديم ويسجل القيمة الجديدة. قد يمنع النظام التعديل إذا حدثت عمليات لاحقة على الاشتراك.</p><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>إلغاء</Button><Button variant="brand" disabled={saving || !(Number(amount) > 0) || !refundDate || !stopDate} onClick={() => void save()}>{saving ? 'جاري الحفظ…' : 'حفظ التعديل'}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
