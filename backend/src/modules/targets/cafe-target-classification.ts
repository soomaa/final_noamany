import { BadRequestException } from '@nestjs/common';

export type CafeBusinessClassificationValue =
  | 'protein'
  | 'bar'
  | 'management_withdrawal';

type ClassifiedTargetLine = {
  classification: CafeBusinessClassificationValue | null;
  amount: number;
  name?: string;
};

type CollectedSaleLine = {
  classification: CafeBusinessClassificationValue | null;
  grossAmount: number;
  paidAmount: number;
};

/**
 * Resolve the persisted catalogue fact used for an immutable invoice-line snapshot.
 * Product names and display categories are deliberately absent from the decision.
 */
export function requireSaleClassification(product: {
  name: string;
  businessClassification: CafeBusinessClassificationValue | null | undefined;
}): 'protein' | 'bar' {
  if (
    product.businessClassification !== 'protein' &&
    product.businessClassification !== 'bar'
  ) {
    throw new BadRequestException(
      `المنتج ${product.name} غير مصنف ضمن Protein أو Bar؛ حدّث تصنيف المنتج قبل البيع`,
    );
  }
  return product.businessClassification;
}

/** The payroll target base is the explicit Protein subtotal only. */
export function summarizeCafeTargetLines(lines: ClassifiedTargetLine[]) {
  let proteinAmount = 0;
  let barAmount = 0;
  let managementWithdrawalCount = 0;

  for (const line of lines) {
    if (line.classification === 'protein') proteinAmount += line.amount;
    if (line.classification === 'bar') barAmount += line.amount;
    if (line.classification === 'management_withdrawal') {
      managementWithdrawalCount += 1;
    }
  }

  return {
    proteinAmount: Math.round(proteinAmount * 100) / 100,
    barAmount: Math.round(barAmount * 100) / 100,
    managementWithdrawalCount,
    targetAmount: Math.round(proteinAmount * 100) / 100,
  };
}

/**
 * Allocate the sale-level amount actually collected back to its immutable line
 * snapshots.  This preserves the pre-Task-7 payroll basis while still allowing
 * Protein and Bar to be reconciled separately.  Free units have no weight and
 * integer-cent allocation prevents the classified rows drifting from the sale.
 */
export function allocateCollectedCafeSale<T extends CollectedSaleLine>(
  lines: T[],
  collectedAmount: number,
): Array<T & { amount: number }> {
  if (!lines.length) return [];
  const collectedCents = Math.max(0, Math.round(Number(collectedAmount || 0) * 100));
  const weights = lines.map((line) => Math.max(0, Number(line.paidAmount || 0)));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (collectedCents === 0 || totalWeight === 0) {
    return lines.map((line) => ({ ...line, amount: 0 }));
  }

  const exact = weights.map((weight) => (collectedCents * weight) / totalWeight);
  const cents = exact.map(Math.floor);
  let remainder = collectedCents - cents.reduce((sum, value) => sum + value, 0);
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remainder; index += 1) {
    cents[byFraction[index].index] += 1;
  }

  return lines.map((line, index) => ({ ...line, amount: cents[index] / 100 }));
}
