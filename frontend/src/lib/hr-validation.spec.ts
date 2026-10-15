import assert from 'node:assert/strict';
import test from 'node:test';
import { isNonNegativeMoney, isScoreOutOf100 } from './hr-validation';

test('interview score accepts 0..100 with at most two decimals', () => {
  for (const value of ['0', '85', '85.5', '100', '100.00']) assert.equal(isScoreOutOf100(value), true);
  for (const value of ['', '-1', '100.01', '1e2', '85abc']) assert.equal(isScoreOutOf100(value), false);
});

test('money accepts plain non-negative decimals only', () => {
  for (const value of ['0', '15000', '15000.25']) assert.equal(isNonNegativeMoney(value), true);
  for (const value of ['', '-1', '1e5', '12abc', '1.234']) assert.equal(isNonNegativeMoney(value), false);
});
