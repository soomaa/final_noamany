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
  payrollPreparation: '/finance/payroll-preparation',
  payrollApproval: '/finance/payroll-approval',
} as const;

/** Legacy report grants still open the consolidated statement; APIs retain their own grants. */
export function canViewFinanceStatement(keys: ReadonlySet<string>) {
  return ['dashboard', 'reports', 'revenue_reports', 'analysis', 'profit_loss']
    .some((resource) => keys.has(`financial-reports.${resource}:view`));
}
