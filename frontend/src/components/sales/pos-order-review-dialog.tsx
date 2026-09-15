import { Banknote, ClipboardList, Minus, Plus, ReceiptText, ShoppingCart, X } from "lucide-react";
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resolveProductImageUrl } from "@/lib/product-image";
import { buildOrderReview } from "@/lib/pos-order-review";
import { toArabicDigits } from "@/lib/utils";

export interface PosOrderReviewLine {
  id: string;
  name: string;
  productCode: string;
  variantName?: string;
  itemNote?: string;
  quantity: number;
  unitPrice: number;
  imageUrl: string | null;
}

interface PosOrderReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: PosOrderReviewLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  currency: string;
  ui: (value: string) => string;
  onQuantityChange: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onPay: () => void;
  busy?: boolean;
  canPay: boolean;
}

function Money({
  value,
  currency,
  emphasize = false,
}: {
  value: number;
  currency: string;
  emphasize?: boolean;
}) {
  return (
    <span
      dir="ltr"
      className={`nums inline-flex items-baseline gap-1 whitespace-nowrap ${emphasize ? "text-xl font-black" : "font-bold"}`}
    >
      <span>{toArabicDigits(value.toFixed(2))}</span>
      <small className="text-[10px] font-semibold opacity-70">{currency}</small>
    </span>
  );
}

export function PosOrderReviewDialog({
  open,
  onOpenChange,
  lines,
  subtotal,
  discountAmount,
  taxAmount,
  total,
  currency,
  ui,
  onQuantityChange,
  onRemove,
  onPay,
  busy,
  canPay,
}: PosOrderReviewDialogProps) {
  const review = buildOrderReview(lines);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="form"
        className="max-h-[92dvh] gap-0 overflow-hidden p-0"
        aria-label={ui("مراجعة الطلب كاملًا")}
      >
        <DialogHeader className="border-b bg-gradient-to-l from-primary/15 via-primary/[0.06] to-card px-5 py-5 pe-14 sm:px-7 sm:py-6 sm:pe-16">
          <div className="flex items-start gap-3 text-start">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <ClipboardList className="size-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{ui("مراجعة الطلب مع العميل")}</DialogTitle>
              <DialogDescription className="mt-1">
                {ui("عرض واضح لكل الأصناف والكميات والأسعار قبل تأكيد الطلب")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_250px]">
          <section className="min-h-0 min-w-0 overflow-auto overscroll-contain p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-black">
                <ShoppingCart className="size-4 text-primary" />
                {ui("منتجات الطلب")}
              </h3>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-primary/10 px-3 py-1.5 text-primary">
                  {toArabicDigits(review.productCount)} {ui("صنف")}
                </span>
                <span className="rounded-full bg-muted px-3 py-1.5 text-muted-foreground">
                  {toArabicDigits(review.totalUnits)} {ui("وحدة")}
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              {!review.lines.length && <p className="py-8 text-center text-muted-foreground">{ui('السلة فارغة. أضف منتجات من الشاشة الرئيسية.')}</p>}
              {review.lines.map((line, index) => (
                <article key={line.id} className="relative grid min-w-[540px] grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 rounded-xl border bg-card p-3 pe-11">
                  <Button permissionAction={null} variant="ghost" size="icon" className="absolute end-0 top-0 size-11 text-muted-foreground hover:text-destructive" disabled={busy} aria-label={ui(`حذف ${line.name}`)} onClick={() => onRemove(line.id)}><X className="size-4" /></Button>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="relative shrink-0">
                      <img src={resolveProductImageUrl(line.imageUrl)} alt="" className="size-10 rounded-lg bg-muted object-cover" />
                      <span className="nums absolute -bottom-1 -start-1 grid size-4 place-items-center rounded bg-foreground text-[9px] font-bold text-background">{toArabicDigits(index + 1)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold leading-snug">{line.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                        <span className="nums">{line.productCode}</span>
                        {line.variantName && <span className="font-semibold text-primary">{line.variantName}</span>}
                      </div>
                      {line.itemNote && <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground"><span className="font-semibold">{ui('ملاحظة')}:</span> {line.itemNote}</p>}
                    </div>
                  </div>
                  <div className="text-center text-xs">
                    <p className="mb-1 text-[10px] text-muted-foreground">{ui('سعر الوحدة')}</p>
                    <Money value={line.unitPrice} currency={currency} />
                  </div>
                  <div className="flex items-center rounded-lg border bg-background" aria-label={ui('الكمية')}>
                    <Button permissionAction={null} variant="ghost" size="icon" className="size-11" disabled={busy} aria-label={ui(`تقليل كمية ${line.name}`)} onClick={() => onQuantityChange(line.id, -1)}><Minus className="size-4" /></Button>
                    <span className="nums min-w-5 text-center text-sm font-bold" aria-live="polite">{toArabicDigits(line.quantity)}</span>
                    <Button permissionAction={null} variant="ghost" size="icon" className="size-11" disabled={busy} aria-label={ui(`زيادة كمية ${line.name}`)} onClick={() => onQuantityChange(line.id, 1)}><Plus className="size-4" /></Button>
                  </div>
                  <div className="text-center text-xs">
                    <p className="mb-1 text-[10px] text-muted-foreground">{ui('إجمالي الصنف')}</p>
                    <Money value={line.lineTotal} currency={currency} />
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="border-t bg-muted/25 p-4 lg:border-s lg:border-t-0 sm:p-5">
            <div className="lg:sticky lg:top-5">
              <h3 className="flex items-center gap-2 font-black">
                <ReceiptText className="size-4 text-primary" />
                {ui("ملخص الحساب")}
              </h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{ui("المجموع")}</dt>
                  <dd><Money value={subtotal} currency={currency} /></dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{ui("الخصم")}</dt>
                  <dd className="text-rose-600"><Money value={-discountAmount} currency={currency} /></dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{ui("الضريبة")}</dt>
                  <dd><Money value={taxAmount} currency={currency} /></dd>
                </div>
              </dl>
              <div className="mt-5 rounded-2xl bg-primary p-4 text-primary-foreground shadow-lg shadow-primary/20">
                <p className="text-xs font-bold opacity-80">{ui("الإجمالي المطلوب")}</p>
                <div className="mt-1"><Money value={total} currency={currency} emphasize /></div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {ui("يمكنك تعديل الكميات أو حذف منتج؛ الإجمالي يتحدث مباشرة في سلة الطلب.")}
              </p>
            </div>
          </aside>
        </div>

        <DialogFooter className="m-0 border-t bg-card px-4 py-3 sm:px-6">
          <Button permissionAction={null} className="min-h-11 px-6" disabled={!lines.length || busy || !canPay} onClick={onPay}><Banknote className="size-5" />{ui('دفع')}</Button>
          <DialogClose asChild>
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border bg-background px-6 text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {ui("تمت مراجعة الطلب")}
            </button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
