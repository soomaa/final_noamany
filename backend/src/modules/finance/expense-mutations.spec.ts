import { ExpensesService } from './expenses.service';
import { EXPENSE_APPROVED } from './finance.utils';

function setup(drawer = false, closed = false) {
  const existing = {
    id: 1, expense_number: 'EXP-1', expense_date: '2026-10-01T10:30:00',
    amount: 100, tax_amount: 0, total_amount: 100, paid_amount: 40, payments: [{ method: 'cash', amount: 40 }],
    payment_method: 'نقدي', payment_status: 'جزئي', approval_status: EXPENSE_APPROVED,
    branch_id: 1, created_by: 9, notes: null, updated_at: new Date('2026-10-01'), is_deleted: false,
  };
  const tx = {
    $queryRaw: jest.fn(),
    fin_expenses: {
      findFirst: jest.fn().mockResolvedValue(existing), findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(({ data }) => ({ ...existing, ...data })),
    },
    sales_cash_drawer_transactions: {
      findFirst: jest.fn().mockResolvedValue(drawer ? { id: 2, amount: 40, branch_id: 1, shift_session_id: 3 } : null),
      findMany: jest.fn().mockResolvedValue([{ direction: 'out', amount: 40 }]), update: jest.fn(),
    },
    sales_shift_sessions: {
      findUnique: jest.fn().mockResolvedValue({ id: 3, status: closed ? 'closed' : 'open', opening_balance: 200, total_cash: 0 }),
      update: jest.fn(),
    },
  };
  const ledger = { syncExpense: jest.fn() };
  const service = new ExpensesService({ ...tx, $transaction: (callback: (tx: unknown) => unknown) => callback(tx) } as never,
    ledger as never, { isBranchAllowed: () => true } as never, {} as never);
  return { service, ledger, tx };
}

describe('manual expense mutations', () => {
  it('reposts an approved expense with its revised payment allocation', async () => {
    const s = setup();
    await s.service.update(1, { paidAmount: 60, payments: [{ method: 'cash', amount: 60 }] });
    expect(s.ledger.syncExpense).toHaveBeenCalledWith(expect.objectContaining({ paidAmount: 60, post: true }), s.tx);
  });
  it('deducts only the difference from an open drawer when updating', async () => {
    const s = setup(true);
    await s.service.update(1, { paidAmount: 60, payments: [{ method: 'cash', amount: 60 }] });
    expect(s.tx.sales_shift_sessions.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { expected_closing_balance: 140 } });
  });
  it('returns the paid cash and reverses the approved entry when deleting', async () => {
    const s = setup(true);
    await s.service.remove(1);
    expect(s.tx.sales_shift_sessions.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { expected_closing_balance: 200 } });
    expect(s.ledger.syncExpense).toHaveBeenCalledWith(expect.objectContaining({ post: false }), s.tx);
  });
  it('does not rewrite a closed drawer', async () => {
    const s = setup(true, true);
    await expect(s.service.remove(1)).rejects.toThrow('إغلاق ورديته');
    expect(s.tx.fin_expenses.update).not.toHaveBeenCalled();
  });
});
