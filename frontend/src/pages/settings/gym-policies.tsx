import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { usePermission } from '@/hooks/use-permission';
import { CheckCircle2, DoorOpen, FileText, Printer, ReceiptText, UserRoundCheck } from 'lucide-react';
import type { ClubPrintingPolicy } from '@/lib/club-printing';
import { uiStatic } from '@/lib/ui-static';

interface GymPolicies extends ClubPrintingPolicy {
  allowCheckInWithOutstanding: boolean;
  allowGraceSessions: boolean;
  outstandingGraceDays: number;
  outstandingAlertEnabled: boolean;
  outstandingAlertAfterSubscriptionPercent: number;
  allowRefunds: boolean;
  allowSameGuestMultipleInvitations: boolean;
  requireExpenseApproval: boolean;
  restrictEmployeeFinancialVisibility: boolean;
}

const DEFAULTS: GymPolicies = {
  allowCheckInWithOutstanding: true,
  allowGraceSessions: false,
  outstandingGraceDays: 7,
  outstandingAlertEnabled: true,
  outstandingAlertAfterSubscriptionPercent: 50,
  allowRefunds: true,
  allowSameGuestMultipleInvitations: false,
  requireExpenseApproval: true,
  restrictEmployeeFinancialVisibility: false,
  receiptPaperSize: 'thermal',
  receiptA4Copies: 2,
  receiptLanguage: 'ar',
  printSubscriptionReceipts: false,
  printSubscriptionPayments: false,
  printQuickServiceReceipts: false,
  printInbodyReceipts: false,
  printSpaReceipts: false,
  printLockerReceipts: false,
  printEventReceipts: false,
};

type PrintingKey = Exclude<keyof ClubPrintingPolicy, 'receiptPaperSize' | 'receiptA4Copies' | 'receiptLanguage'>;
const PRINTING_POLICIES: Array<{ key: PrintingKey; id: string; title: string; description: string }> = [
  { key: 'printSubscriptionReceipts', id: 'print-subscription-receipts', title: uiStatic('الاشتراكات الجديدة'), description: uiStatic('بعد تحصيل مبلغ وحفظ الاشتراك بنجاح') },
  { key: 'printSubscriptionPayments', id: 'print-subscription-payments', title: uiStatic('دفعات وتجديدات الاشتراكات'), description: uiStatic('للدفعات اللاحقة والتجديدات فقط') },
  { key: 'printQuickServiceReceipts', id: 'print-quick-service-receipts', title: uiStatic('الخدمات السريعة'), description: uiStatic('للخدمات المدفوعة من شاشة الاستقبال') },
  { key: 'printInbodyReceipts', id: 'print-inbody-receipts', title: uiStatic('قياسات InBody'), description: uiStatic('للقياس المدفوع، لا المشمول في الاشتراك') },
  { key: 'printSpaReceipts', id: 'print-spa-receipts', title: uiStatic('خدمات SPA'), description: uiStatic('للخدمة المدفوعة، لا المشمولة في الاشتراك') },
  { key: 'printLockerReceipts', id: 'print-locker-receipts', title: uiStatic('الخزائن'), description: uiStatic('عند اشتراك أو تجديد خزانة بمبلغ مدفوع') },
  { key: 'printEventReceipts', id: 'print-event-receipts', title: uiStatic('الفعاليات والأنشطة'), description: uiStatic('عند التسجيل المدفوع في فعالية') },
];

