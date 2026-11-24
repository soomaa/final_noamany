import {
  methodGroup,
  normalizeCashierMethod,
  resolveCashierPeriod,
  summarizeDailyCashier,
} from './daily-cashier-report.util';

describe('daily cashier aggregation', () => {
  it('normalizes stored payment methods into cash / card / transfer groups', () => {
    expect(normalizeCashierMethod('نقدي')).toBe('cash');
    expect(normalizeCashierMethod(null)).toBe('cash');
    expect(normalizeCashierMethod('فيزا')).toBe('visa');
    expect(methodGroup('visa')).toBe('card');
    expect(methodGroup('card')).toBe('card');
    expect(methodGroup('instapay')).toBe('transfer');
    expect(methodGroup('محفظة')).toBe('transfer');
    expect(methodGroup('mixed')).toBe('other');
  });

  it('computes the drawer cash, the split and the reconciliation, keeping the bar apart', () => {
    const result = summarizeDailyCashier(
      [
        { source: 'subscription', amount: 500, userId: 1, payments: [{ method: 'cash', amount: 200 }, { method: 'visa', amount: 300 }] },
        { source: 'installment', amount: 100.1, userId: 2, payments: [{ method: 'cash', amount: 100.1 }] },
        { source: 'quick_service', amount: 50, userId: 1, payments: [{ method: 'instapay', amount: 50 }] },
        { source: 'locker', amount: 75, userId: 2, payments: [] },
        { source: 'other', amount: 20, userId: 2, payments: [{ method: 'cash', amount: 15 }] },
        { source: 'bar', amount: 45, userId: 3, payments: [{ method: 'cash', amount: 30 }, { method: 'wallet', amount: 15 }] },
      ],
      [
        { amount: 60, method: 'نقدي', userId: 2, isRefund: false },
        { amount: 500, method: 'تحويل بنكي', userId: 2, isRefund: false },
        { amount: 25, method: 'cash', userId: 1, isRefund: true },
      ],
    );

    expect(result.receptionCollected).toBe(745.1);
    expect(result.subscriptionsAmount).toBe(600.1);
    expect(result.servicesAmount).toBe(125);
    expect(result.otherReceiptsAmount).toBe(20);
    expect(result.receptionByMethod).toEqual({ cash: 390.1, visa: 300, instapay: 50 });
    expect(result.paymentsTotal).toBe(740.1);
    expect(result.reconciliationDifference).toBe(5);
    expect(result.unreconciledCount).toBe(1);
    expect(result.isReconciled).toBe(false);
    expect(result.bar).toEqual({ count: 1, collected: 45, byMethod: { cash: 30, wallet: 15 } });
    expect(result.expenses).toMatchObject({ count: 3, total: 560, refundsTotal: 25 });
    expect(result.drawer).toEqual({
      subscriptionsCash: 300.1,
      servicesCash: 75,
      otherReceiptsCash: 15,
      barCash: 30,
      collectedCash: 420.1,
      expensesCash: 60,
      refundsCash: 25,
      cashInDrawer: 335.1,
    });
    const byUser = Object.fromEntries(result.byUser.map((row) => [row.userId, row]));
    expect(byUser[1]).toMatchObject({ cash: 200, card: 300, transfer: 50, total: 550, refundsCash: 25, cashInDrawer: 175 });
    expect(byUser[2]).toMatchObject({ cash: 190.1, total: 195.1, expensesCash: 60, expensesTotal: 560, cashInDrawer: 130.1 });
    expect(byUser[3]).toMatchObject({ cash: 30, transfer: 15, barTotal: 45, receptionTotal: 0, cashInDrawer: 30 });
    // Every user's drawer adds up to the overall drawer.
    expect(result.byUser.reduce((sum, row) => sum + row.cashInDrawer, 0)).toBeCloseTo(result.drawer.cashInDrawer, 2);
  });

  it('resolves the period: today by default, single legacy date, clamps to today, rejects reversed ranges', () => {
    const today = '2026-11-24';
    expect(resolveCashierPeriod({}, today)).toEqual({ dateFrom: today, dateTo: today });
    expect(resolveCashierPeriod({ date: '2026-11-20' }, today)).toEqual({ dateFrom: '2026-11-20', dateTo: '2026-11-20' });
    expect(resolveCashierPeriod({ dateFrom: '2026-11-01' }, today)).toEqual({ dateFrom: '2026-11-01', dateTo: today });
    expect(resolveCashierPeriod({ dateFrom: '2026-11-01', dateTo: '2026-12-31' }, today)).toEqual({ dateFrom: '2026-11-01', dateTo: today });
    expect(() => resolveCashierPeriod({ dateFrom: '2026-11-10', dateTo: '2026-11-01' }, today)).toThrow();
    expect(() => resolveCashierPeriod({ dateFrom: '24/11/2026' }, today)).toThrow('تاريخ غير صالح');
    expect(() => resolveCashierPeriod({ dateFrom: '2024-01-01' }, today, 366)).toThrow();
  });
});
