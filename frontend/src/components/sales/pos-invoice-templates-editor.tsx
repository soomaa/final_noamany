import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Coffee, Printer, ReceiptText, Save, Settings2, Split } from 'lucide-react';
import { toast } from 'sonner';
import type { PaginatedResponse } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';
import { usePermission } from '@/hooks/use-permission';
import {
  PosPrintTemplatePreview,
  PosPrinterDestination,
  resolveCafePrintTemplates,
  toPosPrintTemplatePayload,
  type PosPrintFontScale,
  type PosPrintTemplate,
} from './pos-printing';

function ToggleSetting({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-16 cursor-pointer items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2.5 transition hover:border-primary/35">
      <span><b className="block text-sm">{label}</b><small className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">{description}</small></span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function TemplateEditorCard({
  template,
  onChange,
  onSave,
  saving,
  editable,
}: {
  template: PosPrintTemplate;
  onChange: (template: PosPrintTemplate) => void;
  onSave: () => void;
  saving: boolean;
  editable: boolean;
}) {
  const { ui } = useLocale();
  const kitchen = template.layoutConfig.documentType === 'kitchen_ticket';
  const updateLayout = (patch: Partial<PosPrintTemplate['layoutConfig']>) => onChange({
    ...template,
    layoutConfig: { ...template.layoutConfig, ...patch },
  });

  return (
    <Card className={`overflow-hidden border-2 shadow-md ${kitchen ? 'border-amber-300/55' : 'border-primary/20'}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b p-4 ${kitchen ? 'bg-gradient-to-l from-amber-100/80 to-card dark:from-amber-950/20' : 'bg-gradient-to-l from-primary/12 to-card'}`}>
        <div className="flex items-center gap-3">
          <span className={`grid size-11 place-items-center rounded-2xl text-white shadow-sm ${kitchen ? 'bg-amber-500' : 'bg-primary'}`}>
            {kitchen ? <Coffee className="size-5" /> : <ReceiptText className="size-5" />}
          </span>
          <div>
            <p className="text-lg font-black">{kitchen ? ui('تذكرة تحضير الكافيه') : ui('إيصال العميل')}</p>
            <p className="text-xs text-muted-foreground">{kitchen ? ui('تصل لفريق التحضير بدون أسعار') : ui('تصل للعميل بالأسعار والإجمالي والدفع')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PosPrinterDestination template={template} />
          <label className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-bold"><span>{template.isActive ? ui('مفعّل') : ui('معطل')}</span>{editable ? <Switch checked={template.isActive} onCheckedChange={(checked) => onChange({ ...template, isActive: checked })} /> : null}</label>
        </div>
      </div>

      <CardContent className="grid gap-6 p-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:p-5">
        <div className="space-y-5">
          <section>
            <div className="mb-3 flex items-center gap-2"><Settings2 className="size-4 text-primary" /><h3 className="font-bold">{ui('بيانات القالب والوجهة')}</h3></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><Label>{ui('اسم القالب')}</Label><Input value={template.name} onChange={(event) => onChange({ ...template, name: event.target.value })} /></div>
              <div className="grid gap-1.5"><Label>{ui('العنوان المطبوع')}</Label><Input value={template.headerText} onChange={(event) => onChange({ ...template, headerText: event.target.value })} /></div>
              <div className="grid gap-1.5 sm:col-span-2"><Label>{ui('رسالة نهاية الورقة')}</Label><Input value={template.footerText} onChange={(event) => onChange({ ...template, footerText: event.target.value })} /></div>
              <div className="grid gap-1.5"><Label>{ui('اسم الطابعة المستهدفة')}</Label><div className="relative"><Printer className="absolute start-3 top-2.5 size-4 text-muted-foreground" /><Input className="ps-9" value={template.layoutConfig.printerName} onChange={(event) => updateLayout({ printerName: event.target.value })} /></div></div>
              <div className="grid gap-1.5"><Label>{ui('حجم الورق الحراري')}</Label><select className="h-10 rounded-md border bg-background px-3 text-sm" value={template.paperSize} onChange={(event) => onChange({ ...template, paperSize: event.target.value as '80mm' | '58mm' })}><option value="80mm">80mm — {ui('المقاس القياسي للكافيه')}</option><option value="58mm">58mm — {ui('مقاس صغير')}</option></select></div>
              <div className="grid gap-1.5"><Label>{ui('حجم الخط')}</Label><select className="h-10 rounded-md border bg-background px-3 text-sm" value={template.layoutConfig.fontScale} onChange={(event) => updateLayout({ fontScale: event.target.value as PosPrintFontScale })}><option value="compact">{ui('مضغوط')}</option><option value="normal">{ui('عادي')}</option><option value="large">{ui('كبير وواضح')}</option></select></div>
              <div className="grid gap-1.5"><Label>{ui('عدد النسخ')}</Label><Input className="nums" type="number" min={1} max={5} value={template.layoutConfig.copies} onChange={(event) => updateLayout({ copies: Math.min(5, Math.max(1, Number(event.target.value) || 1)) })} /></div>
            </div>
            <p className="mt-2 rounded-lg bg-muted/45 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">{ui('اسم الطابعة هو مفتاح الربط مع برنامج الطباعة المحلي عند توصيل الجهاز. قبل التوصيل تظهر النسختان في معاينة التأكيد بدون فتح صفحة طباعة إضافية.')}</p>
          </section>

          <section>
            <h3 className="mb-3 font-bold">{ui('المحتوى وسلوك الطباعة')}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleSetting label={ui('طباعة تلقائية')} description={ui('يرسل القالب فور تأكيد الطلب عند توصيل جهاز الطباعة')} checked={template.layoutConfig.autoPrint} onCheckedChange={(checked) => updateLayout({ autoPrint: checked })} />
              <ToggleSetting label={ui('إظهار الشعار')} description={ui('يظهر أعلى الورقة عند التفعيل')} checked={template.includeLogo} onCheckedChange={(checked) => onChange({ ...template, includeLogo: checked })} />
              <ToggleSetting label={ui('إظهار الأسعار')} description={kitchen ? ui('يفضل إيقافه لفريق التحضير') : ui('السعر والإجماليات للعميل')} checked={template.layoutConfig.showPrices} onCheckedChange={(checked) => updateLayout({ showPrices: checked })} />
              <div className="flex min-h-16 items-center rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100">
                {ui('اسم العميل ورقم التليفون بيانات داخلية مؤرشفة ولا تُطبع على إيصال العميل أو تذكرة التحضير.')}
              </div>
              <ToggleSetting label={ui('إظهار طريقة الدفع')} description={ui('مناسب لإيصال العميل فقط')} checked={template.layoutConfig.showPaymentMethod} onCheckedChange={(checked) => updateLayout({ showPaymentMethod: checked })} />
              <ToggleSetting label={ui('إظهار ملاحظات الطلب')} description={ui('مثل بدون سكر أو ثلج إضافي')} checked={template.layoutConfig.showReceiptComment} onCheckedChange={(checked) => updateLayout({ showReceiptComment: checked })} />
            </div>
          </section>

          {editable ? <Button permissionAction={template.id ? 'update' : 'create'} type="button" size="lg" className="w-full sm:w-auto" disabled={saving || !template.name.trim() || !template.layoutConfig.printerName.trim()} onClick={onSave}><Save className="me-2 size-4" />{saving ? ui('جاري الحفظ…') : ui('حفظ هذا القالب')}</Button> : null}
        </div>

        <aside className="rounded-2xl border bg-slate-100/80 p-4 dark:bg-slate-950/25">
          <div className="mb-3 flex items-center justify-between gap-2"><div><p className="font-bold">{ui('معاينة مباشرة')}</p><p className="text-[10px] text-muted-foreground">{ui('بنفس نسبة ورق الطابعة الحرارية')}</p></div><span className="rounded-full bg-background px-2.5 py-1 text-xs font-black shadow-sm">{template.paperSize}</span></div>
          <div className="max-h-[650px] overflow-y-auto rounded-xl py-3"><PosPrintTemplatePreview template={template} scale={0.86} /></div>
        </aside>
      </CardContent>
    </Card>
  );
}

export function PosInvoiceTemplatesEditor() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('gym-sales.sales.pos_admin:create');
  const canUpdate = can('gym-sales.sales.pos_admin:update');
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['pos-invoice-templates'],
    queryFn: async () => (await api.get<PaginatedResponse<PosPrintTemplate>>('/pos-invoice-templates', { params: { pageSize: 50 } })).data,
  });
  const resolved = useMemo(() => resolveCafePrintTemplates(data?.data ?? []), [data]);
  const [templates, setTemplates] = useState<[PosPrintTemplate, PosPrintTemplate]>(resolved);

  useEffect(() => setTemplates(resolved), [resolved]);

  const save = useMutation({
    mutationFn: async (template: PosPrintTemplate) => {
      if (template.id ? !canUpdate : !canCreate) throw new Error('غير مصرح');
      return template.id
        ? (await api.put<PosPrintTemplate>(`/pos-invoice-templates/${template.id}`, toPosPrintTemplatePayload(template))).data
        : (await api.post<PosPrintTemplate>('/pos-invoice-templates', toPosPrintTemplatePayload(template))).data;
    },
    onSuccess: async (saved) => {
      setTemplates((current) => current.map((template) => template.layoutConfig.documentType === saved.layoutConfig.documentType ? saved : template) as [PosPrintTemplate, PosPrintTemplate]);
      toast.success(ui('تم حفظ قالب الطباعة'));
      await queryClient.invalidateQueries({ queryKey: ['pos-invoice-templates'] });
    },
    onError: (error) => toast.error(apiError(error)),
  });

  const replaceTemplate = (index: number, template: PosPrintTemplate) => setTemplates((current) => {
    const next = [...current] as [PosPrintTemplate, PosPrintTemplate];
    next[index] = template;
    return next;
  });

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-l from-primary/12 via-card to-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg"><Split className="size-5" /></span><div><h2 className="text-xl font-black">{ui('طباعة مزدوجة لكل طلب')}</h2><p className="mt-1 text-sm text-muted-foreground">{ui('بعد تأكيد البيع تُجهز نسختان مستقلتان: إيصال للعميل وتذكرة واضحة لفريق التحضير.')}</p></div></div>
          <div className="grid grid-cols-[auto_32px_auto] items-center gap-2 text-xs font-bold"><span className="rounded-xl border bg-background px-3 py-2">{ui('تأكيد الطلب')}</span><span className="text-center text-primary">←</span><span className="grid gap-1"><small className="rounded-lg bg-primary/10 px-2 py-1 text-primary">{ui('إيصال العميل')}</small><small className="rounded-lg bg-amber-100 px-2 py-1 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{ui('تذكرة التحضير')}</small></span></div>
        </div>
      </section>

      {isLoading ? <Card><CardContent className="p-8 text-center text-muted-foreground">{ui('جاري تحميل قوالب الطباعة…')}</CardContent></Card> : templates.map((template, index) => (
        <TemplateEditorCard key={template.layoutConfig.documentType} template={template} editable={template.id ? canUpdate : canCreate} onChange={(next) => replaceTemplate(index, next)} onSave={() => save.mutate(template)} saving={save.isPending && save.variables?.layoutConfig.documentType === template.layoutConfig.documentType} />
      ))}
    </div>
  );
}
