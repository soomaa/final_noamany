import { classifyFollowUps, FollowUpSubscription, matchesExpiryRange } from './renewal-follow-up.utils';
const base: FollowUpSubscription = { id: 1, memberId: 1, branchId: 1, packageKey: 'type:1', startDate: '2026-08-01', endDate: '2026-08-31', status: 'expired', sessionsCount: null, sessionsUsed: 0, isLinkedToSessions: false, successorId: null, transferred: false, lastAttendance: '2026-08-20', lastSessionDate: null, lastFreezeEnd: null };
const run = (rows: FollowUpSubscription[], mode: 'not_renewed' | 'absent' = 'not_renewed') => classifyFollowUps(rows, '2026-09-12', mode, 14);
it('reports the latest expired period with days since inclusive end date', () => {
  expect(run([base])[0]).toMatchObject({ id: 1, daysSince: 12, reason: 'expired' });
  expect(run([{ ...base, endDate: '2026-09-12' }])).toEqual([]);
});
it('suppresses older periods and prepaid renewals but preserves another package', () => {
  expect(run([base, { ...base, id: 2, startDate: '2026-10-01', endDate: '2026-10-31', status: 'upcoming' }, { ...base, id: 3, packageKey: 'type:2' }]).map(r => r.id)).toEqual([3]);
});
it('does not flag a frozen, extended or transferred entitlement', () => {
  for (const patch of [{ status: 'frozen' }, { endDate: '2026-10-01' }, { transferred: true }, { successorId: 4 }]) expect(run([{ ...base, ...patch }])).toEqual([]);
});
it('deduplicates expired history deterministically', () => {
  expect(run([base, { ...base, id: 2, endDate: '2026-09-01' }]).map(r => r.id)).toEqual([2]);
});
it('recognizes quota exhaustion without inventing an exhaustion date', () => {
  const quota = { ...base, endDate: '2099-12-31', isLinkedToSessions: true, sessionsCount: 8, sessionsUsed: 8 };
  expect(run([quota])[0]).toMatchObject({ reason: 'exhausted', daysSince: null });
  expect(run([{ ...quota, lastSessionDate: '2026-09-10' }])[0].daysSince).toBe(2);
});
it('separates absence from expiry and never treats missing history as absence', () => {
  const active = { ...base, startDate: '2026-08-01', endDate: '2026-09-30', status: 'active' };
  expect(run([active], 'absent')[0].daysSince).toBe(23);
  expect(run([{ ...active, lastAttendance: null }], 'absent')).toEqual([]);
  expect(run([base], 'absent')).toEqual([]);
  expect(run([{ ...active, lastAttendance: '2026-09-01' }], 'absent')).toEqual([]);
});
it('starts absence counting after subscription start or latest freeze end', () => {
  expect(run([{ ...base, startDate: '2026-09-05', endDate: '2026-10-05' }], 'absent')).toEqual([]);
  expect(run([{ ...base, endDate: '2026-10-05', lastFreezeEnd: '2026-09-05' }], 'absent')).toEqual([]);
});
it('does not resurrect an unlinked older period after a newer purchase was transferred', () => {
  expect(run([base, { ...base, id: 2, startDate: '2026-09-01', endDate: '2026-09-05', transferred: true }])).toEqual([]);
  expect(run([base, { ...base, id: 2, startDate: '2026-09-01', endDate: '2026-09-05', transferred: true }, { ...base, id: 3, startDate: '2026-09-06', endDate: '2026-09-10' }]).map(r => r.id)).toEqual([3]);
});
it('prefers the latest purchased period over an older exhausted open-ended package', () => {
  const old = { ...base, startDate: '2026-01-01', endDate: '2099-12-31', isLinkedToSessions: true, sessionsCount: 8, sessionsUsed: 8 };
  expect(run([old, { ...base, id: 2 }]).map(r => r.id)).toEqual([2]);
});
it('orders latest recorded attendance first, missing attendance last with stable ties', () => {
  const rows = [
    { ...base, id: 1, memberId: 1, lastAttendance: null },
    { ...base, id: 2, memberId: 2, lastAttendance: '2026-08-28', endDate: '2026-08-29' },
    { ...base, id: 3, memberId: 3, lastAttendance: '2026-07-01' },
    { ...base, id: 4, memberId: 4, lastAttendance: '2026-08-28' },
  ];
  expect(run(rows).map(r => r.id)).toEqual([4, 2, 3, 1]);
});

it('filters expiry between inclusive dates and supports either open boundary', () => {
  expect(matchesExpiryRange('2026-08-01', '2026-08-01', '2026-08-31')).toBe(true);
  expect(matchesExpiryRange('2026-08-31', '2026-08-01', '2026-08-31')).toBe(true);
  expect(matchesExpiryRange('2026-07-31', '2026-08-01', '2026-08-31')).toBe(false);
  expect(matchesExpiryRange('2026-09-01', '2026-08-01', '2026-08-31')).toBe(false);
  expect(matchesExpiryRange('2026-08-15', '2026-08-01')).toBe(true);
  expect(matchesExpiryRange('2026-08-15', undefined, '2026-08-31')).toBe(true);
  expect(matchesExpiryRange(null, '2026-08-01')).toBe(false);
  expect(matchesExpiryRange(null)).toBe(true);
});
