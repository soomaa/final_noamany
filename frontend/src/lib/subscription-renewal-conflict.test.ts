import assert from 'node:assert/strict';
import test from 'node:test';
import { readRenewalConflict } from './subscription-renewal.ts';

test('extracts a renewable subscription from the structured conflict', () => {
  assert.deepEqual(readRenewalConflict({ response: { data: { code: 'SUBSCRIPTION_RENEWAL_REQUIRED', existingSubscriptionId: 41, canRenew: true } } }), { subscriptionId: 41 });
});

test('ignores unrelated and malformed errors', () => {
  assert.equal(readRenewalConflict({ response: { data: { code: 'OTHER' } } }), null);
  assert.equal(readRenewalConflict(null), null);
});
