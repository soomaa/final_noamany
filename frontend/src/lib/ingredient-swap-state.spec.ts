import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canApplyIngredientSwap,
  eligibleIngredientSwapKeys,
  ingredientSwapRowKey,
  targetIngredientCost,
} from './ingredient-swap-state';

test('selects only eligible rows and enables apply only for valid selections', () => {
  const rows = [
    { recipeType: 'product' as const, recipeId: 1, conflict: false },
    { recipeType: 'variant' as const, recipeId: 2, conflict: true },
    { recipeType: 'product' as const, recipeId: 3, conflict: false },
  ];
  assert.deepEqual(eligibleIngredientSwapKeys(rows), ['product:1', 'product:3']);
  assert.equal(ingredientSwapRowKey(rows[0]), 'product:1');
  assert.equal(canApplyIngredientSwap(new Set(['product:1']), false), true);
  assert.equal(canApplyIngredientSwap(new Set(), false), false);
  assert.equal(canApplyIngredientSwap(new Set(['product:1']), true), false);
});

test('calculates the replacement total directly from its own quantity and unit cost', () => {
  assert.equal(targetIngredientCost(6, 1.25), 7.5);
  assert.equal(targetIngredientCost(12, 0.333333), 4);
});
