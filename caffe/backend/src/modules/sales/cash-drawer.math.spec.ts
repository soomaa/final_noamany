import {
  custodyOutstanding,
  drawerAllocationMatches,
  drawerDifference,
  expectedDrawerBalance,
} from './cash-drawer.math';

describe('cash drawer calculations', () => {
  it('includes opening balance, cash sales and signed drawer movements', () => {
    expect(expectedDrawerBalance(100, 641.16, -30)).toBe(711.16);
    expect(expectedDrawerBalance(100, 641.16, 20)).toBe(761.16);
  });

  it('calculates shortage and surplus without floating point noise', () => {
    expect(drawerDifference(700, 711.16)).toBe(-11.16);
    expect(drawerDifference(712, 711.16)).toBe(0.84);
  });

  it('tracks partial and full custody returns and never exposes a negative balance', () => {
    expect(custodyOutstanding(100, 35)).toBe(65);
    expect(custodyOutstanding(100, 100)).toBe(0);
    expect(custodyOutstanding(100, 101)).toBe(0);
  });

  it('requires the retained or transferred amount plus cash drop to equal actual cash', () => {
    expect(drawerAllocationMatches(741.16, 100, 641.16)).toBe(true);
    expect(drawerAllocationMatches(741.16, 100, 640)).toBe(false);
  });
});
