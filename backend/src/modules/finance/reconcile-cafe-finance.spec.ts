import { reconcileCafeFinance } from './reconcile-cafe-finance';

function database(reversed = false) {
  const expenses: any[] = [];
  const entry = { id: 4, source_doc_id: '27:branch:2', branch_id: 2, date: '2026-08-25', status: 'posted', reversed_by_id: reversed ? 8 : null, created_by: 9,
    lines: [
      { debit: 1200, credit: 0, account: { account_type: 'expense' } },
      { debit: 0, credit: 100, account: { account_type: 'expense' } },
      { debit: 0, credit: 1100, account: { account_type: 'liability' } },
    ] };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]), $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    acc_journal_entries: { findUnique: jest.fn().mockResolvedValue(entry) },
    fin_expenses: {
      findFirst: jest.fn(async ({ where }) => where.invoice_number ? expenses.find(row => row.invoice_number === where.invoice_number) ?? null : null),
      create: jest.fn(async ({ data }) => { const row = { ...data, id: expenses.length + 1 }; expenses.push(row); return row; }),
    },
  };
  const db = {
    sales_quick_sales: { findMany: jest.fn().mockResolvedValue([]) },
    sales_cash_drawer_transactions: { findMany: jest.fn().mockResolvedValue([]) },
    acc_journal_entries: { findMany: jest.fn(async ({ where }) => where.id.gt < entry.id ? [entry] : []) },
    $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
  };
  return { db, tx, expenses };
}

test('reconciliation uses persisted ONE80 salary expense, not net pay, and is idempotent', async () => {
  const { db, tx, expenses } = database();
  await reconcileCafeFinance(db as never);
  await reconcileCafeFinance(db as never);
  expect(expenses).toHaveLength(1);
  expect(expenses[0]).toEqual(expect.objectContaining({ invoice_number: 'PAYROLL-27-BR-2', expense_date: '2026-08-25', total_amount: 1100, branch_id: 2, created_by: 9 }));
  expect(tx.fin_expenses.create).toHaveBeenCalledTimes(1);
});

test('does not recreate an expense if the payroll accrual was reversed before the lock', async () => {
  const { db, expenses } = database(true);
  await reconcileCafeFinance(db as never);
  expect(expenses).toHaveLength(0);
});
