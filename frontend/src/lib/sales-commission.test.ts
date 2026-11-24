import assert from 'node:assert/strict';
import test from 'node:test';
import { findCommissionTierGaps, selectCommissionTier } from './sales-commission.ts';

/** The brackets a manager actually typed: three exact points, not three bands. */
const GAPPY = [
  { minAchievementPct: 80, maxAchievementPct: 80, commissionPercent: 2, label: 'Low target' },
  { minAchievementPct: 100, maxAchievementPct: 100, commissionPercent: 10, label: 'Target' },
  { minAchievementPct: 120, maxAchievementPct: null, commissionPercent: 15, label: 'Over Target' },
];

test('the preview picks the same bracket the server pays by', () => {
  const at = (pct: number) => selectCommissionTier(GAPPY, pct)?.commissionPercent ?? 0;
  assert.equal(at(0), 0);
  assert.equal(at(50), 0);
  assert.equal(at(80), 2);
  assert.equal(at(90), 2);
  assert.equal(at(100), 10);
  assert.equal(at(110), 10);
  assert.equal(at(120), 15);
  assert.equal(at(150), 15);
});

test('the uncovered achievement ranges are named', () => {
  assert.deepEqual(findCommissionTierGaps(GAPPY), ['٠٪ — 80٪', '80٪ — 100٪', '100٪ — 120٪']);
});

test('contiguous brackets report no gaps', () => {
  const tiers = [
    { minAchievementPct: 0, maxAchievementPct: 79.99, commissionPercent: 5, label: null },
    { minAchievementPct: 80, maxAchievementPct: 100, commissionPercent: 10, label: null },
    { minAchievementPct: 100.01, maxAchievementPct: null, commissionPercent: 15, label: null },
  ];
  assert.deepEqual(findCommissionTierGaps(tiers), []);
  assert.equal(selectCommissionTier(tiers, 50)?.commissionPercent, 5);
  assert.equal(selectCommissionTier(tiers, 140)?.commissionPercent, 15);
});

test('an empty table has nothing to warn about', () => {
  assert.deepEqual(findCommissionTierGaps([]), []);
  assert.equal(selectCommissionTier([], 90), null);
});
