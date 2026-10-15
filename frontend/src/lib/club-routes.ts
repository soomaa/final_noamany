/** All club module routes — mirrors SwatGym sidebar structure under `/club`. */
export const CLUB_ROUTES = {
  dashboard: '/hub/club',
  packages: {
    /** One catalog: regular + private packages, scheduled classes, scheduling and reports. */
    settings: '/club/packages/settings',
    scheduling: '/club/packages/settings?tab=scheduling',
    trainerReports: '/club/packages/settings?tab=reports',
  },
  members: {
    reception: '/club/reception',
    quickServices: '/club/reception/quick-services',
    management: '/club/members',
    barcodeManagement: '/club/members/barcode-management',
    attendance: '/club/members/attendance',
    groups: '/club/members/groups',
    surveys: '/club/members/surveys',
  },
  sales: {
    dashboard: '/club/sales-dashboard',
    leads: '/club/leads',
    team: '/club/sales-reports',
    settings: '/club/sales-settings',
  },
  subscriptions: {
    list: '/club/subscriptions',
    new: '/club/subscriptions/new',
    dailyCashier: '/club/subscriptions/daily-cashier',
    reports: '/club/subscriptions/reports',
    timeBased: '/club/subscriptions/time-based',
    transfers: '/club/subscriptions/transfers',
    memberTransfer: '/club/subscriptions/member-transfer',
    refunds: '/club/subscriptions/refunds',
    receipts: '/club/subscriptions/receipts',
    financialReports: '/club/subscriptions/financial-reports',
    expired: '/club/subscriptions/expired',
    outstanding: '/club/subscriptions/outstanding',
    memberFinancial: '/club/subscriptions/member-financial',
    treasury: '/club/subscriptions/treasury',
    unifiedTreasury: '/club/unified-treasury',
    discounts: '/club/subscriptions/discounts',
    customerSources: '/club/subscriptions/customer-sources',
    userAnalytics: '/club/subscriptions/user-analytics',
    memberForm: '/club/subscriptions/member-form',
  },
  lockers: {
    list: '/club/lockers',
    new: '/club/lockers/new',
    settings: '/club/lockers/settings',
  },
  cafe: {
    root: '/club/cafe',
    products: '/club/cafe/products',
    bundles: '/club/cafe/bundles',
    categories: '/club/cafe/categories',
    rawMaterials: '/club/cafe/raw-materials',
    waste: '/club/cafe/waste',
    reports: '/club/cafe/reports',
    customers: '/club/cafe/customers',
    feedbackReports: '/club/cafe/reports/feedback',
    purchases: '/club/cafe/purchases',
    suppliers: '/club/cafe/suppliers',
    supplierPayments: '/club/cafe/supplier-payments',
    dashboard: '/inventory/dashboard',
    priceList: '/inventory/price-list',
    gymIssue: '/inventory/gym-issue',
    stockTaking: '/club/cafe/stock-taking',
    movements: '/club/cafe/movements',
    stockHealth: '/club/cafe/stock-health',
    pos: '/sales/new',
    drafts: '/sales/drafts',
  },
} as const;

export type ClubMembersView =
  | 'members'
  | 'attendance'
  | 'financial';

export type ClubSubscriptionsView =
  | 'subs'
  | 'private'
  | 'receipts'
  | 'refunds'
  | 'transfers'
  | 'expiring'
  | 'frozen'
  | 'followUps'
  | 'waivers'
  | 'reports';

export type ClubLockersView = 'subscriptions' | 'lockers' | 'types';
