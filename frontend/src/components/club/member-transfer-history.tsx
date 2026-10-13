import { ChevronLeft, ChevronRight, Copy, Eye, FileSpreadsheet, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { downloadExcel } from '@/lib/export';
import { formatMoney, localToday } from '@/lib/formatters';
import { useAuth } from '@/store/auth';
import { toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';

export interface MemberTransferHistory {
  id: number;
  source_subscription_id: number;
  destination_subscription_id: number;
  source_member_id: number;
  destination_member_id: number;
  source_branch_id: number;
  destination_branch_id: number;
  entitlement_kind: 'days' | 'sessions';
  remaining_days: number | null;
  remaining_sessions: number | null;
  transferred_value: number | string;
  effective_date: string;
  reason: string;
  created_by_name: string;
  source_member: { id: number; member_code: string; name: string };
  destination_member: { id: number; member_code: string; name: string };
  source_subscription: { subscription_number: string; subscription_type: string | null; subscription_start_date: string; subscription_end_date: string; subscription_value: number | string };
  destination_subscription: { subscription_number: string; subscription_start_date: string; subscription_end_date: string; subscription_value: number | string };
}

interface Props {
  history: MemberTransferHistory[];
  branches: Array<{ id: number; name: string | null }>;
  onChanged: () => Promise<unknown>;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/20 p-3"><span className="text-xs text-muted-foreground">{label}</span><b className="mt-1 block font-medium">{value || '—'}</b></div>;
}

export function MemberTransferHistoryTable({ history, branches, onChanged }: Props) {
  const { can, superAdmin } = usePermission();
  const user = useAuth((state) => state.user);
  const todayOnly = !superAdmin && user?.level === 2;
  const today = localToday();
  const canEdit = can('club.subscriptions.member_transfer:update') || can('club.subscriptions:update') || can('club.subscriptions.list:update') || can('club.reception:update');
  const canDelete = can('club.subscriptions.member_transfer:delete') || can('club.subscriptions:delete') || can('club.subscriptions.list:delete');
  const canExport = can('club.subscriptions.member_transfer:export') || can('club.subscriptions:export') || can('club.subscriptions.list:export');
  const [branchFilter, setBranchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState<MemberTransferHistory | null>(null);
  const [editing, setEditing] = useState<MemberTransferHistory | null>(null);
  const [editBranchId, setEditBranchId] = useState('');
  const [editMember, setEditMember] = useState<ClubMemberListItem | null>(null);
  const [editReason, setEditReason] = useState('');
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const branchName = (id: number) => branches.find((branch) => branch.id === id)?.name ?? `#${id}`;

  const filtered = useMemo(() => history.filter((item) => {
    if (todayOnly && item.effective_date !== today) return false;
    if (branchFilter && item.source_branch_id !== Number(branchFilter) && item.destination_branch_id !== Number(branchFilter)) return false;
    if (!todayOnly && dateFrom && item.effective_date < dateFrom) return false;
    if (!todayOnly && dateTo && item.effective_date > dateTo) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [item.source_member.name, item.source_member.member_code, item.destination_member.name, item.destination_member.member_code, item.source_subscription.subscription_type, item.created_by_name, item.source_subscription.subscription_number]
      .some((value) => String(value ?? '').toLowerCase().includes(query));
  }), [history, branchFilter, dateFrom, dateTo, search, todayOnly, today]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const exportRows = () => filtered.map((item, index) => ({
    number: index + 1,
    date: item.effective_date,
    sourceBranch: branchName(item.source_branch_id),
    destinationBranch: branchName(item.destination_branch_id),
    sourceMember: item.source_member.name,
    destinationMember: item.destination_member.name,
    subscriptionType: item.source_subscription.subscription_type ?? '—',
    operator: item.created_by_name,
    remaining: item.entitlement_kind === 'sessions' ? `${item.remaining_sessions ?? 0} حصة` : `${item.remaining_days ?? 0} يوم`,
    value: Number(item.transferred_value),
    reason: item.reason,
  }));
  const exportColumns = [
    { key: 'number', header: 'م' }, { key: 'date', header: 'التاريخ' },
    { key: 'sourceBranch', header: 'الفرع المحول منه' }, { key: 'destinationBranch', header: 'الفرع المحول إليه' },
    { key: 'sourceMember', header: 'العميل المحول منه' }, { key: 'destinationMember', header: 'العميل المحول إليه' },
    { key: 'subscriptionType', header: 'نوع الاشتراك' }, { key: 'operator', header: 'القائم بالتحويل' },
    { key: 'remaining', header: 'المتبقي المنقول' }, { key: 'value', header: 'القيمة المنقولة' }, { key: 'reason', header: 'السبب' },
  ] as const;

  const openEdit = async (item: MemberTransferHistory) => {
    setLoadingEdit(true);
    try {
      const { data } = await api.get<ClubMemberListItem>(`/club-members/${item.destination_member_id}`);
      setEditMember(data);
      setEditBranchId(String(item.destination_branch_id));
      setEditReason(item.reason);
      setEditing(item);
    } catch (error) { toast.error(apiError(error)); } finally { setLoadingEdit(false); }
  };

  const saveEdit = async () => {
    if (!editing || !editMember || !editBranchId || editMember.branchId !== Number(editBranchId) || editReason.trim().length < 3) {
      toast.error('اختر الفرع والعضو المستلم واكتب سبب التحويل'); return;
    }
    setSaving(true);
    try {
      await api.patch(`/club-subscription-transfers/member-transfers/${editing.id}`, { destinationMemberId: editMember.id, reason: editReason.trim() });
      toast.success('تم تعديل التحويل');
      setEditing(null);
      await onChanged();
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };

  const deleteTransfer = async (item: MemberTransferHistory) => {
    if (!window.confirm(`حذف تحويل ${item.source_member.name} إلى ${item.destination_member.name}؟ سيُلغى الاشتراك الناتج ويعود المتبقي إلى العضو الأصلي إذا لم يُستخدم.`)) return;
    setDeletingId(item.id);
    try {
      await api.delete(`/club-subscription-transfers/member-transfers/${item.id}`);
      toast.success('تم حذف التحويل وإعادة الاشتراك الأصلي');
      await onChanged();
    } catch (error) { toast.error(apiError(error)); } finally { setDeletingId(null); }
  };

  return <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">قائمة تحويلات الاشتراكات بين الأعضاء</h2><p className="mt-1 text-sm text-muted-foreground">{toArabicDigits(filtered.length)} تحويل</p></div>{canExport ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!filtered.length} onClick={() => void downloadExcel(exportRows(), [...exportColumns], 'تحويلات-الاشتراكات-بين-الأعضاء.xlsx', 'التحويلات')}><FileSpreadsheet className="size-4" /> Excel</Button><Button size="sm" variant="outline" disabled={!filtered.length} onClick={() => { const rows = exportRows(); void navigator.clipboard.writeText([[...exportColumns].map((column) => column.header).join('\t'), ...rows.map((row) => [...exportColumns].map((column) => String(row[column.key])).join('\t'))].join('\n')).then(() => toast.success('تم نسخ القائمة')).catch(() => toast.error('تعذر نسخ القائمة')); }}><Copy className="size-4" /> نسخ</Button></div> : null}</div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-1"><Label htmlFor="member-transfer-branch-filter">الفرع</Label><select id="member-transfer-branch-filter" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={branchFilter} onChange={(event) => { setBranchFilter(event.target.value); setPage(1); }}><option value="">كل الفروع</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="member-transfer-date-from">من تاريخ</Label><Input id="member-transfer-date-from" type="date" disabled={todayOnly} value={todayOnly ? today : dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></div>
      <div className="space-y-1"><Label htmlFor="member-transfer-date-to">إلى تاريخ</Label><Input id="member-transfer-date-to" type="date" disabled={todayOnly} value={todayOnly ? today : dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></div>
      <div className="space-y-1"><Label htmlFor="member-transfer-search">بحث</Label><Input id="member-transfer-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="الاسم أو الكود أو نوع الاشتراك" /></div>
    </div>
    <Table><TableHeader><TableRow><TableHead>م</TableHead><TableHead>التاريخ</TableHead><TableHead>الفرع</TableHead><TableHead>العميل المحوَّل منه</TableHead><TableHead>العميل المحوَّل إليه</TableHead><TableHead>نوع الاشتراك</TableHead><TableHead>القائم بالتحويل</TableHead><TableHead>الإجراء</TableHead></TableRow></TableHeader><TableBody>
      {visible.map((item, index) => <TableRow key={item.id}><TableCell className="nums">{toArabicDigits((currentPage - 1) * pageSize + index + 1)}</TableCell><TableCell className="nums whitespace-nowrap">{toArabicDigits(item.effective_date)}</TableCell><TableCell className="whitespace-nowrap">{branchName(item.source_branch_id)}{item.destination_branch_id !== item.source_branch_id ? ` ← ${branchName(item.destination_branch_id)}` : ''}</TableCell><TableCell><b>{item.source_member.name}</b><span className="block font-mono text-xs text-muted-foreground">{item.source_member.member_code}</span></TableCell><TableCell><b>{item.destination_member.name}</b><span className="block font-mono text-xs text-muted-foreground">{item.destination_member.member_code}</span></TableCell><TableCell>{item.source_subscription.subscription_type ?? '—'}</TableCell><TableCell>{item.created_by_name}</TableCell><TableCell><div className="flex gap-1"><Button size="icon" variant="outline" title="تفاصيل" aria-label="تفاصيل التحويل" onClick={() => setDetails(item)}><Eye className="size-4" /></Button>{canEdit ? <Button size="icon" variant="outline" title="تعديل" aria-label="تعديل التحويل" disabled={loadingEdit} onClick={() => void openEdit(item)}><Pencil className="size-4" /></Button> : null}{canDelete ? <Button size="icon" variant="destructive" title="حذف" aria-label="حذف التحويل" disabled={deletingId === item.id} onClick={() => void deleteTransfer(item)}><Trash2 className="size-4" /></Button> : null}</div></TableCell></TableRow>)}
      {!visible.length ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">لا توجد تحويلات مطابقة للبحث أو الفلاتر.</TableCell></TableRow> : null}
    </TableBody></Table>
    {filtered.length > pageSize ? <div className="flex items-center justify-between text-sm text-muted-foreground"><span>صفحة {toArabicDigits(currentPage)} من {toArabicDigits(pageCount)}</span><div className="flex gap-2"><Button size="icon" variant="outline" disabled={currentPage <= 1} aria-label="الصفحة السابقة" onClick={() => setPage(currentPage - 1)}><ChevronRight className="size-4" /></Button><Button size="icon" variant="outline" disabled={currentPage >= pageCount} aria-label="الصفحة التالية" onClick={() => setPage(currentPage + 1)}><ChevronLeft className="size-4" /></Button></div></div> : null}

    <Dialog open={details !== null} onOpenChange={(open) => !open && setDetails(null)}><DialogContent size="lg" aria-describedby={undefined}><DialogHeader><DialogTitle>تفاصيل تحويل الاشتراك</DialogTitle></DialogHeader>{details ? <div className="grid gap-3 sm:grid-cols-2"><DetailField label="التاريخ" value={toArabicDigits(details.effective_date)} /><DetailField label="القائم بالتحويل" value={details.created_by_name} /><DetailField label="العضو المحوَّل منه" value={`${details.source_member.name} · ${details.source_member.member_code}`} /><DetailField label="العضو المحوَّل إليه" value={`${details.destination_member.name} · ${details.destination_member.member_code}`} /><DetailField label="الفرع المحوَّل منه" value={branchName(details.source_branch_id)} /><DetailField label="الفرع المحوَّل إليه" value={branchName(details.destination_branch_id)} /><DetailField label="نوع الاشتراك" value={details.source_subscription.subscription_type ?? '—'} /><DetailField label="رقم الاشتراك المصدر" value={details.source_subscription.subscription_number} /><DetailField label="رقم الاشتراك الناتج" value={details.destination_subscription.subscription_number} /><DetailField label="المتبقي المنقول" value={details.entitlement_kind === 'sessions' ? `${toArabicDigits(details.remaining_sessions ?? 0)} حصة` : `${toArabicDigits(details.remaining_days ?? 0)} يوم`} /><DetailField label="القيمة المنقولة" value={formatMoney(Number(details.transferred_value))} /><DetailField label="سبب التحويل" value={details.reason} /></div> : null}<DialogFooter><Button variant="outline" onClick={() => setDetails(null)}>إغلاق</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !saving) setEditing(null); }}><DialogContent size="md" aria-describedby={undefined}><DialogHeader><DialogTitle>تعديل تحويل الاشتراك</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">{editing?.source_member.name} ← {editing?.destination_member.name}</p><div className="space-y-2"><Label htmlFor="edit-transfer-branch">فرع العضو المستلم *</Label><select id="edit-transfer-branch" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={editBranchId} onChange={(event) => { setEditBranchId(event.target.value); setEditMember(null); }}><option value="">اختر الفرع</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div><div className="space-y-2"><Label>العضو المستلم *</Label><MemberSearchCombobox key={editBranchId} selectedMember={editMember} onSelect={setEditMember} onClear={() => setEditMember(null)} branchId={editBranchId ? Number(editBranchId) : undefined} exactBranch disabled={!editBranchId} /></div><div className="space-y-2"><Label>سبب التحويل *</Label><Textarea value={editReason} onChange={(event) => setEditReason(event.target.value)} /></div><p className="text-xs text-muted-foreground">يمكن تغيير العضو المستلم ما دام الاشتراك الناتج لم يُستخدم أو يدخل في عملية لاحقة.</p></div><DialogFooter><Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>إلغاء</Button><Button variant="brand" disabled={saving || !editMember || !editBranchId || editReason.trim().length < 3} onClick={() => void saveEdit()}>{saving ? 'جاري الحفظ…' : 'حفظ التعديل'}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
