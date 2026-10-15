import { formatDisplayNumber } from '@/lib/number-display';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface TaxBracketRow {
  id: number;
  lower_bound: string;
  upper_bound: string | null;
  rate_percent: string;
}

interface TaxPolicyRow {
  id: number;
  code: string;
  version: number;
  name: string;
  jurisdiction: string;
  effective_from: string;
  effective_to: string | null;
  annual_allowance: string;
  annual_tax_credit: string;
  periods_per_year: number;
  status: 'draft' | 'published' | string;
  source_reference: string | null;
  brackets: TaxBracketRow[];
}

interface BracketForm {
  lowerBound: string;
  upperBound: string;
  ratePercent: string;
}

interface TaxPolicyForm {
  code: string;
  version: string;
  name: string;
  jurisdiction: string;
  effectiveFrom: string;
  effectiveTo: string;
  annualAllowance: string;
  annualTaxCredit: string;
  periodsPerYear: string;
  sourceReference: string;
  brackets: BracketForm[];
}

const EMPTY_FORM: TaxPolicyForm = {
  code: '',
  version: '1',
  name: '',
  jurisdiction: '',
  effectiveFrom: '',
  effectiveTo: '',
  annualAllowance: '',
  annualTaxCredit: '',
  periodsPerYear: '12',
  sourceReference: '',
  brackets: [{ lowerBound: '0', upperBound: '', ratePercent: '' }],
};

