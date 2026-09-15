import { resolveRoute } from '@/lib/routes';
import type { MenuNode } from '@/types';

export function isRouteActive(node: MenuNode, pathname: string, search: string): boolean {
  const route = resolveRoute(node.link);
  if (route === '#') return false;

  const [path, queryPart] = route.split('?');
  if (pathname !== path) return false;

  if (!queryPart) {
    const actual = new URLSearchParams(search.replace(/^\?/, ''));
    // Exact path only: ignore nodes without query when URL has unrelated params
    if ([...actual.keys()].length === 0) return true;
    return false;
  }

  const expected = new URLSearchParams(queryPart);
  const actual = new URLSearchParams(search.replace(/^\?/, ''));
  for (const [key, value] of expected) {
    if (actual.get(key) !== value) return false;
  }
  return true;
}

export function containsActive(node: MenuNode, pathname: string, search = ''): boolean {
  if (node.children.length === 0) return isRouteActive(node, pathname, search);
  return node.children.some((c) => containsActive(c, pathname, search));
}

export function findActiveLeafId(nodes: MenuNode[], pathname: string, search: string): number | null {
  let bestId: number | null = null;
  let bestScore = -1;

  const walk = (list: MenuNode[], depth: number) => {
    for (const node of list) {
      if (node.children.length > 0) {
        walk(node.children, depth + 1);
      } else if (isRouteActive(node, pathname, search)) {
        const score = depth * 1000 + (node.link?.length ?? 0);
        if (score > bestScore) {
          bestScore = score;
          bestId = node.id;
        }
      }
    }
  };

  walk(nodes, 0);
  return bestId;
}

export function findOpenBranchIds(nodes: MenuNode[], pathname: string, search: string): Set<number> {
  const open = new Set<number>();
  const activeLeafId = findActiveLeafId(nodes, pathname, search);
  if (activeLeafId == null) return open;

  const walk = (list: MenuNode[], ancestors: number[]): boolean => {
    for (const node of list) {
      if (node.id === activeLeafId) return true;
      if (node.children.length > 0) {
        if (walk(node.children, [...ancestors, node.id])) {
          ancestors.forEach((id) => open.add(id));
          return true;
        }
      }
    }
    return false;
  };

  walk(nodes, []);
  return open;
}

export function findActiveBranchId(nodes: MenuNode[], pathname: string, search = ''): number | null {
  for (const node of nodes) {
    if (node.children.length > 0 && containsActive(node, pathname, search)) return node.id;
  }
  return null;
}

export function findOwningDepartment(nodes: MenuNode[], pathname: string, search = ''): MenuNode | null {
  for (const node of nodes) {
    if (node.children.length > 0 && containsActive(node, pathname, search)) return node;
  }
  return null;
}
