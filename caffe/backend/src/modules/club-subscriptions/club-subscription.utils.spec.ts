import {
  primaryClubPaymentMethod,
  resolveClubPayments,
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
