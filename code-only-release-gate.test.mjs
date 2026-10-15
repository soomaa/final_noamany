import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('member activity migration uses SQL identifier quotes without shell escaping', () => {
  const sql = readFileSync(new URL('./backend/prisma/migrations/20261003120000_reactivate_members_with_live_entitlements/migration.sql', import.meta.url), 'utf8');
  assert.equal(sql.includes(String.fromCharCode(92, 96)), false);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `legacy_member_activity_backup_20261003`/);
  assert.match(sql, /INSERT IGNORE INTO `legacy_member_activity_backup_20261003`/);
  assert.match(sql, /UPDATE `club_members`/);
});

test('data-free release gate forbids secrets and runtime data', () => {
  const source = readFileSync(new URL('./code-only-release-gate.mjs', import.meta.url), 'utf8');
  for (const marker of ['.env', 'uploads', 'private-uploads', 'database', 'db-import.sql', '.sha256']) {
    assert.match(source, new RegExp(marker.replace('.', '\\.')));
  }
  assert.match(source, /20260830123000_subscription_renewal_chain/);
  assert.match(source, /public\/index\.html/);
});
