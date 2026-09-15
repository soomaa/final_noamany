/* eslint-disable no-console */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  SEED_DEMO_RANGES,
  SEED_DEMO_USER_MAX,
  SEED_DEMO_USER_MIN,
  SeedDemoRange,
} from './seed-demo-manifest';

type Db = PrismaClient | Prisma.TransactionClient;
type CountRow = { n: bigint | number };
type NamedCountRow = { item: string; n: bigint | number };
type TableRow = { tbl: string };
type ColumnRow = { tbl: string; col: string };
type ForeignKeyRow = {
  constraint_name: string;
  child_table: string;
  child_column: string;
  parent_table: string;
  parent_column: string;
  position: bigint | number;
};

type ProtectionContext = {
  targetDatabase: string;
  legacyDatabase: string;
  legacyTableCount: number;
  targetTables: Set<string>;
  legacyColumns: Set<string>;
  hasLegacyRecordMappings: boolean;
  hasLegacyUserMappings: boolean;
  hasLegacyEmployeeMappings: boolean;
  hasLegacyBranchMappings: boolean;
};

type RangeInspection = {
  table: string;
  primaryKey: string;
  min: number;
  max: number;
  present: number;
  sqlProtected: number;
  delete: number;
};

type LinkedInspection = {
  table: string;
  present: number;
  delete: number;
};

const CONFIRM_FLAG = '--confirm-seed-demo-cleanup';
const REQUIRED_ACK = 'DELETE_SEED_DEMO_KEEP_SQL_AND_JOB_TITLES';

function q(value: string): string {
  return `\`${value.replace(/`/g, '``')}\``;
}

function lit(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function safeDatabaseName(value: string, variable: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_$-]+$/.test(trimmed)) {
    throw new Error(`${variable} contains an unsafe database name`);
  }
  return trimmed;
}

function databaseNameFromUrl(value: string): string {
  const name = decodeURIComponent(new URL(value).pathname.replace(/^\/+/, ''));
  if (!name) throw new Error('DATABASE_URL has no database name');
  return safeDatabaseName(name, 'DATABASE_URL');
}

async function rows<T>(db: Db, sql: string): Promise<T[]> {
  return db.$queryRawUnsafe<T[]>(sql);
}

async function scalar(db: Db, sql: string): Promise<number> {
  const result = await rows<CountRow>(db, sql);
  return Number(result[0]?.n ?? 0);
}

async function buildProtectionContext(db: Db): Promise<ProtectionContext> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const targetDatabase = databaseNameFromUrl(databaseUrl);
  const legacyValue = process.env.LEGACY_DATABASE?.trim();
  if (!legacyValue) {
    throw new Error(
      'LEGACY_DATABASE is required: cleanup refuses to run without the immutable SQL archive',
    );
  }
  const legacyDatabase = safeDatabaseName(legacyValue, 'LEGACY_DATABASE');
  if (legacyDatabase === targetDatabase) {
    throw new Error('LEGACY_DATABASE must be different from the live target database');
  }

  const targetTableRows = await rows<TableRow>(db, `
    SELECT TABLE_NAME AS tbl
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=${lit(targetDatabase)} AND TABLE_TYPE='BASE TABLE'
  `);
  const targetTables = new Set(targetTableRows.map((item) => item.tbl));

  const legacyTableCount = await scalar(db, `
    SELECT COUNT(*) n
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA=${lit(legacyDatabase)} AND TABLE_TYPE='BASE TABLE'
  `);
  if (legacyTableCount === 0) {
    throw new Error(
      'The configured LEGACY_DATABASE archive is missing or empty; no data was changed',
    );
  }

  const legacyColumnRows = await rows<ColumnRow>(db, `
    SELECT TABLE_NAME AS tbl, COLUMN_NAME AS col
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=${lit(legacyDatabase)}
  `);
  const legacyColumns = new Set(
    legacyColumnRows.map((item) => `${item.tbl}\u0000${item.col}`),
  );

  return {
    targetDatabase,
    legacyDatabase,
    legacyTableCount,
    targetTables,
    legacyColumns,
    hasLegacyRecordMappings: targetTables.has('legacy_record_mappings'),
    hasLegacyUserMappings: targetTables.has('legacy_user_mappings'),
    hasLegacyEmployeeMappings: targetTables.has('legacy_employee_mappings'),
    hasLegacyBranchMappings: targetTables.has('legacy_branch_mappings'),
  };
}

