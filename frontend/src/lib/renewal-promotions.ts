type Promotion = {
  isActive?: boolean;
  isLinkedToSessions?: boolean;
  promoEnabled?: boolean;
  promoPrice?: number | null;
  promoEndsAt?: string | null;
};

export function liveRenewalPromotions<T extends Promotion>(
  types: T[],
  sourceIsSessions: boolean,
  now = Date.now(),
): T[] {
  return types.filter((type) => type.isActive && type.promoEnabled
    && Boolean(type.isLinkedToSessions) === sourceIsSessions
    && Number.isFinite(type.promoPrice) && Number(type.promoPrice) > 0
    && (type.promoEndsAt == null || new Date(type.promoEndsAt).getTime() > now));
}

type RenewalSelection = {
  subscriptionTypeId: number | null;
  specialClassTypeId: number | null;
  privatePackageId: number | null;
  sessionsCount: number | null;
  startDate: string;
  endDate: string;
  grossValue: number;
  discountValue: number;
  netValue: number;
};

/** Payment amounts change the quote token; the displayed package and price must not. */
export function sameRenewalSelection(displayed: RenewalSelection, confirmed: RenewalSelection): boolean {
  const fields: (keyof RenewalSelection)[] = ['subscriptionTypeId', 'specialClassTypeId',
    'privatePackageId', 'sessionsCount', 'startDate', 'endDate', 'grossValue', 'discountValue', 'netValue'];
  return fields.every((field) => displayed[field] === confirmed[field]);
}
