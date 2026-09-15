/* eslint-disable no-console */
/**
 * Employee-only migration from legacy tbl_employees into canonical employees.
 *
 * Usage:
 *   npm run db:migrate:employees
 *   npm run db:migrate:employees -- --dry-run
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

interface Stats {
  found: number;
  created: number;
  linkedToExisting: number;
  skippedMapped: number;
  mappingsCreated: number;
  warnings: number;
}

interface Event {
  type: 'created' | 'linked' | 'skipped';
  legacyId: number;
  newId: number;
  empCode: number;
  name: string;
}

class DryRunRollback extends Error {
  constructor(
    readonly stats: Stats,
    readonly events: Event[],
    readonly warnings: string[],
  ) {
    super('Dry-run rollback requested');
  }
}

function printSummary(stats: Stats, errors: number): void {
  console.log('\n=== Employee migration summary ===');
  console.log(`Employees found:            ${stats.found}`);
  console.log(`Employees migrated/created: ${stats.created}`);
  console.log(`Duplicates linked safely:   ${stats.linkedToExisting}`);
  console.log(`Employees skipped (mapped): ${stats.skippedMapped}`);
  console.log(`Mapping rows created:       ${stats.mappingsCreated}`);
  console.log(`Warnings:                   ${stats.warnings}`);
  console.log(`Errors:                     ${errors}`);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const targetUrl = requireEnv('DATABASE_URL');
  const legacyUrl = resolveLegacyUrl(targetUrl);
  if (comparableDatabaseUrl(targetUrl) === comparableDatabaseUrl(legacyUrl)) {
    throw new Error('Legacy and target database URLs point to the same database');
  }

  const key = employeeSourceKey(legacyUrl);
  const target = new PrismaClient();
  const legacy = new PrismaClient({ datasources: { db: { url: legacyUrl } } });
  let found = 0;

  try {
    console.log(`=== Employee migration (${dryRun ? 'DRY RUN' : 'COMMIT'}) ===`);
    console.log(`Legacy source: ${key}`);
    const rows = await readLegacyEmployees(legacy);
    found = rows.length;
    console.log(`Employees found: ${found}`);
    validateLegacyEmployees(rows);

    const result = await target.$transaction(
      async (tx) => {
        const stats: Stats = {
          found,
          created: 0,
          linkedToExisting: 0,
          skippedMapped: 0,
          mappingsCreated: 0,
          warnings: 0,
        };
        const events: Event[] = [];
        const warnings: string[] = [];
        const context = await buildTransformContext(tx, key);
        const existingMappings = await tx.legacy_employee_mappings.findMany({
          where: { source_key: key },
          select: { legacy_id: true, new_employee_id: true },
        });
        const mappingByLegacyId = new Map(
          existingMappings.map((item) => [item.legacy_id, item.new_employee_id]),
        );

        for (const row of rows) {
          const name = String(row.employee).trim().replace(/\s+/g, ' ');
          const mappedTargetId = mappingByLegacyId.get(row.id);
          if (mappedTargetId != null) {
            const mapped = await tx.employees.findUnique({
              where: { id: mappedTargetId },
              select: { id: true, emp_code: true, employee: true },
            });
            if (!mapped) {
              throw new Error(
                `Mapping for legacy employee ${row.id} points to missing target employee ${mappedTargetId}`,
              );
            }
            if (mapped.emp_code !== row.emp_code || normalizeText(mapped.employee ?? '') !== normalizeText(name)) {
              throw new Error(
                `Mapped employee mismatch for legacy=${row.id}, target=${mappedTargetId}`,
              );
            }
            stats.skippedMapped += 1;
            events.push({
              type: 'skipped',
              legacyId: row.id,
              newId: mapped.id,
              empCode: row.emp_code,
              name,
            });
            continue;
          }

          const transformed = transformEmployee(row, context);
          warnings.push(...transformed.warnings);
          const duplicateCandidates = await tx.employees.findMany({
            where: { emp_code: row.emp_code },
            select: { id: true, employee: true },
          });
          if (duplicateCandidates.length > 1) {
            throw new Error(`Multiple target employees already use emp_code=${row.emp_code}`);
          }

          let targetId: number;
          let eventType: Event['type'];
          if (duplicateCandidates.length === 1) {
            const duplicate = duplicateCandidates[0];
            if (normalizeText(duplicate.employee ?? '') !== normalizeText(name)) {
              throw new Error(
                `emp_code=${row.emp_code} belongs to target "${duplicate.employee ?? ''}" but source is "${name}"`,
              );
            }
            targetId = duplicate.id;
            eventType = 'linked';
            stats.linkedToExisting += 1;
          } else {
            const created = await tx.employees.create({
              data: transformed.data,
              select: { id: true },
            });
            targetId = created.id;
            eventType = 'created';
            stats.created += 1;
          }

          await tx.legacy_employee_mappings.create({
            data: {
              source_key: key,
              legacy_id: row.id,
              new_employee_id: targetId,
              source_name: name.slice(0, 200),
              source_emp_code: row.emp_code,
            },
          });
          stats.mappingsCreated += 1;
          events.push({
            type: eventType,
            legacyId: row.id,
            newId: targetId,
            empCode: row.emp_code,
            name,
          });
        }

        stats.warnings = warnings.length;
        if (dryRun) throw new DryRunRollback(stats, events, warnings);
        return { stats, events, warnings };
      },
      { maxWait: 10_000, timeout: 120_000 },
    );

    for (const event of result.events) {
      console.log(
        `[${event.type}] legacy=${event.legacyId} -> new=${event.newId} | code=${event.empCode} | ${event.name}`,
      );
    }
    for (const warning of result.warnings) console.warn(`[warning] ${warning}`);
    printSummary(result.stats, 0);
  } catch (error) {
    if (error instanceof DryRunRollback) {
      for (const event of error.events) {
        console.log(
          `[would-${event.type}] legacy=${event.legacyId} -> new=${event.newId} | code=${event.empCode} | ${event.name}`,
        );
      }
      for (const warning of error.warnings) console.warn(`[warning] ${warning}`);
      printSummary(error.stats, 0);
      console.log('Dry run complete: transaction rolled back.');
      return;
    }
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error('Employee migration failed; transaction was rolled back.');
    console.error(message);
    printSummary(
      {
        found,
        created: 0,
        linkedToExisting: 0,
        skippedMapped: 0,
        mappingsCreated: 0,
        warnings: 0,
      },
      1,
    );
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([legacy.$disconnect(), target.$disconnect()]);
  }
}

void main();
