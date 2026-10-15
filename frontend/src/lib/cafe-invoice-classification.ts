import type { CafeBundleDetail } from '../types/cafe';

type CategorizedProduct = { categoryId?: number | null; categoryIds?: number[] };

export function cafeInvoiceCategoryIds(product: CategorizedProduct): number[] {
  return [...new Set([...(product.categoryIds ?? []), ...(product.categoryId ? [product.categoryId] : [])])];
}

export function cafeInvoiceLineMatchesCategory(product: CategorizedProduct, categoryId: string): boolean {
  const id = Number(categoryId);
  return Number.isInteger(id) && id > 0 && cafeInvoiceCategoryIds(product).includes(id);
}

/** Keep only valid choices; reject combos that cannot satisfy every required group. */
export function cafeBundleForInvoiceCategory(bundle: CafeBundleDetail, categoryId: string): CafeBundleDetail | null {
  const groups = bundle.groups.map(group => ({
    ...group,
    options: group.options.filter(option => option.isActive && cafeInvoiceLineMatchesCategory(option, categoryId)),
  }));
  return groups.some(group => group.options.length < group.minSelect) ? null : { ...bundle, groups };
}

export function cafeBundleInvoiceCategoryIds(
  bundle: CafeBundleDetail,
  selections: Array<{ groupId: number; cafeProductId: number; cafeVariantId?: number | null }>,
): number[] {
  const categories = selections.map(selection => {
    const option = bundle.groups.find(group => group.id === selection.groupId)?.options.find(option =>
      option.cafeProductId === selection.cafeProductId && (option.cafeVariantId ?? null) === (selection.cafeVariantId ?? null));
    return option ? cafeInvoiceCategoryIds(option) : [];
  });
  return categories.length ? categories[0].filter(id => categories.every(ids => ids.includes(id))) : [];
}
