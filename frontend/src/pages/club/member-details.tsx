import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarPlus, CreditCard, Dumbbell, Loader2, LockKeyhole, Receipt, RefreshCw, Repeat2, ShieldBan, Snowflake, Sun, WalletCards } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/states';
import { MemberCell } from '@/components/club/member-cell';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { formatDateTime, formatMoney } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { InbodyCreateDialog } from './fitness/inbody-create-dialog';
import { SubscriptionReceiptCreateDialog } from './subscription-receipt-create-dialog';
import type { ClubMemberWorkspace, ClubMemberWorkspaceSubscription } from '@/types/club';

function statusBadge(status: ClubMemberWorkspaceSubscription['status']) {
  const statusMap: Record<ClubMemberWorkspaceSubscription['status'], 'active' | 'expired' | 'pending' | 'suspended'> = {
    active: 'active',
    expired: 'expired',
    upcoming: 'pending',
    frozen: 'suspended',
  };
  return <StatusBadge status={statusMap[status]} />;
}

export function ClubMemberDetailsPage() {
  const { id } = useParams();
  const memberId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const canCreateSubscriptions = can('club.subscriptions:create') || can('club.subscriptions.list:create') || can('club.subscriptions.new:create') || can('club.reception:create');
  const canCreateReceipts = can('club.subscriptions:create');
  const canCreateLockers = can('club.lockers:create');
  const canCreateInbody = can('club.fitness:create');
  const canBlockMembers = can('club.members:update') || can('club.reception:update');
  const canUpdateSubscriptions = can('club.subscriptions:update') || can('club.subscriptions.list:update') || can('club.reception:update');
  const [inbodyDialogOpen, setInbodyDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['club-members', memberId, 'workspace'],
    enabled: Number.isInteger(memberId) && memberId > 0,
    queryFn: async () => (await api.get<ClubMemberWorkspace>(`/club-members/${memberId}/workspace`)).data,
  });

  const openSubscription = () => {
    if (!data) return;
    navigate('/club/subscriptions/new', { state: { prefillMember: data.member } });
  };

  const openLockerSubscription = () => {
    if (!data) return;
    navigate('/club/lockers', { state: { openSubOnMount: true, prefillMember: data.member } });
  };

  const blockMember = async () => {
    if (!data) return;
    const reason = data.member.isActive ? window.prompt('سبب الحظر (3 أحرف على الأقل):')?.trim() : undefined;
    if (data.member.isActive && (!reason || reason.length < 3)) return;
    const allowed = await confirm({
      title: data.member.isActive ? 'حظر العضو' : 'إلغاء حظر العضو',
      description: data.member.isActive ? `سيُمنع ${data.member.name} من استخدام الخدمات حتى إلغاء الحظر.` : `سيُعاد تفعيل ${data.member.name}.`,
      variant: data.member.isActive ? 'destructive' : 'default',
      confirmLabel: data.member.isActive ? 'حظر العضو' : 'إلغاء الحظر',
    });
    if (!allowed) return;
    try {
      if (data.member.isActive) await api.post(`/club-members/${memberId}/block`, { reason });
      else await api.post(`/club-members/${memberId}/unblock`);
      toast.success(data.member.isActive ? 'تم حظر العضو' : 'تم إلغاء حظر العضو');
      await queryClient.invalidateQueries({ queryKey: ['club-members', memberId, 'workspace'] });
      await queryClient.invalidateQueries({ queryKey: ['club-members'] });
    } catch (requestError) {
      toast.error(apiError(requestError));
    }
  };

  const openSubscriptionAction = (subscription: ClubMemberWorkspaceSubscription, action: 'renew' | 'freeze' | 'unfreeze' | 'transfer') => {
    navigate('/club/subscriptions', {
      state: { workspaceSubscriptionId: subscription.id, workspaceAction: action },
    });
  };

  if (isLoading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>;
  if (isError || !data) return <ErrorState message={error instanceof Error ? error.message : 'تعذر تحميل تفاصيل العضو'} onRetry={() => void refetch()} />;

  const { member, summary } = data;
  const fields = [
    ['كود العضو', member.memberCode],
    ['الفرع', member.branchId ? `#${toArabicDigits(member.branchId)}` : '—'],
    ['رقم الموبايل', member.phone ? toArabicDigits(member.phone) : '—'],
    ['الرقم القومي', member.cardNumber ? toArabicDigits(member.cardNumber) : '—'],
    ['البريد الإلكتروني', member.email ?? '—'],
    ['العنوان', member.address ?? '—'],
    ['الوظيفة', member.jobTitle ?? '—'],
    ['تاريخ الميلاد', member.dateOfBirth ? toArabicDigits(member.dateOfBirth) : '—'],
    ['الحالة الاجتماعية', member.maritalStatus ?? '—'],
    ['تاريخ التسجيل', member.createdAt ? formatDateTime(member.createdAt) : '—'],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="تفاصيل العضو"
        description="عرض بيانات العضو واشتراكاته وإجراء العمليات المرتبطة بها."
        actions={<Button variant="outline" onClick={() => navigate('/club/members')}><ArrowRight className="size-4" /> العودة للأعضاء</Button>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-6">
          <div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-4 shadow-sm">
            {canCreateSubscriptions ? <Button variant="brand" onClick={openSubscription}><CalendarPlus className="size-4" /> إضافة اشتراك جديد</Button> : null}
            {canCreateReceipts ? <Button variant="outline" onClick={() => setReceiptDialogOpen(true)}><Receipt className="size-4" /> إضافة إيصال</Button> : null}
            {canCreateInbody ? <Button variant="outline" onClick={() => setInbodyDialogOpen(true)}><Dumbbell className="size-4" /> قياسات InBody</Button> : null}
            {canBlockMembers ? <Button variant={member.isActive ? 'destructive' : 'outline'} onClick={() => void blockMember()} disabled={isFetching}><ShieldBan className="size-4" /> {member.isActive ? 'حظر العميل' : 'إلغاء حظر العميل'}</Button> : null}
            {canCreateLockers ? <Button variant="outline" onClick={openLockerSubscription}><LockKeyhole className="size-4" /> إضافة اشتراك لوكر</Button> : null}
          </div>

          <section className="rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b p-4"><h2 className="font-bold">اشتراكات العضو</h2><span className="rounded-full bg-muted px-3 py-1 text-sm nums">{toArabicDigits(summary.subscriptionCount)}</span></div>
            {data.subscriptions.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3 text-start">الاشتراك</th><th className="p-3 text-start">من</th><th className="p-3 text-start">إلى</th><th className="p-3 text-start">المدفوع</th><th className="p-3 text-start">المتبقي</th><th className="p-3 text-start">الحالة</th><th className="p-3 text-start">الإجراء</th></tr></thead>
                  <tbody>
                    {data.subscriptions.map((subscription) => <tr key={subscription.id} className="border-t"><td className="p-3"><b>{subscription.subscriptionType ?? 'اشتراك'}</b><span className="mt-1 block font-mono text-xs text-muted-foreground">{subscription.subscriptionNumber}</span></td><td className="p-3 nums">{toArabicDigits(subscription.startDate)}</td><td className="p-3 nums">{toArabicDigits(subscription.endDate)}</td><td className="p-3">{formatMoney(subscription.paidAmount)}</td><td className="p-3">{formatMoney(subscription.remainingAmount)}</td><td className="p-3">{statusBadge(subscription.status)}</td><td className="p-3">{canUpdateSubscriptions ? <div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => openSubscriptionAction(subscription, 'renew')}><RefreshCw className="size-3.5" /> تجديد</Button><Button size="sm" variant="outline" onClick={() => openSubscriptionAction(subscription, 'transfer')}><Repeat2 className="size-3.5" /> تحويل</Button><Button size="sm" variant="outline" onClick={() => navigate(`/club/subscriptions/refunds?memberId=${subscription.memberId ?? member.id}&subscriptionId=${subscription.id}`)}><WalletCards className="size-3.5" /> مرتجع</Button>{subscription.status === 'frozen' ? <Button size="sm" variant="outline" onClick={() => openSubscriptionAction(subscription, 'unfreeze')}><Sun className="size-3.5" /> إلغاء التجميد</Button> : <Button size="sm" variant="outline" disabled={subscription.status !== 'active'} onClick={() => openSubscriptionAction(subscription, 'freeze')}><Snowflake className="size-3.5" /> تجميد</Button>}</div> : '—'}</td></tr>)}
                  </tbody>
                </table>
              </div>
            ) : <p className="p-10 text-center text-sm text-muted-foreground">لا توجد اشتراكات مسجلة لهذا العضو بعد.</p>}
          </section>

          <section className="rounded-2xl border bg-card shadow-sm"><div className="border-b p-4"><h2 className="font-bold">اشتراكات اللوكر</h2></div>{data.lockerSubscriptions.length ? <div className="divide-y">{data.lockerSubscriptions.map((subscription) => <div key={subscription.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><div><b>{subscription.subscriptionType ?? 'لوكر'} {subscription.lockerNumber ? `— ${subscription.lockerNumber}` : ''}</b><p className="mt-1 font-mono text-xs text-muted-foreground">{subscription.subscriptionNumber}</p></div><div className="nums text-muted-foreground">{toArabicDigits(subscription.startDate)} — {toArabicDigits(subscription.endDate)}</div><div>{formatMoney(subscription.paidAmount)}</div><StatusBadge status={subscription.status === 'active' ? 'active' : subscription.status === 'expired' ? 'expired' : 'pending'} /></div>)}</div> : <p className="p-8 text-center text-sm text-muted-foreground">لا توجد اشتراكات لوكر.</p>}</section>
        </section>

        <aside className="h-fit rounded-2xl border bg-card p-5 shadow-sm">
          <MemberCell name={member.name} code={member.memberCode} profilePicture={member.profilePicture} />
          <div className="mt-4 flex items-center justify-between"><h2 className="font-bold">بيانات العضو</h2><StatusBadge status={member.isActive ? 'active' : 'suspended'} /></div>
          <dl className="mt-4 divide-y text-sm">{fields.map(([label, value]) => <div key={label} className="grid grid-cols-[105px_minmax(0,1fr)] gap-3 py-2"><dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}</dl>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-5"><div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">إجمالي المدفوع</p><b className="mt-1 block">{formatMoney(summary.totalPaid)}</b></div><div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">النقاط</p><b className="mt-1 block nums">{toArabicDigits(summary.pointsBalance)}</b></div></div>
        </aside>
      </div>
      <InbodyCreateDialog open={inbodyDialogOpen} onOpenChange={setInbodyDialogOpen} member={member} />
      <SubscriptionReceiptCreateDialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen} member={member} />
    </div>
  );
}
