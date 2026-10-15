import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Allocate the saved invoice's waste COGS in cents without changing stock quantities. */
export function refundWasteCosts(rows: Array<{ quantity: number; unitCost: number }>, total: number): number[] {
  const cents = Math.round(total * 100);
  if (cents === 0) return rows.map(() => 0);
  if (!Number.isSafeInteger(cents) || cents < 0 || !rows.length
    || rows.some(row => !Number.isFinite(row.quantity) || !Number.isFinite(row.unitCost) || row.quantity <= 0 || row.unitCost < 0)) {
    throw new BadRequestException('تعذر مطابقة تكلفة هالك الاسترداد');
  }
  const weights = rows.map(row => new Prisma.Decimal(row.quantity).times(row.unitCost));
  const sum = weights.reduce((a, b) => a.plus(b), new Prisma.Decimal(0));
  if (sum.isZero()) throw new BadRequestException('تعذر مطابقة تكلفة هالك الاسترداد مع الحركات الأصلية');
  const shares = weights.map(weight => weight.times(cents).div(sum));
  const allocations = shares.map(share => share.floor().toNumber());
  const remaining = cents - allocations.reduce((a, b) => a + b, 0);
  const priority = shares.map((share, index) => ({ index, fraction: share.minus(allocations[index]) }))
    .sort((a, b) => b.fraction.comparedTo(a.fraction) || a.index - b.index);
  for (let index = 0; index < remaining; index++) allocations[priority[index].index]++;
  return allocations.map(value => value / 100);
}
