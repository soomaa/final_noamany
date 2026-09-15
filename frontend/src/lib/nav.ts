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
  Lock,
  Mail,
  type LucideIcon,
  Scale,
  Settings,
  SlidersHorizontal,
  Smartphone,
  Globe2,
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
import { PORTAL_ROUTES as PR } from '@/lib/portal-routes';

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
  if (id === 'gym-sales') return GS.sales.newReceipt;
  return navHubPath(id);
}

/**
 * Curated application navigation. Top-level order is intentional:
 *   club (incl. financial-reports group) → gym-sales → accounting → app-management → hr → settings
 */
export const NAV_SECTIONS: NavSection[] = [
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
          { to: CR.members.barcodePrintRange },
          { to: CR.members.barcodeSpaCheckIn },
          { to: CR.members.barcodeClassesCheckIn },
          { to: CR.members.barcodeSpaAttendance },
          { to: CR.members.barcodeClassesAttendance },
          { to: CR.members.attendance },
        ],
      },
      {
        id: 'club-subscriptions',
        icon: CreditCard,
        items: [
          { to: CR.packages.settings },
          { to: CR.subscriptions.list },
          { to: CR.subscriptions.new },
          { to: CR.subscriptions.online },
          { to: CR.subscriptions.special },
          { to: CR.subscriptions.dailyCashier },
          { to: CR.subscriptions.reports },
          { to: CR.subscriptions.receipts },
          { to: FIT.facilities.spaInvoices },
          { to: CR.subscriptions.inbodyInvoices },
          { to: CR.subscriptions.outstanding },
          { to: CR.subscriptions.treasury },
          { to: CR.subscriptions.unifiedTreasury },
          { to: CR.subscriptions.refunds },
          { to: CR.subscriptions.customerSources },
        ],
      },
      {
        id: 'club-lockers-mgmt',
        icon: Lock,
        items: [
          { to: CR.lockers.list },
          { to: CR.lockers.new },
          { to: CR.lockers.settings },
        ],
      },
      {
        id: 'club-fitness-trainers',
        icon: Users,
        items: [
          { to: FIT.trainers.payments },
          { to: FIT.trainers.search },
          { to: FIT.trainers.ratings },
          { to: FIT.trainers.settings },
        ],
      },
      {
        id: 'club-events',
        icon: CalendarDays,
        items: [
          { to: '/club/events' },
          { to: '/club/events/registrations' },
          { to: '/club/events/checkin' },
          { to: '/club/events/settings' },
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
          { to: CR.cafe.categories },
          { to: CR.cafe.products },
          { to: CR.cafe.priceList },
          { to: CR.cafe.reports },
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
          { to: CR.cafe.managementWithdrawals },
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
    items: [{ to: AM.about }],
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
          { to: AM.community },
          { to: AM.ads },
        ],
      },
    ],
  },
  {
    id: 'hr',
    icon: Briefcase,
    groups: [
      {
        id: 'administrative-affairs-settings',
        icon: Settings,
        items: [
          { to: '/org/departments' },
          { to: '/org/job-titles' },
          { to: '/attendance/settings' },
          { to: '/attendance/rules' },
          { to: '/leaves/types' },
          { to: '/settings/pay-components' },
          { to: '/hr/gym-rates' },
          { to: '/hr/action-screen' },
          { to: '/hr/warnings/templates' },
        ],
      },
      {
        id: 'employees',
        icon: Users,
        items: [
          { to: '/employees/new' },
          { to: '/employees' },
          { to: '/employees/weekly-leaves' },
        ],
      },
      {
        id: 'leaves',
        icon: CalendarDays,
        items: [
          { to: '/leaves' },
          { to: '/leaves/balances' },
          { to: '/permissions' },
          { to: '/missions' },
        ],
      },
      {
        id: 'finance',
        icon: HandCoins,
        items: [
          { to: '/loans' },
          { to: '/loans/settings' },
        ],
      },
      {
        id: 'administrative-decisions-actions',
        icon: Scale,
        items: [
          { to: '/rewards' },
          { to: '/penalties' },
        ],
      },
      {
        id: 'affairs',
        icon: FileText,
        items: [
          { to: '/hr/circulars' },
          { to: '/hr/warnings' },
          { to: '/hr/messages' },
          { to: '/hr/activities' },
          { to: '/hr/legal-files' },
          { to: '/hr/mobile-content' },
        ],
      },
      {
        id: 'attendance',
        icon: Fingerprint,
        items: [
          { to: '/attendance' },
          { to: '/attendance/reports' },
          { to: '/attendance/adjustments' },
          { to: '/attendance/import' },
        ],
      },
      {
        id: 'payroll',
        icon: Banknote,
        items: [
          { to: '/payroll/runs' },
          { to: '/payroll/increases' },
          { to: '/payroll/increases/report' },
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
  {
    id: 'portal-management',
    icon: Globe2,
    groups: [
      { id: 'portal-management-basics', icon: Settings, items: [{ to: PR.company }, { to: PR.paymentMethods }, { to: PR.sliders }, { to: PR.partners }, { to: PR.policies }] },
      { id: 'portal-management-subdata', icon: SlidersHorizontal, items: [{ to: PR.sectionSettings }, { to: PR.stats }, { to: PR.services }, { to: PR.classShowcase }, { to: PR.aboutFeatures }, { to: PR.coachFeatures }] },
      { id: 'portal-management-about', icon: FileText, items: [{ to: PR.about }] },
      { id: 'portal-management-media', icon: FileText, items: [{ to: PR.photos }, { to: PR.videos }, { to: PR.heroVideos }] },
      { id: 'portal-management-branches', icon: Building2, items: [{ to: PR.branches }, { to: PR.trainers }, { to: PR.classes }] },
      { id: 'portal-management-requests', icon: Mail, items: [{ to: PR.messages }, { to: PR.messagesRead }] },
      { id: 'portal-management-jobs', icon: Briefcase, items: [{ to: PR.jobs }, { to: PR.jobApplications }, { to: PR.jobApplicationsAccepted }, { to: PR.jobApplicationsRejected }] },
      { id: 'portal-management-store', icon: Boxes, items: [{ to: PR.offers }, { to: PR.badges }, { to: PR.captainDiscounts }, { to: PR.categories }, { to: PR.products }, { to: PR.orders }, { to: PR.customers }, { to: PR.captainSalesReport }] },
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
  if (!best && (pathname === '/employees' || /^\/employees\/\d+/.test(pathname))) {
    return '/employees/active';
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
