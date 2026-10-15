import { BadRequestException } from '@nestjs/common';
import { ShiftSessionStatus } from '@prisma/client';
import { ExpensesService } from './expenses.service';

const user = { sub: 9, level: 2, branchIds: [1] } as never;

function makeService(options?: { openSession?: boolean; available?: number }) {
  const openSession = options?.openSession ?? true;
  const available = options?.available ?? 200;
  const createdExpense = {
    id: 41,
    expense_number: 'EXP-2026-000041',
    expense_date: '2026-09-07',
    category: 'مرافق',
    sub_category: null,
    amount: 90,
    tax_amount: 10,
    total_amount: 100,
    payment_method: 'نقدي',
    payment_status: 'مدفوع',
    approval_status: 'معلق',
    approved_by: null,
    approved_at: null,
    rejection_notes: null,
    description: 'فاتورة مياه',
    vendor: null,
    invoice_number: null,
    branch_id: 1,
    department_id: null,
    attachments: null,
    notes: null,
    is_recurring: false,
    recurring_frequency: null,
    next_recurring_date: null,
    created_by: 9,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date('2026-09-07T10:00:00Z'),
    updated_at: new Date('2026-09-07T10:00:00Z'),
  };
  const session = {
    id: 7,
    branch_id: 1,
    user_id: 15,
    status: ShiftSessionStatus.open,
    opening_balance: available,
    total_cash: 0,
  };
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    fin_expenses: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(createdExpense),
    },
    club_gym_policies: {
      findUnique: jest.fn().mockResolvedValue({ require_expense_approval: true }),
    },
    sales_shift_sessions: {
      findFirst: jest.fn().mockResolvedValue(openSession ? session : null),
      findUnique: jest.fn().mockResolvedValue(openSession ? session : null),
      update: jest.fn().mockResolvedValue(undefined),
    },
    sales_cash_drawer_transactions: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 15 }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const branchScope = {
    allowedBranchIds: jest.fn().mockReturnValue([1]),
    isBranchAllowed: jest.fn().mockReturnValue(true),
  };
  const service = new ExpensesService(
    prisma as never,
    {} as never,
    branchScope as never,
    {} as never,
  );
  return { service, tx };
}

describe('expense cash-drawer deduction', () => {
  it('deducts the expense total including tax from the branch open drawer even when another user owns it', async () => {
    const { service, tx } = makeService();

    const result = await service.create({
      expenseDate: '2026-09-07',
      category: 'مرافق',
      amount: 90,
      taxAmount: 10,
      paymentMethod: 'نقدي',
      paymentStatus: 'مدفوع',
      description: 'فاتورة مياه',
      branchId: 1,
      deductFromDrawer: true,
    }, 9, user);

    expect(tx.sales_shift_sessions.findFirst).toHaveBeenCalledWith({
      where: { branch_id: 1, status: ShiftSessionStatus.open },
      orderBy: { start_time: 'desc' },
    });
    expect(tx.sales_cash_drawer_transactions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reference: 'FIN-EXP-41',
        shift_session_id: 7,
        movement_type: 'petty_expense',
        direction: 'out',
        amount: 100,
        created_by: 9,
      }),
    });
    expect(tx.sales_shift_sessions.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { expected_closing_balance: 100 },
    });
    expect(result).toEqual(expect.objectContaining({ id: 41, drawerDeducted: true }));
  });

  it('does not create the expense when the branch has no open shift', async () => {
    const { service, tx } = makeService({ openSession: false });

    await expect(service.create({
      category: 'مرافق',
      amount: 100,
      paymentMethod: 'نقدي',
      paymentStatus: 'مدفوع',
      branchId: 1,
      deductFromDrawer: true,
    }, 9, user)).rejects.toThrow(new BadRequestException('لا توجد وردية مفتوحة في هذا الفرع لخصم المصروف من الدرج'));
    expect(tx.fin_expenses.create).not.toHaveBeenCalled();
  });

  it('does not create the expense when drawer cash is insufficient', async () => {
    const { service, tx } = makeService({ available: 75 });

    await expect(service.create({
      category: 'مرافق',
      amount: 90,
      taxAmount: 10,
      paymentMethod: 'نقدي',
      paymentStatus: 'مدفوع',
      branchId: 1,
      deductFromDrawer: true,
    }, 9, user)).rejects.toThrow(new BadRequestException('الرصيد المتاح في الدرج 75.00 ج.م فقط'));
    expect(tx.fin_expenses.create).not.toHaveBeenCalled();
  });

  it('creates a regular expense without touching the drawer when the toggle is off', async () => {
    const { service, tx } = makeService();

    const result = await service.create({
      category: 'تحويل بنكي',
      amount: 50,
      paymentMethod: 'تحويل',
      paymentStatus: 'مدفوع',
      branchId: 1,
      deductFromDrawer: false,
    }, 9, user);

    expect(tx.sales_shift_sessions.findFirst).not.toHaveBeenCalled();
    expect(tx.sales_cash_drawer_transactions.create).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: 41, drawerDeducted: false }));
  });
});
