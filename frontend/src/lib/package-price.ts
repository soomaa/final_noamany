import { roundSessionMoney, type SessionPriceRow } from '@/lib/session-price-matrix';

export function packagePriceForBranch(
  type: { price: number; branchPrices?: Array<{ branchId: number; price: number }> | null },
  branchId?: number | null,
): number {
  if (branchId != null && type.branchPrices?.length) {
    const hit = type.branchPrices.find((row) => row.branchId === branchId);
    if (hit && Number.isFinite(hit.price) && hit.price >= 0) return hit.price;
  }
  return Number(type.price) || 0;
}

export function sessionMatrixForBranchPrice(
  matrix: SessionPriceRow[] | undefined,
  defaultPrice: number,
  branchPrice: number,
): SessionPriceRow[] | undefined {
  if (!matrix?.length || !defaultPrice || defaultPrice === branchPrice) return matrix;
  const factor = branchPrice / defaultPrice;
  return matrix.map((row) => ({ ...row, price: roundSessionMoney(row.price * factor) }));
}
