import { BadRequestException } from '@nestjs/common';

interface SavedLine {
  cafe_product_id: number | null;
  cafe_variant_id: number | null;
  product_id: number;
  quantity: unknown;
  unit_cost: unknown;
}
interface ResolvedLine {
  cafeProductId: number | null;
  cafeVariantId: number | null;
  productId: number;
  quantity: number;
  unitCost: number;
  consumption: Array<{ productId: number; quantity: number; unitCost: number }>;
}
interface HistoricalConsumption {
  product_id: number;
  warehouse_id: number;
  quantity: unknown;
  unit_cost: unknown;
}
export interface PlannedConsumption {
  productId: number;
  warehouseId: number;
  quantity: number;
  unitCost: number;
}

const itemKey = (productId: number, cafeId: number | null, variantId: number | null) =>
  cafeId == null ? `inventory:${productId}` : `cafe:${cafeId}:${variantId ?? 'base'}`;
const resolvedKey = (line: ResolvedLine) => itemKey(line.productId, line.cafeProductId, line.cafeVariantId);
const roundQuantity = (quantity: number) => Math.round(quantity * 1000) / 1000;
const mismatch = () => new BadRequestException('تعذر مطابقة وصفات وتكلفة استهلاك الفاتورة الأصلية مع سجل المخزون؛ لا يمكن تغيير الأصناف أو الكميات بأمان. راجع وصفات الفاتورة الأصلية أولاً');

/**
 * Preserve the recorded recipe/cost of retained units. Legacy invoices do not
 * store per-line ingredient snapshots, so a quantity-changing edit is allowed
 * only when today's reconstruction of the old basket matches its actual stock
 * history. Notes-only edits need no reconstruction and keep history exactly.
 */
