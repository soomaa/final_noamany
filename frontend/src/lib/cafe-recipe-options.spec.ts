import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergeCafeRecipeIngredientOptions,
  recipeIngredientOptionsForLine,
  savedCafeRecipeRows,
} from './cafe-recipe-options';

describe('mergeCafeRecipeIngredientOptions', () => {
  it('keeps a saved recipe ingredient visible when it is outside the paginated picker results', () => {
    const result = mergeCafeRecipeIngredientOptions(
      [{ id: 301, nameAr: 'سكر', unitOfMeasure: 'kg', costPrice: 42 }],
      [{
        id: 91,
        ingredientId: 17,
        ingredientName: 'لبن كامل الدسم',
        ingredientNameEn: 'Full-fat milk',
        ingredientSize: '1 لتر',
        ingredientBaseUnit: 'L',
        ingredientCostPrice: 58,
        ingredientInventorySection: 'preparation_ingredients',
        ingredientInventoryKind: 'raw_material',
        quantity: 120,
        unit: 'ml',
        sortOrder: 0,
      }],
    );

    assert.deepEqual(result.find((option) => option.id === 17), {
      id: 17,
      nameAr: 'لبن كامل الدسم',
      nameEn: 'Full-fat milk',
      size: '1 لتر',
      unitOfMeasure: 'L',
      costPrice: 58,
      inventorySection: 'preparation_ingredients',
      inventoryKind: 'raw_material',
      isSelectable: false,
    });
  });

  it('prefers the current picker record over the saved recipe snapshot', () => {
    const result = mergeCafeRecipeIngredientOptions(
      [{ id: 17, nameAr: 'لبن محدث', unitOfMeasure: 'L', costPrice: 64 }],
      [{
        id: 91,
        ingredientId: 17,
        ingredientName: 'لبن قديم',
        ingredientBaseUnit: 'L',
        ingredientCostPrice: 58,
        quantity: 120,
        unit: 'ml',
        sortOrder: 0,
      }],
    );

    assert.equal(result.find((option) => option.id === 17)?.nameAr, 'لبن محدث');
    assert.equal(result.find((option) => option.id === 17)?.costPrice, 64);
  });

  it('offers a saved-only ingredient only to the recipe line that already uses it', () => {
    const options = [
      { id: 17, nameAr: 'لبن قديم', unitOfMeasure: 'L', costPrice: 58, isSelectable: false },
      { id: 301, nameAr: 'سكر', unitOfMeasure: 'kg', costPrice: 42 },
    ];

    assert.deepEqual(recipeIngredientOptionsForLine(options, 17).map((option) => option.id), [17, 301]);
    assert.deepEqual(recipeIngredientOptionsForLine(options, 301).map((option) => option.id), [301]);
    assert.deepEqual(recipeIngredientOptionsForLine(options, 0).map((option) => option.id), [301]);
  });

  it('treats omitted recipe collections from an older API response as empty', () => {
    assert.deepEqual(savedCafeRecipeRows({}), []);
    assert.deepEqual(savedCafeRecipeRows({ recipes: undefined, variants: undefined }), []);
  });
});
