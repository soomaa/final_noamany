import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Coffee, History, LockKeyhole, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Money } from '@/components/common/formatters';
import { ErrorState } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { usePermission } from '@/hooks/use-permission';
import { apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';
import { payrollApi } from './payroll-api';
import type { MonthlyEmployee, MonthlyEvent, MonthlyEventKind } from './types';
import { uiStatic } from '@/lib/ui-static';

const kinds: Record<string, string> = { deduction: uiStatic('خصم'), increase: uiStatic('زيادة'), bonus: uiStatic('بونص'), evaluation: uiStatic('مكافأة تقييم'), target: uiStatic('مكافأة تارجت'), reversal: uiStatic('إلغاء حركة'), cafe_select: uiStatic('خصم حساب الكافيه'), cafe_defer: uiStatic('تأجيل حساب الكافيه') };
const earningLabels: Record<string, string> = {
  basicSalary: uiStatic('الراتب الأساسي'), housing: uiStatic('بدل السكن'), transport: uiStatic('بدل المواصلات'), communication: uiStatic('بدل الاتصالات'),
  meal: uiStatic('بدل الإعاشة'), nature: uiStatic('بدل طبيعة العمل'), assignment: uiStatic('بدل التكليف'), overtime: uiStatic('الإضافي'),
  bonus: uiStatic('المكافآت'), incentives: uiStatic('الحوافز والعمولات'), other: uiStatic('استحقاقات أخرى'), total: uiStatic('إجمالي الاستحقاقات'),
};
const deductionLabels: Record<string, string> = {
  absence: uiStatic('الغياب'), unpaidLeave: uiStatic('إجازة بدون راتب'), lateness: uiStatic('التأخير'), permitLateness: uiStatic('تأخير بإذن'),
  penalty: uiStatic('الجزاءات'), insurance: uiStatic('التأمينات'), incomeTax: uiStatic('ضريبة الدخل'), loan: uiStatic('السلف'), other: uiStatic('خصومات أخرى'), total: uiStatic('إجمالي الخصومات'),
};

export function MonthlyEmployeeSheet({ runId, itemId, onClose, onSaved }: { runId: number; itemId: number | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { ui, locale } = useLocale();
  const { can } = usePermission();
  const [kind, setKind] = useState<MonthlyEventKind>('deduction');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [cafeNote, setCafeNote] = useState('');
  const [reversal, setReversal] = useState<MonthlyEvent | null>(null);
  const request = useRef<{ payload: string; id: string } | null>(null);
  const query = useQuery({ queryKey: ['finance-payroll', 'monthly', runId, itemId], queryFn: () => payrollApi.monthly(runId, itemId!), enabled: itemId != null });
  const slip = query.data;
  const editable = Boolean(slip?.editable && can('financial-reports.payroll:update') && can('payroll.runs:update'));
  const mutation = useMutation({
    mutationFn: async (input: { type: 'event' | 'cafe'; deduct?: boolean }) => {
      const body = input.type === 'cafe' ? { deduct: input.deduct!, expectedAmount: input.deduct ? slip!.cafe.outstanding : slip!.cafe.selectedAmount, note: cafeNote.trim() || (input.deduct ? uiStatic('خصم حساب الكافيه من مرتب الشهر') : uiStatic('تأجيل حساب الكافيه لشهر تاني')) } : { kind: reversal ? 'reversal' as const : kind, amount: reversal?.amount ?? Number(amount), note: note.trim(), ...(reversal ? { reversesId: reversal.id } : {}) };
      const payload = JSON.stringify({ runId, itemId, ...input, ...body });
      if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
      const data = { ...body, requestId: request.current.id };
      return input.type === 'cafe' ? payrollApi.cafe(runId, itemId!, data as Parameters<typeof payrollApi.cafe>[2]) : payrollApi.event(runId, itemId!, data as Parameters<typeof payrollApi.event>[2]);
    },
    onSuccess: async (_data: MonthlyEmployee, input) => {
      request.current = null;
      if (input.type === 'event') { setAmount(''); setNote(''); setReversal(null); } else setCafeNote('');
      toast.success(ui('تم الحفظ وتحديث صافي المرتب'));
      await onSaved();
      await query.refetch();
    },
    onError: async error => { toast.error(apiError(error)); await query.refetch(); },
  });
  const busy = mutation.isPending;
  const reversed = new Set(slip?.history.filter(e => e.reversesId != null).map(e => e.reversesId));
  const date = (value: string, time = false) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone: 'Africa/Cairo', ...(time ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }).format(new Date(value));
  const groups = new Map<string, MonthlyEvent[]>();
  for (const event of slip?.history ?? []) { const day = date(event.createdAt); groups.set(day, [...(groups.get(day) ?? []), event]); }
  return <Sheet open={itemId != null} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <SheetContent side="end" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl [&>button:last-child]:size-11 [&>button:last-child]:flex [&>button:last-child]:items-center [&>button:last-child]:justify-center">
      <SheetHeader className="shrink-0 border-b px-6 py-5 pe-12"><SheetTitle>{slip?.employee.name ?? ui('مرتب الموظف')}</SheetTitle><SheetDescription>{slip?.run.title ?? ui('المرتبات الشهرية')} · {slip?.employee.jobTitle ?? ui('تفاصيل المرتب والحركات')}</SheetDescription></SheetHeader>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
        {query.isLoading && <Skeleton className="h-64" />}
        {query.isError && <ErrorState message={apiError(query.error)} onRetry={() => void query.refetch()} />}
        {slip && <>
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-muted/40 p-4" aria-live="polite"><div><p className="text-sm text-muted-foreground">{ui('صافي المرتب الحالي')}</p><p className="nums mt-1 text-2xl font-bold text-primary"><Money value={slip.netSalary} /></p></div><Badge variant="secondary">{slip.editable ? ui('مفتوح لحد الاعتماد') : <><LockKeyhole className="me-1 size-3" />{ui('معتمد · التعديل مقفول')}</>}</Badge></section>
          <details className="rounded-xl border p-4"><summary className="cursor-pointer py-1 font-semibold">{ui('تفاصيل الاستحقاقات والخصومات')}</summary><div className="mt-5 grid gap-6 sm:grid-cols-2">{[{ title: uiStatic('الاستحقاقات'), values: slip.earnings, labels: earningLabels }, { title: uiStatic('الخصومات'), values: slip.deductions, labels: deductionLabels }].map(section => <section key={section.title}><h3 className="mb-3 font-semibold">{ui(section.title)}</h3><dl className="space-y-3">{Object.entries(section.values).filter(([key, value]) => value !== 0 || key === 'total').map(([key, value]) => <div key={key} className={`flex justify-between gap-3 text-sm ${key === 'total' ? 'border-t pt-3 font-bold' : ''}`}><dt>{ui(section.labels[key] ?? key)}</dt><dd className="nums shrink-0"><Money value={value} /></dd></div>)}</dl></section>)}</div><p className="mt-4 text-xs leading-6 text-muted-foreground">{ui('الزيادات والبونص ضمن الاستحقاقات الأخرى، والخصومات اليدوية وحساب الكافيه ضمن الخصومات الأخرى. الضريبة بتتحسب على إجمالي الاستحقاقات وفق السياسة المحفوظة.')}</p></details>
          {editable && <section className="space-y-4" aria-labelledby="monthly-add-heading"><div className="flex items-center gap-2"><Plus className="size-4 text-primary" /><h3 id="monthly-add-heading" className="font-semibold">{ui(reversal ? uiStatic('إلغاء حركة سابقة') : uiStatic('إضافة حركة على المرتب'))}</h3></div>{reversal && <p className="rounded-lg bg-muted p-3 text-sm">{ui(kinds[reversal.kind])} · <Money value={reversal.amount} /> — {reversal.note}</p>}
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (!busy && note.trim() && (reversal || Number(amount) > 0)) mutation.mutate({ type: 'event' }); }}>
              {!reversal && <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="monthly-kind">{ui('نوع الحركة')}</Label><select id="monthly-kind" className="h-11 w-full rounded-lg border bg-background px-3 text-sm" value={kind} disabled={busy} onChange={e => setKind(e.target.value as MonthlyEventKind)}>{['deduction', 'increase', 'bonus', 'evaluation', 'target'].map(k => <option value={k} key={k}>{ui(kinds[k])}</option>)}</select></div><div className="space-y-2"><Label htmlFor="monthly-amount">{ui('المبلغ بالEGP')}</Label><Input id="monthly-amount" type="number" inputMode="decimal" min="0.01" max="100000000" step="0.01" required value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div></div>}
              <div className="space-y-2"><Label htmlFor="monthly-note">{ui(reversal ? uiStatic('سبب إلغاء الحركة') : uiStatic('ملاحظة الحركة'))}</Label><Textarea id="monthly-note" rows={2} maxLength={1000} required value={note} disabled={busy} onChange={e => setNote(e.target.value)} placeholder={ui('مثال: خصم ١٠٠ EGP بسبب…')} /></div>
              <div className="flex gap-2"><Button permissionAction={null} type="submit" disabled={busy || !note.trim() || (!reversal && (!Number.isFinite(Number(amount)) || Number(amount) <= 0))}>{ui(busy ? uiStatic('جاري الحفظ…') : reversal ? uiStatic('تأكيد إلغاء الحركة') : uiStatic('حفظ الحركة'))}</Button>{reversal && <Button permissionAction={null} variant="outline" type="button" disabled={busy} onClick={() => { setReversal(null); setNote(''); }}>{ui('رجوع')}</Button>}</div>
            </form><p className="text-xs leading-6 text-muted-foreground">{ui('كل حركة محفوظة لوحدها. التعديل بعد الإرسال للمراجعة يحتاج مراجعة جديدة قبل الاعتماد.')}</p>
          </section>}
          <section className="space-y-4 rounded-xl border p-4" aria-labelledby="monthly-cafe-heading"><h3 id="monthly-cafe-heading" className="flex items-center gap-2 font-semibold"><Coffee className="size-4 text-primary" />{ui('حساب الموظف في الكافيه')}</h3>
            <div className="flex flex-wrap justify-between gap-3"><span className="text-sm text-muted-foreground">{ui(slip.cafe.settled ? uiStatic('اتخصم واتسدد مع المرتب') : uiStatic('طلبات شهرية لسه متسددتش'))}</span><strong className="nums"><Money value={slip.cafe.settled ? slip.cafe.selectedAmount : slip.cafe.outstanding} /></strong></div>
            {slip.cafe.selected && !slip.cafe.settled && <p className="rounded-lg bg-primary/5 p-3 text-sm leading-6">{ui('مختار للخصم من الشهر ده:')} <Money value={slip.cafe.selectedAmount} />. {ui('التسوية بتتم عند ترحيل المرتبات، ومش بيتحصّل كاش مرة تانية.')}</p>}
            {slip.cafe.reservedElsewhere > 0 && <p className="text-xs text-muted-foreground">{ui('محجوز للخصم في شهر تاني:')} <Money value={slip.cafe.reservedElsewhere} /></p>}
            {editable && (slip.cafe.outstanding > 0 || slip.cafe.selected) && <><div className="space-y-2"><Label htmlFor="monthly-cafe-note">{ui('ملاحظة قرار حساب الكافيه (اختياري)')}</Label><Input id="monthly-cafe-note" value={cafeNote} maxLength={1000} disabled={busy} onChange={e => setCafeNote(e.target.value)} /></div><div className="flex flex-wrap gap-2"><Button permissionAction={null} variant="outline" disabled={busy || slip.cafe.outstanding <= 0 || (slip.cafe.selected && slip.cafe.selectedAmount === slip.cafe.outstanding)} onClick={() => mutation.mutate({ type: 'cafe', deduct: true })}>{ui(slip.cafe.selected ? uiStatic('ضم الطلبات الجديدة للخصم') : uiStatic('خصم من مرتب الشهر ده'))}</Button><Button permissionAction={null} variant="outline" disabled={busy} onClick={() => mutation.mutate({ type: 'cafe', deduct: false })}>{ui('تأجيل السداد')}</Button></div></>}
            <p className="text-xs leading-6 text-muted-foreground">{ui('الخصم باختيارك فقط. الطلبات لحد نهاية شهر المرتبات، وأي طلبات جديدة بعد اختيارك تحتاج تضمّها بنفسك.')}</p>
          </section>
          <section><div className="mb-3 flex items-center justify-between gap-3"><h3 id="monthly-history-heading" className="flex items-center gap-2 font-semibold"><History className="size-4 text-primary" />{ui('سجل الحركات')}</h3><span className="text-xs text-muted-foreground">{ui('الأحدث أولًا · اسحب لعرض الأقدم')}</span></div>
            <div role="region" aria-labelledby="monthly-history-heading" tabIndex={0} className="max-h-80 overflow-y-auto overscroll-contain rounded-xl border px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {!slip.history.length && <p className="py-8 text-center text-sm text-muted-foreground">{ui('لسه مفيش حركات. أول حركة هتظهر هنا باسم المسؤول ووقتها.')}</p>}
              {[...groups].map(([day, events]) => <div key={day}><h4 className="sticky top-0 z-10 border-b bg-background py-3 text-xs font-semibold text-muted-foreground">{day}</h4>{events.map(event => <article key={event.id} className="space-y-2 border-b py-4 last:border-b-0"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{ui(kinds[event.kind] ?? event.kind)} <span className="nums ms-1"><Money value={event.amount} /></span></strong><time className="nums text-xs text-muted-foreground" dateTime={event.createdAt}>{date(event.createdAt, true)}</time></div><p className="whitespace-pre-wrap break-words text-sm leading-6">{event.note}</p><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{event.actorName}{event.reversesId ? ` · ${ui('إلغاء الحركة رقم')} ${event.reversesId}` : ''}</span>{reversed.has(event.id) ? <Badge variant="secondary">{ui('ملغاة')}</Badge> : editable && ['deduction', 'increase', 'bonus', 'evaluation', 'target'].includes(event.kind) && <Button permissionAction={null} variant="ghost" size="sm" className="min-h-11" disabled={busy} onClick={() => { setReversal(event); setNote(''); document.getElementById('monthly-add-heading')?.scrollIntoView({ block: 'start' }); }}><RotateCcw className="size-3" />{ui('إلغاء الحركة')}</Button>}</div></article>)}</div>)}
            </div>
          </section>
        </>}
      </div>
    </SheetContent>
  </Sheet>;
}
