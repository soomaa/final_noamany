#!/usr/bin/env node
/** Read-only preflight for the known pending forward migrations. Never invokes Prisma migrate. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksumMismatches, classifyChecksumDrift, conflictingExistingTables, missingLocalHistory, pendingMigrations } from './migration-preflight-model.mjs';

const databaseUrl = process.env.DATABASE_URL;
const parsedUrl = databaseUrl ? new URL(databaseUrl) : null;
if (parsedUrl && parsedUrl.protocol !== 'mysql:') throw new Error('DATABASE_URL must use mysql://');
const db = process.env.NOAMANY_DB_NAME || (parsedUrl ? decodeURIComponent(parsedUrl.pathname.slice(1)) : 'noamany_final_new');
if (!/^[A-Za-z0-9_$-]+$/.test(db)) throw new Error('Invalid database name');
const mysqlArgs = ['-N', '-B'];
if (parsedUrl) {
  mysqlArgs.push('--host', parsedUrl.hostname, '--port', parsedUrl.port || '3306', '--user', decodeURIComponent(parsedUrl.username));
}
mysqlArgs.push('--database', db);
const mysqlEnv = parsedUrl?.password
  ? { ...process.env, MYSQL_PWD: decodeURIComponent(parsedUrl.password) }
  : process.env;
const sql = (query) => execFileSync('mysql', [...mysqlArgs, '-e', query], { encoding: 'utf8', env: mysqlEnv }).trim();
const rows = (query) => sql(query).split('\n').filter(Boolean).map((line) => line.split('\t'));
const migrationsDir = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
const localMigrations = new Set(readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name));
const candidates = [...localMigrations];
const appliedMigrationRows = rows("SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL").map(([name, checksum]) => ({ name, checksum }));
const unresolvedMigrationAttempts = rows("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL").map(([name]) => name);
const appliedMigrations = new Set(appliedMigrationRows.map(({ name }) => name));
const pending = pendingMigrations(candidates, appliedMigrations);
const [legacyCount = '0'] = rows("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='club_leads' AND column_name='name'")[0] ?? [];
const [targetCount = '0'] = rows("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='club_leads' AND column_name='full_name'")[0] ?? [];
const existingTables = rows("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('club_lead_follow_ups','inv_product_packages','cafe_waste_reasons','cafe_waste_records','club_subscription_type_branch_prices','club_trainer_receipt_commissions','club_trainer_refund_settlements','fin_payroll_employee_locks','hr_evaluation_templates','hr_monthly_evaluations','club_customer_service_questions','club_customer_service_interactions','club_customer_service_answers','club_locker_inventory_sessions','club_locker_inventory_lines','club_trainer_target_periods','online_payment_methods','online_subscription_requests','club_member_documents')").map(([name]) => name);
const tableMigration = new Map([
  ['club_lead_follow_ups', '20260909090000_sales_portal_crm'],
  ['inv_product_packages', '20260909160000_noamany_cafe_wave1'],
  ['cafe_waste_reasons', '20260909160000_noamany_cafe_wave1'],
  ['cafe_waste_records', '20260909160000_noamany_cafe_wave1'],
  ['club_subscription_type_branch_prices', '20260909180000_fitness_trainer_subscription_integrity'],
  ['club_trainer_receipt_commissions', '20260909180000_fitness_trainer_subscription_integrity'],
  ['club_trainer_refund_settlements', '20260909180000_fitness_trainer_subscription_integrity'],
  ['fin_payroll_employee_locks', '20260909180000_fitness_trainer_subscription_integrity'],
  ['hr_evaluation_templates', '20260909203000_evaluations_customer_service_locker_inventory'],
  ['hr_monthly_evaluations', '20260909203000_evaluations_customer_service_locker_inventory'],
  ['club_customer_service_questions', '20260909203000_evaluations_customer_service_locker_inventory'],
  ['club_customer_service_interactions', '20260909203000_evaluations_customer_service_locker_inventory'],
  ['club_customer_service_answers', '20260909203000_evaluations_customer_service_locker_inventory'],
  ['club_locker_inventory_sessions', '20260909203000_evaluations_customer_service_locker_inventory'],
  ['club_locker_inventory_lines', '20260909203000_evaluations_customer_service_locker_inventory'],
  ['club_trainer_target_periods', '20260909223000_trainer_monthly_target_periods'],
  ['online_payment_methods', '20260909230000_online_memberships'],
  ['online_subscription_requests', '20260909230000_online_memberships'],
  ['club_member_documents', '20260910001000_member_documents'],
]);
const pendingSet = new Set(pending);
const pendingTableNames = new Set([...tableMigration].filter(([, migration]) => pendingSet.has(migration)).map(([table]) => table));
const idempotentTableNames = new Set([
  'club_lead_follow_ups',
  'inv_product_packages',
  'cafe_waste_reasons',
  'cafe_waste_records',
  'hr_evaluation_templates',
  'hr_monthly_evaluations',
  'club_customer_service_questions',
  'club_customer_service_interactions',
  'club_customer_service_answers',
  'club_locker_inventory_sessions',
  'club_locker_inventory_lines',
]);
const conflictingTables = conflictingExistingTables(existingTables, idempotentTableNames, pendingTableNames);
const history = [...appliedMigrations];
const localChecksums = new Map([...localMigrations].map((name) => [name, createHash('sha256').update(readFileSync(path.join(migrationsDir, name, 'migration.sql'))).digest('hex')]));
// This exact seed-only drift predates the current release. It is retained visibly
// without rewriting production migration history. Any different checksum pair,
// including another edit to this migration, remains a hard failure.
const acceptedHistoricalChecksumDrift = [{
  migration: '20260706000000_reference_data_seed',
  expected: '68905bdbe880384e6ff844b483994572db088d1e932537dd1a5fbe5ad7132dec',
  actual: '808bbe4a194940433a5a999188c5ca931690e59483ad840cf0f1da5db403471e',
}];
const checksumDrift = classifyChecksumDrift(
  checksumMismatches(appliedMigrationRows, localChecksums),
  acceptedHistoricalChecksumDrift,
);
const result = { database: db, pending, unresolvedMigrationAttempts, clubLeads: { legacyNameColumn: Number(legacyCount) === 1, targetFullNameColumn: Number(targetCount) === 1, strategy: Number(legacyCount) === 1 && Number(targetCount) === 0 ? 'rename-name-forward-only' : 'fresh-or-already-adapted' }, conflictingPendingCreateTables: conflictingTables, missingLocalHistory: missingLocalHistory(history, localMigrations), ...checksumDrift };
console.log(JSON.stringify(result, null, 2));
if (unresolvedMigrationAttempts.length || conflictingTables.length || result.missingLocalHistory.length || result.checksumMismatches.length) process.exitCode = 2;
