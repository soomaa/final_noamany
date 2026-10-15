/**
 * Ordera cafe route constants.
 * Prefer `/cafe/*` paths (gym `/club/cafe/*` aliases still redirect in the router).
 */
export const CAFE_ROUTES = {
  root: '/cafe',
  pos: '/sales/new',
  drafts: '/sales/drafts',
  shifts: '/sales/shifts',
  treasury: '/sales/treasury',
  settlements: '/sales/settlements',
  posAdmin: '/sales/pos-admin',
  partners: '/hr/partners',
  categories: '/cafe/categories',
  products: '/cafe/products',
  priceList: '/inventory/price-list',
  reports: '/cafe/reports',
  customers: '/cafe/customers',
  feedbackReports: '/cafe/reports/feedback',
  dashboard: '/inventory/dashboard',
  rawMaterials: '/cafe/raw-materials',
  stockTaking: '/cafe/stock-taking',
  movements: '/cafe/movements',
  suppliers: '/cafe/suppliers',
  purchases: '/cafe/purchases',
  supplierPayments: '/cafe/supplier-payments',
} as const;

/** @deprecated Prefer CAFE_ROUTES — kept for gradual import migration */
export const CLUB_ROUTES = {
  cafe: {
    root: CAFE_ROUTES.root,
    pos: CAFE_ROUTES.pos,
    drafts: CAFE_ROUTES.drafts,
    categories: CAFE_ROUTES.categories,
    products: CAFE_ROUTES.products,
    priceList: CAFE_ROUTES.priceList,
    reports: CAFE_ROUTES.reports,
    customers: CAFE_ROUTES.customers,
    feedbackReports: CAFE_ROUTES.feedbackReports,
    dashboard: CAFE_ROUTES.dashboard,
    rawMaterials: CAFE_ROUTES.rawMaterials,
    stockTaking: CAFE_ROUTES.stockTaking,
    movements: CAFE_ROUTES.movements,
    suppliers: CAFE_ROUTES.suppliers,
    purchases: CAFE_ROUTES.purchases,
    supplierPayments: CAFE_ROUTES.supplierPayments,
  },
} as const;

export const GYM_SALES_ROUTES = {
  sales: {
    newReceipt: CAFE_ROUTES.pos,
    drafts: CAFE_ROUTES.drafts,
    shifts: CAFE_ROUTES.shifts,
    treasury: CAFE_ROUTES.treasury,
    settlements: CAFE_ROUTES.settlements,
    posAdmin: CAFE_ROUTES.posAdmin,
  },
  cafe: {
    categories: CAFE_ROUTES.categories,
    products: CAFE_ROUTES.products,
    priceList: CAFE_ROUTES.priceList,
    reports: CAFE_ROUTES.reports,
  },
  inventory: {
    dashboard: CAFE_ROUTES.dashboard,
    rawMaterials: CAFE_ROUTES.rawMaterials,
    stockTaking: CAFE_ROUTES.stockTaking,
    movementLog: CAFE_ROUTES.movements,
  },
  procurement: {
    suppliers: CAFE_ROUTES.suppliers,
    cafePurchases: CAFE_ROUTES.purchases,
    supplierPayments: CAFE_ROUTES.supplierPayments,
  },
} as const;
