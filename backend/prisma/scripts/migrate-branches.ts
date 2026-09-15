/* eslint-disable no-console */
/**
 * Branch-only migration from legacy store_branch_settings into tbl_branches.
 * Only operational rows where from_id > 0 are migrated. Legacy from_id = 0
 * rows are grouping records, so migrated target branches are roots (from_id=0).
 *
 * Required environment:
 *   DATABASE_URL       Target database URL.
 *   OLD_DATABASE_URL   Legacy database URL.
 *
 * Alternatively, LEGACY_DATABASE may contain only the old database name. In
 * that case the script reuses the target URL's host and credentials.
 *
 * Optional:
 *   LEGACY_BRANCH_SOURCE_KEY  Stable source identifier used by the mapping table.
 *
 * Usage:
 *   npx ts-node prisma/scripts/migrate-branches.ts
 *   npx ts-node prisma/scripts/migrate-branches.ts --dry-run
 */
import 'dotenv/config';
import { BrCode, Prisma, PrismaClient } from '@prisma/client';

interface LegacyBranch {
  branch_id: number;
  branch_name: string;
  br_code: BrCode | null;
  legacy_group_id: number;
}

interface MigrationStats {
  found: number;
  created: number;
  updated: number;
  linkedToExisting: number;
  alreadyMapped: number;
  mappingsCreated: number;
}

interface MigrationEvent {
  type: 'created' | 'linked' | 'skipped';
  legacyId: number;
  newId: number;
  name: string;
}