export function TaxPolicyPanel() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canUpdate = can('payroll.setup:update');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [form, setForm] = useState<TaxPolicyForm>(EMPTY_FORM);
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['payroll', 'tax-policies'],
    queryFn: async () => (await api.get<TaxPolicyRow[]>('/payroll/tax-policies')).data,
  });

  const setField = (key: Exclude<keyof TaxPolicyForm, 'brackets'>, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const updateBracket = (index: number, field: keyof BracketForm, value: string) =>
    setForm((current) => ({
      ...current,
      brackets: current.brackets.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    }));

  const addBracket = () =>
    setForm((current) => {
      const previous = current.brackets.at(-1);
      return {
        ...current,
        brackets: [
          ...current.brackets,
          { lowerBound: previous?.upperBound ?? '', upperBound: '', ratePercent: '' },
        ],
      };
    });

  const removeBracket = (index: number) =>
    setForm((current) => ({
      ...current,
      brackets: current.brackets.filter((_, rowIndex) => rowIndex !== index),
    }));

  const save = async () => {
    if (!canUpdate || saving) return;
    setSaving(true);
    try {
      await api.post('/payroll/tax-policies', {
        code: form.code.trim(),
        version: Number(form.version),
        name: form.name.trim(),
        jurisdiction: form.jurisdiction.trim(),
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || null,
        annualAllowance: Number(form.annualAllowance || 0),
        annualTaxCredit: Number(form.annualTaxCredit || 0),
        periodsPerYear: Number(form.periodsPerYear),
        sourceReference: form.sourceReference.trim(),
        brackets: form.brackets.map((row, index) => ({
          lowerBound: Number(row.lowerBound),
          upperBound: index === form.brackets.length - 1 ? null : Number(row.upperBound),
          ratePercent: Number(row.ratePercent),
        })),
      });
      toast.success(ui('تم حفظ نسخة السياسة كمسودة'));
      setOpen(false);
      setForm(EMPTY_FORM);
      await refetch();
    } catch (error) {
      toast.error(apiError(error, ui('تعذر حفظ سياسة الضريبة')));
    } finally {
      setSaving(false);
    }
  };

  const publish = async (policy: TaxPolicyRow) => {
    if (!canUpdate || publishingId != null) return;
    const accepted = await confirm({
      title: ui('نشر سياسة ضريبة الدخل'),
      description: ui('بعد النشر ستُستخدم هذه النسخة في شهور المرتبات التي تقع داخل فترة سريانها، ويُحفظ منها snapshot تاريخي غير متغير.'),
      confirmLabel: ui('نشر النسخة'),
    });
    if (!accepted) return;
    setPublishingId(policy.id);
    try {
      await api.post(`/payroll/tax-policies/${policy.id}/publish`);
      toast.success(ui('تم نشر سياسة ضريبة الدخل'));
      await refetch();
    } catch (error) {
      toast.error(apiError(error, ui('تعذر نشر السياسة')));
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="tax-policy-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="tax-policy-title" className="text-lg font-semibold">{ui('سياسات ضريبة الدخل')}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {ui('نسخ مؤرخة من القواعد القانونية. النظام يوقف احتساب أي مرتبات شهر لا تغطيها سياسة منشورة بدل افتراض ضريبة صفرية.')}
          </p>
        </div>
        {canUpdate ? (
          <Button permissionResource="payroll.setup" permissionAction="update" size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />{ui('نسخة سياسة جديدة')}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">{ui('جارٍ تحميل السياسات…')}</CardContent></Card>
      ) : isError ? (
        <Card className="border-destructive/40"><CardContent className="flex items-center justify-between gap-3 py-5"><span className="text-sm text-destructive">{ui('تعذر تحميل سياسات الضريبة')}</span><Button variant="outline" size="sm" onClick={() => void refetch()}>{ui('إعادة المحاولة')}</Button></CardContent></Card>
      ) : data.length === 0 ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex gap-3 py-5">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
            <div><p className="font-medium">{ui('لا توجد سياسة ضريبة منشورة')}</p><p className="mt-1 text-sm text-muted-foreground">{ui('إنشاء شهور المرتبات الجديدة سيتوقف بأمان إلى أن تُدخل نسخة موثقة وتُنشر.')}</p></div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((policy) => (
            <Card key={policy.id} className={policy.status === 'published' ? 'border-success/30' : undefined}>
              <CardHeader className="gap-3 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div><CardTitle className="text-base">{policy.name}</CardTitle><p className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">{policy.code}@{formatDisplayNumber(policy.version)}</p></div>
                  <StatusBadge status={policy.status === 'published' ? 'approved' : 'pending'} label={policy.status === 'published' ? ui('منشورة') : ui('مسودة')} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div><dt className="text-xs text-muted-foreground">{ui('الاختصاص')}</dt><dd className="mt-0.5 font-medium">{policy.jurisdiction}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{ui('عدد الشرائح')}</dt><dd className="mt-0.5 font-medium">{toArabicDigits(policy.brackets.length)}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-muted-foreground">{ui('فترة السريان')}</dt><dd className="mt-0.5 font-medium" dir="ltr">{policy.effective_from.slice(0, 10)} → {policy.effective_to?.slice(0, 10) ?? ui('مفتوحة')}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{ui('الإعفاء السنوي')}</dt><dd className="mt-0.5 font-medium">{toArabicDigits(Number(policy.annual_allowance).toLocaleString())}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{ui('فترات السنة')}</dt><dd className="mt-0.5 font-medium">{toArabicDigits(policy.periods_per_year)}</dd></div>
                </dl>
                <details className="rounded-lg border border-border/60 bg-muted/10 p-3">
                  <summary className="cursor-pointer font-medium">{ui('عرض الشرائح والقواعد')}</summary>
                  <div className="mt-3 space-y-2">
                    {policy.brackets.map((bracket) => (
                      <div key={bracket.id} className="grid grid-cols-3 gap-2 rounded-md bg-background px-3 py-2 text-xs">
                        <span>{ui('من')}: {toArabicDigits(Number(bracket.lower_bound).toLocaleString())}</span>
                        <span>{ui('إلى')}: {bracket.upper_bound == null ? ui('مفتوحة') : toArabicDigits(Number(bracket.upper_bound).toLocaleString())}</span>
                        <span>{ui('النسبة')}: {toArabicDigits(Number(bracket.rate_percent))}%</span>
                      </div>
                    ))}
                  </div>
                </details>
                {policy.source_reference && /^https?:\/\//i.test(policy.source_reference) ? (
                  <a className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline" href={policy.source_reference} target="_blank" rel="noreferrer"><FileCheck2 className="size-4" />{ui('فتح المرجع القانوني')}</a>
                ) : (
                  <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><FileCheck2 className="mt-0.5 size-4 shrink-0" /><span>{policy.source_reference}</span></p>
                )}
                {policy.status === 'draft' && canUpdate ? <Button permissionResource="payroll.setup" permissionAction="update" className="w-full" variant="outline" disabled={publishingId === policy.id} onClick={() => void publish(policy)}>{ui('مراجعة ونشر النسخة')}</Button> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{ui('نسخة سياسة ضريبة دخل جديدة')}</DialogTitle>
            <DialogDescription>{ui('أدخل النص كما هو من مصدر رسمي مؤرخ. لا توجد نسب افتراضية؛ كل شريحة مطلوبة صراحة.')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={ui('كود السياسة')}><Input value={form.code} onChange={(event) => setField('code', event.target.value)} placeholder="EG-INCOME" dir="ltr" /></Field>
              <Field label={ui('رقم النسخة')}><Input type="number" min={1} value={form.version} onChange={(event) => setField('version', event.target.value)} /></Field>
              <Field label={ui('اسم السياسة')} className="sm:col-span-2"><Input value={form.name} onChange={(event) => setField('name', event.target.value)} /></Field>
              <Field label={ui('الاختصاص / الدولة')}><Input value={form.jurisdiction} onChange={(event) => setField('jurisdiction', event.target.value)} /></Field>
              <Field label={ui('بداية السريان')}><Input type="date" value={form.effectiveFrom} onChange={(event) => setField('effectiveFrom', event.target.value)} /></Field>
              <Field label={ui('نهاية السريان (اختياري)')}><Input type="date" value={form.effectiveTo} onChange={(event) => setField('effectiveTo', event.target.value)} /></Field>
              <Field label={ui('فترات الاحتساب سنويًا')}><Input type="number" min={1} value={form.periodsPerYear} onChange={(event) => setField('periodsPerYear', event.target.value)} /></Field>
              <Field label={ui('الإعفاء السنوي')}><Input type="number" min={0} step="0.01" value={form.annualAllowance} onChange={(event) => setField('annualAllowance', event.target.value)} /></Field>
              <Field label={ui('الخصم الضريبي السنوي')}><Input type="number" min={0} step="0.01" value={form.annualTaxCredit} onChange={(event) => setField('annualTaxCredit', event.target.value)} /></Field>
              <Field label={ui('مرجع رسمي أو رابط')} className="sm:col-span-2"><Input value={form.sourceReference} onChange={(event) => setField('sourceReference', event.target.value)} placeholder="https://…" dir="ltr" /></Field>
            </div>

            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-4">
              <div className="flex items-center justify-between gap-3"><div><h3 className="font-medium">{ui('الشرائح السنوية')}</h3><p className="mt-0.5 text-xs text-muted-foreground">{ui('يجب أن تبدأ من صفر، تتصل دون فجوات، وتظل الشريحة الأخيرة مفتوحة.')}</p></div><Button permissionAction={null} type="button" variant="outline" size="sm" onClick={addBracket}><Plus className="size-4" />{ui('شريحة')}</Button></div>
              <div className="space-y-2">
                {form.brackets.map((row, index) => (
                  <div key={index} className="grid items-end gap-2 rounded-lg bg-background p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <Field label={ui('من')}><Input type="number" min={0} step="0.01" value={row.lowerBound} onChange={(event) => updateBracket(index, 'lowerBound', event.target.value)} /></Field>
                    <Field label={index === form.brackets.length - 1 ? ui('إلى: مفتوحة') : ui('إلى')}><Input type="number" min={0} step="0.01" disabled={index === form.brackets.length - 1} value={index === form.brackets.length - 1 ? '' : row.upperBound} onChange={(event) => updateBracket(index, 'upperBound', event.target.value)} /></Field>
                    <Field label={ui('النسبة %')}><Input type="number" min={0} max={100} step="0.0001" value={row.ratePercent} onChange={(event) => updateBracket(index, 'ratePercent', event.target.value)} /></Field>
                    <Button permissionAction={null} type="button" variant="ghost" size="icon" aria-label={ui('حذف الشريحة')} disabled={form.brackets.length === 1} onClick={() => removeBracket(index)}><Trash2 className="size-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter><Button permissionAction={null} variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button><Button permissionResource="payroll.setup" permissionAction="update" disabled={saving} onClick={() => void save()}>{ui('حفظ كمسودة')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <div className={`grid gap-1.5 ${className ?? ''}`}><Label>{label}</Label>{children}</div>;
}
