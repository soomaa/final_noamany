import assert from 'node:assert/strict';
import test from 'node:test';
import { liveRenewalPromotions, sameRenewalSelection } from './renewal-promotions.ts';

test('renewal lists the active 3-month, 6-month and annual promotional packages', () => {
  const offers = [90, 180, 365].map((days) => ({ days, isActive: true, promoEnabled: true, promoPrice: days * 10, promoEndsAt: '2026-11-01T00:00:00Z' }));
  assert.deepEqual(liveRenewalPromotions(offers, false, Date.parse('2026-10-03T12:00:00Z')), offers);
});

test('changed promotional price or duration requires reviewing the quote again', () => {
  const quote = { subscriptionTypeId: 10, specialClassTypeId: null, privatePackageId: null,
    sessionsCount: null, startDate: '2026-09-03', endDate: '2026-12-02',
    grossValue: 700, discountValue: 0, netValue: 700 };
  assert.equal(sameRenewalSelection(quote, { ...quote }), true);
  assert.equal(sameRenewalSelection(quote, { ...quote, grossValue: 750, netValue: 750 }), false);
  assert.equal(sameRenewalSelection(quote, { ...quote, endDate: '2027-03-02' }), false);
  assert.equal(sameRenewalSelection(quote, { ...quote, subscriptionTypeId: 11 }), false);
});

test('expired, disabled, inactive, invalid-price and incompatible offers are excluded', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  const valid = { isActive: true, promoEnabled: true, promoPrice: 500 };
  const offers = [
    valid,
    { ...valid, promoEndsAt: '2026-10-03T12:00:00Z' },
    { ...valid, promoEndsAt: 'invalid' },
    { ...valid, promoEnabled: false },
    { ...valid, isActive: false },
    { ...valid, promoPrice: 0 },
    { ...valid, promoPrice: NaN },
    { ...valid, isLinkedToSessions: true },
  ];
  assert.deepEqual(liveRenewalPromotions(offers, false, now), [valid]);
  assert.deepEqual(liveRenewalPromotions(offers, true, now), [{ ...valid, isLinkedToSessions: true }]);
});