export function GymPoliciesPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canConfigure = can('admin.gym-policies:configure');
  const qc = useQueryClient();
  const [form, setForm] = useState<GymPolicies>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['club-gym-policies'],
    queryFn: async () => {
      const { data: policies } = await api.get<GymPolicies>('/club/gym-policies');
      return policies;
    },
  });

  useEffect(() => {
    if (data) setForm({ ...DEFAULTS, ...data });
  }, [data]);

  const save = async () => {
    if (!canConfigure || isLoading || isError || !data) return;
    if (!Number.isInteger(form.outstandingGraceDays) || form.outstandingGraceDays < 0 || form.outstandingGraceDays > 365) {
      toast.error(ui('مهلة السداد يجب أن تكون عدد أيام صحيحًا من 0 إلى 365'));
      return;
    }
    setSaving(true);
    try {
      const { data: updated } = await api.patch<GymPolicies>('/club/gym-policies', {
        allowCheckInWithOutstanding: form.allowCheckInWithOutstanding,
        allowGraceSessions: form.allowGraceSessions,
        outstandingGraceDays: form.outstandingGraceDays,
        outstandingAlertEnabled: form.outstandingAlertEnabled,
        outstandingAlertAfterSubscriptionPercent: Number(form.outstandingAlertAfterSubscriptionPercent) || 0,
        allowRefunds: form.allowRefunds,
        allowSameGuestMultipleInvitations: form.allowSameGuestMultipleInvitations,
        requireExpenseApproval: form.requireExpenseApproval,
        restrictEmployeeFinancialVisibility: form.restrictEmployeeFinancialVisibility,
        printSubscriptionReceipts: form.printSubscriptionReceipts,
        printSubscriptionPayments: form.printSubscriptionPayments,
        printQuickServiceReceipts: form.printQuickServiceReceipts,
        printInbodyReceipts: form.printInbodyReceipts,
        printSpaReceipts: form.printSpaReceipts,
        printLockerReceipts: form.printLockerReceipts,
        printEventReceipts: form.printEventReceipts,
        receiptPaperSize: form.receiptPaperSize,
        receiptA4Copies: form.receiptA4Copies,
        receiptLanguage: form.receiptLanguage,
      });
      setForm(updated);
      void qc.invalidateQueries({ queryKey: ['club-gym-policies'] });
      void qc.invalidateQueries({ queryKey: ['me', 'permissions'] });
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      void qc.invalidateQueries({ queryKey: ['revenues'] });
      void qc.invalidateQueries({ queryKey: ['finance'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['club-dashboard'] });
      toast.success(ui('تم حفظ سياسات الجيم'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('سياسات الجيم')}
        description={ui('تحكم في دخول الأعضاء عند وجود مبالغ متبقية وتنبيهات الاستقبال والاسترداد')}
        actions={
          canConfigure ? <Button permissionResource="admin.gym-policies" permissionAction="configure" variant="brand" onClick={() => void save()} disabled={saving || isLoading || isError || !data}>
            {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
          </Button> : null
        }
      />

      {isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-destructive">
        <p>{ui('تعذر تحميل سياسات الجيم. أعد المحاولة قبل تعديل الإعدادات.')}</p>
        <Button variant="outline" onClick={() => void refetch()}>{ui('إعادة المحاولة')}</Button>
      </div>}

      <Card>
        <CardHeader>
          <CardTitle>{ui('خصوصية العمليات المالية للموظفين')}</CardTitle>
          <CardDescription>{ui('حدد نطاق البيانات المالية المعروضة للموظفين')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="employee-financial-privacy">{ui('كل موظف يرى عملياته المالية فقط')}</Label>
            <p id="employee-financial-privacy-help" className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{ui('عند التفعيل، تظهر لكل موظف العمليات التي سجلها فقط في المصروفات والإيرادات والتقارير المالية ولوحة الجيم، حتى لو كان نطاق دوره أوسع. مدير النظام يحتفظ بالرؤية الكاملة.')}</p>
          </div>
          <Switch id="employee-financial-privacy" aria-describedby="employee-financial-privacy-help" className="shrink-0" disabled={!canConfigure || isLoading || isError} checked={form.restrictEmployeeFinancialVisibility} onCheckedChange={(checked) => setForm((current) => ({ ...current, restrictEmployeeFinancialVisibility: checked }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ui('الدخول مع وجود متبقي')}</CardTitle>
          <CardDescription>
            {ui('حدد هل يُسمح للعضو بتسجيل الحضور وهو عليه مبلغ متبقٍ على الاشتراك')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="allow-outstanding">{ui('السماح بالدخول مع وجود متبقي')}</Label>
              <p className="text-sm text-muted-foreground">
                {form.allowCheckInWithOutstanding
                  ? ui('يمكن للعضو الدخول حتى مع وجود رصيد مستحق')
                  : ui('يُرفض الدخول تلقائياً إذا كان عليه مبلغ متبقٍ')}
              </p>
            </div>
            <Switch
              disabled={!canConfigure}
              id="allow-outstanding"
              checked={form.allowCheckInWithOutstanding}
              onCheckedChange={(checked) =>
                setForm((f) => ({ ...f, allowCheckInWithOutstanding: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><ReceiptText className="size-5" /></div>
            <div className="space-y-1"><CardTitle>{ui('الطباعة المركزية')}</CardTitle><CardDescription>{ui('لغة ومقاس وسياسات الطباعة التلقائية لكل عملية مدفوعة')}</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/15 p-4" aria-live="polite">
            <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" /><span className="text-sm text-muted-foreground">{ui('الأنواع المفعّلة')}</span></div>
            <strong className="nums">{toArabicDigits(PRINTING_POLICIES.filter((item) => form[item.key]).length)} / {toArabicDigits(PRINTING_POLICIES.length)}</strong>
          </div>
          <section aria-labelledby="receipt-language-heading" className="rounded-xl border p-4">
            <h3 id="receipt-language-heading" className="mb-3 font-bold">{ui('لغة الإيصال')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {([{ value: 'ar' as const, title: ui('العربية'), description: ui('اتجاه كامل من اليمين إلى اليسار') }, { value: 'en' as const, title: 'English', description: 'Left-to-right receipt layout' }]).map((option) => <button key={option.value} type="button" disabled={!canConfigure} aria-pressed={form.receiptLanguage === option.value} onClick={() => setForm((current) => ({ ...current, receiptLanguage: option.value }))} className={`min-h-20 rounded-xl border p-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${form.receiptLanguage === option.value ? 'border-primary bg-primary/[0.06]' : 'hover:border-primary/40'} disabled:opacity-60`}><strong className="block text-sm">{ui(option.title)}</strong><span className="mt-1 block text-sm text-muted-foreground">{ui(option.description)}</span></button>)}
            </div>
          </section>
          <section aria-labelledby="receipt-paper-heading" className="rounded-xl border p-4">
            <h3 id="receipt-paper-heading" className="mb-3 font-bold">{ui('مقاس الإيصال')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {([{ value: 'thermal' as const, title: ui('حراري 80mm'), icon: ReceiptText }, { value: 'a4' as const, title: ui('ورقة A4'), icon: FileText }]).map((option) => { const Icon = option.icon; return <button key={option.value} type="button" disabled={!canConfigure} aria-pressed={form.receiptPaperSize === option.value} onClick={() => setForm((current) => ({ ...current, receiptPaperSize: option.value }))} className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${form.receiptPaperSize === option.value ? 'border-primary bg-primary/[0.06]' : 'hover:border-primary/40'} disabled:opacity-60`}><Icon className="size-5" /><strong>{ui(option.title)}</strong></button>; })}
            </div>
            {form.receiptPaperSize === 'a4' && <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">{([1, 2] as const).map((copies) => <button key={copies} type="button" disabled={!canConfigure} aria-pressed={form.receiptA4Copies === copies} onClick={() => setForm((current) => ({ ...current, receiptA4Copies: copies }))} className={`rounded-xl border p-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${form.receiptA4Copies === copies ? 'border-primary bg-primary/[0.06]' : ''}`}>{ui(copies === 1 ? ui('نسخة واحدة') : ui('نسختان مع خط قص'))}</button>)}</div>}
          </section>
          <div className="grid gap-3 lg:grid-cols-2">
            {PRINTING_POLICIES.map((policy) => <div key={policy.key} className={`flex min-h-28 items-start justify-between gap-4 rounded-xl border p-4 ${form[policy.key] ? 'border-primary/35 bg-primary/[0.045]' : ''}`}><div className="space-y-1.5"><Label htmlFor={policy.id} className="cursor-pointer font-bold">{ui(policy.title)}</Label><p id={`${policy.id}-description`} className="text-sm leading-6 text-muted-foreground">{ui(policy.description)}</p></div><Switch id={policy.id} aria-describedby={`${policy.id}-description`} disabled={!canConfigure} checked={form[policy.key]} onCheckedChange={(checked) => setForm((current) => ({ ...current, [policy.key]: checked }))} className="shrink-0" /></div>)}
          </div>
          <p className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-sm leading-6 text-muted-foreground"><Printer className="mt-1 size-4 shrink-0" />{ui('لا تُطبع العمليات المجانية، وتظل إعادة الطباعة اليدوية متاحة عند منع النافذة المنبثقة.')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{ui('اعتماد المصروفات')}</CardTitle><CardDescription>{ui('حافظ على الاعتماد اليدوي أو رحّل المصروف الجديد تلقائيًا داخل نفس المعاملة')}</CardDescription></CardHeader>
        <CardContent className="flex items-start justify-between gap-4"><div><Label htmlFor="expense-approval">{ui('اشتراط اعتماد الإدارة')}</Label><p id="expense-approval-help" className="mt-2 text-sm leading-6 text-muted-foreground">{ui('عند الإيقاف يعتمد المصروف الجديد ويُرحّل للحسابات فور الحفظ؛ المصروفات القديمة لا تتغير.')}</p></div><Switch id="expense-approval" aria-describedby="expense-approval-help" disabled={!canConfigure} checked={form.requireExpenseApproval} onCheckedChange={(checked) => setForm((current) => ({ ...current, requireExpenseApproval: checked }))} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ui('مهلة سداد المتبقي بالأيام')}</CardTitle>
          <CardDescription>{ui('الاشتراك المنتهي لا يسمح بالدخول. والمتبقي يمنع الدخول عند انتهاء المهلة المحددة من بداية الاشتراك.')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="outstanding-grace-days">{ui('عدد أيام مهلة السداد')}</Label>
          <Input id="outstanding-grace-days" type="number" min={0} max={365} step={1}
            className="nums max-w-40 text-base" value={Number.isNaN(form.outstandingGraceDays) ? '' : form.outstandingGraceDays}
            disabled={!canConfigure || saving || isLoading || isError || !form.allowCheckInWithOutstanding}
            aria-describedby="outstanding-grace-help"
            aria-invalid={!Number.isInteger(form.outstandingGraceDays) || form.outstandingGraceDays < 0 || form.outstandingGraceDays > 365}
            onChange={(event) => setForm((current) => ({ ...current, outstandingGraceDays: event.target.value === '' ? NaN : Number(event.target.value) }))} />
          <p id="outstanding-grace-help" className="text-sm leading-6 text-muted-foreground">
            {ui(form.allowCheckInWithOutstanding
              ? 'مثال: 7 يسمح بالدخول قبل مرور 7 أيام، ثم يمنعه لحين السداد. 0 يعني المنع الفوري. تغيير المهلة يسري على الاشتراكات الحالية أيضًا.'
              : 'السماح بالدخول مع متبقي متوقف؛ المنع فوري حتى السداد.')}
          </p>
        </CardContent>
      </Card>

      {form.allowCheckInWithOutstanding && (
        <Card>
          <CardHeader>
            <CardTitle>{ui('تنبيه الاستقبال')}</CardTitle>
            <CardDescription>
              {ui('عند حضور عضو عليه متبقي، يظهر المبلغ ومهلة السداد للريسبشن')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="alert-enabled">{ui('تفعيل تنبيه المتبقي عند الحضور')}</Label>
                <p className="text-sm text-muted-foreground">
                  {ui('يظهر تحذير في شاشة الاستقبال أثناء تسجيل الدخول')}
                </p>
              </div>
              <Switch
                disabled={!canConfigure}
                id="alert-enabled"
                checked={form.outstandingAlertEnabled}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, outstandingAlertEnabled: checked }))
                }
              />
            </div>

            <p className="text-sm leading-6 text-muted-foreground">{ui('عند تفعيل التنبيه يظهر المتبقي من أول حضور، مع الأيام المتاحة للسداد. انتهاء المهلة يمنع الدخول حتى لو التنبيه متوقف.')}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b bg-muted/20">
          <div className="flex items-start gap-3">
            <div
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <DoorOpen className="size-5" />
            </div>
            <div className="space-y-1">
              <CardTitle>{ui('جلسات السماح')}</CardTitle>
              <CardDescription>
                {ui('تحكم في السماح بدخول عضو لا يملك اشتراكًا صالحًا بعد موافقة مستخدم مخوّل')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <div
            className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${form.allowGraceSessions ? 'border-primary/35 bg-primary/[0.045]' : 'bg-background'}`}
          >
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="allow-grace-sessions" className="cursor-pointer font-bold">
                {ui('السماح بجلسات السماح')}
              </Label>
              <p
                id="allow-grace-sessions-description"
                className="text-sm leading-6 text-muted-foreground"
              >
                {form.allowGraceSessions
                  ? ui('يمكن للمستخدم صاحب صلاحية الموافقة تسجيل جلسة سماح مع حفظ السبب في سجل التدقيق')
                  : ui('جلسات السماح متوقفة، ولن يظهر إجراء التجاوز في شاشة الاستقبال')}
              </p>
            </div>
            <Switch
              disabled={!canConfigure}
              id="allow-grace-sessions"
              aria-describedby="allow-grace-sessions-description"
              checked={form.allowGraceSessions}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, allowGraceSessions: checked }))
              }
              className="shrink-0 focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b bg-muted/20">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
              <UserRoundCheck className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle>{ui('دعوات الضيوف')}</CardTitle>
              <CardDescription>{ui('حدد هل يمكن استخدام نفس رقم الجوال في أكثر من دعوة')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <div className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${form.allowSameGuestMultipleInvitations ? 'border-primary/35 bg-primary/[0.045]' : 'bg-background'}`}>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="allow-repeat-guest-invitations" className="cursor-pointer font-bold">
                {ui('السماح بتكرار دعوة نفس الضيف')}
              </Label>
              <p id="allow-repeat-guest-invitations-description" className="text-sm leading-6 text-muted-foreground">
                {form.allowSameGuestMultipleInvitations
                  ? ui('يمكن إصدار أكثر من دعوة لنفس رقم الجوال')
                  : ui('كل رقم جوال يقبل دعوة واحدة فقط')}
              </p>
            </div>
            <Switch
              disabled={!canConfigure}
              id="allow-repeat-guest-invitations"
              aria-describedby="allow-repeat-guest-invitations-description"
              checked={form.allowSameGuestMultipleInvitations}
              onCheckedChange={(checked) => setForm((current) => ({ ...current, allowSameGuestMultipleInvitations: checked }))}
              className="shrink-0 focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle>{ui('الاسترداد وإلغاء الاشتراك')}</CardTitle>
          <CardDescription>
            {ui('عند التفعيل تظهر صفحة استرداد وإلغاء الاشتراك في قسم الاشتراكات وتُسجَّل في المستردات')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="allow-refunds">{ui('السماح بالاسترداد')}</Label>
              <p className="text-sm text-muted-foreground">
                {form.allowRefunds
                  ? ui('يمكن إلغاء الاشتراك وحساب المبلغ المسترد حسب المتبقي (أيام أو حصص)')
                  : ui('الاسترداد معطّل — لن تظهر صفحة الإلغاء والاسترداد')}
              </p>
            </div>
            <Switch
              disabled={!canConfigure}
              id="allow-refunds"
              checked={form.allowRefunds}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, allowRefunds: checked }))}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
