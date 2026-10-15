import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  assertDisposableDatabaseName,
  buildTargetDatabaseUrl,
  generateDisposableDatabaseName,
  redactRehearsalError,
} from '../../src/common/migrations/migration-rehearsal-policy';
import { LEGACY_ALIAS } from '../../src/common/migrations/migration-history-policy';

const LEGACY_CHECKSUM =
  'aa2cec58e37905044d3fb09c1b648916daa6a771c9e18449bb19acf55d681d72';

function runLocal(
  binaryName: 'prisma' | 'tsx',
  args: string[],
  databaseUrl: string,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  const binary = resolve(process.cwd(), 'node_modules', '.bin', binaryName);
  const result = spawnSync(binary, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = redactRehearsalError(
      result.stderr || result.stdout || `${binaryName} failed`,
    );
    throw new Error(detail.trim());
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

async function assertFreshSchema(target: PrismaClient) {
  const rows = await target.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(*) AS count
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN ('_prisma_migrations', 'employees', 'club_members', 'gate_credentials')
  `;
  if (Number(rows[0]?.count ?? 0) !== 4) {
    throw new Error('fresh migration rehearsal is missing required schema objects');
  }
}

async function insertLegacyAlias(target: PrismaClient) {
  const now = new Date();
  await target.$executeRaw`
    INSERT INTO _prisma_migrations (
      id,
      checksum,
      finished_at,
      migration_name,
      logs,
      rolled_back_at,
      started_at,
      applied_steps_count
    ) VALUES (
      ${randomUUID()},
      ${LEGACY_CHECKSUM},
      ${now},
      ${LEGACY_ALIAS},
      ${null},
      ${null},
      ${now},
      ${1}
    )
  `;
}

async function runRehearsal() {
  const adminUrl = process.env.E2E_MYSQL_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!adminUrl) throw new Error('E2E_MYSQL_ADMIN_URL or DATABASE_URL is required');

  const databaseName = generateDisposableDatabaseName();
  assertDisposableDatabaseName(databaseName);
  const targetUrl = buildTargetDatabaseUrl(adminUrl, databaseName);
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  let target: PrismaClient | null = null;
  let created = false;
  let databaseDropped = false;
  let result:
    | {
        status: 'passed';
        freshMigrations: true;
        historyRepair: true;
        driftFree: true;
        databaseDropped: boolean;
      }
    | undefined;

  try {
    await admin.$executeRawUnsafe(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    created = true;

    runLocal('prisma', ['migrate', 'deploy'], targetUrl);
    runLocal('prisma', ['migrate', 'status'], targetUrl);

    target = new PrismaClient({ datasources: { db: { url: targetUrl } } });
    await assertFreshSchema(target);
    await insertLegacyAlias(target);

    const dryRun = runLocal(
      'tsx',
      ['prisma/scripts/migration-history-doctor.ts'],
      targetUrl,
    );
    const dryRunResult = JSON.parse(dryRun.stdout.trim()) as {
      status?: string;
      changed?: boolean;
    };
    if (dryRunResult.status !== 'repairable' || dryRunResult.changed !== false) {
      throw new Error('legacy migration dry-run did not report a repairable alias');
    }

    const repair = runLocal(
      'tsx',
      ['prisma/scripts/migration-history-doctor.ts', '--apply'],
      targetUrl,
      { MIGRATION_REPAIR_BACKUP_ID: `rehearsal-${databaseName}` },
    );
    const repairResult = JSON.parse(repair.stdout.trim()) as {
      status?: string;
      changed?: boolean;
    };
    if (repairResult.status !== 'repaired' || repairResult.changed !== true) {
      throw new Error('legacy migration metadata repair did not complete');
    }

    const clean = runLocal(
      'tsx',
      ['prisma/scripts/migration-history-doctor.ts'],
      targetUrl,
    );
    const cleanResult = JSON.parse(clean.stdout.trim()) as {
      status?: string;
      changed?: boolean;
    };
    if (cleanResult.status !== 'clean' || cleanResult.changed !== false) {
      throw new Error('migration history is not clean after repair');
    }

    runLocal('prisma', ['migrate', 'status'], targetUrl);
    runLocal(
      'prisma',
      [
        'migrate',
        'diff',
        '--from-schema-datasource',
        resolve(process.cwd(), 'prisma', 'schema.prisma'),
        '--to-schema-datamodel',
        resolve(process.cwd(), 'prisma', 'schema.prisma'),
        '--exit-code',
      ],
      targetUrl,
    );

    result = {
      status: 'passed',
      freshMigrations: true,
      historyRepair: true,
      driftFree: true,
      databaseDropped: false,
    };
  } finally {
    if (target) await target.$disconnect();
    if (created) {
      assertDisposableDatabaseName(databaseName);
      await admin.$executeRawUnsafe(`DROP DATABASE \`${databaseName}\``);
      databaseDropped = true;
    }
    await admin.$disconnect();
  }

  if (!result) throw new Error('migration rehearsal did not produce a result');
  return { ...result, databaseDropped };
}

runRehearsal()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'migration rehearsal failed';
    process.stderr.write(`${redactRehearsalError(message)}\n`);
    process.exitCode = 1;
  });
