import assert from 'node:assert/strict';
import test from 'node:test';
import { shiftSubscriptionDate } from './subscription-dates.ts';

test('moving the end date derives the start date for the same 30-day package', () => {
  assert.equal(shiftSubscriptionDate('2026-11-02', -30), '2026-10-03');
  assert.equal(shiftSubscriptionDate('2026-11-12', -30), '2026-10-13');
  assert.equal(shiftSubscriptionDate('2026-10-13', 30), '2026-11-12');
});

test('calendar duration survives month, year, leap-day and Cairo DST boundaries', () => {
  for (const [start, end, days] of [
    ['2026-12-20', '2027-01-19', 30],
    ['2024-02-15', '2024-03-16', 30],
    ['2026-04-10', '2026-05-10', 30],
    ['2026-10-03', '2026-11-02', 30],
    ['2026-10-03', '2026-10-03', 0],
  ] as const) {
    assert.equal(shiftSubscriptionDate(start, days), end);
    assert.equal(shiftSubscriptionDate(end, -days), start);
  }
});

test('empty or partial input does not produce malformed dates', () => {
  for (const value of ['', '2026-', '2026-02-30', 'invalid']) {
    assert.equal(shiftSubscriptionDate(value, -30), '');
  }
  assert.equal(shiftSubscriptionDate('2026-11-02', NaN), '');
});
