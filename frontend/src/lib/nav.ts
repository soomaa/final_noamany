import {
  Banknote,
  BarChart3,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  Coffee,
  CreditCard,
  Dumbbell,
  FileText,
  Fingerprint,
  HandCoins,
  Handshake,
  Lock,
  Mail,
  type LucideIcon,
  Scale,
  Settings,
  SlidersHorizontal,
  Smartphone,
  UserRoundCheck,
  UserX,
  Users,
  Wrench,
} from 'lucide-react';
import { ACCOUNTING_ROUTES as AC } from '@/lib/accounting-routes';
import { APP_MANAGEMENT_ROUTES as AM } from '@/lib/app-management-routes';
import { CLUB_ROUTES as CR } from '@/lib/club-routes';
import { FITNESS_ROUTES as FIT } from '@/lib/fitness-routes';
import { FINANCE_ROUTES as FR } from '@/lib/finance-routes';
import { GYM_SALES_ROUTES as GS } from '@/lib/gym-sales-routes';

export interface NavItem {
  to: string;
}

/** A collapsible sub-group nested inside a top-level section (3rd level). */
export interface NavGroup {
  id: string;
  icon?: LucideIcon;
  items: NavItem[];
}

/**
 * A top-level section. It may contain direct `items` (2 levels: section → items)
 * and/or nested `groups` (3 levels: section → group → items).
 */
export interface NavSection {
  id: string;
  icon: LucideIcon;
  items?: NavItem[];
  groups?: NavGroup[];
}

/** Translation key for a nav route label. */
export function navRouteKey(to: string): string {
  return `nav.routes.${to}`;
}

