import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRightLeft, CheckCircle2, Search, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { formatMoney, localToday } from '@/lib/formatters';
import { useListQuery } from '@/lib/use-list-query';
import { cn, toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem, ClubSubscriptionListItem } from '@/types/club';

interface MemberTransferHistory {
  id: number;
  source_subscription_id: number;
  destination_subscription_id: number;
  entitlement_kind: 'days' | 'sessions';
  remaining_days: number | null;
  remaining_sessions: number | null;
  transferred_value: number;
  effective_date: string;
  reason: string;
  created_at: string;
  source_member: { id: number; member_code: string; name: string };
  destination_member: { id: number; member_code: string; name: string };
}

function dateDaysRemaining(endDate: string) {
  const today = new Date(`${localToday()}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.max(0, Math.round((end.getTime() - today.getTime()) / 86_400_000) + 1);
}

export function ClubMemberTransferPage() {
  const listQuery = useListQuery({ pageSize: 200 });
  const [sourceSearch, setSourceSearch] = useState('');
  const [subscriptionId, setSubscriptionId] = useState('');
  const [target, setTarget] = useState<ClubMemberListItem | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const sourceListParams = useMemo(() => ({
    ...listQuery.params,
    page: 1,
    search: sourceSearch,
    filters: {
      ...listQuery.params.filters,
      status: 'active',
      isSpecial: 'false',
    },
  }), [listQuery.params, sourceSearch]);
  const { data: subscriptions, refetch: refetchSubscriptions, isLoading } = usePaginatedList<ClubSubscriptionListItem>('club-subscriptions', sourceListParams);
  const { data: history = [], refetch: refetchHistory } = useQuery({ queryKey: ['club-subscription-transfers', 'member-transfers'], queryFn: async () => (await api.get<MemberTransferHistory[]>('/club-subscription-transfers/member-transfers')).data });

  const eligible = useMemo(() => (subscriptions?.data ?? []).filter((row) => row.memberId && row.status === 'active' && !row.isSpecial && !row.privatePackageId && !/private|برايفت/i.test(row.subscriptionType ?? '') && row.remainingAmount <= 0.009).filter((row) => {
    const query = sourceSearch.trim().toLowerCase();
    return !query || `${row.customerName ?? ''} ${row.subscriptionNumber} ${row.subscriptionType ?? ''}`.toLowerCase().includes(query);
  }), [subscriptions?.data, sourceSearch]);
  const source = eligible.find((row) => row.id === Number(subscriptionId)) ?? null;
  const remainingSessions = source?.isLinkedToSessions ? Math.max(0, (source.sessionsCount ?? 0) - (source.sessionsUsed ?? 0)) : null;
  const remainingDays = source && !source.isLinkedToSessions ? dateDaysRemaining(source.subscriptionEndDate) : null;
  const totalUnits = source?.isLinkedToSessions ? Math.max(1, source.sessionsCount ?? 1) : source ? Math.max(1, Math.round((new Date(`${source.subscriptionEndDate}T00:00:00`).getTime() - new Date(`${source.subscriptionStartDate}T00:00:00`).getTime()) / 86_400_000) + 1) : 1;
  const remainingUnits = source?.isLinkedToSessions ? remainingSessions ?? 0 : remainingDays ?? 0;
  const netValue = source ? Math.max(0, source.subscriptionValue - (source.discountEnabled ? source.discountValue : 0)) : 0;
  const estimatedValue = source ? Math.round((netValue * remainingUnits / totalUnits) * 100) / 100 : 0;
  const targetMismatch = Boolean(source && target && (source.memberId === target.id || source.branchId !== target.branchId || (source.gender && source.gender !== target.gender)));

  const transfer = async () => {
    if (!source || !target || reason.trim().length < 3) { toast.error('اختر الاشتراك والعضو المستلم واكتب سبب التحويل'); return; }
    if (targetMismatch) { toast.error('العضو المستلم يجب أن يكون من نفس الفرع ونفس نوع العضوية'); return; }
    if (!window.confirm(`تأكيد نقل ${source.isLinkedToSessions ? `${remainingSessions} حصة` : `${remainingDays} يومًا`} من ${source.customerName} إلى ${target.name}؟`)) return;
    setSaving(true);
    try {
      await api.post('/club-subscription-transfers/to-member', { sourceSubscriptionId: source.id, destinationMemberId: target.id, reason: reason.trim() });
      toast.success('تم تحويل المتبقي إلى العضو الجديد بدون إنشاء حركة مالية');
      setSubscriptionId(''); setTarget(null); setReason('');
      await Promise.all([refetchSubscriptions(), refetchHistory()]);
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };

  return <div className="space-y-6">
    <PageHeader title="تحويل الاشتراك بين الأعضاء" description="نقل المدة أو الحصص المتبقية إلى عضو آخر مع الاحتفاظ بسجل كامل للعملية." actions={<Button asChild variant="outline"><Link to="/club/subscriptions"><ArrowLeft className="size-4" /> العودة للاشتراكات</Link></Button>} />
    <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><ArrowRightLeft className="size-5" /></span><div><h2 className="font-bold">بيانات التحويل</h2><p className="text-sm text-muted-foreground">تظهر الاشتراكات النشطة المسددة بالكامل فقط.</p></div></div>
        <div className="space-y-2"><Label>الاشتراك المصدر *</Label><div className="relative mb-2"><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" value={sourceSearch} onChange={(e) => setSourceSearch(e.target.value)} placeholder="ابحث باسم العضو أو رقم الاشتراك" /></div><select className="flex h-11 w-full rounded-md border bg-background px-3 text-sm" value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)}><option value="">{isLoading ? 'جاري التحميل…' : 'اختر اشتراكًا نشطًا'}</option>{eligible.map((row) => <option key={row.id} value={row.id}>{row.subscriptionNumber} — {row.customerName} — {row.subscriptionType}</option>)}</select></div>
        {source ? <div className="grid gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:grid-cols-3"><div><span className="text-xs text-muted-foreground">المتبقي</span><b className="block nums">{source.isLinkedToSessions ? `${toArabicDigits(remainingSessions ?? 0)} حصة` : `${toArabicDigits(remainingDays ?? 0)} يوم`}</b></div><div><span className="text-xs text-muted-foreground">القيمة المنقولة المتوقعة</span><b className="block">{formatMoney(estimatedValue)}</b></div><div><span className="text-xs text-muted-foreground">تاريخ النهاية</span><b className="block nums">{toArabicDigits(source.subscriptionEndDate)}</b></div></div> : null}
        <div className="space-y-2"><Label>العضو المستلم *</Label><MemberSearchCombobox selectedMember={target} onSelect={setTarget} onClear={() => setTarget(null)} /></div>
        {target ? <div className={cn('rounded-xl border p-3 text-sm', targetMismatch ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-emerald-500/30 bg-emerald-500/5')}><b>{target.name}</b> · <span className="font-mono nums">{target.memberCode}</span>{targetMismatch ? <p className="mt-1">اختر عضوًا آخر من نفس الفرع ونفس نوع العضوية.</p> : <p className="mt-1 flex items-center gap-1 text-emerald-700"><CheckCircle2 className="size-4" /> عضو مؤهل لاستلام الاشتراك</p>}</div> : null}
        <div className="space-y-2"><Label>سبب التحويل *</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اكتب سبب تحويل الاشتراك (3 أحرف على الأقل)" /></div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><p className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" /> تنبيه قبل التنفيذ</p><p className="mt-1 text-muted-foreground">سيتم إنهاء حق الاستخدام المتبقي لدى العضو الحالي وإنشاء اشتراك بالقيمة والمدة/الحصص المتبقية للعضو الجديد، دون إيصال أو قيد مالي جديد.</p></div>
        <Button variant="brand" className="w-full" disabled={saving || !source || !target || targetMismatch} onClick={() => void transfer()}><UserRoundCheck className="size-4" /> {saving ? 'جاري التحويل…' : 'تأكيد تحويل الاشتراك'}</Button>
      </section>
      <section className="rounded-2xl border bg-card p-5 shadow-sm"><h2 className="mb-4 font-bold">آخر التحويلات</h2><div className="max-h-[650px] space-y-3 overflow-auto pe-1">{history.map((item) => <article key={item.id} className="rounded-xl border p-4 text-sm"><div className="flex items-center justify-between gap-3"><b>{item.source_member.name} ← {item.destination_member.name}</b><span className="nums text-xs text-muted-foreground">{toArabicDigits(item.effective_date)}</span></div><p className="mt-2 text-muted-foreground"><span className="font-mono">{item.source_member.member_code}</span> ← <span className="font-mono">{item.destination_member.member_code}</span></p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-muted px-2.5 py-1 nums">{item.entitlement_kind === 'sessions' ? `${toArabicDigits(item.remaining_sessions ?? 0)} حصة` : `${toArabicDigits(item.remaining_days ?? 0)} يوم`}</span><span className="rounded-full bg-muted px-2.5 py-1">{formatMoney(Number(item.transferred_value))}</span></div><p className="mt-3 border-t pt-3 text-muted-foreground">{item.reason}</p></article>)}{!history.length ? <p className="py-12 text-center text-sm text-muted-foreground">لا توجد تحويلات بين الأعضاء حتى الآن.</p> : null}</div></section>
    </div>
  </div>;
}
