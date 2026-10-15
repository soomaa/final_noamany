import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createExpiryDaysFilterState,
  reduceExpiryDaysFilter,
} from './subscription-expiry-filter';

test('editing expiry days keeps the applied query unchanged until apply', () => {
  const initial = createExpiryDaysFilterState(7);
  const edited = reduceExpiryDaysFilter(initial, { type: 'edit', value: '30' });

  assert.deepEqual(edited, { draft: '30', applied: 7 });

  const applied = reduceExpiryDaysFilter(edited, { type: 'apply' });

  assert.deepEqual(applied, { draft: '30', applied: 30 });
});

test('applying expiry days clamps invalid and out-of-range values', () => {
  const initial = createExpiryDaysFilterState(7);

  const empty = reduceExpiryDaysFilter(
    reduceExpiryDaysFilter(initial, { type: 'edit', value: '' }),
    { type: 'apply' },
  );
  assert.deepEqual(empty, { draft: '7', applied: 7 });

  const tooLarge = reduceExpiryDaysFilter(
    reduceExpiryDaysFilter(initial, { type: 'edit', value: '120' }),
    { type: 'apply' },
  );
  assert.deepEqual(tooLarge, { draft: '90', applied: 90 });

  const negative = reduceExpiryDaysFilter(
    reduceExpiryDaysFilter(initial, { type: 'edit', value: '-5' }),
    { type: 'apply' },
  );
  assert.deepEqual(negative, { draft: '0', applied: 0 });
});
