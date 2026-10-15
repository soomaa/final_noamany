import { Navigate } from 'react-router-dom';
import { FINANCE_ROUTES } from '@/lib/finance-routes';

export { FinanceDashboardPage } from './dashboard';
export { FinanceExpensesPage } from './expenses';
export { FinanceRevenuesPage } from './revenues';
export { FinanceExpenseReportsPage } from './expense-reports';
export { FinanceReportRedirect as FinanceRevenueReportsPage, FinanceReportRedirect as FinanceAnalysisPage, FinanceReportRedirect as FinanceProfitLossPage } from './statement';

export function FinanceIndexPage() {
  return <Navigate to={FINANCE_ROUTES.dashboard} replace />;
}
