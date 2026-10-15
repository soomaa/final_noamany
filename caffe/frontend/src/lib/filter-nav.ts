import type { NavGroup, NavItem, NavSection } from '@/lib/nav';

function filterItems(items: NavItem[], canRoute: (path: string) => boolean): NavItem[] {
  return items.filter((item) => canRoute(item.to));
}

function filterGroups(groups: NavGroup[], canRoute: (path: string) => boolean): NavGroup[] {
  return groups
    .map((g) => ({ ...g, items: filterItems(g.items, canRoute) }))
    .filter((g) => g.items.length > 0);
}

/** Permission-filtered copy of the static nav tree. */
export function filterNavSections(
  sections: NavSection[],
  canRoute: (path: string) => boolean,
): NavSection[] {
  return sections
    .map((section) => {
      const items = section.items ? filterItems(section.items, canRoute) : undefined;
      const groups = section.groups ? filterGroups(section.groups, canRoute) : undefined;
      return { ...section, items, groups };
    })
    .filter((s) => (s.items?.length ?? 0) > 0 || (s.groups?.length ?? 0) > 0);
}
