import { receiptLogoUrl } from '@/lib/receipt-brand';
import { Coffee, Printer, ReceiptText } from 'lucide-react';
import { toArabicDigits } from '@/lib/utils';
import { receiptDiscountRows } from '@/lib/saved-pos-receipt';
import { formatMoneyNumber } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

export type PosPrintDocumentType = 'customer_receipt' | 'kitchen_ticket';
export type PosPrintFontScale = 'compact' | 'normal' | 'large';

export interface PosReceiptData {
  saleNumber: string;
  dailyNumber?: number;
  saleType?: 'customer' | 'employee' | 'partner';
  customerName?: string;
  employeeName?: string;
  employeeFreeAmount?: number;
  saleDate: string;
  saleTime?: string;
  paymentMethod: string;
  payments?: Array<{ methodName: string; amount: number; reference?: string }>;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  receiptComment?: string;
  currency?: string;
  businessName?: string;
  logoUrl?: string;
  footerText?: string;
  branchName?: string;
  cashierName?: string;
  items: Array<{ name: string; variantName?: string; itemNote?: string; freeQuantity?: number; quantity: number; unitPrice: number; lineTotal: number }>;
}

export interface PosPrintLayoutConfig {
  documentType: PosPrintDocumentType;
  autoPrint: boolean;
  copies: number;
  printerName: string;
  showCustomer: boolean;
  showPrices: boolean;
  showPaymentMethod: boolean;
  showReceiptComment: boolean;
  fontScale: PosPrintFontScale;
}

