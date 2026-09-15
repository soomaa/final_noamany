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
  assert.deepEqual(monthRange('2026-08-23'), { dateFrom: '2026-08-01', dateTo: '2026-08-31' });
});

test('moves between months without leaking the previous day number', () => {
  assert.equal(shiftPortalMonth('2026-03-31', -1), '2026-02-01');
  assert.equal(shiftPortalMonth('2026-01-15', 1), '2026-02-01');
});

test('uses Arabic operational labels and opens the trainer portal on clients', () => {
  assert.equal(trainerClassStatusLabel('completed'), 'مكتملة');
  assert.deepEqual(trainerPortalSections, ['clients', 'calendar', 'attendance', 'private', 'earnings']);
  assert.equal(resolveTrainerPortalSection('unknown'), 'clients');
});
