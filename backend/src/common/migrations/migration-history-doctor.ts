import {
  CANONICAL_REPLACEMENT,
  LEGACY_ALIAS,
  assertRepairableLegacyAlias,
  classifyHistory,
} from './migration-history-policy';

export interface MigrationHistoryPort {
  listLocalNames(): Promise<Set<string>>;
  listAppliedNames(): Promise<Set<string>>;
  listUnresolvedNames(): Promise<Set<string>>;
  hasEmployeeEmploymentType(): Promise<boolean>;
  hasClubMemberCreatedByIndex(): Promise<boolean>;
  archiveAndDeleteLegacy(migrationName: string, backupId: string): Promise<void>;
}

export interface MigrationHistoryDoctorOptions {
  apply: boolean;
  backupId?: string;
}

export interface MigrationHistoryDoctorResult {
  status: 'clean' | 'repairable' | 'repaired';
  legacyAlias: string | null;
  canonicalReplacement: string;
  localPending: string[];
  changed: boolean;
}

export class MigrationHistoryDoctor {
  constructor(private readonly port: MigrationHistoryPort) {}

  async run(options: MigrationHistoryDoctorOptions): Promise<MigrationHistoryDoctorResult> {
    const [localNames, appliedNames, unresolvedNames] = await Promise.all([
      this.port.listLocalNames(),
      this.port.listAppliedNames(),
      this.port.listUnresolvedNames(),
    ]);
    const classification = classifyHistory(localNames, appliedNames);

    if (classification.unknownDatabaseOnly.length > 0) {
      throw new Error(
        `unknown database-only migrations: ${classification.unknownDatabaseOnly.join(', ')}`,
      );
    }

    if (classification.repairableAliases.length === 0) {
      return {
        status: 'clean',
        legacyAlias: null,
        canonicalReplacement: CANONICAL_REPLACEMENT,
        localPending: classification.localPending,
        changed: false,
      };
    }

    assertRepairableLegacyAlias({ localNames, appliedNames, unresolvedNames });

    if (!(await this.port.hasEmployeeEmploymentType())) {
      throw new Error('employees.employment_type is missing');
    }
    if (!(await this.port.hasClubMemberCreatedByIndex())) {
      throw new Error('idx_club_members_created_by is missing');
    }

    if (!options.apply) {
      return {
        status: 'repairable',
        legacyAlias: LEGACY_ALIAS,
        canonicalReplacement: CANONICAL_REPLACEMENT,
        localPending: classification.localPending,
        changed: false,
      };
    }

    const backupId = options.backupId?.trim();
    if (!backupId) {
      throw new Error('MIGRATION_REPAIR_BACKUP_ID is required');
    }

    await this.port.archiveAndDeleteLegacy(LEGACY_ALIAS, backupId);
    return {
      status: 'repaired',
      legacyAlias: LEGACY_ALIAS,
      canonicalReplacement: CANONICAL_REPLACEMENT,
      localPending: classification.localPending,
      changed: true,
    };
  }
}