export function planCompletedSaleStock(input: {
  originalItems: SavedLine[];
  resolvedItems: ResolvedLine[];
  reconstructedOriginalItems: ResolvedLine[];
  history: HistoricalConsumption[];
  warehouseId: number;
}): { unchanged: boolean; desiredConsumption: PlannedConsumption[]; perLineUnitCosts: number[] } {
  const saved = new Map<string, { quantity: number; cost: number }>();
  for (const line of input.originalItems) {
    const key = itemKey(line.product_id, line.cafe_product_id, line.cafe_variant_id);
    const total = saved.get(key) ?? { quantity: 0, cost: 0 };
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(Number(line.unit_cost))) throw mismatch();
    total.quantity += quantity;
    total.cost += quantity * Number(line.unit_cost);
    saved.set(key, total);
  }
  const revisedQuantities = new Map<string, number>();
  for (const line of input.resolvedItems) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw mismatch();
    const key = resolvedKey(line);
    revisedQuantities.set(key, (revisedQuantities.get(key) ?? 0) + line.quantity);
  }
  const unchanged = saved.size === revisedQuantities.size && [...saved].every(([key, value]) =>
    Math.abs(value.quantity - (revisedQuantities.get(key) ?? 0)) < 0.000001,
  );
  if (unchanged) return {
    unchanged: true,
    desiredConsumption: input.history.map(row => ({ productId: row.product_id, warehouseId: row.warehouse_id,
      quantity: Number(row.quantity), unitCost: Number(row.unit_cost) })),
    perLineUnitCosts: input.resolvedItems.map(line => {
      const old = saved.get(resolvedKey(line))!;
      return old.cost / old.quantity;
    }),
  };

  const historical = new Map<number, { quantity: number; cost: number }>();
  for (const row of input.history) {
    if (row.warehouse_id !== input.warehouseId) throw mismatch();
    const old = historical.get(row.product_id) ?? { quantity: 0, cost: 0 };
    const quantity = Number(row.quantity);
    old.quantity += quantity;
    old.cost += quantity * Number(row.unit_cost);
    historical.set(row.product_id, old);
  }
  const reconstructed = new Map<string, { quantity: number; ingredients: Map<number, number> }>();
  const reconstructedIngredients = new Map<number, number>();
  for (const line of input.reconstructedOriginalItems) {
    const key = resolvedKey(line);
    if (input.originalItems.some(savedLine => itemKey(savedLine.product_id, savedLine.cafe_product_id, savedLine.cafe_variant_id) === key && savedLine.product_id !== line.productId)) throw mismatch();
    const old = reconstructed.get(key) ?? { quantity: 0, ingredients: new Map<number, number>() };
    old.quantity += line.quantity;
    for (const ingredient of line.consumption) {
      // The movement table stores each original consumption at three decimals.
      const quantity = roundQuantity(ingredient.quantity);
      if (quantity === 0) continue;
      old.ingredients.set(ingredient.productId, (old.ingredients.get(ingredient.productId) ?? 0) + quantity);
      reconstructedIngredients.set(ingredient.productId, (reconstructedIngredients.get(ingredient.productId) ?? 0) + quantity);
    }
    reconstructed.set(key, old);
  }
  if (saved.size !== reconstructed.size || [...saved].some(([key, old]) =>
    Math.abs(old.quantity - (reconstructed.get(key)?.quantity ?? 0)) > 0.000001,
  )) throw mismatch();
  if (historical.size !== reconstructedIngredients.size || [...historical].some(([id, old]) =>
    Math.abs(old.quantity - (reconstructedIngredients.get(id) ?? 0)) > 0.000001,
  )) throw mismatch();
  // After earlier edits, two lines may have consumed the same ingredient at
  // different costs. A global ingredient average cannot identify which cost
  // belongs to a removed line. Refuse that ambiguity rather than allowing the
  // stock valuation and the saved line COGS to diverge.
  for (const [key, old] of saved) {
    const recipe = reconstructed.get(key)!;
    const reconstructedCost = [...recipe.ingredients].reduce((sum, [productId, quantity]) => {
      const ingredient = historical.get(productId)!;
      return sum + quantity * ingredient.cost / ingredient.quantity;
    }, 0);
    if (Math.abs(reconstructedCost / old.quantity - old.cost / old.quantity) > 0.011) throw mismatch();
  }

  const remaining = new Map([...saved].map(([key, value]) => [key, value.quantity]));
  const desired = new Map<number, { quantity: number; cost: number }>();
  const add = (productId: number, quantity: number, unitCost: number) => {
    if (quantity <= 0) return;
    const row = desired.get(productId) ?? { quantity: 0, cost: 0 };
    row.quantity += quantity;
    row.cost += quantity * unitCost;
    desired.set(productId, row);
  };
  const perLineUnitCosts = input.resolvedItems.map(line => {
    const key = resolvedKey(line);
    const old = saved.get(key);
    const retained = Math.min(line.quantity, remaining.get(key) ?? 0);
    const added = line.quantity - retained;
    remaining.set(key, (remaining.get(key) ?? 0) - retained);
    if (retained > 0) {
      const recipe = reconstructed.get(key)!;
      for (const [productId, quantity] of recipe.ingredients) {
        const historicIngredient = historical.get(productId)!;
        add(productId, quantity * retained / recipe.quantity, historicIngredient.cost / historicIngredient.quantity);
      }
    }
    if (added > 0) for (const ingredient of line.consumption) {
      add(ingredient.productId, ingredient.quantity * added / line.quantity, ingredient.unitCost);
    }
    return ((old ? old.cost / old.quantity * retained : 0) + line.unitCost * added) / line.quantity;
  });
  return {
    unchanged: false,
    perLineUnitCosts,
    desiredConsumption: [...desired].flatMap(([productId, row]) => {
      const quantity = roundQuantity(row.quantity);
      return quantity <= 0 ? [] : [{ productId, warehouseId: input.warehouseId, quantity, unitCost: row.cost / quantity }];
    }),
  };
}

