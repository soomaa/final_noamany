import {
  BarChart3,
  Boxes,
  Briefcase,
  Calculator,
  Coffee,
  CreditCard,
  FileText,
  HandCoins,
  type LucideIcon,
  Settings,
  BookOpen,
  Scale,
  SlidersHorizontal,
  Users,
  Handshake,
} from 'lucide-react';
import { ACCOUNTING_ROUTES as AC } from '@/lib/accounting-routes';
import { CAFE_ROUTES as CR } from '@/lib/cafe-routes';
import { FINANCE_ROUTES as FR } from '@/lib/finance-routes';

export interface NavItem {
  to: string;
}

export interface NavGroup {
  id: string;
  icon?: LucideIcon;
  items: NavItem[];
}

export interface NavSection {
  id: string;
  icon: LucideIcon;
  items?: NavItem[];
  groups?: NavGroup[];
}

export function navRouteKey(to: string): string {
  return `nav.routes.${to}`;
}

export function translateNavRoute(t: (key: string) => string, to: string): string {
  const key = navRouteKey(to);
  const label = t(key);
  if (label !== key) return label;

  const hubMatch = /^\/hub\/([^/]+)$/.exec(to);
  if (hubMatch) {
    const hubId = hubMatch[1];
    const sectionLabel = t(navSectionKey(hubId));
    if (sectionLabel !== navSectionKey(hubId)) return sectionLabel;
    const groupLabel = t(navGroupKey(hubId));
    if (groupLabel !== navGroupKey(hubId)) return groupLabel;
  }

  const tail = to.split('/').filter(Boolean).pop() ?? to;
  return tail.replace(/-/g, ' ');
}

export function navSectionKey(id: string): string {
  return `nav.sections.${id}`;
}

export function navGroupKey(id: string): string {
  return `nav.groups.${id}`;
}

export function navSectionDescKey(id: string): string {
  return `nav.sectionDesc.${id}`;
}

export function navHubPath(id: string): string {
  if (id === 'gym-sales') return CR.pos;
  if (id === 'accounting') return AC.dashboard;
  if (id === 'financial-reports') return FR.dashboard;
  if (id === 'admin' || id === 'settings') return '/hub/settings';
  return `/hub/${id}`;
}

/** Primary landing route when opening a section from the sidebar. */
export function navSectionLandingPath(id: string): string {
  if (id === 'gym-sales') return CR.pos;
  if (id === 'accounting') return AC.dashboard;
  if (id === 'financial-reports') return FR.dashboard;
  return navHubPath(id);
}

