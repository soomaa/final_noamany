import assert from 'node:assert/strict';
import test from 'node:test';
import { commissionPreview } from './commission-preview.ts';

test('shows the percentage formula and its actual financial value', () => {
  assert.deepEqual(commissionPreview(12_500, 8), {
    baseAmount: 12_500,
    percent: 8,
    amount: 1_000,
    equation: '12,500.00 × 8% = 1,000.00',
  });
});

test('normalizes invalid and negative values without exposing NaN in reports', () => {
  assert.deepEqual(commissionPreview(Number.NaN, -5), {
    baseAmount: 0,
    percent: 0,
    amount: 0,
    equation: '0.00 × 0% = 0.00',
  });
});
