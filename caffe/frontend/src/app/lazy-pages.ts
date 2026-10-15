import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** Lazy-load a page module by named export (keeps route chunks split). */
function lazyPage(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string,
): LazyExoticComponent<ComponentType<unknown>> {
  return lazy(() =>
    loader().then((mod) => ({
      default: mod[exportName] as ComponentType<unknown>,
    })),
  );
}

export const DepartmentHubPage = lazyPage(() => import('@/pages/hub'), 'DepartmentHubPage');
export const HrPartnersPage = lazyPage(() => import('@/pages/hr/partners'), 'HrPartnersPage');
export const EmployeesListPage = lazyPage(() => import('@/pages/employees/list'), 'EmployeesListPage');
export const EmployeeFormPage = lazyPage(() => import('@/pages/employees/form'), 'EmployeeFormPage');
export const EmployeeProfilePage = lazyPage(() => import('@/pages/employees/profile'), 'EmployeeProfilePage');
export const OrgBranchesPage = lazyPage(() => import('@/pages/org/branches'), 'OrgBranchesPage');
export const OrgJobTitlesPage = lazyPage(() => import('@/pages/org/job-titles'), 'OrgJobTitlesPage');
export const NotificationsPage = lazyPage(() => import('@/pages/notifications/index'), 'NotificationsPage');
export const UsersPage = lazyPage(() => import('@/pages/users/index'), 'UsersPage');
export const CompanyPage = lazyPage(() => import('@/pages/company'), 'CompanyPage');
export const ProfilePage = lazyPage(() => import('@/pages/profile'), 'ProfilePage');
export const AdminLayout = lazyPage(() => import('@/pages/admin/layout'), 'AdminLayout');
export const RolesPage = lazyPage(() => import('@/pages/admin/roles'), 'RolesPage');
export const UserExceptionsPage = lazyPage(() => import('@/pages/admin/exceptions'), 'UserExceptionsPage');
export const AuditPage = lazyPage(() => import('@/pages/admin/audit'), 'AuditPage');

export const InventoryDashboardPage = lazyPage(() => import('@/pages/inventory/dashboard'), 'InventoryDashboardPage');
export const InventoryPriceListPage = lazyPage(() => import('@/pages/inventory/price-list'), 'InventoryPriceListPage');
export const InventoryMovementLogPage = lazyPage(() => import('@/pages/inventory/movement-log'), 'InventoryMovementLogPage');
export const InventoryStockTakingPage = lazyPage(() => import('@/pages/inventory/stock-taking'), 'InventoryStockTakingPage');

export const SalesNewReceiptPage = lazyPage(() => import('@/pages/sales'), 'SalesNewReceiptPage');
export const SalesDraftsPage = lazyPage(() => import('@/pages/sales'), 'SalesDraftsPage');
export const SalesShiftsPage = lazyPage(() => import('@/pages/sales'), 'SalesShiftsPage');
export const SalesTreasuryPage = lazyPage(() => import('@/pages/sales'), 'SalesTreasuryPage');
export const PosAdminPage = lazyPage(() => import('@/pages/sales'), 'PosAdminPage');
export const SalesSettlementsPage = lazyPage(() => import('@/pages/sales'), 'SalesSettlementsPage');

export const AccountingDashboardPage = lazyPage(() => import('@/pages/accounting'), 'AccountingDashboardPage');
export const JournalEntriesPage = lazyPage(() => import('@/pages/accounting'), 'JournalEntriesPage');
export const ChartOfAccountsPage = lazyPage(() => import('@/pages/accounting'), 'ChartOfAccountsPage');
export const GeneralLedgerPage = lazyPage(() => import('@/pages/accounting'), 'GeneralLedgerPage');
export const AccountStatementPage = lazyPage(() => import('@/pages/accounting'), 'AccountStatementPage');
export const TrialBalancePage = lazyPage(() => import('@/pages/accounting'), 'TrialBalancePage');
export const IncomeStatementPage = lazyPage(() => import('@/pages/accounting'), 'IncomeStatementPage');
export const BalanceSheetPage = lazyPage(() => import('@/pages/accounting'), 'BalanceSheetPage');
export const CashFlowPage = lazyPage(() => import('@/pages/accounting'), 'CashFlowPage');
export const AccountingSettingsPage = lazyPage(() => import('@/pages/accounting'), 'AccountingSettingsPage');

export const CafeProductsPage = lazyPage(() => import('@/pages/cafe/route-pages'), 'CafeProductsPage');
export const CafeCategoriesPage = lazyPage(() => import('@/pages/cafe/route-pages'), 'CafeCategoriesPage');
export const CafeRawMaterialsPage = lazyPage(() => import('@/pages/cafe/route-pages'), 'CafeRawMaterialsPage');
export const CafeReportsPage = lazyPage(() => import('@/pages/cafe/route-pages'), 'CafeReportsPage');
export const CafeItemFeedbackReportPage = lazyPage(() => import('@/pages/cafe/route-pages'), 'CafeItemFeedbackReportPage');
export const CafeCustomersPage = lazyPage(() => import('@/pages/cafe/route-pages'), 'CafeCustomersPage');
export const CafePurchasesPage = lazyPage(() => import('@/pages/cafe/route-pages'), 'CafePurchasesPage');
export const CafeSuppliersPage = lazyPage(() => import('@/pages/cafe/route-pages'), 'CafeSuppliersPage');
export const CafeSupplierPaymentsPage = lazyPage(() => import('@/pages/cafe/supplier-payments'), 'CafeSupplierPaymentsPage');
export const CafeDashboardPage = lazyPage(() => import('@/pages/cafe-dashboard'), 'CafeDashboardPage');

export const FinanceIndexPage = lazyPage(() => import('@/pages/finance'), 'FinanceIndexPage');
export const FinanceDashboardPage = lazyPage(() => import('@/pages/finance'), 'FinanceDashboardPage');
export const FinanceExpensesPage = lazyPage(() => import('@/pages/finance'), 'FinanceExpensesPage');
export const FinanceRevenuesPage = lazyPage(() => import('@/pages/finance'), 'FinanceRevenuesPage');
export const FinanceExpenseReportsPage = lazyPage(() => import('@/pages/finance'), 'FinanceExpenseReportsPage');
export const FinanceRevenueReportsPage = lazyPage(() => import('@/pages/finance'), 'FinanceRevenueReportsPage');
export const FinanceAnalysisPage = lazyPage(() => import('@/pages/finance'), 'FinanceAnalysisPage');
export const FinanceProfitLossPage = lazyPage(() => import('@/pages/finance'), 'FinanceProfitLossPage');
