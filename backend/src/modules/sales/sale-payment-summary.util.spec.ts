import { strict as assert } from 'node:assert';
import { invoicePaymentAmounts, shiftPaymentSummary, type ShiftPaymentInvoice } from './sale-payment-summary.util';

const sale = (overrides: Partial<ShiftPaymentInvoice> = {}): ShiftPaymentInvoice => ({
  status: 'completed', paymentMethod: 'cash', totalAmount: 100, collectedAmount: 100, saleType: 'customer', ...overrides,
});

test('split invoices contribute their actual amounts to each method, never their full total twice', () => {
  const split = sale({ paymentMethod: 'mixed', payments: [
    { id: 1, method: 'cash', amount: 30 }, { id: 2, method: 'card', amount: 70 },
  ] });
  const summary = shiftPaymentSummary([split, sale({ totalAmount: 25, collectedAmount: 25 })]);
  assert.equal(summary.total, 125);
  assert.equal(summary.collected, 125);
  assert.equal(summary.outstanding, 0);
  assert.equal(summary.payments.find(row => row.method === 'cash')?.amount, 55);
  assert.equal(summary.payments.find(row => row.method === 'card')?.amount, 70);
  assert.equal(invoicePaymentAmounts(split).length, 2);
});

test('uses saved custom method names and combines duplicate allocations of the same method', () => {
  const payments = invoicePaymentAmounts(sale({ payments: [
    { id: 1, method: 'wallet', catalogPaymentMethodId: 8, methodName: 'فودافون كاش', amount: 30 },
    { id: 2, method: 'wallet', catalogPaymentMethodId: 8, methodName: 'فودافون كاش', amount: 20 },
    { id: 3, method: 'wallet', catalogPaymentMethodId: 9, methodName: 'محفظة أخرى', amount: 50 },
  ] }));
  assert.equal(payments.length, 2);
  assert.equal(payments[0].label, 'فودافون كاش');
  assert.equal(payments[0].amount, 50);
});

test('combines the configured default method with historical invoices using its base method', () => {
  const summary = shiftPaymentSummary([sale(), sale({ payments: [
    { id: 1, method: 'cash', amount: 100, catalogPaymentMethodId: 1, methodCode: 'CASH', methodName: 'كاش' },
  ] })]);
  assert.equal(summary.payments.length, 1);
  assert.equal(summary.payments[0].amount, 200);
});

test('excludes cancelled, refunded and held invoices from totals but retains their original payment display', () => {
  const reversed = sale({ status: 'refunded', payments: [{ id: 1, method: 'card', amount: 100 }] });
  const summary = shiftPaymentSummary([sale(), reversed, sale({ status: 'cancelled' }), sale({ status: 'draft' })]);
  assert.equal(summary.total, 100);
  assert.equal(summary.collected, 100);
  assert.equal(invoicePaymentAmounts(reversed)[0].method, 'card');
});

test('does not count unpaid employee invoices or free drinks as cash and shows partial collection separately', () => {
  const unpaid = sale({ saleType: 'employee', billingCycle: 'monthly', collectedAmount: 0, payments: [] });
  const free = sale({ totalAmount: 0, collectedAmount: 0 });
  const partial = sale({ collectedAmount: 40, payments: [{ id: 1, method: 'cash', amount: 40 }] });
  assert.deepEqual(invoicePaymentAmounts(unpaid), []);
  assert.deepEqual(invoicePaymentAmounts(free), []);
  const summary = shiftPaymentSummary([unpaid, free, partial]);
  assert.equal(summary.total, 200);
  assert.equal(summary.collected, 40);
  assert.equal(summary.outstanding, 160);
});

test('supports historical single-method invoices without inventing the split for historical mixed invoices', () => {
  assert.equal(invoicePaymentAmounts(sale({ collectedAmount: undefined, paymentMethod: 'card' }))[0].amount, 100);
  assert.equal(invoicePaymentAmounts(sale({ collectedAmount: undefined, saleType: 'employee', billingCycle: 'monthly' })).length, 0);
  assert.equal(invoicePaymentAmounts(sale({ paymentMethod: 'mixed' }))[0].label, 'دفع مختلط (غير مفصل)');
});

test('sums currency in cents and reflects only the latest edited invoice amounts', () => {
  const summary = shiftPaymentSummary([sale({ totalAmount: 0.1, collectedAmount: 0.1 }), sale({ totalAmount: 0.2, collectedAmount: 0.2 })]);
  assert.equal(summary.collected, 0.3);
  assert.equal(summary.total, 0.3);
  assert.equal(summary.payments[0].amount, 0.3);
});

