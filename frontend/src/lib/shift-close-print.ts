export interface ShiftCloseReportData {
  generatedAt: string;
  session: {
    id: number;
    shiftName: string;
    branchId: number | null;
    branchName: string | null;
    cashierId: number;
    cashierName: string | null;
    sessionDate: string;
    startTime: string;
    endTime: string | null;
    status: string;
  };
  counts: { invoices: number; refunds: number; cancellations: number };
  totals: {
    grossSales: number;
    refunds: number;
    cancellations: number;
    netSales: number;
    collected: number;
    internalAccounts: number;
    discount: number;
    tax: number;
  };
  paymentMethods: Array<{
    code: string;
    name: string;
    baseMethod: string;
    saleCount: number;
    refundCount: number;
    cancellationCount: number;
    grossAmount: number;
    refundAmount: number;
    cancellationAmount: number;
    netAmount: number;
  }>;
  invoices: Array<{
    invoiceNumber: string;
    saleDate: string;
    saleTime: string;
    customerName: string;
    status: string;
    subtotalAmount: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    payments: Array<{
      code: string;
      name: string;
      baseMethod: string;
      amount: number;
    }>;
  }>;
  products?: Array<{
    key: string;
    name: string;
    variantName: string | null;
    orderCount: number;
    soldQuantity: number;
    refundQuantity: number;
    cancellationQuantity: number;
    netQuantity: number;
    unitPrice: number;
    grossAmount: number;
    refundAmount: number;
    cancellationAmount: number;
    netAmount: number;
  }>;
  internalAccounts: { name: string; saleCount: number; refundCount: number; netAmount: number };
  accountSettlements?: {
    count: number;
    totalAmount: number;
    directAmount: number;
    nonCashAmount: number;
    entries: Array<{
      statementNumber: string;
      settledAt: string | null;
      accountType: string;
      accountName: string | null;
      totalAmount: number;
      settlementMethod: string;
      paymentMethod: string | null;
    }>;
  };
  drawer: {
    openingBalance: number;
    expectedClosingBalance: number;
    closingBalance: number | null;
    cashDifference: number | null;
    cashDropAmount: number;
    retainedAmount: number;
  };
}

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const toLatinDigits = (value: string) => value
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
}).format(new Date(value));

const formatTime = (value: string) => {
  const directTime = value.match(/^(\d{1,2}):(\d{2})/);
  if (directTime) return `${directTime[1].padStart(2, '0')}:${directTime[2]}`;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
};

const formatQuantity = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return Number.isInteger(safeValue)
    ? safeValue.toFixed(0)
    : safeValue.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'مكتملة',
  refunded: 'مستردة',
  cancelled: 'ملغاة',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'كاش',
  card: 'بطاقة / فيزا',
  wallet: 'محفظة إلكترونية',
  transfer: 'تحويل بنكي',
};

const settlementMethodLabel = (method: string, paymentMethod: string | null) => {
  if (method === 'payroll_deduction') return 'خصم من الراتب';
  if (method === 'profit_share_deduction') return 'خصم من نسبة الشريك';
  return `دفع مباشر${paymentMethod ? ` · ${PAYMENT_LABELS[paymentMethod] || paymentMethod}` : ''}`;
};

