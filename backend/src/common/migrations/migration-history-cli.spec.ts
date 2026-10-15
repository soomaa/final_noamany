import {
  databaseNameFromUrl,
  parseMigrationDoctorOptions,
} from './migration-history-cli';

describe('migration history CLI safety', () => {
  it('defaults to dry-run and does not invent a backup acknowledgement', () => {
    expect(parseMigrationDoctorOptions([], {})).toEqual({
      apply: false,
      backupId: undefined,
    });
  });

  it('reads the explicit apply flag and backup acknowledgement', () => {
    expect(
      parseMigrationDoctorOptions(['--apply'], {
        MIGRATION_REPAIR_BACKUP_ID: ' backup-verified ',
      }),
    ).toEqual({
      apply: true,
      backupId: 'backup-verified',
    });
  });

  it('refuses unsupported CLI arguments', () => {
    expect(() => parseMigrationDoctorOptions(['--migration', 'anything'], {})).toThrow(
      'unsupported migration history doctor arguments',
    );
  });

  it('extracts only the database name without exposing credentials', () => {
    const url = 'mysql://admin:super-secret@localhost:3306/one80_hr?connection_limit=5';

    const result = databaseNameFromUrl(url);

    expect(result).toBe('one80_hr');
    expect(result).not.toContain('admin');
    expect(result).not.toContain('super-secret');
  });

  it('refuses non-MySQL datasource URLs', () => {
    expect(() => databaseNameFromUrl('postgresql://localhost/example')).toThrow(
      'migration history doctor requires a MySQL DATABASE_URL',
    );
  });
});
