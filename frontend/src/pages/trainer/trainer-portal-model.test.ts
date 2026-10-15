import assert from 'node:assert/strict';
import test from 'node:test';
import {
  monthRange,
  resolveTrainerPortalSection,
  shiftPortalMonth,
  trainerClassStatusLabel,
  trainerPortalSections,
} from './trainer-portal-model.ts';

test('builds an exact calendar-month range for trainer portal queries', () => {
  assert.deepEqual(monthRange('2026-08-23'), {
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
  });
});

test('moves between months without leaking the previous day number', () => {
  assert.equal(shiftPortalMonth('2026-03-31', -1), '2026-02-01');
  assert.equal(shiftPortalMonth('2026-01-15', 1), '2026-02-01');
});

test('uses clear Arabic operational labels for class states', () => {
  assert.equal(trainerClassStatusLabel('scheduled'), 'مجدولة');
  assert.equal(trainerClassStatusLabel('completed'), 'مكتملة');
  assert.equal(trainerClassStatusLabel('cancelled'), 'ملغاة');
});

test('keeps the four trainer work areas explicit and falls back to the calendar', () => {
  assert.deepEqual(trainerPortalSections, ['calendar', 'attendance', 'earnings', 'private']);
  assert.equal(resolveTrainerPortalSection('earnings'), 'earnings');
  assert.equal(resolveTrainerPortalSection('unknown'), 'calendar');
  assert.equal(resolveTrainerPortalSection(null), 'calendar');
});

test('active private clients prioritize remaining sessions then expiry', async () => {
  const model = await import('./trainer-portal-model.ts');
  const rows = [
    { id: 1, sessionsRemaining: 5, endDate: '2026-09-20' },
    { id: 2, sessionsRemaining: 1, endDate: '2026-09-25' },
    { id: 3, sessionsRemaining: null, endDate: '2026-09-10' },
  ];
  assert.deepEqual(model.sortPrivateClients(rows).map((row) => row.id), [2, 1, 3]);
  assert.equal(model.canPrivateCheckIn({ status: 'active', sessionsRemaining: 0 }), false);
  assert.equal(model.canPrivateCheckIn({ status: 'active', sessionsRemaining: 3 }), true);
});
