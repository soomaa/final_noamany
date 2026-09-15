import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampAchievement,
  monthBounds,
  profilePath,
  resolveTargetPeriod,
  resolveTrainerTab,
  starRows,
} from './trainer-workspace-model.ts';

test('resolves profile tabs only within the permitted trainer workspace', () => {
  assert.equal(resolveTrainerTab('earnings', ['overview', 'earnings']), 'earnings');
  assert.equal(resolveTrainerTab('target', ['overview', 'targets']), 'targets');
  assert.equal(resolveTrainerTab('targets', ['overview', 'ratings']), 'overview');
});

test('uses canonical profile links and never overfills a target progress bar', () => {
  assert.equal(profilePath(9, 'ratings'), '/club/fitness/trainers/9?tab=ratings');
  assert.deepEqual(clampAchievement(135.5), { actual: 135.5, bar: 100 });
});

test('orders trainer ratings from five stars down to one', () => {
  assert.deepEqual(starRows({ '1': 2, '2': 1, '3': 0, '4': 4, '5': 7 }), [
    { stars: 5, count: 7 }, { stars: 4, count: 4 }, { stars: 3, count: 0 },
    { stars: 2, count: 1 }, { stars: 1, count: 2 },
  ]);
});

test('selects an explicit trainer target month and derives its exact calendar bounds', () => {
  const periods = [
    { periodMonth: '2026-09', targetValue: 10 },
    { periodMonth: '2026-10', targetValue: 25 },
  ];
  assert.deepEqual(resolveTargetPeriod(periods, '2026-10'), periods[1]);
  assert.equal(resolveTargetPeriod(periods, '2026-11'), null);
  assert.deepEqual(monthBounds('2028-02'), { start: '2028-02-01', end: '2028-02-29' });
});