export interface PosPrintTemplate {
  id?: number;
  name: string;
  templateType: string;
  paperSize: '80mm' | '58mm';
  includeHeader: boolean;
  includeLogo: boolean;
  includeFooter: boolean;
  includeQr: boolean;
  includeSignature: boolean;
  headerText: string;
  footerText: string;
  cssStyles?: string;
  layoutConfig: PosPrintLayoutConfig;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

type PosTemplateApiRow = Partial<Omit<PosPrintTemplate, 'layoutConfig' | 'paperSize'>> & {
  id?: number;
  name?: string;
  paperSize?: string;
  layoutConfig?: Partial<PosPrintLayoutConfig> | null;
};

export const DEFAULT_CUSTOMER_RECEIPT_TEMPLATE: PosPrintTemplate = {
  name: uiStatic('إيصال العميل'),
  templateType: 'thermal',
  paperSize: '80mm',
  includeHeader: true,
  includeLogo: true,
  includeFooter: true,
  includeQr: false,
  includeSignature: false,
  headerText: uiStatic('إيصال بيع'),
  footerText: uiStatic('شكراً لزيارتكم'),
  layoutConfig: {
    documentType: 'customer_receipt',
    autoPrint: true,
    copies: 1,
    printerName: uiStatic('طابعة إيصال العميل'),
    showCustomer: false,
    showPrices: true,
    showPaymentMethod: true,
    showReceiptComment: true,
    fontScale: 'normal',
  },
  isDefault: true,
  isActive: true,
  sortOrder: 0,
};

export const DEFAULT_KITCHEN_TICKET_TEMPLATE: PosPrintTemplate = {
  name: uiStatic('تذكرة تحضير الكافيه'),
  templateType: 'thermal',
  paperSize: '80mm',
  includeHeader: true,
  includeLogo: false,
  includeFooter: true,
  includeQr: false,
  includeSignature: false,
  headerText: uiStatic('طلب تحضير جديد'),
  footerText: uiStatic('تم الاستلام بواسطة فريق التحضير'),
  layoutConfig: {
    documentType: 'kitchen_ticket',
    autoPrint: true,
    copies: 1,
    printerName: uiStatic('طابعة تحضير الكافيه'),
    showCustomer: false,
    showPrices: false,
    showPaymentMethod: false,
    showReceiptComment: true,
    fontScale: 'large',
  },
  isDefault: false,
  isActive: true,
  sortOrder: 1,
};

function inferDocumentType(row: PosTemplateApiRow): PosPrintDocumentType {
  if (row.layoutConfig?.documentType === 'kitchen_ticket') return 'kitchen_ticket';
  if (row.layoutConfig?.documentType === 'customer_receipt') return 'customer_receipt';
  return /تحضير|مطبخ|kitchen/i.test(row.name ?? '') ? 'kitchen_ticket' : 'customer_receipt';
}

function mergeTemplate(base: PosPrintTemplate, row?: PosTemplateApiRow): PosPrintTemplate {
  if (!row) return { ...base, layoutConfig: { ...base.layoutConfig } };
  return {
    ...base,
    ...row,
    name: row.name?.trim() || base.name,
    paperSize: row.paperSize === '58mm' ? '58mm' : '80mm',
    headerText: row.headerText ?? base.headerText,
    footerText: row.footerText ?? base.footerText,
    layoutConfig: {
      ...base.layoutConfig,
      ...(row.layoutConfig ?? {}),
      documentType: base.layoutConfig.documentType,
      showCustomer: false,
      copies: Math.min(5, Math.max(1, Number(row.layoutConfig?.copies ?? base.layoutConfig.copies) || 1)),
    },
  };
}

export function resolveCafePrintTemplates(rows: PosTemplateApiRow[] = []): [PosPrintTemplate, PosPrintTemplate] {
  const customer = rows.find((row) => inferDocumentType(row) === 'customer_receipt');
  const kitchen = rows.find((row) => inferDocumentType(row) === 'kitchen_ticket');
  return [
    mergeTemplate(DEFAULT_CUSTOMER_RECEIPT_TEMPLATE, customer),
    mergeTemplate(DEFAULT_KITCHEN_TICKET_TEMPLATE, kitchen),
  ];
}

export function toPosPrintTemplatePayload(template: PosPrintTemplate) {
  return {
    name: template.name,
    templateType: 'thermal',
    paperSize: template.paperSize,
    includeHeader: template.includeHeader,
    includeLogo: template.includeLogo,
    includeFooter: template.includeFooter,
    includeQr: template.includeQr,
    includeSignature: template.includeSignature,
    headerText: template.headerText,
    footerText: template.footerText,
    cssStyles: template.cssStyles || undefined,
    layoutConfig: { ...template.layoutConfig, showCustomer: false },
    isDefault: template.layoutConfig.documentType === 'customer_receipt',
    isActive: template.isActive,
    sortOrder: template.layoutConfig.documentType === 'customer_receipt' ? 0 : 1,
  };
}

const SAMPLE_RECEIPT: PosReceiptData = {
  saleNumber: 'CAFE-20260722-0012',
  dailyNumber: 12,
  saleDate: '22/07/2026',
  saleTime: '20:42:00',
  paymentMethod: uiStatic('نقدي'),
  subtotal: 145,
  discountAmount: 5,
  taxAmount: 0,
  totalAmount: 140,
  receiptComment: uiStatic('لاتيه بدون سكر · مياه باردة'),
  currency: 'EGP',
  businessName: 'ONE80 CLUB · CAFE',
  logoUrl: receiptLogoUrl(),
  branchName: 'A1',
  items: [
    { name: uiStatic('لاتيه'), variantName: 'Large', quantity: 2, unitPrice: 50, lineTotal: 100 },
    { name: uiStatic('إسبريسو'), variantName: 'Double', quantity: 1, unitPrice: 25, lineTotal: 25 },
    { name: uiStatic('مياه معدنية'), quantity: 1, unitPrice: 20, lineTotal: 20 },
  ],
};

export function PosPrintTemplatePreview({
  template,
  receipt = SAMPLE_RECEIPT,
  scale = 0.82,
}: {
  template: PosPrintTemplate;
  receipt?: PosReceiptData;
  scale?: number;
}) {
  const { ui } = useLocale();
  const kitchen = template.layoutConfig.documentType === 'kitchen_ticket';
  const currency = receipt.currency || 'EGP';
  const width = template.paperSize === '58mm' ? 219 : 302;
  return (
    <div className="mx-auto overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-950 shadow-xl" style={{ width: width * scale }} dir="rtl">
      <div style={{ width, transform: `scale(${scale})`, transformOrigin: 'top right', marginBottom: `${-(1 - scale) * 100}%` }} className="p-4 font-sans">
        {receipt.saleType === 'employee' ? <div className="mb-3 border-b-2 border-slate-950 pb-2 text-center text-sm font-bold"><p>{ui('فاتورة موظف')}</p><p className="break-words">الموظف: {receipt.employeeName || receipt.customerName || ui('غير محدد')}</p></div> : null}
        {kitchen ? (
          <>
            <div className="border-b-4 border-slate-950 pb-3 text-center">
              <Coffee className="mx-auto mb-1 size-7" />
              <p className="text-lg font-black">{template.headerText || ui('طلب تحضير جديد')}</p>
              <p className="mt-2 text-5xl font-black leading-none">#{toArabicDigits(receipt.dailyNumber ?? 1)}</p>
              <p className="nums mt-2 text-xs font-bold">{toArabicDigits(receipt.saleNumber)}</p>
              <p className="nums text-xs">{toArabicDigits(receipt.saleDate)}</p>
            </div>
            <div className="divide-y-2 divide-dashed divide-slate-500">
              {receipt.items.map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-start gap-3 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-2xl font-black text-white">{toArabicDigits(item.quantity)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-black leading-tight">{item.name}</p>
                    {item.variantName ? <p className="mt-1 inline-block rounded border-2 border-slate-950 px-2 py-0.5 text-sm font-black">{item.variantName}</p> : null}
                    {(item.freeQuantity ?? 0) > 0 ? <p className="mt-1 text-xs font-bold">{freeDrinkNote(item.freeQuantity!, !kitchen || template.layoutConfig.showPrices)}</p> : null}
                    {item.itemNote ? <p className="mt-1 rounded-md bg-slate-100 px-2 py-1.5 text-sm font-black">{ui('ملاحظة: ')}{item.itemNote}</p> : null}
                    {template.layoutConfig.showPrices ? <p className="nums mt-1 text-sm font-bold">{formatMoneyNumber(item.lineTotal)} {currency}</p> : null}
                  </div>
                </div>
              ))}
            </div>
            {template.layoutConfig.showReceiptComment && receipt.receiptComment ? (
              <div className="mt-2 border-4 border-slate-950 p-3">
                <p className="text-xs font-black">{ui('ملاحظات التحضير')}</p>
                <p className="mt-1 text-lg font-black">{receipt.receiptComment}</p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {template.includeHeader ? (
              <div className="text-center">
                {template.includeLogo ? <img src={receiptLogoUrl(receipt.logoUrl)} alt="" className="mx-auto mb-2 h-auto w-[22mm] max-w-full bg-transparent object-contain brightness-0" /> : null}
                <p className="text-lg font-black tracking-wider">{receipt.businessName || 'ONE80 CLUB · CAFE'}</p>
                <p className="mt-1 text-xs font-bold">{template.headerText || ui('إيصال بيع')}</p>
              </div>
            ) : null}
            <div className="my-3 rounded-lg border-2 border-slate-950 px-2 py-2.5 text-center">
              <p className="text-[10px] font-black">{ui('رقم الطلب')}</p>
              <p className="nums mt-1 text-4xl font-black leading-none">#{toArabicDigits(receipt.dailyNumber ?? 1)}</p>
            </div>
            {template.layoutConfig.showPaymentMethod && receipt.payments && receipt.payments.length > 1 ? (
              <div className="my-3 border-y-2 border-dashed border-slate-500 py-2 text-xs">
                <p className="mb-1 font-black">{ui('تفصيل الدفع')}</p>
                {receipt.payments.map((payment, index) => (
                  <p key={`${payment.methodName}-${index}`} className="flex justify-between gap-3 py-0.5">
                    <span>{payment.methodName}{payment.reference ? <small className="nums block text-[9px]">{payment.reference}</small> : null}</span>
                    <b className="nums">{formatMoneyNumber(payment.amount)} {currency}</b>
                  </p>
                ))}
              </div>
            ) : null}
            <div className="my-3 grid grid-cols-2 gap-1 border-y-2 border-dashed border-slate-500 py-2 text-xs">
              <span>{ui('رقم الفاتورة')}</span><b className="nums break-all text-end">{toArabicDigits(receipt.saleNumber)}</b>
              <span>{ui('التاريخ')}</span><b className="nums text-end">{toArabicDigits(receipt.saleDate)}</b>
              {receipt.saleTime ? <><span>{ui('الوقت')}</span><b className="nums text-end" dir="ltr">{toArabicDigits(formatReceiptTime(receipt.saleTime))}</b></> : null}
              {template.layoutConfig.showPaymentMethod ? <><span>{ui('الدفع')}</span><b className="text-end">{receipt.paymentMethod}</b></> : null}
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead><tr className="border-y-2 border-slate-950"><th className="py-1 text-start">{ui('الصنف')}</th><th className="py-1 text-center">{ui('الكمية')}</th>{template.layoutConfig.showPrices ? <th className="py-1 text-end">{receipt.discountAmount > 0 ? ui('قبل الخصم') : ui('الإجمالي')}</th> : null}</tr></thead>
              <tbody>{receipt.items.map((item, index) => <tr key={`${item.name}-${index}`} className="border-b border-dashed border-slate-400"><td className="py-2 font-bold">{item.name}{item.variantName ? <small className="block text-[9px]">{item.variantName}</small> : null}{(item.freeQuantity ?? 0) > 0 ? <small className="block text-[10px] font-bold">{freeDrinkNote(item.freeQuantity!)}</small> : null}{item.itemNote ? <small className="block text-[9px]">ملاحظة: {item.itemNote}</small> : null}</td><td className="nums py-2 text-center font-black">{toArabicDigits(item.quantity)}</td>{template.layoutConfig.showPrices ? <td className="nums py-2 text-end font-bold">{formatMoneyNumber(item.lineTotal)}</td> : null}</tr>)}</tbody>
            </table>
            {template.layoutConfig.showPrices ? (
              <div className="mt-3 space-y-1 border-t-2 border-slate-950 pt-2 text-xs">
                <p className="flex justify-between"><span>{ui('المجموع')}</span><b className="nums">{formatMoneyNumber(receipt.subtotal)}</b></p>
                {receiptDiscountRows(receipt).map((discount) => <p key={discount.label} className="flex justify-between gap-2"><span>{discount.label}</span><b className="nums shrink-0" dir="ltr">−{formatMoneyNumber(discount.amount)}</b></p>)}
                {receipt.taxAmount > 0 ? <p className="flex justify-between"><span>{ui('الضريبة')}</span><b className="nums">{formatMoneyNumber(receipt.taxAmount)}</b></p> : null}
                <p className="mt-2 flex justify-between bg-slate-950 p-2 text-base font-black text-white"><span>{ui('الإجمالي')}</span><span className="nums">{formatMoneyNumber(receipt.totalAmount)} {currency}</span></p>
              </div>
            ) : null}
            {template.layoutConfig.showReceiptComment && receipt.receiptComment ? <div className="mt-3 border-2 border-slate-950 p-2 text-xs"><b>{ui('ملاحظة الطلب')}</b><p className="mt-1">{receipt.receiptComment}</p></div> : null}
          </>
        )}
        {template.includeFooter ? <div className="mt-4 border-t border-dashed pt-3 text-center text-xs font-bold">{template.footerText || receipt.footerText || ui('شكراً لزيارتكم')}</div> : null}
      </div>
    </div>
  );
}

function freeDrinkNote(quantity: number, showDiscount = true) {
  return `${uiStatic('من الرصيد اليومي المجاني: ')}${toArabicDigits(quantity)}${showDiscount ? ` · ${uiStatic('خصم 100%')}` : ''}`;
}

function formatReceiptTime(value: string) {
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(trimmed);
  if (!match) return trimmed;
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return trimmed;
  const hour12 = hour % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${match[2]} ${hour < 12 ? uiStatic('ص') : uiStatic('م')}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function printableBody(receipt: PosReceiptData, template: PosPrintTemplate) {
  const kitchen = template.layoutConfig.documentType === 'kitchen_ticket';
  const currency = escapeHtml(receipt.currency || 'EGP');
  const identity = receipt.saleType === 'employee'
    ? `<section class="employee-identity"><b>${uiStatic('فاتورة موظف')}</b><p>${uiStatic('الموظف: ')}${escapeHtml(receipt.employeeName || receipt.customerName || uiStatic('غير محدد'))}</p></section>` : '';
  const discounts = receiptDiscountRows(receipt).map((discount) => `<p><span>${escapeHtml(discount.label)}</span><b class="nums" dir="ltr">−${escapeHtml(formatMoneyNumber(discount.amount))}</b></p>`).join('');
  const rows = receipt.items.map((item) => kitchen
    ? `<div class="k-item"><b class="qty">${escapeHtml(item.quantity)}</b><div><strong>${escapeHtml(item.name)}</strong>${item.variantName ? `<span class="variant">${escapeHtml(item.variantName)}</span>` : ''}${(item.freeQuantity ?? 0) > 0 ? `<small>${escapeHtml(freeDrinkNote(item.freeQuantity!, template.layoutConfig.showPrices))}</small>` : ''}${item.itemNote ? `<small class="item-note">ملاحظة: ${escapeHtml(item.itemNote)}</small>` : ''}${template.layoutConfig.showPrices ? `<small>${escapeHtml(formatMoneyNumber(item.lineTotal))} ${currency}</small>` : ''}</div></div>`
    : `<tr><td><b>${escapeHtml(item.name)}</b>${item.variantName ? `<small>${escapeHtml(item.variantName)}</small>` : ''}${(item.freeQuantity ?? 0) > 0 ? `<small>${escapeHtml(freeDrinkNote(item.freeQuantity!))}</small>` : ''}${item.itemNote ? `<small class="item-note">ملاحظة: ${escapeHtml(item.itemNote)}</small>` : ''}</td><td class="center nums">${escapeHtml(item.quantity)}</td>${template.layoutConfig.showPrices ? `<td class="end nums">${escapeHtml(formatMoneyNumber(item.lineTotal))}</td>` : ''}</tr>`).join('');
  const comment = template.layoutConfig.showReceiptComment && receipt.receiptComment
    ? `<div class="comment"><b>${kitchen ? uiStatic('ملاحظات التحضير') : uiStatic('ملاحظة الطلب')}</b><p>${escapeHtml(receipt.receiptComment)}</p></div>`
    : '';
  const paymentBreakdown = template.layoutConfig.showPaymentMethod && receipt.payments && receipt.payments.length > 1
    ? `<section style="border-block:1px dashed #000;padding:2mm 0;margin:2mm 0"><b>${uiStatic('تفصيل الدفع')}</b>${receipt.payments.map((payment) => `<p style="display:flex;justify-content:space-between;gap:2mm;margin:1mm 0"><span>${escapeHtml(payment.methodName)}${payment.reference ? `<small style="display:block;font-size:8px;overflow-wrap:anywhere">${escapeHtml(payment.reference)}</small>` : ''}</span><b>${escapeHtml(formatMoneyNumber(payment.amount))} ${currency}</b></p>`).join('')}</section>`
    : '';

  if (kitchen) {
    return `<main class="ticket kitchen">${identity}
      <header>${template.includeLogo ? `<img class="logo" src="${escapeHtml(receiptLogoUrl(receipt.logoUrl))}" alt="">` : '<div class="coffee">☕</div>'}<h1>${escapeHtml(template.headerText || uiStatic('طلب تحضير جديد'))}</h1><div class="order-no">#${escapeHtml(receipt.dailyNumber ?? 1)}</div><b class="sale-no">${escapeHtml(receipt.saleNumber)}</b><time>${escapeHtml(receipt.saleDate)}</time></header>
      <section class="k-items">${rows}</section>${comment}
      ${template.includeFooter ? `<footer>${escapeHtml(template.footerText || uiStatic('تم الاستلام بواسطة فريق التحضير'))}</footer>` : ''}
    </main>`;
  }

  return `<main class="ticket customer">${identity}
    ${template.includeHeader ? `<header>${template.includeLogo ? `<img class="logo" src="${escapeHtml(receiptLogoUrl(receipt.logoUrl))}" alt="">` : ''}<h1>${escapeHtml(receipt.businessName || 'ONE80 CLUB · CAFE')}</h1><b>${escapeHtml(template.headerText || uiStatic('إيصال بيع'))}</b></header>` : ''}
    <section class="order-number"><span>${uiStatic('رقم الطلب')}</span><b>#${escapeHtml(receipt.dailyNumber ?? 1)}</b></section>
    <section class="meta"><span>${uiStatic('رقم الفاتورة')}</span><b class="sale-number-small">${escapeHtml(receipt.saleNumber)}</b><span>${uiStatic('التاريخ')}</span><b>${escapeHtml(receipt.saleDate)}</b>${receipt.saleTime ? `<span>${uiStatic('الوقت')}</span><b class="receipt-time nums" dir="ltr">${escapeHtml(formatReceiptTime(receipt.saleTime))}</b>` : ''}${template.layoutConfig.showPaymentMethod ? `<span>${uiStatic('الدفع')}</span><b>${escapeHtml(receipt.paymentMethod)}</b>` : ''}</section>
    ${paymentBreakdown}
    <table><thead><tr><th>${uiStatic('الصنف')}</th><th class="center">${uiStatic('الكمية')}</th>${template.layoutConfig.showPrices ? `<th class="end">${receipt.discountAmount > 0 ? uiStatic('قبل الخصم') : uiStatic('الإجمالي')}</th>` : ''}</tr></thead><tbody>${rows}</tbody></table>
    ${template.layoutConfig.showPrices ? `<section class="totals"><p><span>${uiStatic('المجموع')}</span><b>${escapeHtml(formatMoneyNumber(receipt.subtotal))}</b></p>${discounts}${receipt.taxAmount > 0 ? `<p><span>${uiStatic('الضريبة')}</span><b>${escapeHtml(formatMoneyNumber(receipt.taxAmount))}</b></p>` : ''}<p class="grand"><span>${uiStatic('الإجمالي')}</span><b>${escapeHtml(formatMoneyNumber(receipt.totalAmount))} ${currency}</b></p></section>` : ''}
    ${comment}${template.includeFooter ? `<footer>${escapeHtml(template.footerText || receipt.footerText || uiStatic('شكراً لزيارتكم'))}</footer>` : ''}
  </main>`;
}

function printableStyles(template: PosPrintTemplate) {
  const width = template.paperSize === '58mm' ? '58mm' : '80mm';
  const padding = template.paperSize === '58mm' ? '2.5mm' : '3mm';
  const baseFont = template.layoutConfig.fontScale === 'compact' ? '10px' : template.layoutConfig.fontScale === 'large' ? '13px' : '11px';
  return `@page{size:auto;margin:0}*{box-sizing:border-box}html{width:100%}html,body{max-width:${width};width:100%;margin:0;padding:0;background:#fff;color:#000;font-family:Tajawal,Arial,sans-serif;font-size:${baseFont}}body{padding:${padding}}.ticket{width:100%}.nums{font-variant-numeric:tabular-nums}.logo{display:block;width:22mm;max-width:100%;height:auto;margin:0 auto 2mm;object-fit:contain;background:transparent;filter:brightness(0)}header{text-align:center;border-bottom:1px dashed #000;padding-bottom:3mm;margin-bottom:3mm}header h1{font-size:18px;margin:0 0 1mm;font-weight:900}.order-number{margin:3mm 0;padding:2.5mm 1.5mm;border:2px solid #000;border-radius:2mm;text-align:center}.order-number span{display:block;font-size:10px;font-weight:900}.order-number b{display:block;margin-top:1mm;font-size:34px;line-height:1;font-weight:1000}.meta{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1mm 3mm;border-bottom:1px dashed #000;padding-bottom:3mm;margin-bottom:3mm}.meta b{text-align:left;min-width:0;overflow-wrap:anywhere}.sale-number-small{font-size:10px;overflow-wrap:anywhere}table{width:100%;table-layout:fixed;border-collapse:collapse}th,td{padding:2mm 1mm;border-bottom:1px dashed #777;text-align:right;vertical-align:top;overflow-wrap:anywhere}th{border-block:1px solid #000;font-size:10px}td small{display:block;font-size:9px;font-weight:700;margin-top:.5mm}.item-note{border-right:2px solid #000;padding-right:1.5mm;font-weight:900!important}.center{text-align:center;width:16%}.end{text-align:left;width:30%}.totals{margin-top:3mm;border-top:2px solid #000;padding-top:2mm}.totals p{display:flex;justify-content:space-between;gap:2mm;margin:1mm 0}.totals b{flex-shrink:0}.employee-identity{text-align:center;overflow-wrap:anywhere;border-bottom:1px solid #000;margin-bottom:3mm;padding-bottom:2mm;font-size:13px}.employee-identity p{margin:1mm 0 0}.grand{background:#000;color:#fff;padding:2mm;font-size:15px;font-weight:900}.comment{border:2px solid #000;padding:2.5mm;margin-top:3mm}.comment p{margin:1mm 0 0;font-size:14px;font-weight:800;white-space:pre-wrap}footer{text-align:center;border-top:1px dashed #000;margin-top:4mm;padding-top:3mm;font-weight:800}.coffee{font-size:24px}.kitchen header{border-bottom:2px solid #000}.kitchen h1{font-size:20px}.order-no{font-size:48px;line-height:1;font-weight:1000;margin:2mm 0}.sale-no,.kitchen time{display:block}.k-items{border-block:2px solid #000}.k-item{display:flex;gap:3mm;align-items:flex-start;padding:3mm 0;border-bottom:2px dashed #777}.k-item:last-child{border-bottom:0}.k-item .qty{display:grid;place-items:center;min-width:12mm;height:12mm;background:#000;color:#fff;border-radius:2mm;font-size:24px}.k-item>div{min-width:0;flex:1;overflow-wrap:anywhere}.k-item strong{display:block;font-size:20px;line-height:1.2}.variant{display:block;width:fit-content;max-width:100%;border:2px solid #000;padding:1mm 2mm;margin-top:1mm;font-size:13px;font-weight:900}.k-item small{display:block;margin-top:1mm;font-weight:800}${template.cssStyles ?? ''}`;
}

export function buildPosPrintDocumentHtml(receipt: PosReceiptData, template: PosPrintTemplate) {
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(template.name)} · ${escapeHtml(receipt.saleNumber)}</title><style>${printableStyles(template)}</style></head><body>${printableBody(receipt, template)}</body></html>`;
}

type PrintBridgeJob = {
  jobId: string;
  printerName: string;
  documentType: PosPrintDocumentType;
  paperSize: string;
  copies: number;
  html: string;
};

type PrintBridgeResult = { ok: boolean; jobId: string; error?: string };

declare global {
  interface Window {
    ONE80_PRINT_BRIDGE?: { print: (job: PrintBridgeJob) => Promise<PrintBridgeResult | void> | PrintBridgeResult | void };
  }
}

export async function dispatchPosPrintJobs(
  receipt: PosReceiptData,
  templates: PosPrintTemplate[],
) {
  const active = templates.filter((template) => template.isActive && template.layoutConfig.autoPrint);
  if (!active.length) {
    return { mode: 'disabled' as const, jobs: 0 };
  }

  if (window.ONE80_PRINT_BRIDGE) {
    for (const template of active) {
      const outcome = await window.ONE80_PRINT_BRIDGE.print({
        jobId: `${receipt.saleNumber}:${template.layoutConfig.documentType}`,
        printerName: template.layoutConfig.printerName,
        documentType: template.layoutConfig.documentType,
        paperSize: template.paperSize,
        copies: template.layoutConfig.copies,
        html: buildPosPrintDocumentHtml(receipt, template),
      });
      if (outcome && !outcome.ok) throw new Error(outcome.error || uiStatic('تعذرت الطباعة'));
    }
    return { mode: 'bridge' as const, jobs: active.length };
  }

  // Until the local print bridge is connected, the in-app confirmation preview
  // is the only automatic fallback. Never interrupt the cashier with a new tab.
  return { mode: 'preview' as const, jobs: active.length };
}

export async function printSinglePosDocument(receipt: PosReceiptData, template: PosPrintTemplate) {
  if (window.ONE80_PRINT_BRIDGE) {
    const outcome = await window.ONE80_PRINT_BRIDGE.print({
      jobId: `${receipt.saleNumber}:${template.layoutConfig.documentType}:reprint:${Date.now()}`,
      printerName: template.layoutConfig.printerName,
      documentType: template.layoutConfig.documentType,
      paperSize: template.paperSize,
      copies: template.layoutConfig.copies,
      html: buildPosPrintDocumentHtml(receipt, template),
    });
    if (outcome && !outcome.ok) throw new Error(outcome.error || uiStatic('تعذرت الطباعة'));
    return true;
  }
  const target = window.open('', '_blank', 'width=420,height=720');
  if (!target) return false;
  target.document.open();
  target.document.write(buildPosPrintDocumentHtml(receipt, template));
  target.document.close();
  window.setTimeout(() => {
    target.focus();
    target.print();
  }, 350);
  return true;
}

export function PosPrinterDestination({ template }: { template: PosPrintTemplate }) {
  const kitchen = template.layoutConfig.documentType === 'kitchen_ticket';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
      {kitchen ? <Coffee className="size-3.5 text-amber-600" /> : <ReceiptText className="size-3.5 text-primary" />}
      <Printer className="size-3" />
      {template.layoutConfig.printerName}
    </span>
  );
}
