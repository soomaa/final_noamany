export type RecipeUnit = 'g' | 'kg' | 'oz' | 'ml' | 'L' | 'fl_oz' | 'piece';
export type CafeProductType = 'ready' | 'prepared' | 'internal';
export type CafeBusinessClassification = 'protein' | 'bar';

export interface CafeRecipeItem {
  id: number;
  ingredientId: number;
  ingredientName: string;
  ingredientBaseUnit: string;
  quantity: number;
  unit: RecipeUnit;
  sortOrder: number;
}

export interface CafeProductVariant {
  id: number;
  name: string;
  variantCode: string | null;
  sellPrice: number;
  cost: number;
  profit: number;
  marginPercentage: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  recipes?: CafeRecipeItem[];
}

export interface CafeProductListItem {
  id: number;
  productCode: string;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  productType: CafeProductType;
  businessClassification: CafeBusinessClassification | null;
  inventoryProductId: number | null;
  sellPrice: number;
  cost: number;
  profit: number;
  marginPercentage: number;
  imageUrl: string | null;
  isActive: boolean;
  recipeCount: number;
  variantCount: number;
  variants: CafeProductVariant[];
  currentStock: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CafeProductDetail extends CafeProductListItem {
  inventoryProduct?: {
    id: number;
    unitOfMeasure: string;
    minStock: number;
  } | null;
  recipes: CafeRecipeItem[];
  variants: CafeProductVariant[];
}

export interface CafeCategory {
  id: number;
  nameAr: string;
  nameEn: string;
  emoji: string;
  description?: string | null;
  parentCategoryId?: number | null;
  sortOrder: number;
  isActive: boolean;
  parent: { id: number; nameAr: string; nameEn: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CafeSellResult {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface UpsertCafeProductDto {
  name: string;
  businessClassification?: CafeBusinessClassification;
  sellPrice: number;
  categoryId?: number;
  imageUrl?: string;
  isActive?: boolean;
  recipes?: Array<{
    ingredientId: number;
    quantity: number;
    unit: RecipeUnit;
  }>;
  variants?: Array<{
    id?: number;
    name: string;
    variantCode?: string;
    sellPrice: number;
    isDefault?: boolean;
    isActive?: boolean;
    recipes: Array<{
      ingredientId: number;
      quantity: number;
      unit: RecipeUnit;
    }>;
  }>;
}

export interface SellCafeProductDto {
  quantity: number;
}

export interface CafeCartItem {
  product: CafeProductListItem;
  variant?: CafeProductVariant;
  quantity: number;
}
