export interface OrderReviewInputLine {
  name: string;
  quantity: number;
  unitPrice: number;
}

export function buildOrderReview<T extends OrderReviewInputLine>(lines: T[]) {
  const reviewLines = lines.map((line) => {
    const quantity = Number.isFinite(line.quantity)
      ? Math.max(0, line.quantity)
      : 0;
    const unitPrice = Number.isFinite(line.unitPrice)
      ? Math.max(0, line.unitPrice)
      : 0;

    return {
      ...line,
      quantity,
      unitPrice,
      lineTotal: quantity * unitPrice,
    };
  });

  return {
    lines: reviewLines,
    productCount: reviewLines.length,
    totalUnits: reviewLines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: reviewLines.reduce((sum, line) => sum + line.lineTotal, 0),
  };
}
