import {
  MigrationHistoryDoctor,
  MigrationHistoryPort,
} from './migration-history-doctor';
import {
  CANONICAL_REPLACEMENT,
  LEGACY_ALIAS,
} from './migration-history-policy';

class InMemoryHistoryPort implements MigrationHistoryPort {
  localNames = new Set([CANONICAL_REPLACEMENT]);
  appliedNames = new Set([CANONICAL_REPLACEMENT, LEGACY_ALIAS]);
  unresolvedNames = new Set<string>();
  employeeTypeExists = true;
  createdByIndexExists = true;
  archive = new Map<string, { migrationName: string; backupId: string }>();

  async listLocalNames() {
    return new Set(this.localNames);
  }

  async listAppliedNames() {
    return new Set(this.appliedNames);
  }

  async listUnresolvedNames() {
    return new Set(this.unresolvedNames);
  }

  async hasEmployeeEmploymentType() {
    return this.employeeTypeExists;
  }

  async hasClubMemberCreatedByIndex() {
    return this.createdByIndexExists;
  }

  async archiveAndDeleteLegacy(migrationName: string, backupId: string) {
    if (!this.appliedNames.has(migrationName)) {
      throw new Error('migration row is missing');
    }
    this.archive.set(migrationName, { migrationName, backupId });
    this.appliedNames.delete(migrationName);
  }
}

describe('MigrationHistoryDoctor', () => {
  it('reports a repairable alias in dry-run without mutating history', async () => {
    const port = new InMemoryHistoryPort();

    const result = await new MigrationHistoryDoctor(port).run({ apply: false });

    expect(result).toEqual({
      status: 'repairable',
      legacyAlias: LEGACY_ALIAS,
      canonicalReplacement: CANONICAL_REPLACEMENT,
      localPending: [],
      changed: false,
    });
    expect(port.appliedNames.has(LEGACY_ALIAS)).toBe(true);
    expect(port.archive.size).toBe(0);
  });

  it('refuses an unknown database-only migration without mutating history', async () => {
    const port = new InMemoryHistoryPort();
    port.appliedNames.add('20260820123456_unknown');

    await expect(new MigrationHistoryDoctor(port).run({ apply: false })).rejects.toThrow(
      'unknown database-only migrations: 20260820123456_unknown',
    );
    expect(port.appliedNames.has(LEGACY_ALIAS)).toBe(true);
    expect(port.archive.size).toBe(0);
  });

  it('refuses repair when employees.employment_type is missing', async () => {
    const port = new InMemoryHistoryPort();
    port.employeeTypeExists = false;

    await expect(new MigrationHistoryDoctor(port).run({ apply: false })).rejects.toThrow(
      'employees.employment_type is missing',
    );
    expect(port.archive.size).toBe(0);
  });

  it('refuses repair when idx_club_members_created_by is missing', async () => {
    const port = new InMemoryHistoryPort();
    port.createdByIndexExists = false;

    await expect(new MigrationHistoryDoctor(port).run({ apply: false })).rejects.toThrow(
      'idx_club_members_created_by is missing',
    );
    expect(port.archive.size).toBe(0);
  });

  it('requires a backup acknowledgement before apply', async () => {
    const port = new InMemoryHistoryPort();

    await expect(new MigrationHistoryDoctor(port).run({ apply: true })).rejects.toThrow(
      'MIGRATION_REPAIR_BACKUP_ID is required',
    );
    expect(port.appliedNames.has(LEGACY_ALIAS)).toBe(true);
    expect(port.archive.size).toBe(0);
  });

  it('archives and removes only the exact legacy alias on apply', async () => {
    const port = new InMemoryHistoryPort();

    const result = await new MigrationHistoryDoctor(port).run({
      apply: true,
      backupId: 'backup-20260826-verified',
    });

    expect(result.status).toBe('repaired');
    expect(result.changed).toBe(true);
    expect(port.appliedNames.has(CANONICAL_REPLACEMENT)).toBe(true);
    expect(port.appliedNames.has(LEGACY_ALIAS)).toBe(false);
    expect(port.archive).toEqual(
      new Map([
        [
          LEGACY_ALIAS,
          {
            migrationName: LEGACY_ALIAS,
            backupId: 'backup-20260826-verified',
          },
        ],
      ]),
    );
  });

  it('reports clean history and preserves pending local migrations', async () => {
    const port = new InMemoryHistoryPort();
    port.appliedNames.delete(LEGACY_ALIAS);
    port.localNames.add('20260820000000_pending');

    const result = await new MigrationHistoryDoctor(port).run({ apply: false });

    expect(result).toEqual({
      status: 'clean',
      legacyAlias: null,
      canonicalReplacement: CANONICAL_REPLACEMENT,
      localPending: ['20260820000000_pending'],
      changed: false,
    });
    expect(port.archive.size).toBe(0);
  });
});
