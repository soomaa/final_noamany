import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const expected = new Map([
  [
    '20260709100000_hot_path_indexes',
    '11b302b5de444f7f5a865edc8155fe614b9d34e02b16bfb405b4e67de907b0d4',
  ],
  [
    '20260809213000_fix_monthly_twelve_session_validity',
    '771a429b863cc297ce2406769363f90414d601e0e4e57a343cd70c89dc048004',
  ],
  [
    '20260810120000_reception_gender_filter_indexes',
    'c077c4c9755b1c3e4e734cee3985b2abc19d5c03b62738e6ad4a6dbaf8fed2ff',
  ],
]);

test('canonical migration artifacts retain their verified database-applied content', async () => {
  for (const [name, digest] of expected) {
    const sql = await readFile(
      new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url),
    );
    assert.equal(createHash('sha256').update(sql).digest('hex'), digest);
  }
});

test('migration identifiers fit the MySQL 64-character limit', async () => {
  const migrationsDirectory = new URL('../prisma/migrations/', import.meta.url);
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const violations = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const migrationUrl = new URL(`${entry.name}/migration.sql`, migrationsDirectory);
    const sql = await readFile(migrationUrl, 'utf8');
    for (const match of sql.matchAll(/`([^`]+)`/g)) {
      if (match[1].length > 64) {
        violations.push(`${entry.name}: ${match[1]} (${match[1].length})`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
