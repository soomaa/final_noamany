/* eslint-disable no-console */
/**
 * Read-only validation for the employee-only legacy migration.
 *
 * Usage:
 *   npm run db:validate:employees
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  buildTransformContext,
  comparableDatabaseUrl,
  employeeSourceKey,
  normalizeText,
  readLegacyEmployees,
  requireEnv,
  resolveLegacyUrl,
  transformEmployee,
  validateLegacyEmployees,
} from './employee-migration.shared';

async function main(): Promise<void> {
  const targetUrl = requireEnv('DATABASE_URL');
  const legacyUrl = resolveLegacyUrl(targetUrl);
  if (comparableDatabaseUrl(targetUrl) === comparableDatabaseUrl(legacyUrl)) {
    throw new Error('Legacy and target database URLs point to the same database');
  }

  const key = employeeSourceKey(legacyUrl);
  const target = new PrismaClient();
  const legacy = new PrismaClient({ datasources: { db: { url: legacyUrl } } });

  try {
    console.log('=== Employee migration validation (read-only) ===');
    console.log(`Legacy source: ${key}`);
    const sourceRows = await readLegacyEmployees(legacy);
    validateLegacyEmployees(sourceRows);
    const [mappings, context] = await Promise.all([
      target.legacy_employee_mappings.findMany({
        where: { source_key: key },
        include: { employee: true },
        orderBy: { legacy_id: 'asc' },
      }),
      buildTransformContext(target, key),
    ]);
    const mappingByLegacyId = new Map(mappings.map((item) => [item.legacy_id, item]));
    const sourceIds = new Set(sourceRows.map((item) => item.id));
    const errors: string[] = [];
    const warnings: string[] = [];
    let valid = 0;

    for (const source of sourceRows) {
      const mapping = mappingByLegacyId.get(source.id);
      if (!mapping) {
        errors.push(`Missing mapping for legacy employee ${source.id} (code=${source.emp_code})`);
        continue;
      }
      if (!mapping.employee) {
        errors.push(`Mapping for legacy employee ${source.id} points to a missing target`);
        continue;
      }
      const transformed = transformEmployee(source, context);
      warnings.push(...transformed.warnings);
      const targetEmployee = mapping.employee;
      const expected = transformed.data;
      const checks: Array<[string, unknown, unknown]> = [
        ['emp_code', expected.emp_code, targetEmployee.emp_code],
        ['employee', normalizeText(String(expected.employee ?? '')), normalizeText(targetEmployee.employee ?? '')],
        ['branch_id_fk', expected.branch_id_fk, targetEmployee.branch_id_fk],
        ['emp_type', expected.emp_type, targetEmployee.emp_type],
        ['gender', expected.gender, targetEmployee.gender],
        ['phone', expected.phone, targetEmployee.phone],
        ['demo_card', expected.demo_card, targetEmployee.demo_card],
        ['employee_type', expected.employee_type, targetEmployee.employee_type],
        ['mosma_wazefy_n', expected.mosma_wazefy_n, targetEmployee.mosma_wazefy_n],
      ];
      const mismatches = checks.filter(([, expectedValue, actualValue]) => expectedValue !== actualValue);
      if (mismatches.length > 0) {
        errors.push(
          `Mismatch legacy=${source.id}, target=${targetEmployee.id}: ${mismatches
            .map(([field, expectedValue, actualValue]) => `${field} expected=${String(expectedValue)} actual=${String(actualValue)}`)
            .join('; ')}`,
        );
        continue;
      }
      valid += 1;
      console.log(
        `[valid] legacy=${source.id} -> new=${targetEmployee.id} | code=${source.emp_code} | ${targetEmployee.employee}`,
      );
    }

    for (const mapping of mappings) {
      if (!sourceIds.has(mapping.legacy_id)) {
        errors.push(`Stale mapping: legacy=${mapping.legacy_id}, target=${mapping.new_employee_id}`);
      }
    }

    const mappedTargets = mappings.map((item) => item.new_employee_id);
    if (new Set(mappedTargets).size !== mappedTargets.length) {
      errors.push('More than one legacy employee maps to the same target employee');
    }

    console.log('\n=== Employee validation summary ===');
    console.log(`Legacy employees found: ${sourceRows.length}`);
    console.log(`Mapping rows found:     ${mappings.length}`);
    console.log(`Valid employees:        ${valid}`);
    console.log(`Warnings:               ${warnings.length}`);
    console.log(`Errors:                 ${errors.length}`);
    for (const warning of warnings) console.warn(`[warning] ${warning}`);
    if (errors.length > 0) {
      console.error('\nValidation errors:');
      for (const error of errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else {
      console.log('Employee migration validation passed.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error('Employee validation failed to run.');
    console.error(message);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([legacy.$disconnect(), target.$disconnect()]);
  }
}

void main();
