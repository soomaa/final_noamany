import { refundWasteCosts } from './refund-waste-cost.util';
import { saleStockBalance } from './sale-stock-balance.util';

describe('refund waste precision and accounting totals', () => {
  it('preserves 7.5 grams and the matching recorded cost', () => {
    expect(refundWasteCosts([{ quantity: 0.0075, unitCost: 1000 }], 7.5)).toEqual([7.5]);
  });

  it('allocates a rounding cent once when two ingredient costs each round up', () => {
    expect(refundWasteCosts([{ quantity: 0.0075, unitCost: 10 }, { quantity: 0.0075, unitCost: 10 }], 0.15)).toEqual([0.08, 0.07]);
  });

  it('keeps mixed-return waste aligned with the saved COGS remainder', () => {
    const costs = refundWasteCosts([{ quantity: 1, unitCost: 3.333333 }, { quantity: 1, unitCost: 1.666667 }], 4.99);
    expect(costs).toEqual([3.33, 1.66]);
    expect(costs.reduce((a, b) => a + b, 0)).toBeCloseTo(4.99);
  });

  it('records zero-cost components without inventing a cost', () => {
    expect(refundWasteCosts([{ quantity: 0.000001, unitCost: 1000 }], 0)).toEqual([0]);
    expect(() => refundWasteCosts([{ quantity: 1, unitCost: 0 }], 10)).toThrow('مطابقة');
  });

  it('retains the last micro-unit after subtracting historical edited quantities', () => {
    const rows = [{ product_id: 1, warehouse_id: 1, direction: 'out', quantity: 0.001, unit_cost: 1000 },
      { product_id: 1, warehouse_id: 1, direction: 'in', quantity: 0.000999, unit_cost: 1000 }];
    expect(saleStockBalance(rows)[0].quantity).toBe(0.000001);
    expect(() => saleStockBalance(rows.map(row => ({ ...row, direction: row.direction === 'out' ? 'in' : 'out' })))).toThrow('متوازنة');
  });
});