function archiveHasColumn(ctx: ProtectionContext, table: string, column: string): boolean {
  return ctx.legacyColumns.has(`${table}\u0000${column}`);
}

/** SQL expression that is true only for a target row with no legacy-SQL identity. */
function notSqlProtected(
  ctx: ProtectionContext,
  table: string,
  primaryKey: string,
  alias = 't',
): string {
  const key = `${alias}.${q(primaryKey)}`;
  const checks: string[] = [];

  if (archiveHasColumn(ctx, table, primaryKey)) {
    checks.push(`NOT EXISTS (
      SELECT 1 FROM ${q(ctx.legacyDatabase)}.${q(table)} legacy_same
      WHERE legacy_same.${q(primaryKey)}=${key}
    )`);
  }
  if (ctx.hasLegacyRecordMappings) {
    checks.push(`NOT EXISTS (
      SELECT 1 FROM legacy_record_mappings legacy_map
      WHERE legacy_map.target_table=${lit(table)} AND legacy_map.target_id=${key}
    )`);
  }
  if (table === 'users' && ctx.hasLegacyUserMappings) {
    checks.push(`NOT EXISTS (
      SELECT 1 FROM legacy_user_mappings legacy_user
      WHERE legacy_user.new_user_id=${key}
    )`);
  }
  if (table === 'employees' && ctx.hasLegacyEmployeeMappings) {
    checks.push(`NOT EXISTS (
      SELECT 1 FROM legacy_employee_mappings legacy_employee
      WHERE legacy_employee.new_employee_id=${key}
    )`);
  }
  if (table === 'tbl_branches' && ctx.hasLegacyBranchMappings) {
    checks.push(`NOT EXISTS (
      SELECT 1 FROM legacy_branch_mappings legacy_branch
      WHERE legacy_branch.new_branch_id=${key}
    )`);
  }

  return checks.length > 0 ? checks.join(' AND ') : 'TRUE';
}

function rangeWhere(ctx: ProtectionContext, range: SeedDemoRange, alias = 't'): string {
  const [table, primaryKey, min, max] = range;
  return `${alias}.${q(primaryKey)} BETWEEN ${min} AND ${max}
    AND ${notSqlProtected(ctx, table, primaryKey, alias)}`;
}

function demoUserWhere(ctx: ProtectionContext, alias = 'u'): string {
  return `${alias}.${q('user_id')} BETWEEN ${SEED_DEMO_USER_MIN} AND ${SEED_DEMO_USER_MAX}
    AND ${notSqlProtected(ctx, 'users', 'user_id', alias)}`;
}

async function inspectRange(
  db: Db,
  ctx: ProtectionContext,
  range: SeedDemoRange,
): Promise<RangeInspection> {
  const [table, primaryKey, min, max] = range;
  if (!ctx.targetTables.has(table)) {
    return { table, primaryKey, min, max, present: 0, sqlProtected: 0, delete: 0 };
  }
  const result = await rows<{ present: bigint | number; targets: bigint | number }>(db, `
    SELECT
      COUNT(*) present,
      COALESCE(SUM(CASE WHEN ${rangeWhere(ctx, range)} THEN 1 ELSE 0 END),0) targets
    FROM ${q(table)} t
    WHERE t.${q(primaryKey)} BETWEEN ${min} AND ${max}
  `);
  const present = Number(result[0]?.present ?? 0);
  const targets = Number(result[0]?.targets ?? 0);
  return {
    table,
    primaryKey,
    min,
    max,
    present,
    sqlProtected: present - targets,
    delete: targets,
  };
}

async function inspectUserLinkedTable(
  db: Db,
  ctx: ProtectionContext,
  table: string,
): Promise<LinkedInspection> {
  if (!ctx.targetTables.has(table) || !ctx.targetTables.has('users')) {
    return { table, present: 0, delete: 0 };
  }
  const result = await rows<{ present: bigint | number; targets: bigint | number }>(db, `
    SELECT COUNT(*) present,
      COALESCE(SUM(CASE WHEN ${demoUserWhere(ctx, 'u')} THEN 1 ELSE 0 END),0) targets
    FROM ${q(table)} linked
    LEFT JOIN users u ON u.user_id=linked.user_id
  `);
  return {
    table,
    present: Number(result[0]?.present ?? 0),
    delete: Number(result[0]?.targets ?? 0),
  };
}

async function jobTitleRows(db: Db): Promise<Array<Record<string, unknown>>> {
  const result = await rows<Array<Record<string, unknown>>[number]>(
    db,
    'SELECT * FROM department_jobs ORDER BY id',
  );
  return result.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'bigint'
          ? value.toString()
          : value instanceof Date
            ? value.toISOString()
            : value,
      ]),
    ),
  );
}

