import { roundMoney } from '../accounting/accounting.utils';

export function expectedDrawerBalance(opening: number, cashSales: number, adjustments: number): number {
  return roundMoney(opening + cashSales + adjustments);
}

export function drawerDifference(actual: number, expected: number): number {
  return roundMoney(actual - expected);
}

export function custodyOutstanding(issued: number, returned: number): number {
  return Math.max(0, roundMoney(issued - returned));
}

export function drawerAllocationMatches(actual: number, transferredOrRetained: number, cashDrop: number): boolean {
  return Math.abs(roundMoney(transferredOrRetained) + roundMoney(cashDrop) - roundMoney(actual)) <= 0.001;
}