/** Ordera cafe-only navigation (gym / HR / club stripped). */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'gym-sales',
    icon: Coffee,
    groups: [
      {
        id: 'gym-sales-sales',
        icon: CreditCard,
        items: [
          { to: CR.pos },
          { to: CR.drafts },
          { to: CR.shifts },
          { to: CR.treasury },
          { to: CR.settlements },
          { to: CR.posAdmin },
        ],
      },
      {
        id: 'gym-sales-cafe',
        icon: Coffee,
        items: [
          { to: CR.categories },
          { to: CR.products },
          { to: CR.priceList },
          { to: CR.reports },
          { to: CR.customers },
          { to: CR.feedbackReports },
        ],
      },
      {
        id: 'gym-sales-inventory',
        icon: Boxes,
        items: [
          { to: CR.dashboard },
          { to: CR.rawMaterials },
          { to: CR.stockTaking },
          { to: CR.movements },
        ],
      },
      {
        id: 'gym-sales-procurement',
        icon: HandCoins,
        items: [
          { to: CR.suppliers },
          { to: CR.purchases },
          { to: CR.supplierPayments },
        ],
      },
    ],
  },
  {
    id: 'hr',
    icon: Briefcase,
    groups: [
      {
        id: 'employees',
        icon: Users,
        items: [
          { to: '/employees' },
          { to: '/employees/new' },
        ],
      },
      {
        id: 'hr-partners',
        icon: Handshake,
        items: [{ to: '/hr/partners' }],
      },
    ],
  },
  {
    id: 'financial-reports',
    icon: BarChart3,
    items: [
      { to: FR.dashboard },
      { to: FR.expenses },
      { to: FR.revenues },
      { to: FR.expenseReports },
      { to: FR.revenueReports },
      { to: FR.analysis },
      { to: FR.profitLoss },
    ],
  },
  {
    id: 'accounting',
    icon: Calculator,
    items: [{ to: AC.dashboard }],
    groups: [
      {
        id: 'accounting-ledger',
        icon: BookOpen,
        items: [
          { to: AC.ledger.journalEntries },
          { to: AC.ledger.chartOfAccounts },
          { to: AC.ledger.generalLedger },
          { to: AC.ledger.accountStatement },
        ],
      },
      {
        id: 'accounting-statements',
        icon: Scale,
        items: [
          { to: AC.statements.trialBalance },
          { to: AC.statements.incomeStatement },
          { to: AC.statements.balanceSheet },
          { to: AC.statements.cashFlow },
        ],
      },
      {
        id: 'accounting-settings',
        icon: SlidersHorizontal,
        items: [{ to: AC.settings }],
      },
    ],
  },
  {
    id: 'admin',
    icon: Settings,
    items: [
      { to: '/hub/settings' },
      { to: '/org/branches' },
      { to: '/org/job-titles' },
      { to: '/admin/roles' },
      { to: '/admin/exceptions' },
      { to: '/users' },
      { to: '/company' },
    ],
  },
];

export const NAV_SECTION_BY_ID = Object.fromEntries(
  NAV_SECTIONS.map((s) => [s.id, s]),
) as Record<string, NavSection>;

/** Icon for a nav route — uses the owning group's icon when available. */
export function navRouteIcon(to: string): LucideIcon {
  for (const section of NAV_SECTIONS) {
    if (section.items?.some((i) => i.to === to)) return section.icon;
    for (const group of section.groups ?? []) {
      if (group.items.some((i) => i.to === to)) return group.icon ?? section.icon;
    }
  }
  return FileText;
}

function allItems(): NavItem[] {
  const out: NavItem[] = [];
  for (const section of NAV_SECTIONS) {
    if (section.items) out.push(...section.items);
    if (section.groups) for (const g of section.groups) out.push(...g.items);
  }
  return out;
}

/** All navigable route paths inside a section (for quick-access + permissions). */
export function sectionRoutePaths(sectionId: string): string[] {
  const section = NAV_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return [];
  const paths: string[] = [];
  if (section.items) paths.push(...section.items.map((i) => i.to));
  if (section.groups) for (const g of section.groups) paths.push(...g.items.map((i) => i.to));
  return paths;
}

/** The single best-matching item path for the current location (longest prefix wins). */
export function activeNavPath(pathname: string): string {
  let best = '';
  for (const item of allItems()) {
    if (pathname === item.to || pathname.startsWith(item.to + '/')) {
      if (item.to.length > best.length) best = item.to;
    }
  }
  return best;
}

/** The top-level section id that owns the current location. */
export function activeSectionId(pathname: string): string | null {
  const hub = /^\/hub\/([^/?#]+)/.exec(pathname);
  if (hub) {
    if (hub[1] === 'settings') return 'admin';
    if (NAV_SECTIONS.some((s) => s.id === hub[1])) return hub[1];
  }

  const path = activeNavPath(pathname);
  if (!path) return null;
  for (const section of NAV_SECTIONS) {
    if (section.items?.some((i) => i.to === path)) return section.id;
    if (section.groups?.some((g) => g.items.some((i) => i.to === path))) return section.id;
  }
  return null;
}

/** The nested sub-group id that owns the current location. */
export function activeGroupId(pathname: string): string | null {
  const path = activeNavPath(pathname);
  if (!path) return null;
  for (const section of NAV_SECTIONS) {
    const g = section.groups?.find((grp) => grp.items.some((i) => i.to === path));
    if (g) return g.id;
  }
  return null;
}