/** Resolve a navigable path to a human label (never returns a raw i18n key). */
export function translateNavRoute(
  t: (key: string) => string,
  to: string,
): string {
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

/** Translation key for a top-level section label. */
export function navSectionKey(id: string): string {
  return `nav.sections.${id}`;
}

/** Translation key for a nested group label. */
export function navGroupKey(id: string): string {
  return `nav.groups.${id}`;
}

/** Translation key for a section's one-line description (shown on its hub). */
export function navSectionDescKey(id: string): string {
  return `nav.sectionDesc.${id}`;
}

/** The default landing ("hub") route for a top-level section. */
export function navHubPath(id: string): string {
  return `/hub/${id}`;
}

/** Primary landing route when opening a section from the sidebar. */
export function navSectionLandingPath(id: string): string {
  if (id === 'personal-sales') return '/sales-portal';
  if (id === 'gym-sales') return GS.sales.newReceipt;
  return navHubPath(id);
}

/**
 * Curated application navigation. Top-level order is intentional:
 *   personal sales → club (incl. financial-reports group) → gym-sales → accounting → app-management → hr → settings
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'personal-sales',
    icon: UserRoundCheck,
    items: [
      { to: '/sales-portal' },
      { to: '/sales-portal/leads' },
      { to: '/sales-portal/results' },
    ],
  },
  {
    id: 'club',
    icon: Dumbbell,
    groups: [
      {
        id: 'club-membership',
        icon: Users,
        items: [
          { to: CR.members.reception },
          { to: CR.members.quickServices },
          { to: CR.members.management },
          { to: CR.members.barcodeManagement },
          { to: CR.members.attendance },
          { to: '/club/gate-access' },
          { to: CR.members.groups },
          { to: CR.members.surveys },
        ],
      },
      {
        id: 'club-subscriptions',
        icon: CreditCard,
        items: [
          { to: CR.packages.settings },
          { to: '/club/membership-add' },
          { to: CR.subscriptions.list },
          { to: CR.subscriptions.new },
          { to: CR.subscriptions.reports },
          { to: CR.subscriptions.dailyCashier },
          { to: CR.subscriptions.outstanding },
          { to: CR.subscriptions.unifiedTreasury },
          { to: FIT.inbody },
          { to: FIT.facilities.spaInvoices },
          { to: CR.subscriptions.customerSources },
        ],
      },
      {
        id: 'club-sales-management',
        icon: Handshake,
        items: [
          // Team + target/commission live as in-page sections of the sales overview.
          { to: CR.sales.dashboard },
          { to: CR.sales.leads },
        ],
      },
      {
        id: 'club-fitness-trainers',
        icon: Users,
        items: [
          { to: FIT.programs },
          { to: FIT.trainers.list },
        ],
      },
      {
        id: 'club-lockers-mgmt',
        icon: Lock,
        items: [
          { to: CR.lockers.list },
        ],
      },
      {
        id: 'financial-reports',
        icon: BarChart3,
        items: [
          { to: FR.dashboard },
          { to: '/finance/payroll-preparation' },
          { to: '/finance/payroll-approval' },
          { to: FR.expenses },
          { to: FR.revenues },
          { to: FR.expenseReports },
        ],
      },
    ],
  },
  {
    id: 'gym-sales',
    icon: Coffee,
    groups: [
      {
        id: 'gym-sales-sales',
        icon: CreditCard,
        items: [
          { to: CR.cafe.pos },
          { to: CR.cafe.drafts },
          { to: GS.sales.shifts },
          { to: GS.sales.treasury },
          { to: GS.sales.settlements },
          { to: GS.sales.posAdmin },
        ],
      },
      {
        id: 'gym-sales-cafe',
        icon: Coffee,
        items: [
          { to: '/club/cafe/dashboard' },
          { to: CR.cafe.categories },
          { to: CR.cafe.products },
          { to: CR.cafe.bundles },
          { to: CR.cafe.priceList },
          { to: CR.cafe.waste },
          { to: CR.cafe.reports },
          { to: CR.cafe.customers },
          { to: CR.cafe.feedbackReports },
        ],
      },
      {
        id: 'gym-sales-inventory',
        icon: Boxes,
        items: [
          { to: CR.cafe.dashboard },
          { to: CR.cafe.rawMaterials },
          { to: CR.cafe.gymIssue },
          { to: CR.cafe.stockTaking },
          { to: CR.cafe.movements },
          { to: CR.cafe.stockHealth },
        ],
      },
      {
        id: 'gym-sales-procurement',
        icon: HandCoins,
        items: [
          { to: CR.cafe.suppliers },
          { to: CR.cafe.purchases },
          { to: CR.cafe.supplierPayments },
        ],
      },
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
    id: 'app-management',
    icon: Smartphone,
    items: [{ to: AM.about }, { to: AM.paymentMethods }, { to: AM.branches }],
    groups: [
      {
        id: 'app-management-invitations',
        icon: Mail,
        items: [
          { to: AM.invitations.sent },
          { to: AM.invitations.accepted },
          { to: AM.invitations.attended },
          { to: AM.invitations.rejected },
        ],
      },
      {
        id: 'app-management-content',
        icon: FileText,
        items: [
          { to: AM.offers },
          { to: AM.trainers },
          { to: AM.exerciseCategories },
          { to: AM.exercises },
          { to: AM.news },
          { to: AM.ads },
          { to: AM.notifications },
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
          { to: '/documents' },
          { to: '/employees/weekly-leaves' },
          { to: '/hr/partners' },
        ],
      },
      {
        id: 'attendance',
        icon: Fingerprint,
        items: [
          { to: '/attendance' },
          { to: '/attendance/devices' },
          { to: '/attendance/settings' },
          { to: '/attendance/rules' },
        ],
      },
      {
        id: 'payroll',
        icon: Banknote,
        items: [
          { to: '/payroll/runs' },
          { to: '/payroll/final-settlements' },
          { to: '/payroll/setup' },
          { to: '/settings/pay-components' },
          { to: '/payroll/salary-scale' },
        ],
      },
      {
        id: 'leaves',
        icon: CalendarDays,
        items: [
          { to: '/leaves' },
          { to: '/leaves/types' },
          { to: '/leaves/balances' },
          { to: '/permissions' },
          { to: '/requests' },
          { to: '/missions' },
        ],
      },
      {
        id: 'finance',
        icon: HandCoins,
        items: [
          { to: '/loans' },
          { to: '/loans/settings' },
          { to: '/penalties' },
          { to: '/penalties/bylaw' },
          { to: '/rewards' },
        ],
      },
      {
        id: 'affairs',
        icon: FileText,
        items: [
          { to: '/hr/circulars' },
          { to: '/hr/warnings' },
          { to: '/hr/evaluations' },
          { to: '/hr/custody' },
          { to: '/hr/job-requests' },
          { to: '/hr/messages' },
          { to: '/hr/tasks' },
          { to: '/hr/daily-reports' },
          { to: '/hr/initiatives' },
          { to: '/hr/activities' },
          { to: '/hr/legal-files' },
          { to: '/sites/visits' },
          { to: '/hr/action-screen' },
          { to: '/hr/gym-rates' },
        ],
      },
      {
        id: 'termination',
        icon: UserX,
        items: [
          { to: '/termination/clearance' },
          { to: '/termination/archive' },
        ],
      },
      {
        id: 'reports',
        icon: BarChart3,
        items: [{ to: '/reports' }],
      },
    ],
  },
  {
    id: 'settings',
    icon: Settings,
    items: [
      { to: '/org/branches' },
      { to: '/org/departments' },
      { to: '/org/job-titles' },
      { to: '/settings/insurance' },
      { to: '/admin/roles' },
      { to: '/admin/exceptions' },
      { to: '/users' },
      { to: '/admin/audit' },
      { to: '/settings/business-audit' },
      { to: '/settings/automation' },
      { to: '/settings/gym-policies' },
      { to: '/settings/backup' },
      { to: '/settings/webhooks' },
      { to: '/company' },
      { to: '/settings/forms' },
    ],
  },
];

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

/** Every item across the whole tree (flat + nested), in declaration order. */
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
  // A section's own hub page (`/hub/<id>`) belongs to that section.
  const hub = /^\/hub\/([^/?#]+)/.exec(pathname);
  if (hub && NAV_SECTIONS.some((s) => s.id === hub[1])) return hub[1];

  const path = activeNavPath(pathname);
  if (!path) return null;
  for (const section of NAV_SECTIONS) {
    if (section.items?.some((i) => i.to === path)) return section.id;
    if (section.groups?.some((g) => g.items.some((i) => i.to === path))) return section.id;
  }
  return null;
}

/** The nested sub-group id that owns the current location (null when the active item is a direct section item). */
export function activeGroupId(pathname: string): string | null {
  const path = activeNavPath(pathname);
  if (!path) return null;
  for (const section of NAV_SECTIONS) {
    const g = section.groups?.find((grp) => grp.items.some((i) => i.to === path));
    if (g) return g.id;
  }
  return null;
}
