import { BadRequestException } from '@nestjs/common';

/**
 * A package's special offer («عرض خاص», ported from MetaFit): either a lower price (`discount`)
 * or extra entitlement (`bonus`): extra days on a time package, extra visits on a sessions
 * package, optionally at a lower price too.
 */
export type PromoKind = 'discount' | 'bonus';

export interface PackageOfferSource {
  price: unknown;
  is_linked_to_sessions: boolean;
  sessions_count: number | null;
  promo_enabled: boolean;
  promo_kind: string | null;
  promo_price: unknown;
  promo_bonus: number | null;
  promo_ends_on: string | null;
}

export function toPromoKind(value: unknown): PromoKind {
  return value === 'bonus' ? 'bonus' : 'discount';
}

/** The extra days / visits a bonus offer grants, or 0 for a discount offer. */
export function promoBonusUnits(kind: unknown, bonus: unknown): number {
  const units = Number(bonus);
  return toPromoKind(kind) === 'bonus' && Number.isInteger(units) && units > 0 ? units : 0;
}

/** The offer can be sold today (`today` is the Cairo date, YYYY-MM-DD). */
export function isOfferLive(type: Pick<PackageOfferSource, 'promo_enabled' | 'promo_ends_on'>, today: string): boolean {
  return type.promo_enabled && (!type.promo_ends_on || type.promo_ends_on >= today);
}

/** "+7 أيام إضافية" / "+4 زيارات إضافية". */
export function promoBonusLabel(units: number, isLinkedToSessions: boolean): string {
  if (units <= 0) return '';
  if (isLinkedToSessions) return `+${units} ${units === 1 ? 'زيارة إضافية' : 'زيارات إضافية'}`;
  return `+${units} ${units === 1 ? 'يوم إضافي' : 'أيام إضافية'}`;
}

/**
 * What selling a package "at its offer" means: the full package at the offer price, plus the
 * offer's extra visits or days. Throws once the offer has ended so a stale screen cannot sell
 * at an old price.
 */
export function resolveSalePromotion(type: PackageOfferSource, today: string) {
  const price = Number(type.promo_price);
  if (!isOfferLive(type, today) || !(price > 0)) {
    throw new BadRequestException('العرض الخاص انتهى أو لم يعد متاحًا — حدّث الصفحة واختر الباقة من جديد');
  }
  const bonus = promoBonusUnits(type.promo_kind, type.promo_bonus);
  return {
    price,
    sessionsCount: type.is_linked_to_sessions ? Number(type.sessions_count) + bonus : null,
    extraDays: type.is_linked_to_sessions ? 0 : bonus,
  };
}

/**
 * Validated offer columns from a plan form body, or null when the body does not touch the offer.
 * Leaves the legacy `is_special_offer` flag alone: the old system used it to mark private
 * training packages, which the plan screens hide on purpose.
 * `price` is the package's own price after this save; `isLinkedToSessions` decides days vs visits.
 */
export function offerColumns(body: Record<string, unknown>, price: number, isLinkedToSessions: boolean, today: string) {
  if (body.promoEnabled === undefined) return null;
  if (!body.promoEnabled) {
    return { promo_enabled: false, promo_kind: 'discount', promo_price: null, promo_bonus: null, promo_ends_on: null };
  }
  const kind = toPromoKind(body.promoKind);
  let bonus: number | null = null;
  if (kind === 'bonus') {
    bonus = Number(body.promoBonus);
    if (!Number.isInteger(bonus) || bonus <= 0) {
      throw new BadRequestException(isLinkedToSessions
        ? 'اكتب عدد الزيارات الإضافية في العرض (رقم صحيح أكبر من صفر)'
        : 'اكتب عدد الأيام الإضافية في العرض (رقم صحيح أكبر من صفر)');
    }
  }
  // A bonus offer may keep the package price (blank price = the package price).
  const blankPrice = body.promoPrice == null || body.promoPrice === '';
  const promoPrice = kind === 'bonus' && blankPrice ? price : Number(body.promoPrice);
  if (!Number.isFinite(promoPrice) || promoPrice <= 0) throw new BadRequestException('اكتب سعر العرض (رقم أكبر من صفر)');
  if (kind === 'discount' && promoPrice >= price) throw new BadRequestException('سعر العرض يجب أن يكون أقل من سعر الباقة');
  if (kind === 'bonus' && promoPrice > price) throw new BadRequestException('سعر العرض لا يمكن أن يزيد عن سعر الباقة');
  const endsOn = body.promoEndsOn ? String(body.promoEndsOn) : null;
  if (endsOn != null && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) throw new BadRequestException('تاريخ نهاية العرض غير صحيح');
  if (endsOn != null && endsOn < today) throw new BadRequestException('تاريخ نهاية العرض لا يمكن أن يكون في الماضي');
  return { promo_enabled: true, promo_kind: kind, promo_price: promoPrice, promo_bonus: bonus, promo_ends_on: endsOn };
}
