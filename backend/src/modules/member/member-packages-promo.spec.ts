import { MemberService } from './member.service';

function row(endsAt: Date) {
  return {
    id: 3,
    name: 'Annual',
    price: 1000,
    days: 365,
    branch_id: 2,
    apply_to_all_branches: false,
    branches: [],
    session_prices: [],
    is_linked_to_sessions: false,
    sessions_count: null,
    is_special_offer: false,
    is_for_students: false,
    invitations_count: null,
    inbody_count: null,
    includes_spa: false,
    spa_count: null,
    freeze_days: null,
    wallet_points: null,
    offer_validity: null,
    promo_enabled: true,
    promo_price: 750,
    promo_discount_percent: 25,
    promo_image: 'offers/annual.png',
    promo_ends_at: endsAt,
    promo_marketing_message: 'عرض محدود',
  };
}

describe('member package promotion presentation', () => {
  it('exposes only unexpired promotions and preserves branch filtering', async () => {
    const prisma = {
      club_subscription_types: {
        findMany: jest.fn().mockResolvedValue([
          row(new Date(Date.now() + 86_400_000)),
          {
            ...row(new Date(Date.now() - 86_400_000)),
            id: 4,
            name: 'Expired',
          },
          {
            ...row(new Date(Date.now() + 86_400_000)),
            id: 5,
            branch_id: 9,
            name: 'Other branch',
          },
        ]),
      },
    };
    const service = new MemberService(
      prisma as never,
      { get: () => '/uploads' } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const result = await service.listPackages(2);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      promoEnabled: true,
      promoPrice: 750,
      promoMarketingMessage: 'عرض محدود',
    });
    expect(result[1]).toMatchObject({ promoEnabled: false, promoPrice: null });
    expect(result.some((item) => item.name === 'Other branch')).toBe(false);
  });
});
