export interface CafeCategoryOption {
  value: string;
  label: string;
}

export function toggleCafeCategory(selected: string[], id: string, checked: boolean): string[] {
  if (checked) return selected.includes(id) ? selected : [...selected, id];
  return selected.filter((value) => value !== id);
}

export function filterCafeCategories(options: CafeCategoryOption[], search: string): CafeCategoryOption[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return options;
  return options.filter((option) => option.label.toLocaleLowerCase().includes(query));
}

export function summarizeCafeCategories(options: CafeCategoryOption[], selected: string[], emptyLabel: string): string {
  const labels = selected.map((id) => options.find((option) => option.value === id)?.label).filter((label): label is string => Boolean(label));
  if (!labels.length) return emptyLabel;
  if (labels.length <= 2) return labels.join('، ');
  return `${labels.length} فئات`;
}

export function cafeProductMatchesCategory(product: { categoryIds?: number[]; categoryId?: number | null }, categoryId: number): boolean {
  if (product.categoryIds !== undefined) return product.categoryIds.includes(categoryId);
  return product.categoryId === categoryId;
}
