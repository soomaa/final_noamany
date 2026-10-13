import ar from '@/locales/ar.json';
import { NAV_SECTIONS, navSectionLandingPath } from '@/lib/nav';
import type { RbacCatalog, RbacNode } from '@/types/rbac';

/** RBAC module keys whose sidebar section has a different identifier. */
const SECTION_MODULE_KEYS: Record<string, string> = {
  settings: 'admin',
};

type NavigationLabels = {
  sections: Record<string, string>;
  groups: Record<string, string>;
  routes: Record<string, string>;
};

const labels = (ar as { nav: NavigationLabels }).nav;

function findPagesByRoute(nodes: RbacNode[], pages = new Map<string, RbacNode>()): Map<string, RbacNode> {
  for (const node of nodes) {
    if (node.type === 'page' && node.route) pages.set(node.route, node);
    findPagesByRoute(node.children, pages);
  }
  return pages;
}

function sidebarPage(node: RbacNode, nameAr: string, index: number): RbacNode {
  return { ...node, nameAr, sortOrder: index, children: [] };
}

/**
 * Build the permission picker from NAV_SECTIONS, rather than merely sorting the
 * full RBAC catalog. This keeps permission keys and action definitions intact,
 * while ensuring every displayed page has a matching visible sidebar entry.
 */
export function orderRbacCatalogForSidebar(catalog: RbacCatalog): RbacCatalog {
  const pagesByRoute = findPagesByRoute(catalog.tree);
  let position = 0;

  const tree = NAV_SECTIONS.flatMap((section) => {
    const moduleKey = SECTION_MODULE_KEYS[section.id] ?? section.id;
    const module = catalog.tree.find((node) => node.key === moduleKey);
    if (!module) return [];

    const children: RbacNode[] = [];
    const addPage = (route: string, nameAr: string) => {
      const page = pagesByRoute.get(route);
      if (page && !children.some((child) => child.key === page.key)) {
        children.push(sidebarPage(page, nameAr, position++));
      }
    };

    // This is the prominent overview link shown after opening a sidebar section.
    const landingPath = navSectionLandingPath(section.id);
    addPage(landingPath, labels.sections[section.id] ?? module.nameAr);

    for (const item of section.items ?? []) {
      addPage(item.to, labels.routes[item.to] ?? item.label ?? item.to.split('/').filter(Boolean).pop()!.replace(/-/g, ' '));
    }

    for (const group of section.groups ?? []) {
      const groupChildren: RbacNode[] = [];
      for (const item of group.items) {
        const page = pagesByRoute.get(item.to);
        if (page) groupChildren.push(sidebarPage(page, labels.routes[item.to] ?? item.label ?? item.to.split('/').filter(Boolean).pop()!.replace(/-/g, ' '), position++));
      }
      if (!groupChildren.length) continue;

      // Sidebar groups are presentation-only. Their children retain their real
      // resource keys, so existing grants and route protection are unchanged.
      children.push({
        key: `sidebar-group:${section.id}:${group.id}`,
        type: 'group',
        nameAr: labels.groups[group.id] ?? group.id,
        nameEn: null,
        route: null,
        icon: null,
        sortOrder: position++,
        actions: [],
        children: groupChildren,
      });
    }

    if (!children.length) return [];
    return [{ ...module, nameAr: labels.sections[section.id] ?? module.nameAr, sortOrder: position++, children }];
  });

  return { ...catalog, tree };
}
