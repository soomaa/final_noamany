import type { NavApiNode } from '@/hooks/use-permission';

export const DEFAULT_DASHBOARD_SHORTCUTS = [
  '/club/subscriptions/daily-cashier',
  '/finance/expenses',
  '/finance/profit-loss',
] as const;

export interface DashboardShortcutPage {
  to: string;
  label: string;
  section: string;
}

/** Use the permission catalog so newly added pages appear in the picker too. */
export function dashboardShortcutPages(
  nodes: NavApiNode[],
  locale: 'ar' | 'en',
  canRoute: (path: string) => boolean,
): DashboardShortcutPage[] {
  const pages: DashboardShortcutPage[] = [];
  const seen = new Set<string>();
  const name = (node: NavApiNode) => locale === 'en' ? node.nameEn || node.nameAr : node.nameAr;
  const visit = (node: NavApiNode, section: string) => {
    const to = node.route;
    if (node.clickable && to && to !== '/dashboard' && !seen.has(to) && canRoute(to)) {
      seen.add(to);
      pages.push({ to, label: name(node), section });
    }
    node.children.forEach((child) => visit(child, section));
  };
  nodes.forEach((node) => visit(node, name(node)));
  return pages;
}

