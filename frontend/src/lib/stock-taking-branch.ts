const positiveInteger = (value: number | string | null | undefined) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export function resolveStockTakingCreateBranch(
  userBranch: number | null | undefined,
  selectedBranch: number | string | null | undefined,
) {
  return positiveInteger(userBranch) ?? positiveInteger(selectedBranch);
}

export function resolveStockTakingCatalogBranch(
  sessionBranch: number | null | undefined,
) {
  return positiveInteger(sessionBranch);
}
