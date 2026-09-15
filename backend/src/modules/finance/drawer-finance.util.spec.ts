import { syncDrawerFinance } from './drawer-finance.util';

describe('drawer finance projection', () => {
  it('does not create a second expense for a drawer movement created by the finance expense form', async () => {
    const findFirst = jest.fn();
    const tx = { fin_expenses: { findFirst } };

    await syncDrawerFinance(tx as never, {
      id: 18,
      reference: 'FIN-EXP-41',
      movement_type: 'petty_expense',
      status: 'posted',
    } as never);

    expect(findFirst).not.toHaveBeenCalled();
  });
});

