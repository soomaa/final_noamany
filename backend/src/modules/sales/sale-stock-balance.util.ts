import { BadRequestException } from '@nestjs/common';

/** Net the immutable sale/edit movement history before another edit or reversal. */
export function saleStockBalance<T extends { product_id: number; warehouse_id: number; direction: string; quantity: unknown; unit_cost: unknown }>(movements: T[]) {
  const balances = new Map<string, { row: T; quantity: number; cost: number }>();
  for (const row of movements) {
    const key = `${row.product_id}:${row.warehouse_id}`;
    const balance = balances.get(key) ?? { row, quantity: 0, cost: 0 };
    const signed = (row.direction === 'out' ? 1 : -1) * Math.abs(Number(row.quantity));
    balance.quantity += signed;
    balance.cost += signed * Number(row.unit_cost);
    balances.set(key, balance);
  }
  return [...balances.values()].flatMap(({ row, quantity, cost }) => {
    if (quantity < -0.000001 || cost < -0.01) throw new BadRequestException('حركات مخزون الفاتورة غير متوازنة؛ راجع المخزون قبل التعديل');
    if (quantity < 0.000001) return [];
    return [{ ...row, direction: 'out', quantity: Math.round(quantity * 1e6) / 1e6, unit_cost: Math.max(0, cost / quantity) }];
  });
}

