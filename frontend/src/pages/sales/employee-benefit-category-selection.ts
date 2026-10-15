export function toggleAllCategoryIds(
  availableCategoryIds: number[],
  selectedCategoryIds: number[],
): number[] {
  if (!availableCategoryIds.length) return [];
  const selected = new Set(selectedCategoryIds);
  const allSelected = availableCategoryIds.every((id) => selected.has(id));
  return allSelected ? [] : [...availableCategoryIds];
}
