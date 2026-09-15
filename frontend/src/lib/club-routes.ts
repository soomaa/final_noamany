/** All club module routes — mirrors SwatGym sidebar structure under `/club`. */
export const CLUB_ROUTES = {
  dashboard: '/hub/club',
  packages: {
    settings: '/club/packages/settings',
  },
  members: {
    reception: '/club/reception',
    quickServices: '/club/reception/quick-services',
    management: '/club/members',
    barcodeManagement: '/club/members/barcode-management',
    barcodePrintRange: '/club/members/barcode-management/print-range',
    barcodeSpaCheckIn: '/club/members/barcode-management/spa-check-in',
    barcodeClassesCheckIn: '/club/members/barcode-management/classes-check-in',
    barcodeSpaAttendance: '/club/members/barcode-management/spa-attendance',
    barcodeClassesAttendance: '/club/members/barcode-management/classes-attendance',
    attendance: '/club/members/attendance',
    groups: '/club/members/groups',
    surveys: '/club/members/surveys',
  },
  subscriptions: {
    list: '/club/subscriptions',
    new: '/club/subscriptions/new',
    online: '/club/subscriptions/online',
    special: '/club/subscriptions/special',
    dailyCashier: '/club/subscriptions/daily-cashier',
    reports: '/club/subscriptions/reports',
    timeBased: '/club/subscriptions/time-based',
    transfers: '/club/subscriptions/transfers',
    memberTransfer: '/club/subscriptions/member-transfer',
    refunds: '/club/subscriptions/refunds',
    receipts: '/club/subscriptions/receipts',
    inbodyInvoices: '/club/subscriptions/inbody-invoices',
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
    categories: '/club/cafe/categories',
    rawMaterials: '/club/cafe/raw-materials',
    reports: '/club/cafe/reports',
    managementWithdrawals: '/club/cafe/inventory',
    feedbackReports: '/club/cafe/reports/feedback',
    purchases: '/club/cafe/purchases',
    suppliers: '/club/cafe/suppliers',
    supplierPayments: '/club/cafe/supplier-payments',
    dashboard: '/inventory/dashboard',
    priceList: '/inventory/price-list',
    gymIssue: '/inventory/gym-issue',
    stockTaking: '/club/cafe/stock-taking',
    movements: '/club/cafe/movements',
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
  | 'frozen'
  | 'receipts'
  | 'refunds'
  | 'transfers'
  | 'waivers'
  | 'private'
  | 'reports';

export type ClubLockersView = 'subscriptions' | 'lockers' | 'types';
