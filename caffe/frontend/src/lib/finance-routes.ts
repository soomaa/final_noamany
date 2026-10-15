/** Financial reports module routes — `/finance/*`. */
export const FINANCE_ROUTES = {
  index: '/finance',
  dashboard: '/finance/dashboard',
  expenses: '/finance/expenses',
  revenues: '/finance/revenues',
  expenseReports: '/finance/expense-reports',
  revenueReports: '/finance/revenue-reports',
  analysis: '/finance/analysis',
  profitLoss: '/finance/profit-loss',
} as const;
