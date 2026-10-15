export type IngredientSwapSelectableRow = {
  recipeType: 'product' | 'variant';
  recipeId: number;
  conflict: boolean;
};

export function ingredientSwapRowKey(row: Pick<IngredientSwapSelectableRow, 'recipeType' | 'recipeId'>) {
  return `${row.recipeType}:${row.recipeId}`;
}

export function eligibleIngredientSwapKeys(rows: IngredientSwapSelectableRow[]) {
  return rows
    .filter((row) => !row.conflict)
    .map(ingredientSwapRowKey);
}

export function targetIngredientCost(quantity: number, unitCost: number) {
  return Math.round(quantity * unitCost * 100) / 100;
}

export function canApplyIngredientSwap(selected: Set<string>, isPending: boolean) {
  return selected.size > 0 && !isPending;
}
