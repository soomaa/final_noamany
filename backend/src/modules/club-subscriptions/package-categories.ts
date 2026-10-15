import { BadRequestException } from '@nestjs/common';

/**
 * Sections the server fills by itself, whatever the admin tagged:
 * - `offers`  — every package with a live promo joins it automatically;
 * - `private` — every private package;
 * - `classes` — every scheduled class type.
 * The member app also routes `offers` to its dedicated offers screen. These rows are
 * `is_system` in `club_package_categories`: renameable and hideable, never deletable.
 */
export const SYSTEM_CATEGORY_KEYS = ['offers', 'private', 'classes'] as const;

export type PackageCategoryRow = {
  id: number;
  key: string;
  name: string;
  name_en: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
};

/**
 * Returns `null` when the caller did not send the field at all — an absent key means
 * "leave the current tagging alone", while an empty array means "clear every tag".
 * Each key must name an existing category in `validKeys`.
 */
export function parsePackageCategories(
  body: Record<string, unknown>,
  validKeys: ReadonlySet<string>,
): string[] | null {
  if (body.categories === undefined) return null;
  if (!Array.isArray(body.categories)) {
    throw new BadRequestException('تصنيفات الباقة غير صالحة');
  }
  const parsed: string[] = [];
  for (const raw of body.categories) {
    const key = typeof raw === 'string' ? raw.trim() : '';
    if (!validKeys.has(key)) {
      throw new BadRequestException(`تصنيف غير معروف: ${String(raw)}`);
    }
    if (!parsed.includes(key)) parsed.push(key);
  }
  return parsed;
}

/** True while a package promo is switched on and has not reached its end date. */
export function isPromoLive(
  promoEnabled: boolean,
  promoEndsAt: Date | null | undefined,
  now: number = Date.now(),
): boolean {
  return promoEnabled && (promoEndsAt == null || promoEndsAt.getTime() > now);
}

/**
 * A live promo puts the package in the "عروض" section regardless of how it was tagged,
 * so an admin who switches a promo on never has to remember to re-tag it.
 */
export function withOffersTag(categories: string[], hasLivePromo: boolean): string[] {
  if (!hasLivePromo || categories.includes('offers')) return categories;
  return [...categories, 'offers'];
}
