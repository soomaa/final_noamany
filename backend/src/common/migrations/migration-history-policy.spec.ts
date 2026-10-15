import {
  CANONICAL_REPLACEMENT,
  LEGACY_ALIAS,
  assertRepairableLegacyAlias,
  classifyHistory,
} from './migration-history-policy';

describe('migration history policy', () => {
  it('classifies only the exact legacy duplicate as repairable and preserves local pending migrations', () => {
    const result = classifyHistory(
      new Set([CANONICAL_REPLACEMENT, '20260820000000_pending']),
      new Set([CANONICAL_REPLACEMENT, LEGACY_ALIAS]),
    );

    expect(result).toEqual({
      localPending: ['20260820000000_pending'],
      databaseOnly: [LEGACY_ALIAS],
      repairableAliases: [LEGACY_ALIAS],
      unknownDatabaseOnly: [],
    });
  });

  it('never treats an unknown database-only migration as repairable', () => {
    const result = classifyHistory(
      new Set([CANONICAL_REPLACEMENT]),
      new Set([CANONICAL_REPLACEMENT, '20260820123456_unknown']),
    );

    expect(result.repairableAliases).toEqual([]);
    expect(result.unknownDatabaseOnly).toEqual(['20260820123456_unknown']);
  });

  it('refuses the legacy alias when the canonical replacement is missing locally', () => {
    expect(() =>
      assertRepairableLegacyAlias({
        localNames: new Set(),
        appliedNames: new Set([CANONICAL_REPLACEMENT, LEGACY_ALIAS]),
        unresolvedNames: new Set(),
      }),
    ).toThrow('canonical replacement is not present locally');
  });

  it('refuses the legacy alias when the canonical replacement is not applied', () => {
    expect(() =>
      assertRepairableLegacyAlias({
        localNames: new Set([CANONICAL_REPLACEMENT]),
        appliedNames: new Set([LEGACY_ALIAS]),
        unresolvedNames: new Set(),
      }),
    ).toThrow('canonical replacement is not applied');
  });

  it('refuses unresolved migration state instead of deleting its metadata', () => {
    expect(() =>
      assertRepairableLegacyAlias({
        localNames: new Set([CANONICAL_REPLACEMENT]),
        appliedNames: new Set([CANONICAL_REPLACEMENT, LEGACY_ALIAS]),
        unresolvedNames: new Set([LEGACY_ALIAS]),
      }),
    ).toThrow('legacy alias is unresolved');
  });

  it('refuses repair when the legacy alias is not an applied database-only migration', () => {
    expect(() =>
      assertRepairableLegacyAlias({
        localNames: new Set([CANONICAL_REPLACEMENT]),
        appliedNames: new Set([CANONICAL_REPLACEMENT]),
        unresolvedNames: new Set(),
      }),
    ).toThrow('legacy alias is not applied');
  });

  it('refuses repair while any unrelated migration remains unresolved', () => {
    expect(() =>
      assertRepairableLegacyAlias({
        localNames: new Set([CANONICAL_REPLACEMENT]),
        appliedNames: new Set([CANONICAL_REPLACEMENT, LEGACY_ALIAS]),
        unresolvedNames: new Set(['20260820123456_failed']),
      }),
    ).toThrow('migration history has unresolved entries');
  });

  it('refuses repair when the legacy alias is part of the canonical local chain', () => {
    expect(() =>
      assertRepairableLegacyAlias({
        localNames: new Set([CANONICAL_REPLACEMENT, LEGACY_ALIAS]),
        appliedNames: new Set([CANONICAL_REPLACEMENT, LEGACY_ALIAS]),
        unresolvedNames: new Set(),
      }),
    ).toThrow('legacy alias must remain outside the canonical local chain');
  });
});
