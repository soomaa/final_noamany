/* eslint-disable no-console */
/**
 * Copies legacy tables that still exist in the app schema when the target table
 * is empty and all required target columns can be populated from the source.
 * Tables with current app rows, incompatible required columns, or a dedicated
 * canonical migration are left untouched and remain losslessly available in
 * the immutable archive database.
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

type TableRow = { table_name: string };
type ColumnRow = { column_name: string };
type CountRow = { n: bigint | number };
type IdRow = { id: number };

const prisma = new PrismaClient();
const dedicated = new Set([
  'employees',
  'users',
  'tbl_branches',
  'tbl_employees',
]);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
function dbName(url: string): string {
  const value = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));
  if (!value) throw new Error('DATABASE_URL has no database name');
  return value;
}
function safeName(value: string): string {
  if (!/^[A-Za-z0-9_$-]+$/.test(value)) throw new Error(`Unsafe identifier: ${value}`);
  return value;
}
function q(value: string): string {
  return `\`${value.replace(/`/g, '``')}\``;
}
function lit(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}
async function rows<T>(sql: string): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql);
}
async function count(database: string, table: string): Promise<number> {
  const result = await rows<CountRow>(`SELECT COUNT(*) n FROM ${q(database)}.${q(table)}`);
  return Number(result[0]?.n ?? 0);
}
async function record(
  runId: number,
  sourceTable: string,
  targetTable: string,
  sourceRows: number,
  mappedRows: number,
  note: string,
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    INSERT INTO legacy_table_reconciliations
      (run_id,source_table,target_table,source_rows,mapped_rows,archived_rows,error_rows,notes,checked_at)
    VALUES (${runId},${lit(sourceTable)},${lit(targetTable)},${sourceRows},${mappedRows},${sourceRows},0,${lit(note)},CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE source_rows=VALUES(source_rows),mapped_rows=VALUES(mapped_rows),
      archived_rows=VALUES(archived_rows),error_rows=0,notes=VALUES(notes),checked_at=CURRENT_TIMESTAMP(3)
  `);
}

async function main(): Promise<void> {
  const targetDatabase = safeName(dbName(required('DATABASE_URL')));
  const sourceDatabase = safeName(required('LEGACY_DATABASE'));
  const sourceKey = required('LEGACY_SOURCE_KEY');
  const dumpSha = required('LEGACY_DUMP_SHA256').toLowerCase();
  if (sourceDatabase === targetDatabase) throw new Error('Legacy and target databases must differ');
  const runRows = await rows<IdRow>(`SELECT id FROM legacy_import_runs WHERE source_key=${lit(sourceKey)} AND dump_sha256=${lit(dumpSha)}`);
  if (runRows.length !== 1) throw new Error('Legacy import run was not initialized');
  const runId = runRows[0].id;

  const sourceTables = await rows<TableRow>(`
    SELECT table_name AS table_name FROM information_schema.tables
    WHERE table_schema=${lit(sourceDatabase)} AND table_type='BASE TABLE' ORDER BY table_name
  `);
  let copiedTables = 0;
  let copiedRows = 0;
  let archivedOnlyTables = 0;

  for (const { table_name: table } of sourceTables) {
    const sourceCount = await count(sourceDatabase, table);
    const targetExists = await rows<CountRow>(`
      SELECT COUNT(*) n FROM information_schema.tables
      WHERE table_schema=${lit(targetDatabase)} AND table_name=${lit(table)} AND table_type='BASE TABLE'
    `);
    if (Number(targetExists[0]?.n ?? 0) === 0) {
      await record(runId, table, '', sourceCount, 0, 'Archive-only: the rebuilt app has no table with this name.');
      archivedOnlyTables += 1;
      continue;
    }
    if (dedicated.has(table)) {
      await record(runId, table, table, sourceCount, 0, 'Handled by a dedicated canonical migration; raw table retained in archive.');
      archivedOnlyTables += 1;
      continue;
    }
    const targetCount = await count(targetDatabase, table);
    if (targetCount > 0) {
      if (targetCount === sourceCount) {
        await record(runId, table, table, sourceCount, targetCount, 'Compatible table already contains the reconciled row count; left unchanged on rerun.');
        copiedTables += 1;
        copiedRows += targetCount;
      } else {
        await record(runId, table, table, sourceCount, 0, `Archive-only merge: target already contains ${targetCount} current app rows.`);
        archivedOnlyTables += 1;
      }
      continue;
    }
    const requiredMissing = await rows<CountRow>(`
      SELECT COUNT(*) n FROM information_schema.columns t
      LEFT JOIN information_schema.columns s ON s.table_schema=${lit(sourceDatabase)}
       AND s.table_name=t.table_name AND s.column_name=t.column_name
      WHERE t.table_schema=${lit(targetDatabase)} AND t.table_name=${lit(table)}
       AND s.column_name IS NULL AND t.is_nullable='NO' AND t.column_default IS NULL
       AND t.extra NOT LIKE '%auto_increment%' AND t.extra NOT LIKE '%generated%'
    `);
    if (Number(requiredMissing[0]?.n ?? 0) > 0) {
      await record(runId, table, table, sourceCount, 0, 'Archive-only: target has required columns absent from the source schema.');
      archivedOnlyTables += 1;
      continue;
    }

    const common = await rows<ColumnRow>(`
      SELECT t.column_name AS column_name FROM information_schema.columns t
      JOIN information_schema.columns s ON s.table_schema=${lit(sourceDatabase)}
       AND s.table_name=t.table_name AND s.column_name=t.column_name
      WHERE t.table_schema=${lit(targetDatabase)} AND t.table_name=${lit(table)}
      ORDER BY t.ordinal_position
    `);
    if (sourceCount === 0 || common.length === 0) {
      await record(runId, table, table, sourceCount, 0, sourceCount === 0 ? 'Empty legacy table.' : 'Archive-only: no compatible columns.');
      archivedOnlyTables += 1;
      continue;
    }
    const columns = common.map((item) => q(item.column_name)).join(',');
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.$executeRawUnsafe("SET collation_connection='utf8mb4_unicode_ci'");
      await tx.$executeRawUnsafe(`INSERT IGNORE INTO ${q(targetDatabase)}.${q(table)} (${columns}) SELECT ${columns} FROM ${q(sourceDatabase)}.${q(table)}`);
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    }, { maxWait: 30_000, timeout: 1_800_000 });
    const after = await count(targetDatabase, table);
    if (after !== sourceCount) {
      await record(runId, table, table, sourceCount, after, `Partially materialized ${after}/${sourceCount}; every source row remains exact in the archive. Target constraints rejected ${sourceCount - after} duplicate/incompatible row(s).`);
      copiedTables += 1;
      copiedRows += after;
      console.warn(`[partial] ${table}: canonical=${after}, archived=${sourceCount}`);
      continue;
    }
    await record(runId, table, table, sourceCount, sourceCount, 'Copied to the empty compatible app table; raw archive retained.');
    copiedTables += 1;
    copiedRows += sourceCount;
    console.log(`[copied] ${table}: ${sourceCount}`);
  }

  console.log('\n=== Shared-table migration summary ===');
  console.log(`Copied compatible tables: ${copiedTables}`);
  console.log(`Copied rows:              ${copiedRows}`);
  console.log(`Archive-only tables:      ${archivedOnlyTables}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
