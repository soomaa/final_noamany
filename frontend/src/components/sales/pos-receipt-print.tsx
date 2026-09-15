import { CheckCircle2, Coffee, Printer, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/store/locale';
import { toast } from 'sonner';
import {
  PosPrintTemplatePreview,
  PosPrinterDestination,
  printSinglePosDocument,
  resolveCafePrintTemplates,
  type PosPrintTemplate,
  type PosReceiptData,
} from './pos-printing';

export type { PosReceiptData } from './pos-printing';

export function PosReceiptPrint({
  open,
  onOpenChange,
  receipt,
  templates,
  onDone,
  confirmationOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: PosReceiptData | null;
  templates?: PosPrintTemplate[];
  onDone?: () => void;
  confirmationOnly?: boolean;
}) {
  const { ui } = useLocale();
  const resolvedTemplates = templates?.length ? templates : resolveCafePrintTemplates();
  const customerTemplate = resolvedTemplates.find((template) => template.layoutConfig.documentType === 'customer_receipt') ?? resolvedTemplates[0];
  const kitchenTemplate = resolvedTemplates.find((template) => template.layoutConfig.documentType === 'kitchen_ticket') ?? resolvedTemplates[1];
  const hasPrintBridge = typeof window !== 'undefined' && Boolean(window.NOAMANY_PRINT_BRIDGE);

  if (!receipt || !customerTemplate || !kitchenTemplate) return null;

  const close = () => {
    onOpenChange(false);
    onDone?.();
  };
  const reprint = (template: PosPrintTemplate) => {
    void printSinglePosDocument(receipt, template)
      .then((printed) => {
        if (printed) toast.success(ui('تم إرسال النسخة للطباعة'));
        else toast.error(ui('اسمح بفتح نافذة الطباعة في المتصفح ثم أعد المحاولة'));
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : ui('تعذرت الطباعة. تحقق من الطابعة ثم أعد المحاولة.'));
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-6 text-emerald-600" />
            {ui('تم تأكيد الطلب')}
          </DialogTitle>
          <DialogDescription>{ui(confirmationOnly ? 'راجع إيصال العميل وتذكرة التحضير قبل بدء الطلب التالي' : 'معاينة نسخ الطلب وإعادة طباعتها')}</DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100">
          <p className="font-bold">{hasPrintBridge ? ui('الطباعة التلقائية مفعّلة للإيصالات') : ui('معاينة الإيصالات جاهزة')}</p>
          <p className="mt-1 text-xs opacity-80">{hasPrintBridge
            ? ui('إيصال للعميل وتذكرة منفصلة لفريق تحضير الكافيه. يمكن طباعة أي نسخة مرة أخرى من الأزرار أدناه.')
            : ui('لن تُفتح صفحة طباعة إضافية. راجع إيصال العميل وتذكرة التحضير هنا، واستخدم زر الطباعة فقط عند الحاجة.')}</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border bg-gradient-to-b from-primary/[0.06] to-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><ReceiptText className="size-4" /></span>
                <div><p className="font-bold">{customerTemplate.name}</p><p className="text-[10px] text-muted-foreground">{customerTemplate.paperSize} · {ui('نسخة العميل')}</p></div>
              </div>
              <PosPrinterDestination template={customerTemplate} />
            </div>
            <div className="max-h-[480px] overflow-y-auto p-4"><PosPrintTemplatePreview template={customerTemplate} receipt={receipt} scale={0.82} /></div>
            <div className="border-t p-3"><Button permissionAction={null} type="button" variant="outline" className="w-full" onClick={() => reprint(customerTemplate)}><Printer className="me-2 size-4" />{ui('طباعة إيصال العميل')}</Button></div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-amber-300/60 bg-gradient-to-b from-amber-50/80 to-card shadow-sm dark:from-amber-950/15">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 p-3">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-amber-500 text-white"><Coffee className="size-4" /></span>
                <div><p className="font-bold">{kitchenTemplate.name}</p><p className="text-[10px] text-muted-foreground">{kitchenTemplate.paperSize} · {ui('نسخة التحضير')}</p></div>
              </div>
              <PosPrinterDestination template={kitchenTemplate} />
            </div>
            <div className="max-h-[480px] overflow-y-auto p-4"><PosPrintTemplatePreview template={kitchenTemplate} receipt={receipt} scale={0.82} /></div>
            <div className="border-t border-amber-200/60 p-3"><Button permissionAction={null} type="button" variant="outline" className="w-full border-amber-300 text-amber-800 dark:text-amber-200" onClick={() => reprint(kitchenTemplate)}><Printer className="me-2 size-4" />{ui('طباعة تذكرة التحضير')}</Button></div>
          </section>
        </div>

        <DialogFooter>
          {confirmationOnly ? (
            <Button className="w-full sm:w-auto" size="lg" onClick={close}>{ui('تأكيد وبدء طلب جديد')}</Button>
          ) : (
            <Button variant="outline" onClick={close}>{ui('إغلاق')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
