import { planCompletedSaleStock } from './completed-sale-stock-plan.util';

describe('completed sale historical stock plan', () => {
  const original = (quantity = 2, unit_cost = 5) => ({ cafe_product_id: 7, cafe_variant_id: null, product_id: 44, quantity, unit_cost });
  const resolved = (quantity = 2, unitCost = 8, ingredient = 44, cafeProductId = 7) => ({ cafeProductId, cafeVariantId: null, productId: ingredient,
    quantity, unitCost, consumption: [{ productId: ingredient, quantity, unitCost }] });
  const history = [{ product_id: 44, warehouse_id: 2, quantity: 2, unit_cost: 5 }];
  const plan = (resolvedItems = [resolved()], reconstructedOriginalItems = [resolved()]) => planCompletedSaleStock({
    originalItems: [original()], resolvedItems, reconstructedOriginalItems, history, warehouseId: 2,
  });

  it('keeps exact historical consumption and costs on notes-only edits after recipe or cost changes', () => {
    const result = plan([resolved(2, 20, 88)], [resolved(2, 20, 88)]);
    expect(result.unchanged).toBe(true);
    expect(result.desiredConsumption).toEqual([{ productId: 44, warehouseId: 2, quantity: 2, unitCost: 5 }]);
    expect(result.perLineUnitCosts).toEqual([5]);
  });

  it('charges only added units at the new cost', () => {
    const result = plan([resolved(3)]);
    expect(result.unchanged).toBe(false);
    expect(result.desiredConsumption).toEqual([{ productId: 44, warehouseId: 2, quantity: 3, unitCost: 6 }]);
    expect(result.perLineUnitCosts).toEqual([6]);
  });

  it('returns reduced quantities at historical cost', () => {
    const result = plan([resolved(1)]);
    expect(result.desiredConsumption).toEqual([{ productId: 44, warehouseId: 2, quantity: 1, unitCost: 5 }]);
    expect(result.perLineUnitCosts).toEqual([5]);
  });

  it('rejects quantity-changing edits when historical recipes cannot be reconstructed', () => {
    expect(() => plan([resolved(3, 8, 88)], [resolved(2, 8, 88)])).toThrow('وصفات');
  });

  it('preserves retained products and uses current cost for wholly new products', () => {
    const result = plan([resolved(2), resolved(1, 12, 88, 8)]);
    expect(result.desiredConsumption).toEqual([
      { productId: 44, warehouseId: 2, quantity: 2, unitCost: 5 },
      { productId: 88, warehouseId: 2, quantity: 1, unitCost: 12 },
    ]);
    expect(result.perLineUnitCosts).toEqual([5, 12]);
  });

  it('uses saved line cost and recorded ingredient weighted cost independently', () => {
    const result = planCompletedSaleStock({ originalItems: [original(2, 7)],
      resolvedItems: [{ ...resolved(1, 99), consumption: [{ productId: 44, quantity: 2, unitCost: 99 }] }],
      reconstructedOriginalItems: [{ ...resolved(2, 99), consumption: [{ productId: 44, quantity: 4, unitCost: 99 }] }],
      history: [{ product_id: 44, warehouse_id: 2, quantity: 4, unit_cost: 3.5 }], warehouseId: 2 });
    expect(result.desiredConsumption).toEqual([{ productId: 44, warehouseId: 2, quantity: 2, unitCost: 3.5 }]);
    expect(result.perLineUnitCosts).toEqual([7]);
  });

  it('recognizes a reordered basket and does not recompute its inventory', () => {
    const result = planCompletedSaleStock({ originalItems: [original(), { ...original(1, 12), cafe_product_id: 8, product_id: 88 }],
      resolvedItems: [resolved(1, 99, 88, 8), resolved(2, 99)],
      reconstructedOriginalItems: [], history: [...history, { product_id: 88, warehouse_id: 2, quantity: 1, unit_cost: 12 }], warehouseId: 2 });
    expect(result.unchanged).toBe(true);
    expect(result.perLineUnitCosts).toEqual([12, 5]);
  });

  it('rejects ambiguous historical cost allocation instead of diverging inventory value from COGS', () => {
    expect(() => planCompletedSaleStock({
      originalItems: [original(1, 5), { ...original(1, 8), cafe_product_id: 8 }],
      resolvedItems: [resolved(1, 8)],
      reconstructedOriginalItems: [resolved(1, 8), resolved(1, 8, 44, 8)],
      history: [{ product_id: 44, warehouse_id: 2, quantity: 2, unit_cost: 6.5 }], warehouseId: 2,
    })).toThrow();
  });
});

