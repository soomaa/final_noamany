import { assertFreezeFits, freezeAllowance } from './freeze-allowance';
import { isOfferLive, offerColumns, resolveSalePromotion } from './package-offer';

function client(type: { is_linked_to_freeze: boolean; freeze_days: number | null; freeze_total_days: number | null } | null, history: unknown[]) {
  return {
    club_subscription_types: { findUnique: jest.fn().mockResolvedValue(type) },
    club_subscription_freezes: { findMany: jest.fn().mockResolvedValue(history) },
  } as never;
}
const freeze = (id: number, days: number, active = false, actual?: number) => ({
  id, freeze_start_date: '2026-01-01', freeze_end_date: null, planned_days: days,
  actual_days: active ? null : actual ?? days, is_active: active, reason: null,
});
const sub = { id: 1, subscription_type_id: 9 };

describe('freeze balance', () => {
  it('counts ended freezes by their actual days and a running freeze by its planned days', async () => {
    const a = await freezeAllowance(client({ is_linked_to_freeze: true, freeze_days: null, freeze_total_days: 60 }, [
      freeze(1, 10, false, 4), freeze(2, 20, true),
    ]), sub);
    expect(a).toMatchObject({ usedDays: 24, remainingDays: 36, usedTimes: 2, remainingTimes: null });
  });

  it('allows any number of one-day freezes until the days run out, like the old system', async () => {
    const history = Array.from({ length: 59 }, (_, i) => freeze(i + 1, 1));
    const a = await freezeAllowance(client({ is_linked_to_freeze: true, freeze_days: null, freeze_total_days: 60 }, history), sub);
    expect(() => assertFreezeFits(a, 1)).not.toThrow();
    expect(() => assertFreezeFits(a, 2)).toThrow('المتبقي من رصيد التجميد 1 يوم');
  });

  it('refuses when the number of times is used up', async () => {
    const a = await freezeAllowance(client({ is_linked_to_freeze: true, freeze_days: 2, freeze_total_days: null }, [freeze(1, 3), freeze(2, 3)]), sub);
    expect(() => assertFreezeFits(a, 1)).toThrow('عدد مرات التجميد');
  });

  it('refuses when all freeze days are used', async () => {
    const a = await freezeAllowance(client({ is_linked_to_freeze: true, freeze_days: null, freeze_total_days: 10 }, [freeze(1, 10)]), sub);
    expect(() => assertFreezeFits(a, 1)).toThrow('إجمالي أيام التجميد');
  });

  it('refuses a package without freeze', async () => {
    const a = await freezeAllowance(client({ is_linked_to_freeze: false, freeze_days: null, freeze_total_days: null }, []), sub);
    expect(() => assertFreezeFits(a, 1)).toThrow('لا يدعم التجميد');
  });

  it("leaves out the freeze being edited so its own days don't count twice", async () => {
    const a = await freezeAllowance(client({ is_linked_to_freeze: true, freeze_days: null, freeze_total_days: 30 }, [freeze(1, 10), freeze(2, 15, true)]), sub, 2);
    expect(a.remainingDays).toBe(20);
  });
});

describe('package special offer', () => {
  const today = '2026-11-18';
  const type = (over: Record<string, unknown> = {}) => ({
    price: 1000, is_linked_to_sessions: false, sessions_count: null, promo_enabled: true,
    promo_kind: 'discount', promo_price: 800, promo_bonus: null, promo_ends_on: '2026-11-30', ...over,
  });

  it('sells a discount offer at its price with no extra days', () => {
    expect(resolveSalePromotion(type(), today)).toEqual({ price: 800, sessionsCount: null, extraDays: 0 });
  });

  it('adds extra days to a time package and extra visits to a sessions package', () => {
    expect(resolveSalePromotion(type({ promo_kind: 'bonus', promo_bonus: 15, promo_price: 1000 }), today).extraDays).toBe(15);
    expect(resolveSalePromotion(type({ promo_kind: 'bonus', promo_bonus: 4, is_linked_to_sessions: true, sessions_count: 12 }), today))
      .toMatchObject({ sessionsCount: 16, extraDays: 0 });
  });

  it('refuses to sell after the last offer day', () => {
    expect(isOfferLive(type(), '2026-11-30')).toBe(true);
    expect(() => resolveSalePromotion(type(), '2026-12-01')).toThrow('انتهى');
  });

  it('validates the offer on the plan form', () => {
    expect(() => offerColumns({ promoEnabled: true, promoKind: 'discount', promoPrice: 1000 }, 1000, false, today)).toThrow('أقل من سعر الباقة');
    expect(() => offerColumns({ promoEnabled: true, promoKind: 'bonus', promoBonus: 0 }, 1000, false, today)).toThrow('الأيام الإضافية');
    expect(() => offerColumns({ promoEnabled: true, promoKind: 'discount', promoPrice: 900, promoEndsOn: '2026-01-01' }, 1000, false, today)).toThrow('الماضي');
    expect(offerColumns({ promoEnabled: true, promoKind: 'bonus', promoBonus: 7, promoPrice: '' }, 1000, false, today))
      .toMatchObject({ promo_enabled: true, promo_kind: 'bonus', promo_price: 1000, promo_bonus: 7 });
    expect(offerColumns({ promoEnabled: false }, 1000, false, today)).toEqual(expect.objectContaining({ promo_enabled: false }));
    expect(offerColumns({ promoEnabled: true, promoKind: 'discount', promoPrice: 900 }, 1000, false, today)).not.toHaveProperty('is_special_offer');
    expect(offerColumns({}, 1000, false, today)).toBeNull();
  });
});
