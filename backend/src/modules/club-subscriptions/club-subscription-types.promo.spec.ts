import { ClubSubscriptionTypesService } from './club-subscription-types.service';

const admin = { level: 1 } as never;
const offers = { notifyNewOffer: jest.fn().mockResolvedValue({ sent: 0 }) };
function setup(price = 1000) {
  const prisma = { club_subscription_types: { update: jest.fn() } };
  const service = new ClubSubscriptionTypesService(prisma as never, {} as never, {} as never, offers as never);
  jest.spyOn(service, 'findOne')
    .mockResolvedValueOnce({ id: 4, price, applyToAllBranches: false, promoImage: null, promoMarketingMessage: null } as never)
    .mockResolvedValueOnce({ id: 4, price, promoEnabled: true } as never);
  return { prisma, service };
}

describe('subscription package promotion overlay', () => {
  it('stores a lower promotional price, calculated discount, expiry and trimmed message', async () => {
    const { prisma, service } = setup();
    await service.updatePromo(4, { enabled: true, price: 750, durationDays: 7, marketingMessage: '  عرض ONE80  ' }, admin);
    expect(prisma.club_subscription_types.update).toHaveBeenCalledWith({ where: { id: 4 }, data: expect.objectContaining({
      promo_enabled: true, promo_price: 750, promo_discount_percent: 25, promo_marketing_message: 'عرض ONE80', promo_ends_at: expect.any(Date),
    }) });
  });

  it('rejects an invalid or non-discounted promotional price without writing', async () => {
    const { prisma, service } = setup();
    await expect(service.updatePromo(4, { enabled: true, price: 1000, durationDays: 7 }, admin)).rejects.toThrow('سعر العرض يجب أن يكون أقل');
    expect(prisma.club_subscription_types.update).not.toHaveBeenCalled();
  });

  it('stores a branch manager promo on the branch-local package copy', async () => {
    const prisma = { club_subscription_types: { update: jest.fn() } };
    const service = new ClubSubscriptionTypesService(prisma as never, {} as never, {} as never, offers as never);
    const global = { id: 4, price: 1000, applyToAllBranches: true } as never;
    jest.spyOn(service, 'findOne')
      .mockResolvedValueOnce(global)
      .mockResolvedValueOnce({ id: 14, price: 1000, applyToAllBranches: false, promoImage: null, promoMarketingMessage: null } as never)
      .mockResolvedValueOnce({ id: 14, promoEnabled: true } as never);
    jest.spyOn(service as never, 'upsertBranchOverride' as never).mockResolvedValue({ id: 14 } as never);

    await service.updatePromo(
      4,
      { enabled: true, price: 800, durationDays: 5 },
      { level: 2, branch: 1 } as never,
    );

    expect(prisma.club_subscription_types.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 14 },
      data: expect.objectContaining({ promo_enabled: true, promo_price: 800 }),
    }));
  });
});
