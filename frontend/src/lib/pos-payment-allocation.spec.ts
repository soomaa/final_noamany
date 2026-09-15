import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterConfiguredPaymentMethods,
  fillPaymentRemainder,
  paymentRemainingCents,
  paymentTotalCents,
} from './pos-payment-allocation.ts';

test('does not invent payment methods while the configured catalog is unavailable or empty', () => {
  assert.deepEqual(filterConfiguredPaymentMethods(undefined), []);
  assert.deepEqual(filterConfiguredPaymentMethods([]), []);
});

test('keeps enabled methods plus a disabled method referenced by the saved invoice', () => {
  const catalog = [
    { id: 1, isEnabled: true, name: 'Cash' },
    { id: 2, isEnabled: false, name: 'Old card' },
    { id: 3, isEnabled: false, name: 'Disabled wallet' },
  ];
  assert.deepEqual(
    filterConfiguredPaymentMethods(catalog, [{ catalogPaymentMethodId: 2 }]).map((method) => method.id),
    [1, 2],
  );
});

test('calculates payment totals in cents without floating-point drift', () => {
  assert.equal(paymentTotalCents([{ amount: '0.1' }, { amount: '0.2' }]), 30);
  assert.equal(paymentRemainingCents(0.3, [{ amount: '0.1' }, { amount: '0.2' }]), 0);
});

test('returns the exact outstanding amount for an incomplete split', () => {
  assert.equal(paymentRemainingCents(100, [{ amount: '50' }, { amount: '25.25' }]), 2475);
});

test('fills one payment row with the current remainder and preserves the other rows', () => {
  assert.deepEqual(
    fillPaymentRemainder(100, [
      { paymentMethodId: 1, amount: '35' },
      { paymentMethodId: 4, amount: '' },
    ], 1),
    [
      { paymentMethodId: 1, amount: '35' },
      { paymentMethodId: 4, amount: '65.00' },
    ],
  );
});

test('never fills a negative remainder when the other rows already exceed the total', () => {
  assert.equal(
    fillPaymentRemainder(50, [
      { paymentMethodId: 1, amount: '60' },
      { paymentMethodId: 4, amount: '' },
    ], 1)[1].amount,
    '0.00',
  );
});
