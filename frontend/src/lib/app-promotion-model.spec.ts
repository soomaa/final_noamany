import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPromoUpdate, toPromoSummary } from './app-promotion-model';

test('summarizes a live package promotion using the stored price', () => {
  assert.deepEqual(
    toPromoSummary(
      {
        price: 1000,
        promoPrice: 750,
        promoEnabled: true,
        promoEndsAt: '2026-09-12T00:00:00Z',
      },
      Date.parse('2026-09-10T00:00:00Z'),
    ),
    { isLive: true, daysRemaining: 2, discountPercent: 25 },
  );
});

test('builds the package promo API payload and rejects invalid durations', () => {
  assert.deepEqual(
    buildPromoUpdate({ price: '750', discountPercent: '25', durationDays: '5', image: '/x.png' }, 1000),
    { enabled: true, price: 750, discountPercent: 25, durationDays: 5, image: '/x.png' },
  );
  assert.throws(
    () => buildPromoUpdate({ price: '750', discountPercent: '25', durationDays: '0', image: null }, 1000),
    /duration/i,
  );
});