export function buildShiftCloseHtml(
  report: ShiftCloseReportData,
  businessName: string,
  logoUrl = '',
) {
  const methodRows = report.paymentMethods.map((method) => `
    <section class="method">
      <h3>${escapeHtml(method.name)}</h3>
      <p><span>عمليات</span><b>${method.saleCount}</b><b>${method.grossAmount.toFixed(2)}</b></p>
      ${method.refundCount ? `<p><span>مرتجع</span><b>${method.refundCount}</b><b>-${method.refundAmount.toFixed(2)}</b></p>` : ''}
      ${method.cancellationCount ? `<p><span>ملغي</span><b>${method.cancellationCount}</b><b>-${method.cancellationAmount.toFixed(2)}</b></p>` : ''}
      <p class="net"><span>الصافي</span><b></b><b>${method.netAmount.toFixed(2)}</b></p>
    </section>`).join('');
  const internal = report.internalAccounts.netAmount !== 0 ? `
    <section class="method">
      <h3>${escapeHtml(report.internalAccounts.name)}</h3>
      <p class="net"><span>على الحساب</span><b>${report.internalAccounts.saleCount}</b><b>${report.internalAccounts.netAmount.toFixed(2)}</b></p>
    </section>` : '';
  const invoiceRows = (report.invoices ?? []).map((invoice) => {
    const paymentRows = invoice.payments.length
      ? invoice.payments.map((payment) => `
          <p class="invoice-payment"><span>${escapeHtml(payment.name)}</span><b>${payment.amount.toFixed(2)}</b></p>`).join('')
      : '<p class="invoice-payment"><span>غير محصل</span><b>0.00</b></p>';
    return `
      <article class="invoice">
        <div class="invoice-head">
          <b class="ltr">#${escapeHtml(invoice.invoiceNumber)}</b>
          <span class="ltr">${escapeHtml(formatTime(invoice.saleTime))}</span>
        </div>
        <div class="invoice-meta">
          <span>${escapeHtml(invoice.customerName)}</span>
          <b>${escapeHtml(STATUS_LABELS[invoice.status] || invoice.status)}</b>
        </div>
        <div class="invoice-payments">${paymentRows}</div>
        ${invoice.discountAmount ? `<p class="invoice-adjustment"><span>الخصم</span><b>-${invoice.discountAmount.toFixed(2)}</b></p>` : ''}
        ${invoice.taxAmount ? `<p class="invoice-adjustment"><span>الضريبة</span><b>${invoice.taxAmount.toFixed(2)}</b></p>` : ''}
        <p class="invoice-total"><span>إجمالي الفاتورة</span><b>${invoice.totalAmount.toFixed(2)} EGP</b></p>
      </article>`;
  }).join('');
  const invoiceSection = invoiceRows
    ? `<section class="invoices"><h2 class="section-title">تفاصيل الفواتير</h2>${invoiceRows}</section>`
    : '<section class="invoices"><h2 class="section-title">تفاصيل الفواتير</h2><p class="center muted">لا توجد فواتير في هذه الوردية</p></section>';
  const settlementRows = (report.accountSettlements?.entries ?? []).map((settlement) => `
    <article class="settlement">
      <div class="settlement-head">
        <b class="ltr">#${escapeHtml(settlement.statementNumber)}</b>
        <span class="ltr">${settlement.settledAt ? escapeHtml(formatTime(settlement.settledAt)) : '—'}</span>
      </div>
      <p><span>${escapeHtml(settlement.accountName || (settlement.accountType === 'partner' ? 'شريك' : 'موظف'))}</span><b>${settlement.totalAmount.toFixed(2)} EGP</b></p>
      <small>${escapeHtml(settlementMethodLabel(settlement.settlementMethod, settlement.paymentMethod))}</small>
    </article>`).join('');
  const settlementSection = report.accountSettlements?.count
    ? `<section class="settlements">
        <h2 class="section-title">تحصيلات حسابات الموظفين والشركاء</h2>
        ${settlementRows}
        <p class="settlement-total"><span>إجمالي التسويات</span><b>${report.accountSettlements.totalAmount.toFixed(2)} EGP</b></p>
      </section>`
    : '';
  const products = report.products ?? [];
  const totalNetQuantity = products.reduce((sum, product) => sum + product.netQuantity, 0);
  const productRows = products.map((product, index) => {
    const adjustments = [
      product.refundQuantity > 0 ? `مرتجع ${formatQuantity(product.refundQuantity)}` : '',
      product.cancellationQuantity > 0 ? `ملغي ${formatQuantity(product.cancellationQuantity)}` : '',
    ].filter(Boolean);
    const adjustmentLine = adjustments.length
      ? `<small class="product-adjustment">مباع ${formatQuantity(product.soldQuantity)} · ${adjustments.join(' · ')}</small>`
      : '';
    const variant = product.variantName
      ? `<small class="product-variant">${escapeHtml(product.variantName)}</small>`
      : '';
    return `<article class="product-row">
      <b class="product-index">${index + 1}</b>
      <div class="product-name"><b>${escapeHtml(product.name)}</b>${variant}${adjustmentLine}</div>
      <b class="product-quantity">${formatQuantity(product.netQuantity)}</b>
      <b class="product-unit-price">${product.unitPrice.toFixed(2)}</b>
      <b class="product-total">${product.netAmount.toFixed(2)}</b>
    </article>`;
  }).join('');
  const productSection = products.length
    ? `<section class="products">
        <h2 class="section-title">ملخص المنتجات المباعة</h2>
        <div class="product-overview"><b>${products.length} أصناف</b><b>${formatQuantity(totalNetQuantity)} وحدات صافي</b></div>
        <div class="product-columns"><span>#</span><span>المنتج</span><span>الكمية</span><span>سعر الوحدة</span><span>إجمالي البيع</span></div>
        <div class="product-list">${productRows}</div>
      </section>`
    : `<section class="products"><h2 class="section-title">ملخص المنتجات المباعة</h2><p class="center muted product-empty">لا توجد منتجات مباعة في هذه الوردية</p></section>`;
  const actualDrawer = report.drawer.closingBalance != null
    ? `<p><span>النقدي الفعلي</span><b>${report.drawer.closingBalance.toFixed(2)}</b></p>
       <p><span>فرق النقدية</span><b>${(report.drawer.cashDifference ?? 0).toFixed(2)}</b></p>`
    : '<p><span>النقدي الفعلي</span><b>لم يُدخل بعد</b></p>';
  const logo = logoUrl
    ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="">`
    : '';
  const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>إغلاق الوردية</title><style>
    @page{size:80mm auto;margin:0}*{box-sizing:border-box}html,body{width:80mm;margin:0;background:#fff;color:#000;font-family:Tajawal,Arial,sans-serif;font-size:11px;font-variant-numeric:tabular-nums}body{padding:3mm}.center{text-align:center}.logo{display:block;width:22mm;max-width:100%;height:auto;object-fit:contain;background:transparent;margin:0 auto 1.5mm;filter:brightness(0)}h1{font-size:18px;margin:0}h2{font-size:14px;margin:1mm 0 3mm}.section-title{border-block:2px solid #000;margin:2.5mm 0 0;padding:1.5mm 0;text-align:center;font-size:13px}.rule{border-top:2px solid #000;margin:2mm 0}.dash{border-top:1px dashed #000;margin:2mm 0}.meta,.totals,.drawer{display:grid;gap:1mm}.meta p,.totals p,.drawer p{display:flex;justify-content:space-between;margin:0}.methods{margin-top:1mm}.method{border-bottom:1px dashed #000;padding:2mm 0}.method h3{font-size:13px;margin:0 0 1mm;text-align:center}.method p{display:grid;grid-template-columns:1fr 12mm 20mm;gap:1mm;margin:.6mm 0}.method p b{text-align:left}.method .net{border-top:1px solid #000;padding-top:1mm;font-weight:900}.totals{border-block:2px solid #000;padding:2mm 0;font-size:12px}.totals .grand{font-size:16px;font-weight:900}.settlement{border-bottom:1px dashed #000;padding:2mm 0;break-inside:avoid;page-break-inside:avoid}.settlement-head,.settlement p,.settlement-total{display:flex;align-items:center;justify-content:space-between;gap:2mm;margin:0}.settlement-head{font-size:12px}.settlement p{margin-top:1mm}.settlement small{display:block;margin-top:.7mm;color:#333}.settlement-total{border-block:2px solid #000;padding:1.5mm 0;font-size:12px}.product-overview{display:flex;justify-content:space-between;gap:2mm;background:#000;color:#fff;padding:1.4mm 1.8mm;font-size:10px}.product-columns,.product-row{display:grid;grid-template-columns:4mm minmax(0,1fr) 9mm 15mm 17mm;gap:.6mm;align-items:center}.product-columns{border-bottom:1px solid #000;padding:1mm .3mm;font-size:7px;font-weight:700;line-height:1.15}.product-columns span:nth-child(n+3){text-align:center}.product-row{border-bottom:1px dotted #777;padding:1.5mm .3mm;break-inside:avoid;page-break-inside:avoid}.product-index{text-align:center;font-size:8px}.product-name{min-width:0;line-height:1.25}.product-name>b{display:block;overflow-wrap:anywhere;font-size:10px}.product-variant,.product-adjustment{display:block;margin-top:.4mm;font-size:7px;font-weight:500}.product-variant{color:#333}.product-adjustment{font-weight:700}.product-quantity{text-align:center;font-size:12px}.product-unit-price,.product-total{text-align:center;font-size:9px;direction:ltr;unicode-bidi:embed}.product-total{font-size:10px;font-weight:900}.product-empty{padding:3mm 0}.invoice{border-bottom:1px dashed #000;padding:2mm 0;break-inside:avoid;page-break-inside:avoid}.invoice-head,.invoice-meta,.invoice-payment,.invoice-adjustment,.invoice-total{display:flex;align-items:center;justify-content:space-between;gap:2mm;margin:0}.invoice-head{font-size:13px}.invoice-meta{margin-top:.8mm;color:#333}.invoice-meta b{font-size:9px;border:1px solid #000;border-radius:999px;padding:.3mm 1.2mm;color:#000}.invoice-payments{border-top:1px dotted #777;margin-top:1.2mm;padding-top:1mm}.invoice-payment,.invoice-adjustment{margin-top:.7mm}.invoice-payment b,.invoice-adjustment b,.invoice-total b{text-align:left}.invoice-adjustment{font-size:10px}.invoice-total{border-top:1px solid #000;margin-top:1mm;padding-top:1mm;font-size:12px;font-weight:900}.drawer{padding:2mm 0}.sign{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:8mm;text-align:center}.sign span{border-top:1px solid #000;padding-top:2mm}.muted{font-size:9px}.ltr{direction:ltr;unicode-bidi:embed}
  </style></head><body>
    <header class="center">${logo}<h1>${escapeHtml(businessName)}</h1><h2>تقرير إغلاق الوردية</h2></header>
    <div class="rule"></div>
    <section class="meta">
      <p><span>الفرع</span><b>${escapeHtml(report.session.branchName || '—')}</b></p>
      <p><span>الوردية</span><b>${escapeHtml(report.session.shiftName)}</b></p>
      <p><span>الكاشير</span><b>${escapeHtml(report.session.cashierName || '—')}</b></p>
      <p><span>التاريخ</span><b class="ltr">${escapeHtml(report.session.sessionDate)}</b></p>
      <p><span>رقم الجلسة</span><b>#${report.session.id}</b></p>
      <p><span>الفترة</span><b class="ltr">${escapeHtml(formatTime(report.session.startTime))} — ${report.session.endTime ? escapeHtml(formatTime(report.session.endTime)) : 'مفتوحة'}</b></p>
    </section>
    <div class="dash"></div>
    <section class="methods"><h2 class="section-title">ملخص طرق الدفع</h2>${methodRows}${internal}</section>
    <section class="totals">
      <p><span>عدد الفواتير</span><b>${report.counts.invoices}</b></p>
      <p><span>إجمالي المبيعات</span><b>${report.totals.grossSales.toFixed(2)}</b></p>
      ${report.totals.refunds ? `<p><span>المرتجعات</span><b>-${report.totals.refunds.toFixed(2)}</b></p>` : ''}
      ${report.totals.cancellations ? `<p><span>الإلغاءات</span><b>-${report.totals.cancellations.toFixed(2)}</b></p>` : ''}
      ${report.totals.discount ? `<p><span>الخصومات</span><b>${report.totals.discount.toFixed(2)}</b></p>` : ''}
      ${report.totals.tax ? `<p><span>الضريبة</span><b>${report.totals.tax.toFixed(2)}</b></p>` : ''}
      <p class="grand"><span>صافي المبيعات</span><b>${report.totals.netSales.toFixed(2)} EGP</b></p>
    </section>
    ${settlementSection}
    ${productSection}
    ${invoiceSection}
    <section class="drawer">
      <p><span>رصيد افتتاح الدرج</span><b>${report.drawer.openingBalance.toFixed(2)}</b></p>
      <p><span>المتوقع في الدرج</span><b>${report.drawer.expectedClosingBalance.toFixed(2)}</b></p>
      ${actualDrawer}
    </section>
    <div class="sign"><span>توقيع الكاشير</span><span>اعتماد المسؤول</span></div>
    <p class="center muted">طُبع في <span class="ltr">${escapeHtml(formatDateTime(report.generatedAt))}</span></p>
  </body></html>`;
  return toLatinDigits(html);
}
