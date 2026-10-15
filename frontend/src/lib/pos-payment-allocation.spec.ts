import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fillPaymentRemainder,
  paymentRemainingCents,
  paymentTotalCents,
} from './pos-payment-allocation';

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
