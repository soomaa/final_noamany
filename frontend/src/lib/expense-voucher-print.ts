import type { ExpenseRow } from '@/types/finance';

/** Translator for the voucher labels (the page's `ui()`), so the print follows the UI language. */
type Translate = (arabic: string) => string;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value: number | null | undefined): string {
  return (Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Printable «سند صرف» for one expense row — pure, so it can be unit-tested. */
export function buildExpenseVoucherHtml(
  row: ExpenseRow,
  opts: { brandName: string; branchName?: string | null; printedBy?: string | null; ui: Translate; dir?: 'rtl' | 'ltr' },
): string {
  const { ui } = opts;
  const tax = Number(row.taxAmount) || 0;
  const total = row.totalAmount ?? (Number(row.amount) || 0) + tax;
  const rows: Array<[string, string | null | undefined]> = [
    [ui('التاريخ'), row.expenseDate?.slice(0, 10)],
    [ui('الفرع'), opts.branchName],
    [ui('الفئة'), row.subCategory ? `${row.category} — ${row.subCategory}` : row.category],
    [ui('المورد'), row.vendor],
    [ui('الوصف'), row.description],
    [ui('طريقة الدفع'), row.paymentMethod],
    [ui('حالة الدفع'), row.paymentStatus],
    [ui('الموافقة'), row.approvalStatus],
    [ui('رقم الفاتورة'), row.invoiceNumber],
    [ui('رقم الإيصال'), row.receiptNumber],
    [ui('من قام بالصرف'), row.createdByName],
    [ui('ملاحظات'), row.notes],
  ];
  const detailRows = rows
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  const number = row.expenseNumber || `#${row.id}`;
  const printedAt = new Date().toLocaleString('en-GB');

  return `<!DOCTYPE html><html dir="${opts.dir ?? 'rtl'}"><head><meta charset="utf-8">
<title>${escapeHtml(ui('سند صرف'))} ${escapeHtml(number)}</title>
<style>
  @page { size: A5; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Tajawal, "Segoe UI", system-ui, sans-serif; color: #111; margin: 0; font-size: 13px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: .5px; }
  .title { font-size: 17px; font-weight: 700; }
  .num { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: embed; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d4d4d4; padding: 7px 9px; text-align: start; vertical-align: top; }
  th { width: 34%; background: #f5f5f5; font-weight: 600; }
  .amounts { margin-top: 12px; }
  .amounts td { text-align: end; font-variant-numeric: tabular-nums; }
  .total th, .total td { font-size: 16px; font-weight: 800; background: #fafafa; }
  .signs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 36px; text-align: center; }
  .signs div { border-top: 1px solid #555; padding-top: 6px; }
  .foot { margin-top: 18px; font-size: 11px; color: #666; display: flex; justify-content: space-between; }
</style></head><body>
  <div class="head">
    <div><div class="brand">${escapeHtml(opts.brandName)}</div><div class="title">${escapeHtml(ui('سند صرف'))}</div></div>
    <div class="num">${escapeHtml(number)}</div>
  </div>
  <table>${detailRows}</table>
  <table class="amounts">
    <tr><th>${escapeHtml(ui('المبلغ'))}</th><td>${money(row.amount)}</td></tr>
    ${tax > 0 ? `<tr><th>${escapeHtml(ui('الضريبة'))}</th><td>${money(tax)}</td></tr>` : ''}
    <tr class="total"><th>${escapeHtml(ui('الإجمالي'))}</th><td>${money(total)}</td></tr>
  </table>
  <div class="signs">
    <div>${escapeHtml(ui('المستلم'))}</div>
    <div>${escapeHtml(ui('المحاسب'))}</div>
    <div>${escapeHtml(ui('المدير'))}</div>
  </div>
  <div class="foot"><span>${escapeHtml(opts.printedBy ?? '')}</span><span class="num">${escapeHtml(printedAt)}</span></div>
</body></html>`;
}

/** Print through a hidden iframe so popup blockers never swallow the voucher. */
export function printHtmlDocument(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => window.setTimeout(() => frame.remove(), 500);
  win.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(() => {
    win.focus();
    win.print();
    // Safari never fires afterprint for iframes; remove it eventually anyway.
    window.setTimeout(() => frame.isConnected && frame.remove(), 60_000);
  }, 150);
}
