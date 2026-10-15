const PROMO_DAY_MS = 24 * 60 * 60 * 1000;

export interface AppPromotionSource {
  price: number;
  promoPrice?: number | null;
  promoDiscountPercent?: number | null;
  promoEnabled?: boolean;
  promoEndsAt?: string | null;
}

export interface AppPromotionDraft {
  price: string;
  discountPercent: string;
  durationDays: string;
  image: string | null;
}

export function toPromoSummary(source: AppPromotionSource, now = Date.now()) {
  const endsAt = source.promoEndsAt ? new Date(source.promoEndsAt).getTime() : null;
  const hasEndDate = endsAt != null && Number.isFinite(endsAt);
  const derivedDiscount = source.promoPrice == null || source.price <= 0
    ? null
    : Math.round(((source.price - source.promoPrice) / source.price) * 1000) / 10;
  return {
    isLive: source.promoEnabled === true && (!hasEndDate || endsAt > now),
    daysRemaining: hasEndDate ? Math.ceil((endsAt - now) / PROMO_DAY_MS) : null,
    discountPercent: source.promoDiscountPercent ?? derivedDiscount,
  };
}

export function buildPromoUpdate(draft: AppPromotionDraft, originalPrice: number) {
  const price = Number(draft.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('A valid promo price is required');
  if (price >= originalPrice) throw new Error('Promo price must be lower than the original price');

  const durationDays = Number(draft.durationDays);
  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    throw new Error('A positive integer duration is required');
  }

  const discountPercent = draft.discountPercent === '' ? undefined : Number(draft.discountPercent);
  if (discountPercent != null && (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent >= 100)) {
    throw new Error('Discount percent must be between 0 and 100');
  }

  return {
    enabled: true as const,
    price,
    discountPercent,
    durationDays,
    image: draft.image,
  };
}
