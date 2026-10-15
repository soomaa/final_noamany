import assert from 'node:assert/strict';
import test from 'node:test';
import { selectReceptionSubscriptions } from './reception-subscription-visibility.ts';

type SubscriptionFixture = {
  id: number;
  subscriptionTypeId: number | null;
  subscriptionType: string;
  status: 'active' | 'expired' | 'upcoming' | 'frozen';
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  isLinkedToSessions: boolean;
  sessionsCount: number | null;
  sessionsUsed: number;
};

const sub = (overrides: Partial<SubscriptionFixture> & Pick<SubscriptionFixture, 'id'>): SubscriptionFixture => ({
  subscriptionTypeId: 7,
  subscriptionType: 'Zumba',
  status: 'expired',
  subscriptionStartDate: '2026-06-01',
  subscriptionEndDate: '2026-06-30',
  isLinkedToSessions: false,
  sessionsCount: null,
  sessionsUsed: 0,
  ...overrides,
  id: overrides.id,
});

test('shows only the renewed current package instead of its expired history', () => {
  const result = selectReceptionSubscriptions([
    sub({ id: 11 }),
    sub({
      id: 12,
      status: 'active',
      subscriptionStartDate: '2026-08-01',
      subscriptionEndDate: '2026-08-31',
    }),
  ], '2026-08-15');

  assert.deepEqual(result.map((item) => item.id), [12]);
});

test('keeps one latest expired record when a package has no current subscription', () => {
  const result = selectReceptionSubscriptions([
    sub({ id: 20, subscriptionEndDate: '2026-05-31' }),
    sub({ id: 21, subscriptionEndDate: '2026-06-30' }),
  ], '2026-08-15');

  assert.deepEqual(result.map((item) => item.id), [21]);
});

test('keeps different package types independently', () => {
  const result = selectReceptionSubscriptions([
    sub({ id: 30, subscriptionTypeId: 7, subscriptionType: 'Zumba' }),
    sub({ id: 31, subscriptionTypeId: 8, subscriptionType: 'Yoga' }),
  ], '2026-08-15');

  assert.deepEqual(result.map((item) => item.id), [31, 30]);
});

test('treats exhausted session packages as expired when choosing the visible record', () => {
  const result = selectReceptionSubscriptions([
    sub({ id: 40, isLinkedToSessions: true, sessionsCount: 10, sessionsUsed: 10 }),
    sub({
      id: 41,
      status: 'active',
      isLinkedToSessions: true,
      sessionsCount: 10,
      sessionsUsed: 2,
      subscriptionStartDate: '2026-08-01',
      subscriptionEndDate: '2026-12-31',
    }),
  ], '2026-08-15');

  assert.deepEqual(result.map((item) => item.id), [41]);
});
