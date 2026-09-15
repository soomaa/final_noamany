import { saleStockBalance } from './sale-stock-balance.util';

describe('inventory still consumed by an edited invoice', () => {
  const move = (direction: 'in' | 'out', quantity: number, unit_cost = 5, warehouse_id = 2) => ({ product_id: 7, warehouse_id, direction, quantity, unit_cost });
  it('nets prior edits so a later edit or refund never returns stock twice', () => {
    const result = saleStockBalance([move('out', 2), move('in', 2), move('out', 3), move('in', 3), move('out', 1)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ quantity: 1, unit_cost: 5, warehouse_id: 2 });
  });
  it('keeps warehouses separate and uses remaining movement cost', () => {
    expect(saleStockBalance([move('out', 2, 5), move('in', 2, 5), move('out', 3, 8), move('out', 1, 4, 3)]))
      .toEqual([expect.objectContaining({ quantity: 3, unit_cost: 8, warehouse_id: 2 }), expect.objectContaining({ quantity: 1, unit_cost: 4, warehouse_id: 3 })]);
  });
  it('removes zero balances and rejects over-returned stock history', () => {
    expect(saleStockBalance([move('out', 1), move('in', 1)])).toEqual([]);
    expect(() => saleStockBalance([move('out', 1), move('in', 2)])).toThrow();
  });
});

