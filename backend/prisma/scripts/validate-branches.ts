/* eslint-disable no-console */
/**
 * Read-only validation for the branch-only legacy migration.
 *
 * Usage:
 *   npx ts-node prisma/scripts/validate-branches.ts
 */
import 'dotenv/config';
import { BrCode, PrismaClient } from '@prisma/client';

interface LegacyBranch {
  branch_id: number;
  branch_name: string;
  br_code: BrCode | null;
  legacy_group_id: number;
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
  return value?.trim().replace(/\s+/g, ' ') ?? '';
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

async function main(): Promise<void> {
  const targetUrl = requireEnv('DATABASE_URL');
  const legacyUrl = resolveLegacyUrl(targetUrl);
  if (comparableDatabaseUrl(targetUrl) === comparableDatabaseUrl(legacyUrl)) {
    throw new Error('Legacy and target database URLs point to the same database');
  }

  const key = sourceKey(legacyUrl);
  const target = new PrismaClient();
  const legacy = new PrismaClient({ datasources: { db: { url: legacyUrl } } });

  try {
    console.log('=== Branch migration validation (read-only) ===');
    console.log(`Legacy source: ${key}`);

    const rawSourceRows = await legacy.store_branch_settings.findMany({
      where: { from_id: { gt: 0 } },
      select: { id: true, title: true, br_code: true, from_id: true },
      orderBy: { id: 'asc' },
    });
    const sourceRows: LegacyBranch[] = rawSourceRows.map((row) => ({
      branch_id: row.id,
      branch_name: row.title,
      br_code: row.br_code,
      legacy_group_id: row.from_id,
    }));
    const mappings = await target.legacy_branch_mappings.findMany({
      where: { source_key: key },
      include: { branch: true },
      orderBy: { legacy_id: 'asc' },
    });

    const sourceById = new Map(sourceRows.map((row) => [row.branch_id, row]));
    const mappingByLegacyId = new Map(mappings.map((mapping) => [mapping.legacy_id, mapping]));
    const errors: string[] = [];
    let valid = 0;

    for (const source of sourceRows) {
      const mapping = mappingByLegacyId.get(source.branch_id);
      if (!mapping) {
        errors.push(`Missing mapping for legacy branch ${source.branch_id} "${cleanName(source.branch_name)}"`);
        continue;
      }

      const sourceName = cleanName(source.branch_name);
      if (!sourceName) {
        errors.push(`Legacy branch ${source.branch_id} has an empty name`);
        continue;
      }
      if (!mapping.branch) {
        errors.push(`Mapping for legacy branch ${source.branch_id} points to a missing target branch`);
        continue;
      }
      if (normalizedName(mapping.branch.branch_name ?? '') !== normalizedName(sourceName)) {
        errors.push(
          `Name mismatch for legacy ${source.branch_id}: source="${sourceName}", target="${mapping.branch.branch_name ?? ''}"`,
        );
        continue;
      }

      if (mapping.branch.from_id !== 0) {
        errors.push(
          `Target branch for legacy ${source.branch_id} must be a root; actual parent=${mapping.branch.from_id}`,
        );
        continue;
      }
      if (mapping.branch.br_code !== source.br_code) {
        errors.push(
          `Branch code mismatch for legacy ${source.branch_id}: source=${source.br_code ?? 'NULL'}, target=${mapping.branch.br_code ?? 'NULL'}`,
        );
        continue;
      }

      valid += 1;
      console.log(
        `[valid] legacy=${source.branch_id} -> new=${mapping.new_branch_id} | ${sourceName}`,
      );
    }

    for (const mapping of mappings) {
      if (!sourceById.has(mapping.legacy_id)) {
        errors.push(`Stale mapping has no source row: legacy=${mapping.legacy_id}, new=${mapping.new_branch_id}`);
      }
    }

    const duplicateGroups = new Map<string, number[]>();
    for (const source of sourceRows) {
      const mapping = mappingByLegacyId.get(source.branch_id);
      if (!mapping) continue;
      const duplicateKey = normalizedName(cleanName(source.branch_name));
      const targets = duplicateGroups.get(duplicateKey) ?? [];
      targets.push(mapping.new_branch_id);
      duplicateGroups.set(duplicateKey, targets);
    }
    for (const [duplicateKey, targetIds] of duplicateGroups) {
      if (new Set(targetIds).size > 1) {
        errors.push(`Duplicate legacy branches were split across target branches (${duplicateKey}): ${targetIds.join(', ')}`);
      }
    }

    console.log('\n=== Branch validation summary ===');
    console.log(`Legacy branches found: ${sourceRows.length}`);
    console.log(`Mapping rows found:    ${mappings.length}`);
    console.log(`Valid branches:        ${valid}`);
    console.log(`Errors:                ${errors.length}`);

    if (errors.length > 0) {
      console.error('\nValidation errors:');
      for (const error of errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else {
      console.log('Branch migration validation passed.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error('Branch validation failed to run.');
    console.error(message);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled([legacy.$disconnect(), target.$disconnect()]);
  }
}

void main();
