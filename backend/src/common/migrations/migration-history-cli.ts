import { MigrationHistoryDoctorOptions } from './migration-history-doctor';

type MigrationDoctorEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, 'MIGRATION_REPAIR_BACKUP_ID'>
>;

export function parseMigrationDoctorOptions(
  args: readonly string[],
  env: MigrationDoctorEnvironment,
): MigrationHistoryDoctorOptions {
  if (args.some((arg) => arg !== '--apply')) {
    throw new Error('unsupported migration history doctor arguments');
  }
  return {
    apply: args.includes('--apply'),
    backupId: env.MIGRATION_REPAIR_BACKUP_ID?.trim() || undefined,
  };
}

export function databaseNameFromUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'mysql:') {
    throw new Error('migration history doctor requires a MySQL DATABASE_URL');
  }
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
  if (!databaseName) {
    throw new Error('DATABASE_URL does not contain a database name');
  }
  return databaseName;
}
