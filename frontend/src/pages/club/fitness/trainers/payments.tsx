import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { formatMoneyNumber } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { ClubTrainerRow } from '@/types/fitness';
import { SELECT_CLS } from '../shared';
import { cairoToday, useClientTable } from './trainer-shared';
import { SearchableSelect } from '@/components/common/searchable-select';

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

interface EarningsSummary {
  earned: number;
  paid: number;
  remaining: number;
  classRevenue: number;
  classCommission: number;
  privateRevenue: number;
  privateCommission: number;
  conflicts: Array<{ periodFrom: string; periodTo: string }>;
}

const money = (value: number) => formatMoneyNumber(value ?? 0);

export function FitnessTrainerPaymentsPage() {
  const qc = useQueryClient();
  const { data: trainers } = useQuery({
    queryKey: ['club-trainers', 'earning-payments'],
    // Inactive trainers stay here: they may still have earnings to be paid.
    queryFn: async () => (await api.get<{ data: ClubTrainerRow[] }>('/club-trainers', { params: { page: 1, pageSize: 500 } })).data.data,
  });
  const { data: payments, isLoading, isError, refetch } = useQuery({
    queryKey: ['club-trainer-earning-payments'],
    queryFn: async () => (await api.get<EarningPaymentRow[]>('/club-trainers/earning-payments')).data,
  });
  const table = useClientTable(payments ?? []);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = cairoToday();
  const emptyForm = () => ({ trainerId: '', amount: '', paymentDate: today, periodFrom: `${today.slice(0, 7)}-01`, periodTo: today, notes: '' });
  const [form, setForm] = useState(emptyForm);
  const { data: earnings, isFetching: loadingEarnings, error: earningsError } = useQuery({
    queryKey: ['club-trainer-earnings-summary', form.trainerId, form.periodFrom, form.periodTo],
    queryFn: async () => (await api.get<EarningsSummary>(`/club-trainers/${form.trainerId}/earnings-summary`, {
      params: { periodFrom: form.periodFrom, periodTo: form.periodTo },
    })).data,
    enabled: open && Boolean(form.trainerId && form.periodFrom && form.periodTo && form.periodFrom <= form.periodTo),
    retry: false,
  });

  const openCreate = () => {
    setForm(emptyForm());
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
      await qc.invalidateQueries({ queryKey: ['club-trainer-earnings-summary'] });
    } catch (error) { toast.error(apiError(error)); }
    finally { setSaving(false); }
  };
  const columns = useMemo<ColumnDef<EarningPaymentRow>[]>(() => [
    { accessorKey: 'trainer', header: 'المدرب', cell: ({ row }) => row.original.trainer.name },
    { accessorKey: 'amount', header: 'المبلغ المصروف', cell: ({ getValue }) => <b className="nums">{money(Number(getValue()))} ج.م</b> },
    { accessorKey: 'paymentDate', header: 'تاريخ الصرف', cell: ({ getValue }) => <span className="nums">{toArabicDigits(String(getValue()))}</span> },
    { id: 'period', header: 'فترة الاستحقاق', cell: ({ row }) => row.original.periodFrom && row.original.periodTo ? <span className="nums">{toArabicDigits(row.original.periodFrom)} — {toArabicDigits(row.original.periodTo)}</span> : 'قديم/غير محدد' },
    { accessorKey: 'notes', header: 'ملاحظات', cell: ({ getValue }) => String(getValue() ?? '—') },
  ], []);

  const conflicts = earnings?.conflicts ?? [];
  const periodInvalid = form.periodFrom > form.periodTo;
  const canSave = Boolean(earnings) && !conflicts.length && Number(form.amount) > 0 && Number(form.amount) <= (earnings?.remaining ?? 0);

  return <div className="space-y-6">
    <PageHeader title="مستحقات المدربين" description="المستحق = عمولة الحصص على الأعضاء الحاضرين فقط + عمولة جلسات البرايفت المسجلة عند الحضور. كل يوم يُصرف في فترة واحدة فقط." actions={<Button variant="brand" onClick={openCreate}><Plus className="size-4" /> تسجيل صرف</Button>} />
    <DataTable columns={columns} {...table} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} emptyTitle="لم يتم تسجيل أي مبالغ مصروفة" />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="md" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>تسجيل صرف مستحقات</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>المدرب *</Label>
            <SearchableSelect className={SELECT_CLS} value={form.trainerId} onChange={(event) => setForm((current) => ({ ...current, trainerId: event.target.value, amount: '' }))}>
              <option value="">اختر</option>
              {(trainers ?? []).map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}{trainer.isActive ? '' : ' (غير نشط)'}</option>)}
            </SearchableSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>من *</Label><Input type="date" className="nums" value={form.periodFrom} onChange={(event) => setForm((current) => ({ ...current, periodFrom: event.target.value, amount: '' }))} /></div>
            <div className="grid gap-2"><Label>إلى *</Label><Input type="date" className="nums" value={form.periodTo} onChange={(event) => setForm((current) => ({ ...current, periodTo: event.target.value, amount: '' }))} /></div>
          </div>
          {periodInvalid && <p className="text-sm text-destructive">تاريخ البداية يجب أن يكون قبل النهاية.</p>}
          {form.trainerId && !periodInvalid && (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
              {loadingEarnings ? 'جارٍ حساب المستحق…' : earningsError ? <span className="text-destructive">{apiError(earningsError)}</span> : <>
                <div className="grid grid-cols-3 gap-2">
                  <span>المكتسب<br /><b className="nums">{money(earnings?.earned ?? 0)}</b></span>
                  <span>المصروف<br /><b className="nums">{money(earnings?.paid ?? 0)}</b></span>
                  <span>المتبقي<br /><b className="nums">{money(earnings?.remaining ?? 0)}</b></span>
                </div>
                <p className="text-xs text-muted-foreground">
                  عمولة الحصص <span className="nums">{money(earnings?.classCommission ?? 0)}</span> (من إيراد حضور <span className="nums">{money(earnings?.classRevenue ?? 0)}</span>)
                  {' — '}عمولة البرايفت <span className="nums">{money(earnings?.privateCommission ?? 0)}</span>
                </p>
                {conflicts.length > 0 && (
                  <p className="flex items-start gap-2 text-destructive">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>الفترة تتداخل مع فترة صرف سابقة: {conflicts.map((c) => `${toArabicDigits(c.periodFrom)} — ${toArabicDigits(c.periodTo)}`).join('، ')}. اختر نفس الفترة لصرف باقيها، أو فترة لا تشترك معها في أي يوم.</span>
                  </p>
                )}
              </>}
            </div>
          )}
          <div className="grid gap-2">
            <Label>المبلغ *</Label>
            <div className="relative">
              <Wallet className="absolute start-3 top-3 size-4 text-muted-foreground" />
              <Input type="number" min={0.01} max={earnings?.remaining} step="0.01" className="nums ps-9" value={form.amount} onFocus={() => { if (!form.amount && earnings?.remaining) setForm((current) => ({ ...current, amount: String(earnings.remaining) })); }} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
            </div>
          </div>
          <div className="grid gap-2"><Label>تاريخ الصرف *</Label><Input type="date" className="nums" value={form.paymentDate} onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))} /></div>
          <div className="grid gap-2"><Label>ملاحظات</Label><Input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button variant="brand" onClick={() => void save()} disabled={saving || !canSave}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
