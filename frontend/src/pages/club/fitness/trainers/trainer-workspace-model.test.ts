import assert from 'node:assert/strict';
import test from 'node:test';
import { clampAchievement, profilePath, resolveTrainerTab, starRows } from './trainer-workspace-model.ts';

test('resolves valid profile tabs and falls back to the first permitted tab', () => {
  assert.equal(resolveTrainerTab('earnings', ['overview', 'earnings']), 'earnings');
  assert.equal(resolveTrainerTab('targets', ['overview', 'ratings']), 'overview');
  assert.equal(resolveTrainerTab(null, ['ratings']), 'ratings');
});

test('creates canonical trainer profile deep links', () => {
  assert.equal(profilePath(9), '/club/fitness/trainers/9');
  assert.equal(profilePath(9, 'ratings'), '/club/fitness/trainers/9?tab=ratings');
});

test('clamps progress only for its bar while preserving the actual percentage', () => {
  assert.deepEqual(clampAchievement(135.5), { actual: 135.5, bar: 100 });
  assert.deepEqual(clampAchievement(-2), { actual: 0, bar: 0 });
});

test('orders star distribution from five stars to one', () => {
  assert.deepEqual(starRows({ '1': 2, '2': 1, '3': 0, '4': 4, '5': 7 }), [
    { stars: 5, count: 7 },
    { stars: 4, count: 4 },
    { stars: 3, count: 0 },
    { stars: 2, count: 1 },
    { stars: 1, count: 2 },
  ]);
});
