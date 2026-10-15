export const LEGACY_ALIAS = '20260707145000_hr_employment_type';
export const CANONICAL_REPLACEMENT = '20260707140000_hr_job_titles_members';

export interface HistoryClassification {
  localPending: string[];
  databaseOnly: string[];
  repairableAliases: string[];
  unknownDatabaseOnly: string[];
}

export interface LegacyAliasEvidence {
  localNames: ReadonlySet<string>;
  appliedNames: ReadonlySet<string>;
  unresolvedNames: ReadonlySet<string>;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function classifyHistory(
  localNames: ReadonlySet<string>,
  appliedNames: ReadonlySet<string>,
): HistoryClassification {
  const localPending = sorted([...localNames].filter((name) => !appliedNames.has(name)));
  const databaseOnly = sorted([...appliedNames].filter((name) => !localNames.has(name)));
  const repairableAliases = databaseOnly.filter(
    (name) =>
      name === LEGACY_ALIAS &&
      localNames.has(CANONICAL_REPLACEMENT) &&
      appliedNames.has(CANONICAL_REPLACEMENT),
  );
  const repairableSet = new Set(repairableAliases);
  const unknownDatabaseOnly = databaseOnly.filter((name) => !repairableSet.has(name));

  return { localPending, databaseOnly, repairableAliases, unknownDatabaseOnly };
}

export function assertRepairableLegacyAlias(evidence: LegacyAliasEvidence): void {
  if (evidence.localNames.has(LEGACY_ALIAS)) {
    throw new Error('legacy alias must remain outside the canonical local chain');
  }
  if (!evidence.appliedNames.has(LEGACY_ALIAS)) {
    throw new Error('legacy alias is not applied');
  }
  if (evidence.unresolvedNames.has(LEGACY_ALIAS)) {
    throw new Error('legacy alias is unresolved');
  }
  if (evidence.unresolvedNames.size > 0) {
    throw new Error('migration history has unresolved entries');
  }
  if (!evidence.localNames.has(CANONICAL_REPLACEMENT)) {
    throw new Error('canonical replacement is not present locally');
  }
  if (!evidence.appliedNames.has(CANONICAL_REPLACEMENT)) {
    throw new Error('canonical replacement is not applied');
  }
}