async function tableCounts(db: Db, tables: string[]): Promise<Map<string, number>> {
  if (tables.length === 0) return new Map();
  const result = await rows<NamedCountRow>(
    db,
    tables
      .map((table) => `SELECT ${lit(table)} item, COUNT(*) n FROM ${q(table)}`)
      .join(' UNION ALL '),
  );
  return new Map(result.map((item) => [item.item, Number(item.n)]));
}

async function foreignKeys(db: Db, targetDatabase: string): Promise<ForeignKeyRow[]> {
  return rows<ForeignKeyRow>(db, `
    SELECT
      CONSTRAINT_NAME constraint_name,
      TABLE_NAME child_table,
      COLUMN_NAME child_column,
      REFERENCED_TABLE_NAME parent_table,
      REFERENCED_COLUMN_NAME parent_column,
      ORDINAL_POSITION position
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA=${lit(targetDatabase)} AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
  `);
}

async function orphanCounts(
  db: Db,
  constraints: ForeignKeyRow[],
): Promise<Map<string, number>> {
  const grouped = new Map<string, ForeignKeyRow[]>();
  for (const row of constraints) {
    const key = `${row.child_table}\u0000${row.constraint_name}`;
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }
  if (grouped.size === 0) return new Map();

  const sql = [...grouped.entries()].map(([key, group]) => {
    const first = group[0];
    const join = group
      .map((part) => `parent.${q(part.parent_column)}=child.${q(part.child_column)}`)
      .join(' AND ');
    const childHasKey = group
      .map((part) => `child.${q(part.child_column)} IS NOT NULL`)
      .join(' AND ');
    return `SELECT ${lit(key)} item, COUNT(*) n
      FROM ${q(first.child_table)} child
      LEFT JOIN ${q(first.parent_table)} parent ON ${join}
      WHERE ${childHasKey} AND parent.${q(first.parent_column)} IS NULL`;
  }).join(' UNION ALL ');

  const result = await rows<NamedCountRow>(db, sql);
  return new Map(result.map((item) => [item.item, Number(item.n)]));
}

async function inspectSeedDemoData(db: Db, ctx: ProtectionContext) {
  const ranges: RangeInspection[] = [];
  for (const range of SEED_DEMO_RANGES) {
    ranges.push(await inspectRange(db, ctx, range));
  }
  const userLinked: LinkedInspection[] = [];
  for (const table of ['permissions', 'rbac_user_exceptions', 'rbac_user_roles']) {
    userLinked.push(await inspectUserLinkedTable(db, ctx, table));
  }

  const deleteFromRanges = ranges.reduce((sum, item) => sum + item.delete, 0);
  const deleteFromUserLinks = userLinked.reduce((sum, item) => sum + item.delete, 0);
  const sqlProtected = ranges.reduce((sum, item) => sum + item.sqlProtected, 0);
  const usersRange = ranges.find((item) => item.table === 'users');
  const totalUsers = ctx.targetTables.has('users')
    ? await scalar(db, 'SELECT COUNT(*) n FROM users')
    : 0;
  const jobTitles = ctx.targetTables.has('department_jobs')
    ? await scalar(db, 'SELECT COUNT(*) n FROM department_jobs')
    : 0;
  const mappedSqlRows = ctx.hasLegacyRecordMappings
    ? await scalar(db, 'SELECT COUNT(*) n FROM legacy_record_mappings WHERE target_id IS NOT NULL')
    : 0;

  return {
    archive: {
      database: ctx.legacyDatabase,
      tables: ctx.legacyTableCount,
      mappedCanonicalRows: mappedSqlRows,
    },
    totals: {
      delete: deleteFromRanges + deleteFromUserLinks,
      deleteFromSeedRanges: deleteFromRanges,
      deleteFromDemoUserLinks: deleteFromUserLinks,
      sqlRowsProtectedInsideSeedRanges: sqlProtected,
    },
    protected: {
      jobTitles,
      usersRemaining: totalUsers - (usersRange?.delete ?? 0),
    },
    tables: ranges.filter((item) => item.present > 0 || item.delete > 0),
    userLinked: userLinked.filter((item) => item.present > 0 || item.delete > 0),
  };
}

export async function previewSeedDemoData(db: PrismaClient) {
  const ctx = await buildProtectionContext(db);
  return inspectSeedDemoData(db, ctx);
}

