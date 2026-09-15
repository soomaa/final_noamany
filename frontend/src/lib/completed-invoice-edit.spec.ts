import assert from 'node:assert/strict';
import test from 'node:test';
import { completedInvoicePaymentChanges, completedInvoiceTaxRate, reservedProductQuantity } from './completed-invoice-edit.ts';

test('unchanged invoice collects nothing and an increase collects only the difference', () => {
  const before = [{ method: 'cash', amount: 150 }];
  assert.equal(completedInvoicePaymentChanges(before, before)[0].difference, 0);
  assert.equal(completedInvoicePaymentChanges(before, [{ method: 'cash', amount: 180 }])[0].difference, 30);
  assert.equal(completedInvoicePaymentChanges(before, [{ method: 'cash', amount: 120 }])[0].difference, -30);
});
test('switching payment method refunds the old method and collects the new method', () => {
  const changes = completedInvoicePaymentChanges([{ method: 'cash', amount: 150 }], [{ method: 'card', amount: 150 }]);
  assert.deepEqual(changes.map(row => [row.method, row.difference]), [['cash', -150], ['card', 150]]);
});
test('split adjustments sum in cents without floating point drift', () => {
  const changes = completedInvoicePaymentChanges([{ method: 'cash', amount: 0.1 }, { method: 'cash', amount: 0.2 }, { method: 'card', amount: 40 }], [{ method: 'cash', amount: 0.3 }, { method: 'card', amount: 45 }]);
  assert.deepEqual(changes.map(row => row.difference), [0, 5]);
});
test('original tax is retained, including a zero tax invoice', () => {
  assert.equal(completedInvoiceTaxRate({ subtotal: 100, discountAmount: 20, taxAmount: 12 }), 15);
  assert.equal(completedInvoiceTaxRate({ taxPercentage: 0, subtotal: 100, discountAmount: 0, taxAmount: 0 }), 0);
});
test('stock credit includes all original sizes of the same product only', () => {
  assert.equal(reservedProductQuantity([{ cafeProductId: 1, quantity: 2 }, { cafeProductId: 1, quantity: 3 }, { cafeProductId: 2, quantity: 7 }], 1), 5);
});
