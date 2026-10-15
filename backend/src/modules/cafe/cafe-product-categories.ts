export interface CafeCategoryAssignmentRow {
  sort_order: number;
  category: { id: number; name_ar: string };
}

export function normalizeCafeCategoryIds(ids?: number[], legacyId?: number | null): number[] {
  if (ids !== undefined) {
    return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  }
  return legacyId && Number.isInteger(legacyId) && legacyId > 0 ? [legacyId] : [];
}

export function mapCafeCategories(assignments?: CafeCategoryAssignmentRow[]) {
  return [...(assignments ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order || a.category.id - b.category.id)
    .map((assignment) => ({ id: assignment.category.id, name: assignment.category.name_ar }));
}

export function buildCafeCategoryFilter(categoryId: number) {
  return {
    OR: [
      { category_assignments: { some: { category_id: categoryId } } },
      { category_id: categoryId },
    ],
  };
}

export function cafeProductHasAnyCategory(
  product: { category_id: number | null; category_assignments?: Array<{ category_id: number }> },
  categoryIds: number[],
): boolean {
  const allowed = new Set(categoryIds);
  if (product.category_assignments?.some((assignment) => allowed.has(assignment.category_id))) return true;
  return product.category_id != null && allowed.has(product.category_id);
}
