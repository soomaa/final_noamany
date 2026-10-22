import { CheckCircle2, Printer, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/store/locale';
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
  // The cafe sells ready products only, so the kitchen/preparation ticket is not shown.
  const customerTemplate = resolvedTemplates.find((template) => template.layoutConfig.documentType === 'customer_receipt') ?? resolvedTemplates[0];
  const hasPrintBridge = typeof window !== 'undefined' && Boolean(window.Noamany_PRINT_BRIDGE);

  if (!receipt || !customerTemplate) return null;

  const close = () => {
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-6 text-emerald-600" />
            {ui('تم تأكيد الطلب')}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100">
          <p className="font-bold">{hasPrintBridge ? ui('تم إرسال إيصال العميل للطباعة تلقائيًا') : ui('معاينة إيصال العميل جاهزة')}</p>
          <p className="mt-1 text-xs opacity-80">{hasPrintBridge
            ? ui('يمكن طباعة الإيصال مرة أخرى من الزر أدناه.')
            : ui('لن تُفتح صفحة طباعة إضافية. راجع إيصال العميل هنا، واستخدم زر الطباعة عند الحاجة.')}</p>
        </div>

        <div className="mx-auto w-full max-w-md">
          <section className="overflow-hidden rounded-2xl border bg-gradient-to-b from-primary/[0.06] to-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><ReceiptText className="size-4" /></span>
                <div><p className="font-bold">{customerTemplate.name}</p><p className="text-[10px] text-muted-foreground">{customerTemplate.paperSize} · {ui('نسخة العميل')}</p></div>
              </div>
              <PosPrinterDestination template={customerTemplate} />
            </div>
            <div className="max-h-[480px] overflow-y-auto p-4"><PosPrintTemplatePreview template={customerTemplate} receipt={receipt} scale={0.82} /></div>
            <div className="border-t p-3"><Button type="button" variant="outline" className="w-full" onClick={() => printSinglePosDocument(receipt, customerTemplate)}><Printer className="me-2 size-4" />{ui('طباعة إيصال العميل')}</Button></div>
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
