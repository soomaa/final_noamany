import type { RecipeIngredientOption } from '@/components/cafe/recipe-editor';
import type { CafeRecipeItem } from '@/types/cafe';

type CostedRecipeIngredientOption = RecipeIngredientOption & { costPrice: number };

export function mergeCafeRecipeIngredientOptions(
  currentOptions: CostedRecipeIngredientOption[],
  savedRecipes: CafeRecipeItem[],
): CostedRecipeIngredientOption[] {
  const byId = new Map(currentOptions.map((option) => [Number(option.id), option]));

  for (const recipe of savedRecipes) {
    const ingredientId = Number(recipe.ingredientId);
    if (!ingredientId || byId.has(ingredientId)) continue;
    byId.set(ingredientId, {
      id: ingredientId,
      nameAr: recipe.ingredientName,
      nameEn: recipe.ingredientNameEn,
      size: recipe.ingredientSize,
      unitOfMeasure: recipe.ingredientBaseUnit,
      costPrice: recipe.ingredientCostPrice ?? 0,
      inventorySection: recipe.ingredientInventorySection,
      inventoryKind: recipe.ingredientInventoryKind,
      isSelectable: false,
    });
  }

  return [...byId.values()];
}

export function recipeIngredientOptionsForLine(
  options: RecipeIngredientOption[],
  selectedIngredientId: number,
): RecipeIngredientOption[] {
  return options.filter((option) => option.isSelectable !== false || Number(option.id) === Number(selectedIngredientId));
}
