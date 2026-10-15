import { SalesPaymentMethod, ShiftSessionStatus } from '@prisma/client';
import { ShiftSessionsService } from './shift-sessions.service';

describe('completed invoice shift corrections', () => {
  const snapshot = (overrides: Record<string, unknown> = {}) => ({
    totalAmount: 100, collectedAmount: 100, discountAmount: 0, taxAmount: 0,
    paymentMethod: SalesPaymentMethod.cash, payments: [], ...overrides,
  });
  function setup(overrides: Record<string, unknown> = {}, drawer: { direction: string; amount: number }[] = []) {
    const session: Record<string, any> = { id: 11, status: ShiftSessionStatus.open,
      opening_balance: 20, total_sales: 100, total_cash: 100, total_card: 0,
      total_wallet: 0, total_transfer: 0, total_discount: 0, total_tax: 0,
      transactions_count: 1, expected_closing_balance: 120, ...overrides };
    const tx = { $queryRaw: jest.fn(), sales_shift_sessions: {
      findUnique: jest.fn(async () => {
        expect(tx.$queryRaw).toHaveBeenCalled();
        return session;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        for (const [field, value] of Object.entries(data)) {
          if (value && typeof value === 'object' && 'increment' in value) session[field] += Number(value.increment);
          else session[field] = Number(value);
        }
        return session;
      }),
    }, sales_cash_drawer_transactions: { findMany: jest.fn().mockResolvedValue(drawer) } };
    const service = new ShiftSessionsService({} as never, {} as never, {} as never, {} as never, {} as never);
    return { service, tx, session };
  }

  it('adds only the difference and leaves invoice count unchanged', async () => {
    const { service, tx, session } = setup();
    await service.applySaleEditToSession(tx as never, 11, {
      before: snapshot(), after: snapshot({ totalAmount: 150, collectedAmount: 150, discountAmount: 5, taxAmount: 10 }),
    } as never);
    expect(session).toEqual(expect.objectContaining({ total_sales: 150, total_cash: 150,
      total_discount: 5, total_tax: 10, transactions_count: 1, expected_closing_balance: 170 }));
  });

  it('moves mixed allocations across channels while leaving the gross sale unchanged', async () => {
    const { service, tx, session } = setup({ total_cash: 60, total_card: 40, expected_closing_balance: 80 });
    await service.applySaleEditToSession(tx as never, 11, {
      before: snapshot({ paymentMethod: SalesPaymentMethod.mixed,
        payments: [{ method: SalesPaymentMethod.cash, amount: 60 }, { method: SalesPaymentMethod.card, amount: 40 }] }),
      after: snapshot({ paymentMethod: SalesPaymentMethod.mixed,
        payments: [{ method: SalesPaymentMethod.cash, amount: 20 }, { method: SalesPaymentMethod.wallet, amount: 30 },
          { method: SalesPaymentMethod.transfer, amount: 50 }] }),
    } as never);
    expect(session).toEqual(expect.objectContaining({ total_sales: 100, total_cash: 20, total_card: 0,
      total_wallet: 30, total_transfer: 50, transactions_count: 1, expected_closing_balance: 40 }));
  });

  it('changes deferred invoice value without changing cash', async () => {
    const { service, tx, session } = setup({ total_cash: 0, expected_closing_balance: 20 });
    await service.applySaleEditToSession(tx as never, 11, {
      before: snapshot({ collectedAmount: 0 }), after: snapshot({ totalAmount: 60, collectedAmount: 0 }),
    } as never);
    expect(session).toEqual(expect.objectContaining({ total_sales: 60, total_cash: 0,
      transactions_count: 1, expected_closing_balance: 20 }));
  });

  it('rejects cash reductions that exceed the drawer after posted expenses', async () => {
    const { service, tx, session } = setup({}, [{ direction: 'out', amount: 100 }]);
    await expect(service.applySaleEditToSession(tx as never, 11, {
      before: snapshot(), after: snapshot({ totalAmount: 70, collectedAmount: 70 }),
    } as never)).rejects.toThrow('النقدية');
    expect(session.total_cash).toBe(100);
    expect(tx.sales_shift_sessions.update).not.toHaveBeenCalled();
  });

  it('accepts a cash return equal to the available drawer without rounding below zero', async () => {
    const { service, tx, session } = setup({}, [{ direction: 'out', amount: 100 }]);
    await service.applySaleEditToSession(tx as never, 11, {
      before: snapshot(), after: snapshot({ totalAmount: 80, collectedAmount: 80 }),
    } as never);
    expect(session.expected_closing_balance).toBe(0);
  });

  it('books the correction on a closed shift when explicitly allowed, without a live-drawer guard', async () => {
    const { service, tx, session } = setup({ status: ShiftSessionStatus.closed }, [{ direction: 'out', amount: 100 }]);
    await service.applySaleEditToSession(tx as never, 11, {
      before: snapshot(), after: snapshot({ totalAmount: 70, collectedAmount: 70 }),
    } as never, { allowClosedSession: true });
    expect(session).toEqual(expect.objectContaining({ total_sales: 70, total_cash: 70,
      transactions_count: 1, expected_closing_balance: -10 }));
  });

  it('still guards the drawer on an open shift even when the closed-session flag is passed', async () => {
    const { service, tx } = setup({}, [{ direction: 'out', amount: 100 }]);
    await expect(service.applySaleEditToSession(tx as never, 11, {
      before: snapshot(), after: snapshot({ totalAmount: 70, collectedAmount: 70 }),
    } as never, { allowClosedSession: true })).rejects.toThrow('النقدية');
    expect(tx.sales_shift_sessions.update).not.toHaveBeenCalled();
  });

  it('refuses a shift closed while the invoice editor was open', async () => {
    const { service, tx } = setup({ status: ShiftSessionStatus.closed });
    await expect(service.applySaleEditToSession(tx as never, 11, {
      before: snapshot(), after: snapshot({ totalAmount: 150, collectedAmount: 150 }),
    } as never)).rejects.toThrow('الوردية');
    expect(tx.sales_shift_sessions.update).not.toHaveBeenCalled();
  });
});