export async function clearSeedDemoData(db: PrismaClient, verbose = true) {
  const ctx = await buildProtectionContext(db);
  const before = await inspectSeedDemoData(db, ctx);
  if (before.protected.usersRemaining < 1) {
    throw new Error(
      'Safety check failed: cleanup would leave no login user. Import/map the SQL users first',
    );
  }

  const targetTables = [...ctx.targetTables].sort();
  const constraints = await foreignKeys(db, ctx.targetDatabase);

  const deletedByTable = new Map<string, number>();
  const addDeleted = (table: string, count: number) => {
    deletedByTable.set(table, (deletedByTable.get(table) ?? 0) + count);
  };

  const transactionResult = await db.$transaction(async (tx) => {
    const countsBefore = await tableCounts(tx, targetTables);
    const orphansBefore = await orphanCounts(tx, constraints);
    const jobsBefore = await jobTitleRows(tx);

    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
    try {
      for (const table of ['permissions', 'rbac_user_exceptions', 'rbac_user_roles']) {
        if (!ctx.targetTables.has(table) || !ctx.targetTables.has('users')) continue;
        const deleted = await tx.$executeRawUnsafe(`
          DELETE linked FROM ${q(table)} linked
          JOIN users u ON u.user_id=linked.user_id
          WHERE ${demoUserWhere(ctx, 'u')}
        `);
        addDeleted(table, deleted);
      }

      for (const range of SEED_DEMO_RANGES) {
        const [table] = range;
        if (!ctx.targetTables.has(table)) continue;
        const deleted = await tx.$executeRawUnsafe(`
          DELETE t FROM ${q(table)} t WHERE ${rangeWhere(ctx, range)}
        `);
        addDeleted(table, deleted);
      }
    } finally {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    }

    const jobsAfter = await jobTitleRows(tx);
    if (JSON.stringify(jobsAfter) !== JSON.stringify(jobsBefore)) {
      throw new Error('Safety check failed: job titles changed; cleanup rolled back');
    }

    const countsAfter = await tableCounts(tx, targetTables);
    const countErrors: string[] = [];
    for (const table of targetTables) {
      const expected = (countsBefore.get(table) ?? 0) - (deletedByTable.get(table) ?? 0);
      const actual = countsAfter.get(table) ?? 0;
      if (actual !== expected) countErrors.push(`${table}: expected ${expected}, got ${actual}`);
    }
    if (countErrors.length > 0) {
      throw new Error(
        `Safety check failed: an unplanned row change was detected; cleanup rolled back\n${countErrors.join('\n')}`,
      );
    }

    const orphansAfter = await orphanCounts(tx, constraints);
    const orphanErrors: string[] = [];
    for (const [key, afterCount] of orphansAfter) {
      const beforeCount = orphansBefore.get(key) ?? 0;
      if (afterCount > beforeCount) {
        orphanErrors.push(`${key.replace('\u0000', '/')} +${afterCount - beforeCount}`);
      }
    }
    if (orphanErrors.length > 0) {
      throw new Error(
        `Safety check failed: cleanup would create orphan records; cleanup rolled back\n${orphanErrors.join('\n')}`,
      );
    }

    const after = await inspectSeedDemoData(tx, ctx);
    if (after.totals.delete !== 0) {
      throw new Error(
        `Safety check failed: ${after.totals.delete} known demo row(s) remained; cleanup rolled back`,
      );
    }
    return { after, deletedByTable: Object.fromEntries(deletedByTable) };
  }, { maxWait: 30_000, timeout: 1_800_000 });

  const result = { before, ...transactionResult };
  if (verbose) console.log(JSON.stringify({ mode: 'completed', ...result }, null, 2));
  return result;
}

async function main() {
  const db = new PrismaClient();
  try {
    const preview = await previewSeedDemoData(db);
    console.log(JSON.stringify({ mode: 'preview', ...preview }, null, 2));
    if (!process.argv.includes(CONFIRM_FLAG)) {
      console.log('\nNo data was changed. This was preview mode only.');
      console.log(
        `To execute: SEED_DEMO_CLEANUP_ACK=${REQUIRED_ACK} npm run db:clear:seed-demo -- ${CONFIRM_FLAG}`,
      );
      return;
    }
    if (process.env.SEED_DEMO_CLEANUP_ACK !== REQUIRED_ACK) {
      throw new Error(`Refusing cleanup. Set SEED_DEMO_CLEANUP_ACK=${REQUIRED_ACK}`);
    }
    await clearSeedDemoData(db);
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
