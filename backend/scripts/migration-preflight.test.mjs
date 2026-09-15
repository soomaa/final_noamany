import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260909090000_sales_portal_crm/migration.sql'), 'utf8');
const preflight = fs.readFileSync(path.join(root, 'scripts/migration-preflight.mjs'), 'utf8');

// Offline/read-only guard: do not connect, migrate, reset, or mutate a DB.
assert.match(migration, /CREATE TABLE IF NOT EXISTS `club_leads`/);
assert.match(migration, /CHANGE COLUMN `name` `full_name`/);
assert.match(migration, /PREPARE club_leads_rename_statement/);
assert.doesNotMatch(migration, /^\s*(DELIMITER|CREATE PROCEDURE)/im);
assert.doesNotMatch(migration, /ADD COLUMN IF NOT EXISTS/);
assert.doesNotMatch(migration, /CREATE INDEX IF NOT EXISTS/);
for (const column of ['source', 'assigned_to_id', 'last_contacted_at', 'next_follow_up_at', 'next_call_at', 'created_by']) {
  assert.match(migration, new RegExp(`information_schema\\.columns[\\s\\S]*?column_name = '${column}'`), column);
}
for (const index of ['club_leads_assigned_to_id_branch_id_idx', 'club_leads_status_idx']) {
  assert.match(migration, new RegExp(`information_schema\\.statistics[\\s\\S]*?index_name = '${index}'`), index);
}
assert.match(migration, /SET `assigned_to_id` = `assigned_to`/);
assert.match(migration, /@club_leads_legacy_assigned/);
assert.match(migration, /PREPARE club_leads_copy_assigned_statement/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS `club_lead_follow_ups`/);
assert.doesNotMatch(migration, /DROP TABLE\s+`?club_leads`?/i);
assert.doesNotMatch(migration, /TRUNCATE\s+TABLE\s+`?club_leads`?/i);

assert.match(preflight, /const history = \[\.\.\.appliedMigrations\]/);
assert.match(preflight, /checksumMismatches\(appliedMigrationRows, localChecksums\)/);
assert.match(preflight, /process\.env\.DATABASE_URL/);
assert.match(preflight, /MYSQL_PWD/);
assert.doesNotMatch(preflight, /--password/);
assert.match(preflight, /--database/);
assert.match(preflight, /unresolvedMigrationAttempts/);
assert.match(preflight, /finished_at IS NULL AND rolled_back_at IS NULL/);
assert.match(preflight, /const candidates = \[\.\.\.localMigrations\]/);
assert.doesNotMatch(preflight, /migration_name IN \('20260707145000_hr_employment_type'/);
