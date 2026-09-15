import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checksumMismatches,
  classifyChecksumDrift,
  conflictingExistingTables,
  missingLocalHistory,
  pendingMigrations,
} from './migration-preflight-model.mjs';

test('reports only applied migrations whose local directories are absent', () => {
  const applied = [
    '20260707145000_hr_employment_type',
    '20260709100000_hot_path_indexes',
    '20260826143000_club_membership_document',
  ];
  const local = new Set([
    '20260707145000_hr_employment_type',
    '20260709100000_hot_path_indexes',
  ]);

  assert.deepEqual(missingLocalHistory(applied, local), [
    '20260826143000_club_membership_document',
  ]);
});

test('accepts only an exact reviewed historical checksum pair and keeps new drift blocking', () => {
  const reviewed = { migration: 'seed', expected: 'database-copy', actual: 'reviewed-local-copy' };
  assert.deepEqual(
    classifyChecksumDrift(
      [reviewed, { migration: 'schema', expected: 'old', actual: 'changed' }],
      [reviewed],
    ),
    {
      acceptedHistoricalDrift: [reviewed],
      checksumMismatches: [{ migration: 'schema', expected: 'old', actual: 'changed' }],
    },
  );
});

test('pending migrations exclude successfully applied names', () => {
  assert.deepEqual(
    pendingMigrations(['m1', 'm2', 'm3'], new Set(['m1', 'm3'])),
    ['m2'],
  );
});

test('reports checksum drift for every applied migration that exists locally', () => {
  const applied = [
    { name: 'm1', checksum: 'db-m1' },
    { name: 'm2', checksum: 'same-m2' },
    { name: 'm3', checksum: 'db-m3' },
  ];
  const local = new Map([
    ['m1', 'local-m1'],
    ['m2', 'same-m2'],
  ]);

  assert.deepEqual(checksumMismatches(applied, local), [
    { migration: 'm1', expected: 'db-m1', actual: 'local-m1' },
  ]);
});

test('existing tables are conflicts only for pending non-idempotent creates', () => {
  assert.deepEqual(
    conflictingExistingTables(
      ['safe_table', 'unsafe_table', 'already_applied_table'],
      new Set(['safe_table']),
      new Set(['safe_table', 'unsafe_table']),
    ),
    ['unsafe_table'],
  );
});
