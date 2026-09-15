export function missingLocalHistory(appliedMigrationNames, localMigrationNames) {
  return appliedMigrationNames.filter((name) => !localMigrationNames.has(name));
}

export function pendingMigrations(candidateMigrationNames, appliedMigrationNames) {
  return candidateMigrationNames.filter((name) => !appliedMigrationNames.has(name));
}

export function checksumMismatches(appliedMigrationRows, localChecksumByName) {
  return appliedMigrationRows.flatMap(({ name, checksum: expected }) => {
    const actual = localChecksumByName.get(name);
    if (!actual || actual === expected) return [];
    return [{ migration: name, expected, actual }];
  });
}

export function classifyChecksumDrift(mismatches, acceptedDrift) {
  const acceptedKeys = new Set(
    acceptedDrift.map(({ migration, expected, actual }) => `${migration}\0${expected}\0${actual}`),
  );
  return mismatches.reduce(
    (result, mismatch) => {
      const key = `${mismatch.migration}\0${mismatch.expected}\0${mismatch.actual}`;
      result[acceptedKeys.has(key) ? 'acceptedHistoricalDrift' : 'checksumMismatches'].push(mismatch);
      return result;
    },
    { acceptedHistoricalDrift: [], checksumMismatches: [] },
  );
}

export function conflictingExistingTables(existingTableNames, idempotentTableNames, pendingTableNames) {
  return existingTableNames.filter(
    (name) => pendingTableNames.has(name) && !idempotentTableNames.has(name),
  );
}
