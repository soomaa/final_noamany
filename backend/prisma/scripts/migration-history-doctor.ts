import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { access, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { databaseNameFromUrl, parseMigrationDoctorOptions } from '../../src/common/migrations/migration-history-cli';
import {
  MigrationHistoryDoctor,
  MigrationHistoryPort,
} from '../../src/common/migrations/migration-history-doctor';

interface MigrationNameRow {
  migration_name: string;
}

interface CountRow {
  count: bigint | number;
}

interface MigrationMetadataRow {
  id: string;
}

class PrismaMigrationHistoryPort implements MigrationHistoryPort {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly migrationsDir: string,
  ) {}

  async listLocalNames(): Promise<Set<string>> {
    const entries = await readdir(this.migrationsDir, { withFileTypes: true });
    const names: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        await access(resolve(this.migrationsDir, entry.name, 'migration.sql'));
        names.push(entry.name);
      } catch {
        // A directory without migration.sql is not a Prisma migration artifact.
      }
    }
    return new Set(names);
  }

  async listAppliedNames(): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<MigrationNameRow[]>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    `;
    return new Set(rows.map((row) => row.migration_name));
  }

  async listUnresolvedNames(): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<MigrationNameRow[]>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    `;
    return new Set(rows.map((row) => row.migration_name));
  }

  async hasEmployeeEmploymentType(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'employees'
        AND column_name = 'employment_type'
    `;
    return Number(rows[0]?.count ?? 0) === 1;
  }

  async hasClubMemberCreatedByIndex(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) AS count
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'club_members'
        AND index_name = 'idx_club_members_created_by'
    `;
    return Number(rows[0]?.count ?? 0) > 0;
  }

  async archiveAndDeleteLegacy(migrationName: string, backupId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS one80_migration_history_archive (
        original_id VARCHAR(36) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        finished_at DATETIME(3) NULL,
        migration_name VARCHAR(255) NOT NULL,
        logs TEXT NULL,
        rolled_back_at DATETIME(3) NULL,
        started_at DATETIME(3) NOT NULL,
        applied_steps_count INT UNSIGNED NOT NULL,
        backup_id VARCHAR(255) NOT NULL,
        archived_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (original_id),
        INDEX one80_migration_history_archive_name_idx (migration_name)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<MigrationMetadataRow[]>`
        SELECT id
        FROM _prisma_migrations
        WHERE migration_name = ${migrationName}
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
        FOR UPDATE
      `;
      if (rows.length !== 1) {
        throw new Error('expected exactly one applied legacy migration row');
      }

      const originalId = rows[0].id;
      await tx.$executeRaw`
        INSERT IGNORE INTO one80_migration_history_archive (
          original_id,
          checksum,
          finished_at,
          migration_name,
          logs,
          rolled_back_at,
          started_at,
          applied_steps_count,
          backup_id
        )
        SELECT
          id,
          checksum,
          finished_at,
          migration_name,
          logs,
          rolled_back_at,
          started_at,
          applied_steps_count,
          ${backupId}
        FROM _prisma_migrations
        WHERE id = ${originalId}
      `;

      const archived = await tx.$queryRaw<CountRow[]>`
        SELECT COUNT(*) AS count
        FROM one80_migration_history_archive
        WHERE original_id = ${originalId}
          AND migration_name = ${migrationName}
      `;
      if (Number(archived[0]?.count ?? 0) !== 1) {
        throw new Error('legacy migration metadata was not archived');
      }

      const deleted = await tx.$executeRaw`
        DELETE FROM _prisma_migrations
        WHERE id = ${originalId}
          AND migration_name = ${migrationName}
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      `;
      if (deleted !== 1) {
        throw new Error('legacy migration metadata was not deleted exactly once');
      }
    });
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const options = parseMigrationDoctorOptions(
    process.argv.slice(2),
    process.env,
  );
  const prisma = new PrismaClient();
  try {
    const port = new PrismaMigrationHistoryPort(
      prisma,
      resolve(process.cwd(), 'prisma', 'migrations'),
    );
    const result = await new MigrationHistoryDoctor(port).run(options);
    process.stdout.write(
      `${JSON.stringify({ database: databaseNameFromUrl(databaseUrl), ...result })}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'migration history doctor failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
