import { useMemo, useState } from 'react';
import { CheckCircle2, Eye, FileCheck2, Loader2, ReceiptText, XCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { confirm } from '@/lib/confirm';
import { openProtectedProof } from '@/lib/protected-proof';
import { useLocale } from '@/store/locale';

type RequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
type Request = {
  id: number;
  status: RequestStatus;
  applicant_name: string;
  applicant_phone: string;
  applicant_email?: string | null;
  applicant_gender?: 'male' | 'female' | null;
  package_name_snapshot: string;
  package_days_snapshot: number;
  price_snapshot: number;
  branch_id: number;
  payment_name_snapshot: string;
  payment_destination_snapshot?: string | null;
  payment_account_snapshot?: string | null;
  submitted_at?: string | null;
  created_at: string;
  rejection_reason?: string | null;
  proofUrl?: string | null;
  promoted_subscription_id?: number | null;
};
type Options = { branches: Array<{ id: number; name: string | null }> };

const statusLabel: Record<RequestStatus, string> = {
  draft: 'مسودة', submitted: 'بانتظار المراجعة', approved: 'معتمد ومُرحّل', rejected: 'مرفوض',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
}

function StatusText({ status }: { status: RequestStatus }) {
  const color = status === 'approved' ? 'text-emerald-700' : status === 'rejected' ? 'text-destructive' : 'text-amber-700';
  return <span className={`font-medium ${color}`}>{statusLabel[status]}</span>;
}

export function OnlineSubscriptionsPage() {
  const { ui } = useLocale();
  const client = useQueryClient();
  const [status, setStatus] = useState<string>('submitted');
  const [branchId, setBranchId] = useState<string>('all');
  const [selected, setSelected] = useState<Request | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [openingProof, setOpeningProof] = useState(false);

  const list = useQuery({ queryKey: ['online-subscriptions'], queryFn: async () => (await api.get<Request[]>('/online-subscriptions')).data });
  const options = useQuery({ queryKey: ['online-subscriptions-options'], queryFn: async () => (await api.get<Options>('/online-subscriptions/options')).data });
  const detail = useQuery({ queryKey: ['online-subscription', selected?.id], enabled: !!selected, queryFn: async () => (await api.get<Request>(`/online-subscriptions/${selected!.id}`)).data });
  const current = detail.data ?? selected;
  const filtered = useMemo(() => (list.data ?? []).filter((row) =>
    (status === 'all' || row.status === status) && (branchId === 'all' || row.branch_id === Number(branchId))), [list.data, status, branchId]);
  const totals = useMemo(() => ({
    pending: (list.data ?? []).filter((row) => row.status === 'submitted').length,
    approved: (list.data ?? []).filter((row) => row.status === 'approved').length,
  }), [list.data]);
  const branchName = (id: number) => options.data?.branches.find((branch) => branch.id === id)?.name ?? `${ui('فرع')} ${id}`;
  const refresh = () => void client.invalidateQueries({ queryKey: ['online-subscriptions'] });

  const approve = useMutation({
    mutationFn: async (id: number) => (await api.post(`/online-subscriptions/${id}/approve`)).data,
    onSuccess: (result) => { toast.success(ui(result.idempotent ? 'الطلب مُرحّل بالفعل' : 'تم اعتماد وترحيل الاشتراك')); refresh(); setSelected(null); },
    onError: (error) => toast.error(apiError(error)),
  });
  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => (await api.post(`/online-subscriptions/${id}/reject`, { reason })).data,
    onSuccess: () => { toast.success(ui('تم رفض الطلب')); refresh(); setSelected(null); setRejectReason(''); },
    onError: (error) => toast.error(apiError(error)),
  });

  const approveRequest = async () => {
    if (!current) return;
    const accepted = await confirm({ title: ui('اعتماد وترحيل الاشتراك'), description: ui('سيُنشئ النظام الاشتراك والإيصال والقيد المالي مرة واحدة. هل تريد المتابعة؟') });
    if (accepted) approve.mutate(current.id);
  };
  const openProof = async () => {
    if (!current?.proofUrl) return;
    setOpeningProof(true);
    try {
      await openProtectedProof(async () => {
        const response = await api.get(current.proofUrl!, { responseType: 'blob' });
        return response.data;
      });
    } catch (error) { toast.error(apiError(error)); }
    finally { setOpeningProof(false); }
  };

  return <div className="space-y-6">
    <PageHeader title={ui('الاشتراكات الأونلاين')} description={ui('راجع بيانات الطلب وإثبات التحويل، ثم اعتمد الاشتراك أو ارفضه بسبب واضح.')}/>
    {options.isError && <ErrorState message={apiError(options.error)} onRetry={() => void options.refetch()}/>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{ui('طلبات بانتظار المراجعة')}</p><b className="mt-1 block text-3xl nums">{totals.pending}</b></CardContent></Card>
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{ui('اشتراكات مُرحّلة')}</p><b className="mt-1 block text-3xl nums">{totals.approved}</b></CardContent></Card>
    </div>
    <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-2">
      <div><Label id="online-field-1">{ui('الحالة')}</Label><Select value={status} onValueChange={setStatus}><SelectTrigger aria-labelledby="online-field-1" className="mt-1.5 min-h-11"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{ui('كل الحالات')}</SelectItem><SelectItem value="submitted">{ui('بانتظار المراجعة')}</SelectItem><SelectItem value="approved">{ui('مُرحّل')}</SelectItem><SelectItem value="rejected">{ui('مرفوض')}</SelectItem></SelectContent></Select></div>
      <div><Label id="online-field-2">{ui('الفرع')}</Label><Select value={branchId} onValueChange={setBranchId}><SelectTrigger aria-labelledby="online-field-2" className="mt-1.5 min-h-11"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{ui('كل الفروع المتاحة')}</SelectItem>{options.data?.branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name ?? `${ui('فرع')} ${branch.id}`}</SelectItem>)}</SelectContent></Select></div>
    </CardContent></Card>
    {list.isLoading ? <LoadingState/> : list.isError ? <ErrorState message={apiError(list.error)} onRetry={() => void list.refetch()}/> : !filtered.length ? <EmptyState title={ui('لا توجد طلبات بهذه الفلاتر')} description={ui('ستظهر طلبات الموقع هنا فور إرسالها.')}/> : <>
      <div className="grid gap-3 md:hidden">{filtered.map((row) => <Card key={row.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><b>{row.applicant_name}</b><small className="mt-1 block text-muted-foreground" dir="ltr">{row.applicant_phone}</small></div><StatusText status={row.status}/></div><div className="grid grid-cols-2 gap-2 text-sm"><span>{row.package_name_snapshot}</span><span className="text-end nums">{Number(row.price_snapshot).toLocaleString('ar-EG')} ج.م</span><span className="text-muted-foreground">#{row.id}</span><span className="text-end text-muted-foreground">{branchName(row.branch_id)}</span></div><Button className="min-h-11 w-full gap-2" variant="outline" onClick={() => setSelected(row)}><Eye className="size-4"/>{ui('مراجعة الطلب')}</Button></CardContent></Card>)}</div>
      <Card className="hidden md:block"><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b bg-muted/40 text-start"><th className="p-4">{ui('الطلب')}</th><th className="p-4">{ui('العضو')}</th><th className="p-4">{ui('الفرع')}</th><th className="p-4">{ui('الباقة')}</th><th className="p-4">{ui('القيمة')}</th><th className="p-4">{ui('الحالة')}</th><th className="p-4">{ui('إجراء')}</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="p-4 nums">#{row.id}</td><td className="p-4"><b>{row.applicant_name}</b><small className="block text-muted-foreground" dir="ltr">{row.applicant_phone}</small></td><td className="p-4">{branchName(row.branch_id)}</td><td className="p-4">{row.package_name_snapshot}</td><td className="p-4 nums">{Number(row.price_snapshot).toLocaleString('ar-EG')} ج.م</td><td className="p-4"><StatusText status={row.status}/></td><td className="p-4"><Button size="sm" variant="outline" className="gap-2" onClick={() => setSelected(row)}><Eye className="size-4"/>{ui('مراجعة')}</Button></td></tr>)}</tbody></table></CardContent></Card>
    </>}
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setRejectReason(''); } }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{ui('مراجعة طلب أونلاين')} {current && `#${current.id}`}</DialogTitle></DialogHeader>{detail.isLoading ? <LoadingState/> : detail.isError ? <ErrorState message={apiError(detail.error)} onRetry={() => void detail.refetch()}/> : current && <div className="space-y-5"><div className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2"><p><span className="text-muted-foreground">{ui('العضو')}: </span>{current.applicant_name}</p><p dir="ltr"><span className="text-muted-foreground">{ui('الموبايل')}: </span>{current.applicant_phone}</p><p><span className="text-muted-foreground">{ui('القسم')}: </span>{current.applicant_gender === 'male' ? ui('رجال') : current.applicant_gender === 'female' ? ui('سيدات') : ui('غير محدد — يلزم استكماله قبل الاعتماد')}</p><p><span className="text-muted-foreground">{ui('الباقة')}: </span>{current.package_name_snapshot} · {current.package_days_snapshot} {ui('يوم')}</p><p><span className="text-muted-foreground">{ui('الفرع')}: </span>{branchName(current.branch_id)}</p><p className="nums"><span className="text-muted-foreground">{ui('القيمة')}: </span>{Number(current.price_snapshot).toLocaleString('ar-EG')} ج.م</p><p><span className="text-muted-foreground">{ui('طريقة الدفع')}: </span>{current.payment_name_snapshot}</p><p><span className="text-muted-foreground">{ui('جهة التحويل')}: </span>{current.payment_destination_snapshot || '—'}</p><p><span className="text-muted-foreground">{ui('الحساب')}: </span>{current.payment_account_snapshot || '—'}</p><p><span className="text-muted-foreground">{ui('تاريخ الإرسال')}: </span>{formatDate(current.submitted_at ?? current.created_at)}</p><p><span className="text-muted-foreground">{ui('الحالة')}: </span><StatusText status={current.status}/></p>{current.applicant_email && <p className="sm:col-span-2"><span className="text-muted-foreground">{ui('البريد الإلكتروني')}: </span>{current.applicant_email}</p>}</div>
        {current.proofUrl ? <Button type="button" variant="outline" className="min-h-11 gap-2" disabled={openingProof} onClick={() => void openProof()}>{openingProof ? <Loader2 className="size-4 animate-spin"/> : <ReceiptText className="size-4"/>}{ui(openingProof ? 'جاري فتح الإثبات…' : 'فتح إثبات التحويل المحمي')}</Button> : <p className="flex items-center gap-2 text-sm text-destructive"><FileCheck2 className="size-4"/>{ui('لا يوجد إثبات تحويل مرفق')}</p>}
        {current.status === 'rejected' && current.rejection_reason && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><b>{ui('سبب الرفض')}: </b>{current.rejection_reason}</p>}
        {current.status === 'approved' && current.promoted_subscription_id && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{ui('رقم الاشتراك المُرحّل')}: <b className="nums">#{current.promoted_subscription_id}</b></p>}
        {current.status === 'submitted' && <><div><Label id="online-field-3">{ui('سبب الرفض (مطلوب عند الرفض)')}</Label><Textarea aria-labelledby="online-field-3" className="mt-1.5 min-h-24" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder={ui('اكتب سببًا واضحًا يمكن الرجوع إليه')}/></div><DialogFooter className="gap-2 sm:gap-2"><Button variant="destructive" disabled={!rejectReason.trim() || reject.isPending || approve.isPending} onClick={() => reject.mutate({ id: current.id, reason: rejectReason })}><XCircle className="me-2 size-4"/>{ui('رفض الطلب')}</Button><Button disabled={approve.isPending || reject.isPending || !current.proofUrl} onClick={() => void approveRequest()}><CheckCircle2 className="me-2 size-4"/>{ui(approve.isPending ? 'جاري الترحيل…' : 'اعتماد وترحيل الاشتراك')}</Button></DialogFooter></>}
      </div>}</DialogContent></Dialog>
  </div>;
}
