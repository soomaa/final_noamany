import {
  primaryClubPaymentMethod,
  resolveClubPayments,
  selectCurrentSubscriptionsForMemberDisplay,
  toClubPaymentMethod,
} from './club-subscription.utils';

describe('toClubPaymentMethod', () => {
  it.each([
    ['cash', 'cash'],
    ['visa', 'visa'],
    ['wallet', 'wallet'],
    ['bank', 'bank'],
    ['transfer', 'transfer'],
    ['instapay', 'instapay'],
    ['محفظة', 'wallet'],
    ['حساب بنكي', 'bank'],
    ['إنستا باي', 'instapay'],
  ])('preserves the payment channel %s', (input, expected) => {
    expect(toClubPaymentMethod(input)).toBe(expected);
  });
});

describe('resolveClubPayments', () => {
  it('puts the whole amount on the single method when no split is given', () => {
    expect(resolveClubPayments(500, 'visa')).toEqual([{ method: 'visa', amount: 500 }]);
  });

  it('defaults to cash when no method is given at all', () => {
    expect(resolveClubPayments(200)).toEqual([{ method: 'cash', amount: 200 }]);
  });

  it('returns nothing to collect for a zero payment', () => {
    expect(resolveClubPayments(0, 'cash')).toEqual([]);
  });

  it('keeps a split that adds up to the paid amount', () => {
    expect(
      resolveClubPayments(500, 'cash', [
        { method: 'cash', amount: 300 },
        { method: 'transfer', amount: 200 },
      ]),
    ).toEqual([
      { method: 'cash', amount: 300 },
      { method: 'transfer', amount: 200 },
    ]);
  });

  it('merges repeated methods into one line', () => {
    expect(
      resolveClubPayments(500, 'cash', [
        { method: 'cash', amount: 300 },
        { method: 'cash', amount: 200 },
      ]),
    ).toEqual([{ method: 'cash', amount: 500 }]);
  });

  it('ignores zero-amount rows and falls back when nothing is left', () => {
    expect(resolveClubPayments(150, 'visa', [{ method: 'cash', amount: 0 }])).toEqual([
      { method: 'visa', amount: 150 },
    ]);
  });

  it.each([
    ['under-allocated', 400],
    ['over-allocated', 600],
  ])('rejects an %s split', (_label, cashAmount) => {
    expect(() =>
      resolveClubPayments(500, 'cash', [{ method: 'cash', amount: cashAmount }]),
    ).toThrow(/لا يساوي المبلغ المدفوع/);
  });
});

describe('primaryClubPaymentMethod', () => {
  it('picks the biggest slice', () => {
    expect(
      primaryClubPaymentMethod([
        { method: 'cash', amount: 200 },
        { method: 'transfer', amount: 300 },
      ]),
    ).toBe('transfer');
  });

  it('keeps the first method on a tie', () => {
    expect(
      primaryClubPaymentMethod([
        { method: 'cash', amount: 250 },
        { method: 'transfer', amount: 250 },
      ]),
    ).toBe('cash');
  });

  it('is null when nothing was collected', () => {
    expect(primaryClubPaymentMethod([])).toBeNull();
  });
});

describe('selectCurrentSubscriptionsForMemberDisplay', () => {
  it('keeps only the active period and hides expired/frozen renewals of the same plan', () => {
    const rows = [
      {
        id: 40,
        status: 'active',
        subscriptionTypeId: 7,
        subscriptionType: 'one year family rate',
        subscriptionEndDate: '2027-08-20',
      },
      {
        id: 30,
        status: 'expired',
        subscriptionTypeId: 7,
        subscriptionType: 'one year family rate',
        subscriptionEndDate: '2026-08-20',
      },
      {
        id: 20,
        status: 'frozen',
        subscriptionTypeId: 7,
        subscriptionType: 'one year family rate',
        subscriptionEndDate: '2025-08-20',
      },
      {
        id: 10,
        status: 'expired',
        subscriptionTypeId: 7,
        subscriptionType: 'one year family rate',
        subscriptionEndDate: '2024-08-20',
      },
    ];

    expect(selectCurrentSubscriptionsForMemberDisplay(rows).map((r) => r.id)).toEqual([40]);
  });

  it('keeps a frozen current subscription when it is the only working period', () => {
    const rows = [
      {
        id: 2,
        status: 'frozen',
        subscriptionTypeId: 3,
        subscriptionType: 'monthly',
        subscriptionEndDate: '2026-09-01',
      },
      {
        id: 1,
        status: 'expired',
        subscriptionTypeId: 3,
        subscriptionType: 'monthly',
        subscriptionEndDate: '2026-06-01',
      },
    ];

    expect(selectCurrentSubscriptionsForMemberDisplay(rows).map((r) => r.id)).toEqual([2]);
  });

  it('keeps independent concurrent plans of different types', () => {
    const rows = [
      {
        id: 5,
        status: 'active',
        subscriptionTypeId: 1,
        subscriptionType: 'gym',
        subscriptionEndDate: '2026-12-01',
      },
      {
        id: 6,
        status: 'active',
        subscriptionTypeId: 2,
        subscriptionType: 'spa',
        subscriptionEndDate: '2026-10-01',
      },
      {
        id: 4,
        status: 'expired',
        subscriptionTypeId: 1,
        subscriptionType: 'gym',
        subscriptionEndDate: '2026-01-01',
      },
    ];

    expect(selectCurrentSubscriptionsForMemberDisplay(rows).map((r) => r.id)).toEqual([5, 6]);
  });

  it('keeps the newest expired period when nothing is live', () => {
    const rows = [
      {
        id: 8,
        status: 'expired',
        subscriptionTypeId: 9,
        subscriptionType: 'family',
        subscriptionEndDate: '2025-01-01',
      },
      {
        id: 9,
        status: 'expired',
        subscriptionTypeId: 9,
        subscriptionType: 'family',
        subscriptionEndDate: '2026-01-01',
      },
    ];

    expect(selectCurrentSubscriptionsForMemberDisplay(rows).map((r) => r.id)).toEqual([9]);
  });

  it('keeps active and upcoming together when a renewal has not started yet', () => {
    const rows = [
      {
        id: 11,
        status: 'active',
        subscriptionTypeId: 4,
        subscriptionType: 'annual',
        subscriptionEndDate: '2026-12-31',
      },
      {
        id: 12,
        status: 'upcoming',
        subscriptionTypeId: 4,
        subscriptionType: 'annual',
        subscriptionEndDate: '2027-12-31',
      },
    ];

    expect(selectCurrentSubscriptionsForMemberDisplay(rows).map((r) => r.id)).toEqual([
      11, 12,
    ]);
  });
});
