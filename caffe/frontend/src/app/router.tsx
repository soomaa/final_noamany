import { Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { HomeRedirect } from '@/components/auth/home-redirect';
import { ConfirmDialogProvider } from '@/components/common/confirm-dialog';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { LoginPage } from '@/pages/login';
import { useAuth } from '@/store/auth';
import {
  AccountStatementPage,
  AccountingDashboardPage,
  AccountingSettingsPage,
  AdminLayout,
  AuditPage,
  BalanceSheetPage,
  CafeCategoriesPage,
  CafeItemFeedbackReportPage,
  CafeCustomersPage,
  CafeProductsPage,
  CafePurchasesPage,
  CafeRawMaterialsPage,
  CafeReportsPage,
  CafeSupplierPaymentsPage,
  CafeSuppliersPage,
  CafeDashboardPage,
  CashFlowPage,
  ChartOfAccountsPage,
  CompanyPage,
  DepartmentHubPage,
  EmployeeFormPage,
  EmployeeProfilePage,
  EmployeesListPage,
  FinanceAnalysisPage,
  FinanceDashboardPage,
  FinanceExpenseReportsPage,
  FinanceExpensesPage,
  FinanceIndexPage,
  FinanceProfitLossPage,
  FinanceRevenueReportsPage,
  FinanceRevenuesPage,
  GeneralLedgerPage,
  HrPartnersPage,
  IncomeStatementPage,
  InventoryDashboardPage,
  InventoryMovementLogPage,
  InventoryPriceListPage,
  InventoryStockTakingPage,
  JournalEntriesPage,
  NotificationsPage,
  OrgBranchesPage,
  OrgJobTitlesPage,
  PosAdminPage,
  ProfilePage,
  RolesPage,
  SalesDraftsPage,
  SalesNewReceiptPage,
  SalesSettlementsPage,
  SalesShiftsPage,
  SalesTreasuryPage,
  TrialBalancePage,
  UserExceptionsPage,
  UsersPage,
} from '@/app/lazy-pages';

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  if (status === 'loading' || status === 'idle') return <PageSkeleton />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <>
      <ConfirmDialogProvider />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={<Lazy><CafeDashboardPage /></Lazy>} />
          <Route path="profile" element={<Lazy><ProfilePage /></Lazy>} />
          <Route path="notifications" element={<Lazy><NotificationsPage /></Lazy>} />
          <Route path="company" element={<Lazy><CompanyPage /></Lazy>} />
          <Route path="users" element={<Lazy><UsersPage /></Lazy>} />
          <Route path="org/branches" element={<Lazy><OrgBranchesPage /></Lazy>} />
          <Route path="org/job-titles" element={<Lazy><OrgJobTitlesPage /></Lazy>} />
          <Route path="employees" element={<Lazy><EmployeesListPage /></Lazy>} />
          <Route path="employees/new" element={<Lazy><EmployeeFormPage /></Lazy>} />
          <Route path="employees/:id" element={<Lazy><EmployeeProfilePage /></Lazy>} />
          <Route path="employees/:id/edit" element={<Lazy><EmployeeFormPage /></Lazy>} />
          <Route path="hr/partners" element={<Lazy><HrPartnersPage /></Lazy>} />
          <Route path="hub/:section" element={<Lazy><DepartmentHubPage /></Lazy>} />

          <Route path="admin" element={<Lazy><AdminLayout /></Lazy>}>
            <Route path="roles" element={<Lazy><RolesPage /></Lazy>} />
            <Route path="exceptions" element={<Lazy><UserExceptionsPage /></Lazy>} />
            <Route path="audit" element={<Lazy><AuditPage /></Lazy>} />
          </Route>

          <Route path="sales" element={<Navigate to="/sales/new" replace />} />
          <Route path="sales/new" element={<Lazy><SalesNewReceiptPage /></Lazy>} />
          <Route path="sales/drafts" element={<Lazy><SalesDraftsPage /></Lazy>} />
          <Route path="sales/shifts" element={<Lazy><SalesShiftsPage /></Lazy>} />
          <Route path="sales/treasury" element={<Lazy><SalesTreasuryPage /></Lazy>} />
          <Route path="sales/settlements" element={<Lazy><SalesSettlementsPage /></Lazy>} />
          <Route path="sales/pos-admin" element={<Lazy><PosAdminPage /></Lazy>} />
          <Route path="sales/invoices" element={<Navigate to="/sales/drafts" replace />} />
          <Route path="sales/bookings" element={<Navigate to="/sales/new" replace />} />

          <Route path="cafe" element={<Navigate to="/sales/new" replace />} />
          <Route path="cafe/products" element={<Lazy><CafeProductsPage /></Lazy>} />
          <Route path="cafe/categories" element={<Lazy><CafeCategoriesPage /></Lazy>} />
          <Route path="cafe/raw-materials" element={<Lazy><CafeRawMaterialsPage /></Lazy>} />
          <Route path="cafe/reports" element={<Lazy><CafeReportsPage /></Lazy>} />
          <Route path="cafe/customers" element={<Lazy><CafeCustomersPage /></Lazy>} />
          <Route path="cafe/reports/feedback" element={<Lazy><CafeItemFeedbackReportPage /></Lazy>} />
          <Route path="cafe/purchases" element={<Lazy><CafePurchasesPage /></Lazy>} />
          <Route path="cafe/suppliers" element={<Lazy><CafeSuppliersPage /></Lazy>} />
          <Route path="cafe/supplier-payments" element={<Lazy><CafeSupplierPaymentsPage /></Lazy>} />
          <Route path="cafe/stock-taking" element={<Lazy><InventoryStockTakingPage /></Lazy>} />
          <Route path="cafe/movements" element={<Lazy><InventoryMovementLogPage /></Lazy>} />
          <Route path="cafe/partners" element={<Navigate to="/hr/partners" replace />} />
          <Route path="cafe/pos" element={<Navigate to="/sales/new" replace />} />

          <Route path="club/cafe/products" element={<Navigate to="/cafe/products" replace />} />
          <Route path="club/cafe/categories" element={<Navigate to="/cafe/categories" replace />} />
          <Route path="club/cafe/raw-materials" element={<Navigate to="/cafe/raw-materials" replace />} />
          <Route path="club/cafe/reports/feedback" element={<Navigate to="/cafe/reports/feedback" replace />} />
          <Route path="club/cafe/reports" element={<Navigate to="/cafe/reports" replace />} />
          <Route path="club/cafe/customers" element={<Navigate to="/cafe/customers" replace />} />
          <Route path="club/cafe/purchases" element={<Navigate to="/cafe/purchases" replace />} />
          <Route path="club/cafe/suppliers" element={<Navigate to="/cafe/suppliers" replace />} />
          <Route path="club/cafe/supplier-payments" element={<Navigate to="/cafe/supplier-payments" replace />} />
          <Route path="club/cafe/stock-taking" element={<Navigate to="/cafe/stock-taking" replace />} />
          <Route path="club/cafe/movements" element={<Navigate to="/cafe/movements" replace />} />
          <Route path="club/cafe" element={<Navigate to="/sales/new" replace />} />

          <Route path="inventory/dashboard" element={<Lazy><InventoryDashboardPage /></Lazy>} />
          <Route path="inventory/price-list" element={<Lazy><InventoryPriceListPage /></Lazy>} />
          <Route path="inventory/gym-issue" element={<Navigate to="/cafe/movements" replace />} />
          <Route path="inventory" element={<Navigate to="/cafe/raw-materials" replace />} />

          <Route path="accounting" element={<Lazy><AccountingDashboardPage /></Lazy>} />
          <Route path="accounting/journal-entries" element={<Lazy><JournalEntriesPage /></Lazy>} />
          <Route path="accounting/accounts" element={<Lazy><ChartOfAccountsPage /></Lazy>} />
          <Route path="accounting/general-ledger" element={<Lazy><GeneralLedgerPage /></Lazy>} />
          <Route path="accounting/account-statement" element={<Lazy><AccountStatementPage /></Lazy>} />
          <Route path="accounting/trial-balance" element={<Lazy><TrialBalancePage /></Lazy>} />
          <Route path="accounting/income-statement" element={<Lazy><IncomeStatementPage /></Lazy>} />
          <Route path="accounting/balance-sheet" element={<Lazy><BalanceSheetPage /></Lazy>} />
          <Route path="accounting/cash-flow" element={<Lazy><CashFlowPage /></Lazy>} />
          <Route path="accounting/settings" element={<Lazy><AccountingSettingsPage /></Lazy>} />

          <Route path="finance" element={<Lazy><FinanceIndexPage /></Lazy>} />
          <Route path="finance/dashboard" element={<Lazy><FinanceDashboardPage /></Lazy>} />
          <Route path="finance/expenses" element={<Lazy><FinanceExpensesPage /></Lazy>} />
          <Route path="finance/revenues" element={<Lazy><FinanceRevenuesPage /></Lazy>} />
          <Route path="finance/expense-reports" element={<Lazy><FinanceExpenseReportsPage /></Lazy>} />
          <Route path="finance/revenue-reports" element={<Lazy><FinanceRevenueReportsPage /></Lazy>} />
          <Route path="finance/analysis" element={<Lazy><FinanceAnalysisPage /></Lazy>} />
          <Route path="finance/profit-loss" element={<Lazy><FinanceProfitLossPage /></Lazy>} />

          <Route path="*" element={<Navigate to="/sales/new" replace />} />
        </Route>
      </Routes>
    </>
  );
}
