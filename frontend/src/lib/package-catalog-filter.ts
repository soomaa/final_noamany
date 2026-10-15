/**
 * Filtering for the regular-packages tab on /club/packages/settings.
 *
 * Two independent narrowings that combine with AND: a free-text name search, and the app
 * section (category) the package is published under. Kept pure and separate from the page so
 * the rules are testable — an empty result is either "no such name" or "nothing in this
 * section", and the page tells those apart.
 */

/** Matches when the query is blank, or the name contains it (case-insensitive). */
export function matchesPackageSearch(name: string, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  return name.toLowerCase().includes(term);
}

/** `'all'` keeps every package; otherwise the package must list that category. */
export function matchesPackageCategory(
  categories: readonly string[] | undefined,
  filter: string,
): boolean {
  if (filter === 'all') return true;
  return (categories ?? []).includes(filter);
}

export type FilterablePackage = { name: string; categories?: readonly string[] | null };

export function filterPackages<T extends FilterablePackage>(
  packages: readonly T[],
  search: string,
  categoryFilter: string,
): T[] {
  return packages.filter(
    (item) =>
      matchesPackageSearch(item.name, search) &&
      matchesPackageCategory(item.categories ?? undefined, categoryFilter),
  );
}

/** How many packages sit under each category, for the counts on the filter chips. */
export function countByCategory(
  packages: readonly FilterablePackage[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of packages) {
    for (const key of item.categories ?? []) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}
