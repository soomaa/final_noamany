import assert from 'node:assert/strict';
import test from 'node:test';
import { selectReceptionSubscriptions } from './reception-subscription-visibility.ts';

const sub = (id: number, extra: Record<string, unknown> = {}) => ({ id, subscriptionTypeId: 7, subscriptionType: 'Zumba', status: 'expired', subscriptionStartDate: '2026-06-01', subscriptionEndDate: '2026-06-30', isLinkedToSessions: false, sessionsCount: null, sessionsUsed: 0, ...extra });

test('shows the active renewal instead of an expired period with the same package', () => {
  assert.deepEqual(selectReceptionSubscriptions([sub(11), sub(12, { status: 'active', subscriptionStartDate: '2026-08-01', subscriptionEndDate: '2026-08-31' })], '2026-08-15').map((item) => item.id), [12]);
});

test('does not keep an exhausted session package ahead of a valid renewal', () => {
  assert.deepEqual(selectReceptionSubscriptions([sub(40, { isLinkedToSessions: true, sessionsCount: 10, sessionsUsed: 10 }), sub(41, { status: 'active', isLinkedToSessions: true, sessionsCount: 10, sessionsUsed: 2, subscriptionStartDate: '2026-08-01', subscriptionEndDate: '2026-12-31' })], '2026-08-15').map((item) => item.id), [41]);
});
