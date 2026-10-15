import { ClubSubscriptionRenewalService } from './club-subscription-renewal.service';

describe('subscription renewal promotional offers', () => {
  let source: any;
  let offer: any;
  let prisma: any;
  let service: ClubSubscriptionRenewalService;
  let branchScope: any;
  const user = { sub: 5 } as never;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00Z'));
    source = {
      id: 41, branch_id: 2, member_id: 9, customer_name: 'Member',
      subscription_type_id: 7, special_class_type_id: null, private_package_id: null,
      private_trainer_id: null, subscription_type: 'Monthly',
      subscription_start_date: '2026-08-03', subscription_end_date: '2026-09-02',
      sessions_count: null, sessions_used: 0, is_linked_to_sessions: false,
      remaining_amount: 125, status: 'active',
    };
    offer = {
      id: 10, name: 'Three-month offer', price: 1000, days: 90,
      sessions_count: null, is_linked_to_sessions: false, is_active: true,
      branch_id: 2, apply_to_all_branches: false, branches: [], session_prices: [],
      promo_enabled: true, promo_price: 700, promo_ends_at: new Date('2026-09-01T12:00:00Z'),
    };
    prisma = {
      club_subscriptions: {
        findUnique: jest.fn(async ({ where }) => where.id === 42
          ? { ...source, id: 42, ...prisma.club_subscriptions.create.mock.calls[0]?.[0].data }
          : source),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ subscription_number: 'A000009' }]),
        create: jest.fn().mockResolvedValue({ id: 42 }),
        update: jest.fn(),
      },
      club_subscription_types: { findUnique: jest.fn().mockImplementation(async ({ where }) => ({ ...offer, id: where.id })) },
      club_subscription_type_branch_prices: { findMany: jest.fn().mockResolvedValue([]) },
      club_members: { findUnique: jest.fn().mockResolvedValue({ member_code: 'A000009' }), update: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (fn) => fn(prisma)),
    };
    branchScope = { isBranchAllowed: jest.fn().mockReturnValue(true) };
    service = new ClubSubscriptionRenewalService(
      prisma,
      { findTail: jest.fn().mockResolvedValue({ id: 41, memberId: 9, branchId: 2,
        startDate: '2026-08-03', endDate: '2026-09-02', status: 'active',
        isLinkedToSessions: false, sessionsCount: null, sessionsUsed: 0 }) } as never,
      branchScope,
      { resolveDiscount: jest.fn().mockResolvedValue({ discountEnabled: false,
        discountCodeId: null, discountPercentage: null, discountValue: 0 }) } as never,
      { createForSubscription: jest.fn().mockResolvedValue({ receipt_number: 'R-42' }) } as never,
      { postJournal: jest.fn() } as never,
      { log: jest.fn() } as never,
      { emit: jest.fn() } as never,
    );
  });
  afterEach(() => jest.useRealTimers());

  it.each([[90, '2026-12-01'], [180, '2027-03-01'], [365, '2027-09-02']])(
    'uses the selected %i-day package and promotional price, even when the renewal starts after the offer expires',
    async (days, endDate) => {
      offer.days = days;
      const quote = await service.quote(41, { promotionTypeId: 10 }, user);
      expect(quote).toMatchObject({ promotionTypeId: 10, subscriptionTypeId: 10,
        grossValue: 700, startDate: '2026-09-03', endDate, currentOutstandingAmount: 125 });
    },
  );

  it.each(['expired', 'disabled', 'inactive', 'invalid-price', 'wrong-kind', 'wrong-branch'])(
    'rejects an %s offer on the server', async (reason) => {
      if (reason === 'expired') offer.promo_ends_at = new Date('2026-08-20T12:00:00Z');
      if (reason === 'disabled') offer.promo_enabled = false;
      if (reason === 'inactive') offer.is_active = false;
      if (reason === 'invalid-price') offer.promo_price = 0;
      if (reason === 'wrong-kind') offer.is_linked_to_sessions = true;
      if (reason === 'wrong-branch') offer.branch_id = 3;
      await expect(service.quote(41, { promotionTypeId: 10 }, user)).rejects.toThrow();
    },
  );

  it('preserves ordinary same-package renewal when no offer is selected', async () => {
    offer.promo_enabled = false;
    const quote = await service.quote(41, {}, user);
    expect(quote).toMatchObject({ subscriptionTypeId: 7, promotionTypeId: null, grossValue: 1000 });
  });

  it('allows the promotional price on the current package as well', async () => {
    expect(await service.quote(41, { promotionTypeId: 7 }, user)).toMatchObject({ subscriptionTypeId: 7, grossValue: 700 });
  });

  it('uses the full session quota of a selected offer rather than the old quota', async () => {
    source.is_linked_to_sessions = true;
    source.sessions_count = 4;
    offer.is_linked_to_sessions = true;
    offer.sessions_count = 24;
    expect(await service.quote(41, { promotionTypeId: 10 }, user)).toMatchObject({ sessionsCount: 24, grossValue: 700 });
  });

  it('rejects a target package with an overlapping independent subscription', async () => {
    prisma.club_subscriptions.findFirst.mockResolvedValue({ id: 75 });
    await expect(service.quote(41, { promotionTypeId: 10 }, user)).rejects.toThrow('يتداخل');
  });

  it('checks source branch access and prevents offers on private packages', async () => {
    branchScope.isBranchAllowed.mockReturnValue(false);
    await expect(service.quote(41, { promotionTypeId: 10 }, user)).rejects.toThrow();
    branchScope.isBranchAllowed.mockReturnValue(true);
    source.private_package_id = 3;
    await expect(service.quote(41, { promotionTypeId: 10 }, user)).rejects.toThrow('باقات الاشتراك');
  });

  it('rechecks expiry and price changes when confirming an earlier quote', async () => {
    const quote = await service.quote(41, { promotionTypeId: 10 }, user);
    offer.promo_price = 750;
    await expect(service.renew(41, { promotionTypeId: 10, quoteVersion: quote.quoteVersion }, user)).rejects.toThrow('اتغيّر');
    offer.promo_price = 700;
    offer.promo_ends_at = new Date('2026-08-20T12:00:00Z');
    await expect(service.renew(41, { promotionTypeId: 10, quoteVersion: quote.quoteVersion }, user)).rejects.toThrow('انتهى');
    expect(prisma.club_subscriptions.create).not.toHaveBeenCalled();
  });

  it('saves the selected offer as a new period and preserves the old debt', async () => {
    await service.renew(41, { promotionTypeId: 10, paidAmount: 700 }, user);
    expect(prisma.club_subscriptions.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      subscription_type_id: 10, subscription_value: 700, paid_amount: 700,
      subscription_start_date: '2026-09-03', subscription_end_date: '2026-12-01',
      renewed_from_subscription_id: 41, remaining_amount: 0,
    }) });
    expect(prisma.club_subscriptions.update).not.toHaveBeenCalled();
    expect(source.remaining_amount).toBe(125);
  });
});
