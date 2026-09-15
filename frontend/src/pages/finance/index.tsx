import { Navigate } from 'react-router-dom';
import { FINANCE_ROUTES } from '@/lib/finance-routes';

export { FinanceDashboardPage } from './dashboard';
export { FinanceExpensesPage } from './expenses';
export { FinanceRevenuesPage } from './revenues';
export { FinanceExpenseReportsPage } from './expense-reports';
export { FinanceRevenueReportsPage } from './revenue-reports';
export { FinanceAnalysisPage } from './analysis';
export { FinanceProfitLossPage } from './profit-loss';

export function FinanceIndexPage() {
  return <Navigate to={FINANCE_ROUTES.dashboard} replace />;
}