class DryRunRollback extends Error {
  constructor(
    readonly stats: MigrationStats,
    readonly events: MigrationEvent[],
  ) {
    super('Dry-run rollback requested');
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function databaseName(url: string): string {
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!name) throw new Error('Database URL does not contain a database name');
  return name;
}

function resolveLegacyUrl(targetUrl: string): string {
  const legacyDatabase = process.env.LEGACY_DATABASE?.trim();
  if (legacyDatabase) {
    if (!/^[A-Za-z0-9_$-]+$/.test(legacyDatabase)) {
      throw new Error('LEGACY_DATABASE contains unsupported characters');
    }
    const parsed = new URL(targetUrl);
    parsed.pathname = `/${legacyDatabase}`;
    return parsed.toString();
  }

  const explicit = process.env.OLD_DATABASE_URL?.trim();
  if (explicit) return explicit;
  throw new Error('Set LEGACY_DATABASE, or set OLD_DATABASE_URL to the old database URL');
}

function comparableDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${parsed.port || '3306'}/${databaseName(url)}`;
}

function sourceKey(url: string): string {
  const configured =
    process.env.LEGACY_SOURCE_KEY?.trim() || process.env.LEGACY_BRANCH_SOURCE_KEY?.trim();
  if (configured) {
    if (configured.length > 191) throw new Error('LEGACY_SOURCE_KEY must be at most 191 characters');
    return configured;
  }

  const parsed = new URL(url);
  const key = `${parsed.hostname.toLowerCase()}:${parsed.port || '3306'}/${databaseName(url)}`;
  if (key.length > 191) throw new Error('Derived legacy source key is longer than 191 characters');
  return key;
}

function cleanName(value: string | null): string {
  const name = value?.trim().replace(/\s+/g, ' ') ?? '';
  if (!name) throw new Error('Branch name is empty');
  if (name.length > 50) throw new Error(`Branch name exceeds 50 characters: "${name}"`);
  return name;
}

function normalizedName(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('ar-EG')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function validateLegacyRows(rows: LegacyBranch[]): void {
  const ids = new Set<number>();
  for (const row of rows) {
    if (!Number.isInteger(row.branch_id) || row.branch_id <= 0) {
      throw new Error(`Invalid legacy branch ID: ${row.branch_id}`);
    }
    if (ids.has(row.branch_id)) throw new Error(`Duplicate legacy branch ID: ${row.branch_id}`);
    ids.add(row.branch_id);
    cleanName(row.branch_name);
    if (!Number.isInteger(row.legacy_group_id) || row.legacy_group_id <= 0) {
      throw new Error(
        `Legacy branch ${row.branch_id} must have from_id > 0; received ${row.legacy_group_id}`,
      );
    }
  }
}

function logSummary(stats: MigrationStats, errors: number): void {
  console.log('\n=== Branch migration summary ===');
  console.log(`Branches found:             ${stats.found}`);
  console.log(`Branches migrated/created:  ${stats.created}`);
  console.log(`Branches updated:           ${stats.updated}`);
  console.log(`Duplicates linked safely:   ${stats.linkedToExisting}`);
  console.log(`Branches skipped (mapped):  ${stats.alreadyMapped}`);
  console.log(`Mapping rows created:       ${stats.mappingsCreated}`);
  console.log(`Errors:                     ${errors}`);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const targetUrl = requireEnv('DATABASE_URL');
  const legacyUrl = resolveLegacyUrl(targetUrl);

  if (comparableDatabaseUrl(targetUrl) === comparableDatabaseUrl(legacyUrl)) {
    throw new Error('Legacy and target database URLs point to the same database');
  }

  const key = sourceKey(legacyUrl);
  const target = new PrismaClient();
  const legacy = new PrismaClient({ datasources: { db: { url: legacyUrl } } });
  let found = 0;

  try {
    console.log(`=== Branch migration (${dryRun ? 'DRY RUN' : 'COMMIT'}) ===`);
    console.log(`Legacy source: ${key}`);

    const sourceRows = await legacy.store_branch_settings.findMany({
      where: { from_id: { gt: 0 } },
      select: { id: true, title: true, br_code: true, from_id: true },
      orderBy: { id: 'asc' },
    });
    const rows: LegacyBranch[] = sourceRows.map((row) => ({
      branch_id: row.id,
      branch_name: row.title,
      br_code: row.br_code,
      legacy_group_id: row.from_id,
    }));
    found = rows.length;
    console.log(`Branches found: ${found}`);
    validateLegacyRows(rows);

    const result = await target.$transaction(
      async (tx) => {
        const stats: MigrationStats = {
          found,
          created: 0,
          updated: 0,
          linkedToExisting: 0,
          alreadyMapped: 0,
          mappingsCreated: 0,
        };
        const events: MigrationEvent[] = [];
        const idMap = new Map<number, number>();
        const existingMappings = await tx.legacy_branch_mappings.findMany({
          where: { source_key: key },
          select: { legacy_id: true, new_branch_id: true },
        });

        for (const mapping of existingMappings) {
          idMap.set(mapping.legacy_id, mapping.new_branch_id);
        }

        const pending = new Map(rows.map((row) => [row.branch_id, row]));
        for (const row of rows) {
          const mappedId = idMap.get(row.branch_id);
          if (mappedId == null) continue;

          const targetBranch = await tx.tbl_branches.findUnique({
            where: { branch_id: mappedId },
            select: { branch_id: true, branch_name: true, br_code: true, from_id: true },
          });
          if (!targetBranch) {
            throw new Error(`Mapping for legacy branch ${row.branch_id} points to missing target branch ${mappedId}`);
          }
          const sourceName = cleanName(row.branch_name);
          if (normalizedName(targetBranch.branch_name ?? '') !== normalizedName(sourceName)) {
            throw new Error(
              `Mapped branch name mismatch for legacy ${row.branch_id}: source="${sourceName}", target="${targetBranch.branch_name ?? ''}"`,
            );
          }
          if (targetBranch.from_id !== 0) {
            throw new Error(
              `Mapped target branch ${mappedId} must be a root; actual parent=${targetBranch.from_id}`,
            );
          }
          if (targetBranch.br_code !== row.br_code) {
            await tx.tbl_branches.update({
              where: { branch_id: mappedId },
              data: { br_code: row.br_code },
            });
            stats.updated += 1;
          }

          stats.alreadyMapped += 1;
          pending.delete(row.branch_id);
          events.push({
            type: 'skipped',
            legacyId: row.branch_id,
            newId: mappedId,
            name: sourceName,
          });
        }

        for (const [legacyId, row] of pending) {
          const name = cleanName(row.branch_name);
          const keyName = normalizedName(name);
          const candidates = await tx.tbl_branches.findMany({
            where: { from_id: 0, branch_name: { not: null } },
            select: { branch_id: true, branch_name: true },
          });
          const duplicateCandidates = candidates.filter(
            (candidate) =>
              candidate.branch_name != null && normalizedName(candidate.branch_name) === keyName,
          );
          if (duplicateCandidates.length > 1) {
            throw new Error(`Ambiguous target duplicates for legacy branch ${legacyId} "${name}"`);
          }

          let newId: number;
          let eventType: MigrationEvent['type'];
          if (duplicateCandidates.length === 1) {
            newId = duplicateCandidates[0].branch_id;
            eventType = 'linked';
            stats.linkedToExisting += 1;
            const duplicate = await tx.tbl_branches.findUnique({
              where: { branch_id: newId },
              select: { br_code: true },
            });
            if (duplicate?.br_code != null && duplicate.br_code !== row.br_code) {
              throw new Error(
                `Branch code conflict for legacy ${legacyId}: source=${row.br_code ?? 'NULL'}, target=${duplicate.br_code}`,
              );
            }
            if (duplicate?.br_code !== row.br_code) {
              await tx.tbl_branches.update({
                where: { branch_id: newId },
                data: { br_code: row.br_code },
              });
              stats.updated += 1;
            }
          } else {
            const created = await tx.tbl_branches.create({
              data: { branch_name: name, br_code: row.br_code, from_id: 0 },
              select: { branch_id: true },
            });
            newId = created.branch_id;
            eventType = 'created';
            stats.created += 1;
          }

          await tx.legacy_branch_mappings.create({
            data: {
              source_key: key,
              legacy_id: legacyId,
              new_branch_id: newId,
              source_name: name,
            },
          });
          stats.mappingsCreated += 1;
          idMap.set(legacyId, newId);
          events.push({ type: eventType, legacyId, newId, name });
        }

        if (dryRun) throw new DryRunRollback(stats, events);
        return { stats, events };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 120_000,
      },
    );

    for (const event of result.events) {
      console.log(`[${event.type}] legacy=${event.legacyId} -> new=${event.newId} | ${event.name}`);
    }
    logSummary(result.stats, 0);
  } catch (error) {
    if (error instanceof DryRunRollback) {
      for (const event of error.events) {
        console.log(`[dry-run:${event.type}] legacy=${event.legacyId} -> new=${event.newId} | ${event.name}`);
      }
      logSummary(error.stats, 0);
      console.log('Dry run completed: transaction rolled back intentionally.');
      return;
    }

    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error('\nBranch migration failed. The target transaction was rolled back.');
    console.error(message);
    logSummary(
      { found, created: 0, updated: 0, linkedToExisting: 0, alreadyMapped: 0, mappingsCreated: 0 },
      1,
    );
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([legacy.$disconnect(), target.$disconnect()]);
  }
}

void main();
