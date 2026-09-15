import { reconcileCafeFinance } from './reconcile-cafe-finance';

it('reconciles only café-owned projections and never reads payroll journals', async () => {
  const db = {
    sales_quick_sales: { findMany: jest.fn().mockResolvedValue([]) },
    sales_cash_drawer_transactions: { findMany: jest.fn().mockResolvedValue([]) },
    acc_journal_entries: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };

  await expect(reconcileCafeFinance(db as never)).resolves.toEqual({ sales: 0, drawer: 0 });
  expect(db.acc_journal_entries.findMany).not.toHaveBeenCalled();
});
