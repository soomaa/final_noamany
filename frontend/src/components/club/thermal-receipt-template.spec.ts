import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildThermalFinancialReceiptHtml,
  buildThermalSubscriptionReceiptHtml,
} from './thermal-receipt-template.ts';

const subscription = {
  receiptNumber: 'R-2026-42', subscriptionNumber: 'A000008-2', customerName: 'Karim Waleed',
  customerPhone: '01012345678', memberCode: '000008', branchName: 'Main Branch',
  operatorName: 'Reception', operatorUsername: 'front.desk', salesName: 'Omar Abdallah',
  subscriptionType: 'Annual', registrationDate: '2026-08-25', subscriptionStartDate: '2026-08-25',
  subscriptionEndDate: '2027-08-25', subscriptionValue: 3900, discountEnabled: true,
  discountValue: 400, paidAmount: 200, remainingAmount: 3300, paymentMethod: 'card',
};

test('renders a ONE80 Arabic RTL receipt without inherited competitor branding', () => {
  const html = buildThermalSubscriptionReceiptHtml(subscription);
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /data-print-size="80mm"/);
  assert.match(html, /ONE80/);
  assert.doesNotMatch(html, /FITNESS TIME/i);
  assert.match(html, /data-receipt-status="partial"/);
  assert.match(html, /3,900\.00 ج\.م/);
  assert.match(html, /Reception/);
  assert.match(html, /front\.desk/);
});

test('supports English LTR and one or two A4 copies', () => {
  const english = buildThermalSubscriptionReceiptHtml(subscription, { receiptLanguage: 'en' });
  assert.match(english, /<html lang="en" dir="ltr">/);
  assert.match(english, /MEMBERSHIP RECEIPT/);
  assert.match(english, /EGP 3,900\.00/);
  const two = buildThermalSubscriptionReceiptHtml(subscription, { receiptPaperSize: 'a4', receiptA4Copies: 2 });
  assert.match(two, /@page\s*\{\s*size:\s*A4/);
  assert.equal((two.match(/data-receipt-copy=/g) ?? []).length, 2);
  assert.match(two, /class="cut-guide"/);
  const one = buildThermalSubscriptionReceiptHtml(subscription, { receiptPaperSize: 'a4', receiptA4Copies: 1 });
  assert.equal((one.match(/data-receipt-copy=/g) ?? []).length, 1);
});

test('escapes user input in generic paid-service receipts', () => {
  const html = buildThermalFinancialReceiptHtml({
    documentNumber: 'QS-14', transactionLabel: 'Quick Service', itemName: '<Day Pass>',
    customerName: 'Mona & Ali', collectedAmount: 200, paymentMethod: 'cash',
  });
  assert.match(html, /&lt;Day Pass&gt;/);
  assert.match(html, /Mona &amp; Ali/);
  assert.doesNotMatch(html, /<Day Pass>/);
});
