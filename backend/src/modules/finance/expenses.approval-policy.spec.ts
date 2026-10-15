import { ExpensesService } from './expenses.service';
import { EXPENSE_APPROVED } from './finance.utils';

function setup(requireApproval: boolean, failLedger = false) {
  let stored: any = null;
  const created = {
    id: 4, expense_number: 'EXP-4', expense_date: '2026-09-09', category: 'صيانة',
    sub_category: null, amount: 100, tax_amount: 14, total_amount: 114,
    payment_method: 'نقدي', payment_status: 'مدفوع', approval_status: 'معلق',
    approved_by: null, approved_at: null, rejection_notes: null, description: null,
    vendor: null, invoice_number: null, branch_id: 1, department_id: null,
    attachments: null, notes: null, created_by: 7, created_at: new Date(), updated_at: new Date(),
    is_recurring: false, recurring_frequency: null, next_recurring_date: null,
  };
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    fin_expenses: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => {
        stored = { ...created, ...data };
        return stored;
      }),
    },
    club_gym_policies: { findUnique: jest.fn().mockResolvedValue({ require_expense_approval: requireApproval }) },
  };
  const prisma = { ...tx, $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
    try { return await fn(tx); } catch (error) { stored = null; throw error; }
  } };
  const ledger = { postExpenseApproval: jest.fn().mockImplementation(async () => {
    if (failLedger) throw new Error('ledger unavailable');
  }) };
  const service = new ExpensesService(prisma as never, ledger as never,
    { allowedBranchIds: () => [1], isBranchAllowed: () => true } as never, {} as never);
  return { service, ledger, tx, stored: () => stored };
}

describe('manual expense approval policy', () => {
  it('auto-approves and posts tax-inclusive expense atomically when approval is disabled', async () => {
    const s = setup(false);
    const result = await s.service.create({ category: 'صيانة', amount: 100, taxAmount: 14, branchId: 1 } as never, 7);
    expect(result.approvalStatus).toBe(EXPENSE_APPROVED);
    expect(s.ledger.postExpenseApproval).toHaveBeenCalledWith(
      expect.objectContaining({ expenseId: 4, totalAmount: 114, createdBy: 7 }), s.tx,
    );
  });

  it('keeps manual approval and skips ledger posting when enabled', async () => {
    const s = setup(true);
    const result = await s.service.create({ category: 'صيانة', amount: 100, branchId: 1 } as never, 7);
    expect(result.approvalStatus).not.toBe(EXPENSE_APPROVED);
    expect(s.ledger.postExpenseApproval).not.toHaveBeenCalled();
  });

  it('rolls the approved expense back when accounting fails', async () => {
    const s = setup(false, true);
    await expect(s.service.create({ category: 'صيانة', amount: 100, branchId: 1 } as never, 7)).rejects.toThrow('ledger unavailable');
    expect(s.stored()).toBeNull();
  });
});
