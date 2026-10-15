export type RecipeUnit = 'g' | 'kg' | 'oz' | 'ml' | 'L' | 'fl_oz' | 'piece';
export type CafeProductType = 'ready' | 'prepared' | 'internal';

export interface CafeRecipeItem {
  id: number;
  ingredientId: number;
  ingredientName: string;
  ingredientNameEn?: string | null;
  ingredientSize?: string | null;
  ingredientBaseUnit: string;
  ingredientCostPrice?: number;
  ingredientInventorySection?: 'general' | 'preparation_ingredients' | 'serving_packaging' | 'gym_operations' | 'ready_products';
  ingredientInventoryKind?: 'general' | 'raw_material' | 'ready_product' | 'manufactured_internal';
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
  categoryIds?: number[];
  categories?: Array<{ id: number; name: string }>;
  productType: CafeProductType;
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
  sellPrice: number;
  categoryId?: number;
  categoryIds?: number[];
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

// ── Bundles / combos ────────────────────────────────────────────────────────
export type CafeBundlePricingMode = 'fixed' | 'percent';

export interface CafeBundleOption {
  id: number;
  cafeProductId: number;
  productName: string | null;
  productCode: string | null;
  categoryId?: number | null;
  categoryIds?: number[];
  sellPrice?: number;
  cafeVariantId: number | null;
  variantName: string | null;
  priceDelta: number;
  sortOrder: number;
  isActive: boolean;
}

export interface CafeBundleGroup {
  id: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options: CafeBundleOption[];
}

export interface CafeBundleListItem {
  id: number;
  bundleCode: string;
  name: string;
  imageUrl: string | null;
  pricingMode: CafeBundlePricingMode;
  fixedPrice: number;
  discountPercentage: number;
  isActive: boolean;
  groupCount: number;
  optionCount: number;
}

export interface CafeBundleDetail {
  id: number;
  bundleCode: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  pricingMode: CafeBundlePricingMode;
  fixedPrice: number;
  discountPercentage: number;
  isActive: boolean;
  groups: CafeBundleGroup[];
}

export interface UpsertCafeBundleDto {
  name: string;
  bundleCode?: string;
  description?: string;
  imageUrl?: string;
  pricingMode: CafeBundlePricingMode;
  fixedPrice?: number;
  discountPercentage?: number;
  isActive?: boolean;
  groups: Array<{
    name: string;
    minSelect?: number;
    maxSelect?: number;
    sortOrder?: number;
    options: Array<{
      cafeProductId: number;
      cafeVariantId?: number | null;
      priceDelta?: number;
      sortOrder?: number;
      isActive?: boolean;
    }>;
  }>;
}

/** One chosen option per group, sent to the POS sell endpoint. */
export interface CafeBundleSelection {
  groupId: number;
  cafeProductId: number;
  cafeVariantId?: number;
}

/** A bundle placed in the café POS cart, with the customer's picks resolved. */
export interface CafeBundleCartItem {
  key: string;
  bundle: CafeBundleListItem;
  quantity: number;
  selections: CafeBundleSelection[];
  /** Human-readable component summary for the cart line, e.g. "أمريكانو + راب فراخ". */
  label: string;
  /** Client-side estimate for the cart total; the server recomputes on sale. */
  unitPrice: number;
  categoryIds?: number[];
}
