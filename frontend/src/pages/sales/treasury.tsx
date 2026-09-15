import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  HandCoins,
  ReceiptText,
  RotateCcw,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { usePosEmployeeOptions } from '@/hooks/use-pos-employee-options';
import { useCurrentShiftSession } from '@/hooks/use-shift-session';
import { api, apiError } from '@/lib/api';
import { formatDate, formatTimeFromDate, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';

import { resolveTreasuryReportDate } from './treasury-operating-date';

type MovementType = 'petty_expense' | 'custody_issue' | 'custody_return';

interface SessionLine {
  id: number;
  status: string;
  openingBalance: number;
  expectedClosingBalance: number | null;
  closingBalance: number | null;
  cashDifference: number | null;
  shortageReason: string | null;
  cashDropAmount: number;
  retainedAmount: number;
  totalCash: number;
  shift?: { shiftName: string };
}

interface DailyReport {
  date: string;
  summary: {
    totalCash: number;
    totalCard: number;
    totalWallet: number;
    totalTransfer: number;
    totalCashDifference: number;
    totalTransactions: number;
    openShiftsCount: number;
  };
  sessions: SessionLine[];
}

interface DrawerMovement {
  id: number;
  reference: string;
  movement_type: string;
  direction: 'in' | 'out';
  amount: number;
  category: string | null;
  description: string | null;
  created_at: string;
  sourceReference?: string | null;
  employee?: { id: number; employee: string | null; emp_code: number | null } | null;
}

interface OpenCustody {
  id: number;
  reference: string;
  employeeId: number | null;
  employee: { id: number; employee: string | null; emp_code: number | null } | null;
  description: string | null;
  issuedAmount: number;
  returnedAmount: number;
  outstandingAmount: number;
  issuedAt: string;
}

interface OpenCustodiesResponse {
  data: OpenCustody[];
  summary: { count: number; outstanding: number };
}

const movementLabels: Record<string, string> = {
  petty_expense: 'مصروف تشغيلي',
  custody_issue: 'صرف عهدة',
  custody_return: 'رد عهدة',
  shift_transfer_in: 'استلام من وردية',
  shift_transfer_out: 'تسليم لوردية',
  cash_drop: 'توريد للخزنة',
  account_settlement: 'تحصيل حساب موظف / شريك',
};

export function SalesTreasuryPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('gym-sales.sales.treasury:create');
  const qc = useQueryClient();
  const { data: branches } = useBranches();
  const { data: employees = [] } = usePosEmployeeOptions();
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(localToday());
  const userSelectedDate = useRef(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [movementType, setMovementType] = useState<MovementType>('petty_expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('urgent_purchase');
  const [employeeId, setEmployeeId] = useState('');
  const [sourceTransactionId, setSourceTransactionId] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const effectiveBranch = branchId || String(branches?.[0]?.id ?? '');
  const { data: current } = useCurrentShiftSession(effectiveBranch);

  useEffect(() => {
    const reportDate = resolveTreasuryReportDate(
      date,
      current?.sessionDate,
      userSelectedDate.current,
    );

    if (reportDate !== date) {
      setDate(reportDate);
    }
  }, [current?.sessionDate, date]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shift-sessions', 'daily-report', effectiveBranch, date],
    queryFn: async () => (await api.get<DailyReport>('/shift-sessions/daily-report', {
      params: { branchId: effectiveBranch, date },
    })).data,
    enabled: !!effectiveBranch,
  });
  const { data: movements } = useQuery({
    queryKey: ['shift-sessions', 'drawer-movements', effectiveBranch, date],
    queryFn: async () => (await api.get<{ data: DrawerMovement[] }>('/shift-sessions/drawer-movements', {
      params: { branchId: effectiveBranch, dateFrom: date, dateTo: date, pageSize: 100 },
    })).data,
    enabled: !!effectiveBranch,
  });
  const { data: custodies, isLoading: custodiesLoading } = useQuery({
    queryKey: ['shift-sessions', 'custodies', effectiveBranch],
    queryFn: async () => (await api.get<OpenCustodiesResponse>('/shift-sessions/custodies/open', {
      params: { branchId: effectiveBranch },
    })).data,
    enabled: !!effectiveBranch,
  });

  const selectedCustody = useMemo(
    () => custodies?.data.find((custody) => custody.id === Number(sourceTransactionId)) ?? null,
    [custodies?.data, sourceTransactionId],
  );

  const openMovement = (type: MovementType, custody?: OpenCustody) => {
    if (!canCreate) return;
    setMovementType(type);
    setAmount(custody ? String(custody.outstandingAmount) : '');
    setEmployeeId(custody?.employeeId ? String(custody.employeeId) : '');
    setSourceTransactionId(custody ? String(custody.id) : '');
    setDescription(custody ? `رد عهدة ${custody.reference}` : '');
    setMovementOpen(true);
  };

  const chooseCustody = (id: string) => {
    const custody = custodies?.data.find((item) => item.id === Number(id));
    setSourceTransactionId(id);
    setEmployeeId(custody?.employeeId ? String(custody.employeeId) : '');
    setAmount(custody ? String(custody.outstandingAmount) : '');
    setDescription(custody ? `رد عهدة ${custody.reference}` : '');
  };

  const saveMovement = async () => {
    if (!canCreate) return;
    if (!current) return toast.error(ui('افتح وردية أولاً لتسجيل حركة الدرج'));
    if (!Number(amount) || !description.trim()) return toast.error(ui('أدخل المبلغ وسبب الحركة'));
    if (movementType === 'custody_issue' && !employeeId) return toast.error(ui('اختر الموظف صاحب العهدة'));
    if (movementType === 'custody_return' && !sourceTransactionId) return toast.error(ui('اختر العهدة المصروفة التي يتم ردها'));
    if (movementType === 'custody_return' && selectedCustody && Number(amount) > selectedCustody.outstandingAmount + 0.001) {
      return toast.error(ui('قيمة الرد أكبر من المتبقي على العهدة'));
    }
    setSaving(true);
    try {
      await api.post('/shift-sessions/drawer-movements', {
        sessionId: current.id,
        movementType,
        amount: Number(amount),
        category: movementType === 'petty_expense' ? category : undefined,
        employeeId: movementType === 'custody_issue' ? Number(employeeId) : undefined,
        sourceTransactionId: movementType === 'custody_return' ? Number(sourceTransactionId) : undefined,
        description: description.trim(),
      });
      toast.success(ui(movementType === 'custody_return' ? 'تم رد العهدة وتحديث رصيدها والدرج والقيد المحاسبي' : 'تم تسجيل الحركة وتحديث الدرج والقيد المحاسبي'));
      setMovementOpen(false);
      setAmount('');
      setDescription('');
      setSourceTransactionId('');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['shift-sessions'] }),
        qc.invalidateQueries({ queryKey: ['shift-sessions', 'drawer-movements'] }),
        qc.invalidateQueries({ queryKey: ['shift-sessions', 'custodies'] }),
      ]);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const summary = data?.summary;
  const cards = [
    { label: ui('النقدي المحصل'), value: summary?.totalCash ?? 0, icon: Banknote, tone: 'text-emerald-600' },
    { label: ui('المتوقع الآن في الدرج'), value: current?.expectedClosingBalance ?? 0, icon: WalletCards, tone: 'text-primary' },
    { label: ui('العهد المفتوحة'), value: custodies?.summary.outstanding ?? 0, icon: HandCoins, tone: 'text-amber-600' },
    { label: ui('فرق الجرد'), value: summary?.totalCashDifference ?? 0, icon: AlertTriangle, tone: (summary?.totalCashDifference ?? 0) < 0 ? 'text-destructive' : 'text-emerald-600' },
  ];

  return (
    <GymSalesPageShell
      section="sales"
      title={ui('الخزينة والدرج')}
      description={ui('كل حركة نقدية مرتبطة بالوردية وصاحبها وأصل العهدة وقيدها المحاسبي')}
    >
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border bg-muted/20 p-4">
        <div>
          <Label className="text-xs">{ui('الفرع')}</Label>
          <select className="mt-1 block h-10 rounded-md border bg-background px-3 text-sm" value={effectiveBranch} onChange={(event) => setBranchId(event.target.value)}>
            {(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">{ui('التاريخ')}</Label>
          <Input
            className="nums mt-1"
            type="date"
            value={date}
            onChange={(event) => {
              if (!event.target.value) return;
              userSelectedDate.current = true;
              setDate(event.target.value);
            }}
          />
        </div>
        <div className={`ms-auto rounded-xl px-4 py-2 text-sm font-bold ${current ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/20'}`}>
          {current ? `${ui('الوردية المفتوحة')}: ${current.shift?.shiftName ?? `#${current.shiftId}`}` : ui('لا توجد وردية مفتوحة لهذا المستخدم')}
        </div>
      </div>

      {canCreate ? <div className="mb-5 grid gap-3 md:grid-cols-3">
        <button type="button" disabled={!current} onClick={() => openMovement('petty_expense')} className="group rounded-2xl border bg-card p-4 text-start transition hover:border-primary/50 hover:shadow-sm disabled:opacity-50">
          <span className="mb-3 grid size-10 place-items-center rounded-xl bg-rose-50 text-rose-600"><ReceiptText className="size-5" /></span>
          <b>{ui('تسجيل مصروف')}</b><p className="mt-1 text-xs text-muted-foreground">{ui('صيانة، خدمة طارئة أو مشتريات سريعة')}</p>
        </button>
        <button type="button" disabled={!current} onClick={() => openMovement('custody_issue')} className="group rounded-2xl border bg-card p-4 text-start transition hover:border-primary/50 hover:shadow-sm disabled:opacity-50">
          <span className="mb-3 grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-600"><HandCoins className="size-5" /></span>
          <b>{ui('صرف عهدة')}</b><p className="mt-1 text-xs text-muted-foreground">{ui('تُسجل على الموظف حتى ردها جزئياً أو بالكامل')}</p>
        </button>
        <button type="button" disabled={!current || !custodies?.summary.count} onClick={() => openMovement('custody_return')} className="group rounded-2xl border bg-card p-4 text-start transition hover:border-primary/50 hover:shadow-sm disabled:opacity-50">
          <span className="mb-3 grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><RotateCcw className="size-5" /></span>
          <b>{ui('رد عهدة')}</b><p className="mt-1 text-xs text-muted-foreground">{ui('اختر من العهد المصروفة فعلياً؛ لا يمكن رد أكثر من المتبقي')}</p>
        </button>
      </div> : null}

      {isError ? <div className="mb-5 flex items-center justify-between rounded-xl border border-destructive/40 bg-destructive/5 p-4"><span>{ui('تعذر تحميل بيانات الخزينة')}</span><Button variant="outline" onClick={() => void refetch()}>{ui('إعادة المحاولة')}</Button></div> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <Card key={card.label}><CardContent className="flex items-center gap-3 p-4"><span className="grid size-11 place-items-center rounded-xl bg-muted"><card.icon className={`size-5 ${card.tone}`} /></span><div><p className="text-xs text-muted-foreground">{card.label}</p><p className={`nums text-xl font-black ${card.tone}`}>{isLoading ? '…' : toArabicDigits(card.value.toFixed(2))} <small>EGP</small></p></div></CardContent></Card>)}
      </div>

      <section className="mb-5 overflow-hidden rounded-2xl border">
        <div className="flex items-center justify-between border-b bg-amber-50/60 px-4 py-3 dark:bg-amber-950/10">
          <div><h3 className="font-bold">{ui('العهد المطلوب ردها')}</h3><p className="text-xs text-muted-foreground">{ui('الرصيد المتبقي الحقيقي لكل عهدة بعد خصم كل الردود السابقة')}</p></div>
          <Badge variant="outline">{toArabicDigits(custodies?.summary.count ?? 0)} {ui('عهدة')}</Badge>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {(custodies?.data ?? []).map((custody) => (
            <div key={custody.id} className="rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2"><div><b>{custody.employee?.employee ?? ui('موظف غير محدد')}</b><p className="nums text-xs text-muted-foreground">{custody.reference} · {formatDate(custody.issuedAt)}</p></div><Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{toArabicDigits(custody.outstandingAmount.toFixed(2))} EGP</Badge></div>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{custody.description}</p>
              <div className="mt-3 flex items-center justify-between text-xs"><span>{ui('المصروف')}: <b className="nums">{toArabicDigits(custody.issuedAmount.toFixed(2))}</b></span><span>{ui('المردود')}: <b className="nums text-emerald-600">{toArabicDigits(custody.returnedAmount.toFixed(2))}</b></span></div>
              {canCreate ? <Button permissionAction="create" className="mt-3 w-full" size="sm" variant="outline" disabled={!current} onClick={() => openMovement('custody_return', custody)}><RotateCcw className="me-2 size-3.5" />{ui('تسجيل رد')}</Button> : null}
            </div>
          ))}
          {!custodiesLoading && !custodies?.data.length ? <p className="col-span-full py-5 text-center text-sm text-muted-foreground">{ui('لا توجد عهد مفتوحة — كل العهد المصروفة تم ردها')}</p> : null}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <section className="overflow-hidden rounded-2xl border">
          <div className="border-b bg-muted/30 px-4 py-3 font-bold">{ui('تسويات الورديات')}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-3 text-start">{ui('الشيفت')}</th>
                  <th>{ui('افتتاح')}</th>
                  <th>{ui('نقدي')}</th>
                  <th>{ui('توريد')}</th>
                  <th>{ui('مُسلّم')}</th>
                  <th>{ui('فرق')}</th>
                  <th className="text-start">{ui('سبب العجز')}</th>
                </tr>
              </thead>
              <tbody>
                {(data?.sessions ?? []).map((session) => {
                  const hasShortage = (session.cashDifference ?? 0) < -0.01;
                  return (
                    <tr key={session.id} className="border-b last:border-0">
                      <td className="p-3 font-semibold">{session.shift?.shiftName ?? `#${session.id}`}</td>
                      <td className="nums text-center">{toArabicDigits(session.openingBalance.toFixed(2))}</td>
                      <td className="nums text-center">{toArabicDigits(session.totalCash.toFixed(2))}</td>
                      <td className="nums text-center">{toArabicDigits(session.cashDropAmount.toFixed(2))}</td>
                      <td className="nums text-center">{toArabicDigits(session.retainedAmount.toFixed(2))}</td>
                      <td className={`nums text-center font-bold ${hasShortage ? 'text-destructive' : ''}`}>
                        {toArabicDigits((session.cashDifference ?? 0).toFixed(2))}
                      </td>
                      <td className="max-w-64 p-3 text-start">
                        {hasShortage ? (
                          <span className="block rounded-lg bg-destructive/5 px-2 py-1 text-xs text-destructive">
                            {session.shortageReason || ui('سبب غير مسجل')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!data?.sessions.length ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">{ui('لا توجد جلسات في هذا اليوم')}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border">
          <div className="border-b bg-muted/30 px-4 py-3 font-bold">{ui('سجل حركات الدرج')}</div>
          <div className="max-h-[460px] divide-y overflow-y-auto">
            {(movements?.data ?? []).map((movement) => <div key={movement.id} className="flex items-center gap-3 p-3"><span className={`grid size-9 place-items-center rounded-full ${movement.direction === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{movement.direction === 'in' ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1"><p className="truncate text-sm font-semibold">{movementLabels[movement.movement_type] ? ui(movementLabels[movement.movement_type]) : movement.movement_type}</p>{movement.employee?.employee ? <Badge variant="secondary" className="text-[10px]">{movement.employee.employee}</Badge> : null}</div><p className="truncate text-xs text-muted-foreground">{movement.description}</p><p className="nums text-[10px] text-muted-foreground">{movement.reference}{movement.sourceReference ? ` ← ${movement.sourceReference}` : ''} · {formatTimeFromDate(movement.created_at)}</p></div><b className={`nums ${movement.direction === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>{movement.direction === 'in' ? '+' : '-'}{toArabicDigits(movement.amount.toFixed(2))}</b></div>)}
            {!movements?.data?.length ? <p className="p-8 text-center text-sm text-muted-foreground">{ui('لا توجد حركات درج')}</p> : null}
          </div>
        </section>
      </div>

      <Dialog open={canCreate && movementOpen} onOpenChange={setMovementOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{ui(movementType === 'petty_expense' ? 'تسجيل مصروف من الدرج' : movementType === 'custody_issue' ? 'صرف عهدة لموظف' : 'رد عهدة مصروفة')}</DialogTitle><DialogDescription>{ui('الحفظ يحدّث رصيد الدرج وسجل الحركة والقيد المحاسبي في عملية واحدة.')}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">{([['petty_expense', ui('مصروف')], ['custody_issue', ui('صرف عهدة')], ['custody_return', ui('رد عهدة')]] as const).map(([value, label]) => <Button key={value} type="button" size="sm" variant={movementType === value ? 'default' : 'ghost'} onClick={() => openMovement(value)}>{label}</Button>)}</div>
            {movementType === 'custody_return' ? <div><Label>{ui('العهدة المطلوب ردها')}</Label><select className="mt-1 h-11 w-full rounded-md border bg-background px-3" value={sourceTransactionId} onChange={(event) => chooseCustody(event.target.value)}><option value="">{ui('اختر من العهد المصروفة')}</option>{(custodies?.data ?? []).map((custody) => <option key={custody.id} value={custody.id}>{custody.employee?.employee ?? ui('موظف')} · {custody.reference} · {custody.outstandingAmount.toFixed(2)} EGP</option>)}</select></div> : null}
            {movementType === 'custody_issue' ? <div><Label>{ui('الموظف صاحب العهدة')}</Label><select className="mt-1 h-11 w-full rounded-md border bg-background px-3" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">{ui('اختر الموظف')}</option>{employees.map((employee) => <option key={employee.value} value={employee.value}>{employee.label} · {employee.description}</option>)}</select></div> : null}
            {selectedCustody ? <div className="grid grid-cols-3 gap-2 rounded-xl border bg-amber-50/60 p-3 text-center text-xs dark:bg-amber-950/10"><div><span className="text-muted-foreground">{ui('المصروف')}</span><b className="nums mt-1 block">{toArabicDigits(selectedCustody.issuedAmount.toFixed(2))}</b></div><div><span className="text-muted-foreground">{ui('تم رده')}</span><b className="nums mt-1 block text-emerald-600">{toArabicDigits(selectedCustody.returnedAmount.toFixed(2))}</b></div><div><span className="text-muted-foreground">{ui('المتبقي')}</span><b className="nums mt-1 block text-amber-700">{toArabicDigits(selectedCustody.outstandingAmount.toFixed(2))}</b></div></div> : null}
            <div><Label>{ui(movementType === 'custody_return' ? 'المبلغ المُراد رده' : 'المبلغ')}</Label><Input className="nums mt-1" type="number" min={0.01} max={selectedCustody?.outstandingAmount} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
            {movementType === 'petty_expense' ? <div><Label>{ui('نوع المصروف')}</Label><select className="mt-1 h-11 w-full rounded-md border bg-background px-3" value={category} onChange={(event) => setCategory(event.target.value)}><option value="maintenance">{ui('صيانة')}</option><option value="emergency_service">{ui('خدمة طارئة')}</option><option value="urgent_purchase">{ui('مشتريات عاجلة')}</option><option value="supplies">{ui('مستلزمات سريعة')}</option><option value="other">{ui('أخرى')}</option></select></div> : null}
            <div><Label>{ui('البيان / السبب')}</Label><Textarea className="mt-1" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={ui('اكتب سبب واضح يظهر في السجل والمحاسبة')} /></div>
          </div>
          <DialogFooter><Button permissionAction="create" onClick={() => void saveMovement()} disabled={saving}>{saving ? ui('جارٍ الحفظ…') : ui('حفظ واعتماد الحركة')}</Button><Button variant="outline" onClick={() => setMovementOpen(false)}>{ui('إلغاء')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </GymSalesPageShell>
  );
}
