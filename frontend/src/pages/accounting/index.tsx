import { Navigate } from 'react-router-dom';
import { ACCOUNTING_ROUTES } from '@/lib/accounting-routes';

export { AccountingDashboardPage } from './dashboard';
export { JournalEntriesPage } from './journal-entries';
export { ChartOfAccountsPage } from './chart-of-accounts';
export { GeneralLedgerPage } from './general-ledger';
export { AccountStatementPage } from './account-statement';
export { TrialBalancePage } from './trial-balance';
export { IncomeStatementPage } from './income-statement';
export { BalanceSheetPage } from './balance-sheet';
export { CashFlowPage } from './cash-flow';
export { AccountingSettingsPage } from './settings';

export function AccountingIndexPage() {
  return <Navigate to={ACCOUNTING_ROUTES.dashboard} replace />;
}
