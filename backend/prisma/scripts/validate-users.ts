/* eslint-disable no-console */
/** Read-only validation for the user-only legacy migration. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  comparableDatabaseUrl,
  requireEnv,
  resolveLegacyUrl,
} from './employee-migration.shared';
import {
  buildUserTransformContext,
  normalizeUsername,
  readLegacyUsers,
  transformUser,
  userSourceKey,
  validateLegacyUsers,
} from './user-migration.shared';

async function main(): Promise<void> {
  const targetUrl = requireEnv('DATABASE_URL');
  const legacyUrl = resolveLegacyUrl(targetUrl);
  if (comparableDatabaseUrl(targetUrl) === comparableDatabaseUrl(legacyUrl)) {
    throw new Error('Legacy and target database URLs point to the same database');
  }
  const key = userSourceKey(legacyUrl);
  const target = new PrismaClient();
  const legacy = new PrismaClient({ datasources: { db: { url: legacyUrl } } });

  try {
    console.log('=== User migration validation (read-only) ===');
    console.log(`Legacy source: ${key}`);
    const sourceRows = await readLegacyUsers(legacy);
    validateLegacyUsers(sourceRows);
    const [mappings, context] = await Promise.all([
      target.legacy_user_mappings.findMany({
        where: { source_key: key },
        include: { user: true },
        orderBy: { legacy_id: 'asc' },
      }),
      buildUserTransformContext(target, key),
    ]);
    const mappingByLegacyId = new Map(mappings.map((item) => [item.legacy_id, item]));
    const sourceIds = new Set(sourceRows.map((item) => item.user_id));
    const errors: string[] = [];
    const warnings: string[] = [];
    let valid = 0;

    for (const source of sourceRows) {
      const mapping = mappingByLegacyId.get(source.user_id);
      if (!mapping) {
        errors.push(`Missing mapping for legacy user ${source.user_id} (${source.username ?? ''})`);
        continue;
      }
      if (!mapping.user) {
        errors.push(`Mapping for legacy user ${source.user_id} points to a missing target`);
        continue;
      }
      const transformed = transformUser(source, context);
      warnings.push(...transformed.warnings);
      const expected = transformed.data;
      const actual = mapping.user;
      const checks: Array<[string, unknown, unknown]> = [
        ['username', normalizeUsername(String(expected.username ?? '')), normalizeUsername(actual.username)],
        ['emp_code', expected.emp_code, actual.emp_code],
        ['branch_id_fk', expected.branch_id_fk, actual.branch_id_fk],
        ['level', expected.level, actual.level],
        ['role_id_fk', expected.role_id_fk, actual.role_id_fk],
        ['approved', expected.approved, actual.approved],
      ];
      const mismatches = checks.filter(([, expectedValue, actualValue]) => expectedValue !== actualValue);
      if (mismatches.length > 0) {
        errors.push(
          `Mismatch legacy=${source.user_id}, target=${actual.user_id}: ${mismatches
            .map(([field, expectedValue, actualValue]) => `${field} expected=${String(expectedValue)} actual=${String(actualValue)}`)
            .join('; ')}`,
        );
        continue;
      }
      if (!actual.password) {
        errors.push(`Target user ${actual.user_id} has no usable password hash`);
        continue;
      }
      valid += 1;
      console.log(`[valid] legacy=${source.user_id} -> new=${actual.user_id} | ${actual.username}`);
    }

    for (const mapping of mappings) {
      if (!sourceIds.has(mapping.legacy_id)) {
        errors.push(`Stale mapping: legacy=${mapping.legacy_id}, target=${mapping.new_user_id}`);
      }
    }
    const targetIds = mappings.map((item) => item.new_user_id);
    if (new Set(targetIds).size !== targetIds.length) {
      errors.push('More than one legacy user maps to the same target user');
    }

    console.log('\n=== User validation summary ===');
    console.log(`Legacy users found: ${sourceRows.length}`);
    console.log(`Mapping rows found: ${mappings.length}`);
    console.log(`Valid users:        ${valid}`);
    console.log(`Warnings:           ${warnings.length}`);
    console.log(`Errors:             ${errors.length}`);
    for (const warning of warnings) console.warn(`[warning] ${warning}`);
    if (errors.length > 0) {
      console.error('\nValidation errors:');
      for (const error of errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else {
      console.log('User migration validation passed.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error('User validation failed to run.');
    console.error(message);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([legacy.$disconnect(), target.$disconnect()]);
  }
}

void main();
