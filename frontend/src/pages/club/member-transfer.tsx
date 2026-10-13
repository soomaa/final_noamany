import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRightLeft, CheckCircle2, Search, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { MemberTransferHistoryTable, type MemberTransferHistory } from '@/components/club/member-transfer-history';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { formatMoney, localToday } from '@/lib/formatters';
import { cn, toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem, ClubSubscriptionListItem } from '@/types/club';

function dateDaysRemaining(endDate: string) {
  const today = new Date(`${localToday()}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.max(0, Math.round((end.getTime() - today.getTime()) / 86_400_000) + 1);
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input readOnly value={value} className="bg-muted/40" /></div>;
}

export function ClubMemberTransferPage() {
  const { can } = usePermission();
  const canCreateTransfer = can('club.subscriptions.member_transfer:create') || can('club.subscriptions:update') || can('club.subscriptions.list:update') || can('club.reception:update');
  const { data: branches = [] } = useQuery({ queryKey: ['club-operation-branches'], queryFn: async () => (await api.get<{ id: number; name: string | null }[]>('/club-subscriptions/operation-branch-options')).data });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');
  const [debouncedSourceSearch, setDebouncedSourceSearch] = useState('');
  const [subscriptionId, setSubscriptionId] = useState('');
  const [targetBranchId, setTargetBranchId] = useState('');
  const [target, setTarget] = useState<ClubMemberListItem | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSourceSearch(sourceSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [sourceSearch]);
  const { data: subscriptions, refetch: refetchSubscriptions, isFetching, isError, error } = usePaginatedList<ClubSubscriptionListItem>('club-subscriptions/member-transfer-sources', {
    page: 1, pageSize: 200, search: debouncedSourceSearch, filters: {},
  }, dialogOpen);
  const searching = isFetching || sourceSearch.trim() !== debouncedSourceSearch;
  const { data: history = [], refetch: refetchHistory } = useQuery({ queryKey: ['club-subscription-transfers', 'member-transfers'], queryFn: async () => (await api.get<MemberTransferHistory[]>('/club-subscription-transfers/member-transfers')).data });

  const eligible = searching || isError ? [] : subscriptions?.data ?? [];
  const source = eligible.find((row) => row.id === Number(subscriptionId)) ?? null;
  const branchName = (id: number | null | undefined) => branches.find((branch) => branch.id === id)?.name ?? '—';
  const remainingSessions = source?.isLinkedToSessions ? Math.max(0, (source.sessionsCount ?? 0) - (source.sessionsUsed ?? 0)) : null;
  const remainingDays = source && !source.isLinkedToSessions ? dateDaysRemaining(source.subscriptionEndDate) : null;
  const totalUnits = source?.isLinkedToSessions ? Math.max(1, source.sessionsCount ?? 1) : source ? Math.max(1, Math.round((new Date(`${source.subscriptionEndDate}T00:00:00`).getTime() - new Date(`${source.subscriptionStartDate}T00:00:00`).getTime()) / 86_400_000) + 1) : 1;
  const remainingUnits = source?.isLinkedToSessions ? remainingSessions ?? 0 : remainingDays ?? 0;
  const netValue = source ? Math.max(0, source.subscriptionValue - (source.discountEnabled ? source.discountValue : 0)) : 0;
  const estimatedValue = source ? Math.round((netValue * remainingUnits / totalUnits) * 100) / 100 : 0;
  const sourceGender = source?.gender;
  const targetMismatch = Boolean(source && target && (source.memberId === target.id || (sourceGender && sourceGender !== target.gender)));
  const targetBranchMismatch = Boolean(target && targetBranchId && target.branchId !== Number(targetBranchId));

  const resetForm = () => {
    setSourceSearch('');
    setDebouncedSourceSearch('');
    setSubscriptionId('');
    setTargetBranchId('');
    setTarget(null);
    setReason('');
  };

  const transfer = async () => {
    if (!source || !target || !targetBranchId || reason.trim().length < 3) { toast.error('اختر الاشتراك وفرع العضو المستلم والعضو، واكتب سبب التحويل'); return; }
    if (targetBranchMismatch) { toast.error('العضو المستلم لا يتبع الفرع المختار'); return; }
    if (targetMismatch) { toast.error(source.memberId === target.id ? 'يجب اختيار عضو آخر لاستلام الاشتراك' : 'نوع العضوية للعضوين غير متطابق'); return; }
    if (!window.confirm(`تأكيد نقل ${source.isLinkedToSessions ? `${remainingSessions} حصة` : `${remainingDays} يومًا`} من ${source.customerName} (${branchName(source.branchId)}) إلى ${target.name} (${branchName(target.branchId)})؟`)) return;
    setSaving(true);
    try {
      await api.post('/club-subscription-transfers/to-member', { sourceSubscriptionId: source.id, destinationMemberId: target.id, reason: reason.trim() });
      toast.success('تم تحويل المتبقي إلى العضو الجديد بدون إنشاء حركة مالية');
      setDialogOpen(false);
      resetForm();
      await Promise.all([refetchSubscriptions(), refetchHistory()]);
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };

  return <div className="space-y-6">
    <PageHeader title="تحويل الاشتراك بين الأعضاء" description="نقل المدة أو الحصص المتبقية إلى عضو آخر مع الاحتفاظ بسجل كامل للعملية." actions={<Button asChild variant="outline"><Link to="/club/subscriptions"><ArrowLeft className="size-4" /> العودة للاشتراكات</Link></Button>} />
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div><h2 className="font-bold">تحويل الاشتراك بين الأعضاء</h2><p className="mt-1 text-sm text-muted-foreground">اختر الاشتراك والعضو المستلم، ويمكن أن يكونا من فرعين مختلفين.</p></div>
      {canCreateTransfer ? <Button variant="brand" onClick={() => setDialogOpen(true)}><ArrowRightLeft className="size-4" /> تحويل الاشتراك بين الأعضاء</Button> : null}
    </div>
    <MemberTransferHistoryTable history={history} branches={branches} onChanged={async () => { await Promise.all([refetchSubscriptions(), refetchHistory()]); }} />

    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!saving) { setDialogOpen(open); if (!open) resetForm(); } }}>
      <DialogContent size="form" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>تحويل الاشتراك بين الأعضاء</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <section className="rounded-xl border"><h3 className="border-b bg-muted/40 px-4 py-3 font-semibold">بيانات الاشتراك</h3><div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="transfer-source-search">الاشتراك المصدر *</Label>
              <div className="relative mb-2"><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="transfer-source-search" className="ps-9" value={sourceSearch} onChange={(event) => { setSourceSearch(event.target.value); setSubscriptionId(''); setTarget(null); }} placeholder="ابحث بكود العضو أو رقم الهاتف أو الاسم أو رقم الاشتراك" /></div>
              <select aria-label="الاشتراك المصدر" disabled={searching || isError || eligible.length === 0} className="flex h-11 w-full rounded-md border bg-background px-3 text-sm" value={subscriptionId} onChange={(event) => { setSubscriptionId(event.target.value); setTarget(null); }}>
                <option value="">{searching ? 'جاري البحث عن الاشتراكات…' : isError ? 'تعذر تحميل الاشتراكات' : eligible.length ? 'اختر اشتراكًا من النتائج' : 'لا توجد اشتراكات مؤهلة للتحويل'}</option>
                {eligible.map((row) => <option key={row.id} value={row.id}>{row.customerName} — {row.memberCode ?? 'بدون كود'} — {row.memberPhone ?? 'بدون هاتف'} — {row.subscriptionNumber} — {row.subscriptionTypeName ?? row.subscriptionType} — {row.branchName ?? branchName(row.branchId)}</option>)}
              </select>
              <p role="status" aria-live="polite" className={cn('text-sm', isError ? 'text-destructive' : 'text-muted-foreground')}>
                {searching ? 'جاري البحث…' : isError ? apiError(error) : eligible.length ? `ظهر ${toArabicDigits(subscriptions?.total ?? eligible.length)} اشتراكًا مؤهلًا للتحويل${(subscriptions?.total ?? 0) > eligible.length ? `؛ معروض أول ${toArabicDigits(eligible.length)} نتيجة، حدّد البحث للوصول للاشتراك المطلوب` : ' في القائمة'}` : 'لا توجد اشتراكات نشطة مسددة ومؤهلة للتحويل مطابقة للبحث ضمن نطاق صلاحياتك.'}
              </p>
              {isError ? <Button type="button" variant="outline" size="sm" onClick={() => void refetchSubscriptions()}>إعادة المحاولة</Button> : null}
            </div>
            <ReadonlyField label="الفرع" value={source ? branchName(source.branchId) : '—'} />
            <ReadonlyField label="نوع الاشتراك" value={source?.subscriptionTypeName ?? source?.subscriptionType ?? '—'} />
            <ReadonlyField label="قيمة الاشتراك" value={source ? formatMoney(source.subscriptionValue) : '—'} />
            <ReadonlyField label="بداية الاشتراك" value={source ? toArabicDigits(source.subscriptionStartDate) : '—'} />
            <ReadonlyField label="نهاية الاشتراك" value={source ? toArabicDigits(source.subscriptionEndDate) : '—'} />
          </div></section>

          <section className="rounded-xl border"><h3 className="border-b bg-muted/40 px-4 py-3 font-semibold">بيانات العضو المحوَّل منه</h3><div className="grid gap-4 p-4 sm:grid-cols-3">
            <ReadonlyField label="كود العضو" value={source?.memberCode ?? '—'} />
            <ReadonlyField label="اسم العضو" value={source?.customerName ?? '—'} />
            <ReadonlyField label="رقم الهاتف" value={source?.memberPhone ?? '—'} />
          </div></section>

          <section className="rounded-xl border"><h3 className="border-b bg-muted/40 px-4 py-3 font-semibold">بيانات العضو المحوَّل إليه</h3><div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="transfer-target-branch">الفرع *</Label><select id="transfer-target-branch" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={targetBranchId} onChange={(event) => { setTargetBranchId(event.target.value); setTarget(null); }}><option value="">اختر الفرع</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
            <div className="space-y-2"><Label>العضو المستلم *</Label><MemberSearchCombobox key={targetBranchId} selectedMember={target} onSelect={setTarget} onClear={() => setTarget(null)} branchId={targetBranchId ? Number(targetBranchId) : undefined} exactBranch forRefundTransfer disabled={!source || !targetBranchId} /></div>
            <ReadonlyField label="رقم الهاتف" value={target?.phone ?? '—'} />
            <div className="space-y-2 sm:col-span-2 lg:col-span-3"><Label>سبب التحويل *</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="اكتب سبب تحويل الاشتراك (3 أحرف على الأقل)" /></div>
          </div></section>

          {source ? <div className="grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:grid-cols-2"><div><span className="text-xs text-muted-foreground">المتبقي الذي سينتقل</span><b className="block nums">{source.isLinkedToSessions ? `${toArabicDigits(remainingSessions ?? 0)} حصة` : `${toArabicDigits(remainingDays ?? 0)} يوم`}</b></div><div><span className="text-xs text-muted-foreground">القيمة المنقولة المتوقعة</span><b className="block">{formatMoney(estimatedValue)}</b></div></div> : null}
          {target ? <div className={cn('rounded-xl border p-3 text-sm', targetMismatch || targetBranchMismatch ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-emerald-500/30 bg-emerald-500/5')}><b>{target.name}</b> · <span className="font-mono nums">{target.memberCode}</span>{targetMismatch || targetBranchMismatch ? <p className="mt-1">{targetBranchMismatch ? 'العضو المستلم لا يتبع الفرع المختار.' : source?.memberId === target.id ? 'يجب اختيار عضو آخر لاستلام الاشتراك.' : 'نوع العضوية للعضوين غير متطابق.'}</p> : <p className="mt-1 flex items-center gap-1 text-emerald-700"><CheckCircle2 className="size-4" /> عضو مؤهل لاستلام الاشتراك</p>}</div> : null}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" /> تنبيه قبل التنفيذ</p><p className="mt-1 text-muted-foreground">سيتم إنهاء حق الاستخدام المتبقي لدى العضو الحالي وإنشاء اشتراك بالقيمة والمدة أو الحصص المتبقية للعضو الجديد في فرعه، دون إيصال أو قيد مالي جديد.</p></div>
        </div>
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => { setDialogOpen(false); resetForm(); }}>إلغاء</Button><Button variant="brand" disabled={saving || !source || !target || !targetBranchId || targetMismatch || targetBranchMismatch || reason.trim().length < 3} onClick={() => void transfer()}><UserRoundCheck className="size-4" /> {saving ? 'جاري التحويل…' : 'تأكيد تحويل الاشتراك'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
