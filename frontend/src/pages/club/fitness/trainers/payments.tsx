import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { usePermission } from '@/hooks/use-permission';
import { localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { ClubTrainerRow } from '@/types/fitness';
import { SELECT_CLS } from '../shared';

interface EarningPaymentRow {
  id: number;
  trainerId: number;
  trainer: { id: number; name: string };
  amount: number;
  paymentDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  notes: string | null;
}

export function FitnessTrainerPaymentsPage() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const canCreate = can('club.fitness.trainer_payments:create');
  const { data: trainers } = useQuery({
    queryKey: ['club-trainers', 'earning-payments'],
    queryFn: async () => (await api.get<{ data: ClubTrainerRow[] }>('/club-trainers', { params: { page: 1, pageSize: 200, isActive: true } })).data.data,
  });
  const { data: payments, isLoading, isError, refetch } = useQuery({
    queryKey: ['club-trainer-earning-payments'],
    queryFn: async () => (await api.get<EarningPaymentRow[]>('/club-trainers/earning-payments')).data,
  });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = localToday();
  const [form, setForm] = useState({ trainerId: '', amount: '', paymentDate: today, periodFrom: `${today.slice(0, 7)}-01`, periodTo: today, notes: '' });
  const { data: earnings, isFetching: loadingEarnings } = useQuery({
    queryKey: ['club-trainer-earnings-summary', form.trainerId, form.periodFrom, form.periodTo],
    queryFn: async () => (await api.get<{
      earned: number;
      paid: number;
      remaining: number;
      classCommission: number;
      subscriptionCommission: number;
    }>(`/club-trainers/${form.trainerId}/earnings-summary`, {
      params: { periodFrom: form.periodFrom, periodTo: form.periodTo },
    })).data,
    enabled: open && Boolean(form.trainerId && form.periodFrom && form.periodTo),
  });

  const openCreate = () => {
    setForm({ trainerId: trainers?.[0] ? String(trainers[0].id) : '', amount: '', paymentDate: today, periodFrom: `${today.slice(0, 7)}-01`, periodTo: today, notes: '' });
    setOpen(true);
  };
  const save = async () => {
    if (!form.trainerId || !Number(form.amount)) { toast.error('اختر المدرب وأدخل مبلغ الصرف'); return; }
    setSaving(true);
    try {
      await api.post(`/club-trainers/${form.trainerId}/earning-payments`, { amount: Number(form.amount), paymentDate: form.paymentDate, periodFrom: form.periodFrom, periodTo: form.periodTo, notes: form.notes || undefined });
      toast.success('تم تسجيل المبلغ المصروف للمدرب');
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ['club-trainer-earning-payments'] });
    } catch (error) { toast.error(apiError(error)); }
    finally { setSaving(false); }
  };
  const columns = useMemo<ColumnDef<EarningPaymentRow>[]>(() => [
    { accessorKey: 'trainer', header: 'المدرب', cell: ({ row }) => row.original.trainer.name },
    { accessorKey: 'amount', header: 'المبلغ المصروف', cell: ({ getValue }) => <b className="nums">{toArabicDigits(Number(getValue()).toFixed(2))} ج.م</b> },
    { accessorKey: 'paymentDate', header: 'تاريخ الصرف', cell: ({ getValue }) => <span className="nums">{toArabicDigits(String(getValue()))}</span> },
    { id: 'period', header: 'فترة الاستحقاق', cell: ({ row }) => row.original.periodFrom && row.original.periodTo ? <span className="nums">{toArabicDigits(row.original.periodFrom)} — {toArabicDigits(row.original.periodTo)}</span> : 'قديم/غير محدد' },
    { accessorKey: 'notes', header: 'ملاحظات', cell: ({ getValue }) => String(getValue() ?? '—') },
  ], []);

  return <div className="space-y-6">
    <PageHeader title="مستحقات المدربين" description="تسجيل المبالغ التي تم صرفها، لتظهر تلقائيًا داخل بوابة كل مدرب." actions={canCreate ? <Button variant="brand" onClick={openCreate}><Plus className="size-4" /> تسجيل صرف</Button> : undefined} />
    <DataTable columns={columns} data={payments ?? []} total={payments?.length ?? 0} page={1} pageSize={Math.max(10, payments?.length ?? 10)} onPageChange={() => undefined} onPageSizeChange={() => undefined} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} emptyTitle="لم يتم تسجيل أي مبالغ مصروفة" />
    <Dialog open={open} onOpenChange={setOpen}><DialogContent size="md" aria-describedby={undefined}><DialogHeader><DialogTitle>تسجيل صرف مستحقات</DialogTitle></DialogHeader><div className="grid gap-4"><div className="grid gap-2"><Label>المدرب *</Label><select className={SELECT_CLS} value={form.trainerId} onChange={(event) => setForm((current) => ({ ...current, trainerId: event.target.value, amount: '' }))}><option value="">اختر</option>{(trainers ?? []).map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}</select></div><div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>من *</Label><Input type="date" className="nums" value={form.periodFrom} onChange={(event) => setForm((current) => ({ ...current, periodFrom: event.target.value, amount: '' }))} /></div><div className="grid gap-2"><Label>إلى *</Label><Input type="date" className="nums" value={form.periodTo} onChange={(event) => setForm((current) => ({ ...current, periodTo: event.target.value, amount: '' }))} /></div></div>{form.trainerId && <div className="rounded-lg border bg-muted/40 p-3 text-sm">{loadingEarnings ? 'جارٍ حساب المستحق…' : <div className="grid grid-cols-3 gap-2"><span>المكتسب<br/><b className="nums">{toArabicDigits((earnings?.earned ?? 0).toFixed(2))}</b></span><span>المصروف<br/><b className="nums">{toArabicDigits((earnings?.paid ?? 0).toFixed(2))}</b></span><span>المتبقي<br/><b className="nums">{toArabicDigits((earnings?.remaining ?? 0).toFixed(2))}</b></span></div>}</div>}<div className="grid gap-2"><Label>المبلغ *</Label><div className="relative"><Wallet className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input type="number" min={0.01} max={earnings?.remaining} step="0.01" className="nums ps-9" value={form.amount} onFocus={() => { if (!form.amount && earnings?.remaining) setForm((current) => ({ ...current, amount: String(earnings.remaining) })); }} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></div></div><div className="grid gap-2"><Label>تاريخ الصرف *</Label><Input type="date" className="nums" value={form.paymentDate} onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))} /></div><div className="grid gap-2"><Label>ملاحظات</Label><Input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>{canCreate ? <Button permissionAction="create" variant="brand" onClick={() => void save()} disabled={saving || !earnings || Number(form.amount) > earnings.remaining}>حفظ</Button> : null}</DialogFooter></DialogContent></Dialog>
  </div>;
}
