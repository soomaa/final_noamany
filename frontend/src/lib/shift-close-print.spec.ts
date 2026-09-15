import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShiftCloseHtml, type ShiftCloseReportData } from './shift-close-print.ts';

const report: ShiftCloseReportData = {
  generatedAt: '2026-08-27T13:00:00.000Z',
  session: {
    id: 4,
    shiftName: 'مسائي <A>',
    branchId: 1,
    branchName: 'GC Gym',
    cashierId: 1,
    cashierName: 'مدير النظام',
    sessionDate: '2026-08-27',
    startTime: '2026-08-27T10:00:00.000Z',
    endTime: null,
    status: 'open',
  },
  counts: { invoices: 11, refunds: 0, cancellations: 0 },
  totals: {
    grossSales: 585.5,
    refunds: 0,
    cancellations: 0,
    netSales: 585.5,
    collected: 585.5,
    internalAccounts: 0,
    discount: 0,
    tax: 1.5,
  },
  paymentMethods: [{
    code: 'cash',
    name: 'كاش',
    baseMethod: 'cash',
    saleCount: 11,
    refundCount: 0,
    cancellationCount: 0,
    grossAmount: 579.75,
    refundAmount: 0,
    cancellationAmount: 0,
    netAmount: 579.75,
  }],
  invoices: [{
    invoiceNumber: 'INV-0042',
    saleDate: '2026-08-27',
    saleTime: '14:35:00',
    customerName: 'سارة أحمد',
    status: 'completed',
    subtotalAmount: 570,
    discountAmount: 5,
    taxAmount: 1.5,
    totalAmount: 566.5,
    payments: [
      { code: 'cash', name: 'كاش', baseMethod: 'cash', amount: 300 },
      { code: 'instapay', name: 'InstaPay', baseMethod: 'transfer', amount: 266.5 },
    ],
  }],
  internalAccounts: { name: 'حساب الموظفين والشركاء', saleCount: 0, refundCount: 0, netAmount: 0 },
  drawer: {
    openingBalance: 1,
    expectedClosingBalance: 580.75,
    closingBalance: null,
    cashDifference: null,
    cashDropAmount: 0,
    retainedAmount: 0,
  },
};

test('builds the complete escaped 80mm receipt used by preview and printer', () => {
  const html = buildShiftCloseHtml(report, 'GC Gym & Cafe', '/uploads/gc-logo.png');

  assert.match(html, /@page\{size:80mm auto/);
  assert.match(html, /GC Gym &amp; Cafe/);
  assert.match(html, /<img[^>]+src="\/uploads\/gc-logo\.png"/);
  assert.match(html, /مسائي &lt;A&gt;/);
  assert.match(html, /<h3>كاش<\/h3>/);
  assert.match(html, /<span>عدد الفواتير<\/span><b>11<\/b>/);
  assert.match(html, /<span>صافي المبيعات<\/span><b>585\.50 EGP<\/b>/);
  assert.match(html, /ملخص طرق الدفع/);
  assert.match(html, /تفاصيل الفواتير/);
  assert.match(html, /INV-0042/);
  assert.match(html, /14:35/);
  assert.match(html, /سارة أحمد/);
  assert.match(html, /InstaPay/);
  assert.match(html, /266\.50/);
  assert.doesNotMatch(html, /[٠-٩]/);
  assert.match(html, /توقيع الكاشير/);
  assert.match(html, /اعتماد المسؤول/);
});

test('prints a structured product summary with unit price and sold total instead of orders', () => {
  const productReport = {
    ...report,
    products: [
      {
        key: 'cafe:1',
        name: 'مياه <بارد>',
        variantName: null,
        orderCount: 2,
        soldQuantity: 5,
        refundQuantity: 1,
        cancellationQuantity: 0,
        netQuantity: 4,
        unitPrice: 10,
        grossAmount: 50,
        refundAmount: 10,
        cancellationAmount: 0,
        netAmount: 40,
      },
      {
        key: 'cafe:2:v1',
        name: 'قهوة',
        variantName: 'وسط',
        orderCount: 1,
        soldQuantity: 1,
        refundQuantity: 0,
        cancellationQuantity: 0,
        netQuantity: 1,
        unitPrice: 25,
        grossAmount: 25,
        refundAmount: 0,
        cancellationAmount: 0,
        netAmount: 25,
      },
    ],
  } as ShiftCloseReportData;

  const html = buildShiftCloseHtml(productReport, 'GC Gym');

  assert.match(html, /ملخص المنتجات المباعة/);
  assert.match(html, /2 أصناف/);
  assert.match(html, /5 وحدات صافي/);
  assert.match(html, /مياه &lt;بارد&gt;/);
  assert.ok(!html.includes('<span>الطلبات</span>'));
  assert.ok(!html.includes('<span>2 طلب</span>'));
  assert.ok(html.includes('<b class="product-quantity">4</b>'));
  assert.ok(html.includes('<b class="product-unit-price">10.00</b>'));
  assert.ok(html.includes('<b class="product-total">40.00</b>'));
  assert.match(html, /مباع 5 · مرتجع 1/);
  assert.match(html, /قهوة/);
  assert.match(html, /وسط/);
  assert.doesNotMatch(html, /[٠-٩]/);
});

test('prints direct and non-cash account settlements as a separate shift section', () => {
  const settlementReport = {
    ...report,
    accountSettlements: {
      count: 2,
      totalAmount: 230,
      directAmount: 150,
      nonCashAmount: 80,
      entries: [
        {
          statementNumber: 'ST-CASH-1',
          settledAt: '2026-09-01T10:30:00.000Z',
          accountType: 'employee',
          accountName: 'كابتن تامر',
          totalAmount: 150,
          settlementMethod: 'direct_payment',
          paymentMethod: 'cash',
        },
        {
          statementNumber: 'ST-PAYROLL-1',
          settledAt: '2026-09-01T11:00:00.000Z',
          accountType: 'employee',
          accountName: 'كابتن محمود',
          totalAmount: 80,
          settlementMethod: 'payroll_deduction',
          paymentMethod: null,
        },
      ],
    },
  } as ShiftCloseReportData;

  const html = buildShiftCloseHtml(settlementReport, 'GC Gym');

  assert.match(html, /تحصيلات حسابات الموظفين والشركاء/);
  assert.match(html, /ST-CASH-1/);
  assert.match(html, /كابتن تامر/);
  assert.match(html, /دفع مباشر · كاش/);
  assert.match(html, /ST-PAYROLL-1/);
  assert.match(html, /خصم من الراتب/);
  assert.match(html, /إجمالي التسويات/);
  assert.match(html, /230\.00/);
});
