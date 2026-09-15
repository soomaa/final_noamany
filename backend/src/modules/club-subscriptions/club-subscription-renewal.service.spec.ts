import { ClubSubscriptionRenewalService } from './club-subscription-renewal.service';

describe('ClubSubscriptionRenewalService', () => {
  const db = {
    club_subscriptions: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    club_subscription_types: { findUnique: jest.fn() },
    club_subscription_type_branch_prices: { findMany: jest.fn() },
    club_members: { update: jest.fn() },
    business_audit_log: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const scope = {
    isBranchAllowed: jest.fn(() => true),
    memberGenderFilter: jest.fn().mockReturnValue(null),
  };
  const discounts = { resolveDiscount: jest.fn() };
  const receipts = { createForSubscription: jest.fn() };
  const accounting = { postJournal: jest.fn() };
  const audit = { log: jest.fn() };
  const automation = { emit: jest.fn() };
  const lifecycle = { findTail: jest.fn() };
  const service = new ClubSubscriptionRenewalService(
    db as never, lifecycle as never, scope as never, discounts as never,
    receipts as never, accounting as never, audit as never, automation as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    scope.memberGenderFilter.mockReturnValue(null);
    db.business_audit_log.findMany.mockResolvedValue([]);
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T12:00:00Z'));
    db.club_subscriptions.findUnique.mockResolvedValue({
      id: 41, branch_id: 2, member_id: 9, subscription_type_id: 7,
      subscription_type: 'باقة 12 حصة', subscription_start_date: '2026-09-01', subscription_end_date: '2026-09-30',
      sessions_count: 12, sessions_used: 0, is_linked_to_sessions: true, status: 'active', remaining_amount: 125,
      payment_method: 'cash', customer_name: 'فاطمة', gender: null, freezes: [],
      member: { member_code: 'M9', gender: 'female', is_deleted: false },
    });
    lifecycle.findTail.mockResolvedValue({ id: 41, branchId: 2, memberId: 9, endDate: '2026-09-30', isLinkedToSessions: true, sessionsCount: 12, sessionsUsed: 0 });
    db.club_subscription_types.findUnique.mockResolvedValue({
      id: 7, name: 'باقة 12 حصة', price: 500, days: 30, sessions_count: 12,
      is_linked_to_sessions: true, is_active: true, apply_to_all_branches: true, branches: [], session_prices: [],
    });
    db.club_subscription_type_branch_prices.findMany.mockResolvedValue([{ subscription_type_id: 7, branch_id: 2, price: 600 }]);
    discounts.resolveDiscount.mockResolvedValue({ discountEnabled: false, discountCodeId: null, discountPercentage: null, discountValue: 0 });
  });
  afterEach(() => jest.useRealTimers());

  it('quotes current branch price and preserves the old balance as a separate contract', async () => {
    await expect(service.quote(41, {}, { sub: 3 } as never)).resolves.toMatchObject({
      grossValue: 600, currentOutstandingAmount: 125, startDate: '2026-10-01', endDate: '2026-10-31',
    });
  });

  it('never accepts client supplied dates, package, or renewal-day changes', async () => {
    await expect(service.quote(41, { renewalDays: 1, subscriptionTypeId: 999, startDate: '2020-01-01' } as never, { sub: 3 } as never)).resolves.toMatchObject({
      startDate: '2026-10-01', endDate: '2026-10-31', subscriptionTypeId: 7,
    });
  });

  it('rejects quoting an opposite-audience member using canonical member gender', async () => {
    scope.memberGenderFilter.mockReturnValue('male');
    await expect(service.quote(41, {}, { sub: 3 } as never)).rejects.toThrow(
      'لا تملك صلاحية الوصول لبيانات هذا القسم',
    );
    expect(db.club_subscriptions.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        member: { select: { member_code: true, gender: true, is_deleted: true } },
      }),
    }));
  });

  it('scales a current session-price row to the current branch package price', async () => {
    db.club_subscriptions.findUnique.mockResolvedValueOnce({
      ...(await db.club_subscriptions.findUnique()),
      sessions_count: 6,
    });
    db.club_subscription_types.findUnique.mockResolvedValueOnce({
      id: 7, name: 'باقة 12 حصة', price: 500, days: 30, sessions_count: 12,
      is_linked_to_sessions: true, is_active: true, apply_to_all_branches: true,
      branches: [], session_prices: [{ sessions_count: 6, price: 250 }],
    });

    await expect(service.quote(41, {}, { sub: 3 } as never)).resolves.toMatchObject({
      grossValue: 300,
      sessionsCount: 6,
    });
  });

  it('requires a server quote confirmation before opening the renewal transaction', async () => {
    await expect(service.renew(41, { paidAmount: 0 }, { sub: 3 } as never)).rejects.toThrow(
      'تأكيد عرض التجديد مطلوب',
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('uses the current catalog session mode and activates an immediate renewal in the same transaction', async () => {
    const source = {
      id: 41, branch_id: 2, member_id: 9, subscription_type_id: 7,
      subscription_type: 'باقة شهرية قديمة', subscription_start_date: '2026-08-01', subscription_end_date: '2026-09-08',
      sessions_count: 12, sessions_used: 12, is_linked_to_sessions: true, status: 'expired', remaining_amount: 125,
      payment_method: 'cash', customer_name: 'فاطمة', gender: 'female', freezes: [],
      member: { member_code: 'M9', gender: 'female', is_deleted: false },
    };
    const currentType = {
      id: 7, name: 'باقة شهرية', price: 700, days: 30, sessions_count: null,
      is_linked_to_sessions: false, is_active: true, apply_to_all_branches: true,
      branches: [], session_prices: [],
    };
    db.club_subscriptions.findUnique.mockResolvedValue(source);
    db.club_subscription_types.findUnique.mockResolvedValue(currentType);
    db.club_subscription_type_branch_prices.findMany.mockResolvedValue([]);
    lifecycle.findTail.mockResolvedValue({ id: 41, branchId: 2, memberId: 9, endDate: '2026-09-08', isLinkedToSessions: true, sessionsCount: 12, sessionsUsed: 12 });
    const confirmed = await service.quote(41, {}, { sub: 3 } as never);
    const tx = {
      $queryRaw: jest.fn(),
      club_subscriptions: {
        findUnique: jest.fn().mockResolvedValue(source),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 42, ...data })),
      },
      club_subscription_types: { findUnique: jest.fn().mockResolvedValue(currentType) },
      club_subscription_type_branch_prices: { findMany: jest.fn().mockResolvedValue([]) },
      club_members: { findUnique: jest.fn().mockResolvedValue({ member_code: 'M9' }), update: jest.fn() },
    };
    db.$transaction.mockImplementationOnce(async (work: (client: typeof tx) => unknown) => work(tx));
    audit.log.mockResolvedValue(undefined);
    automation.emit.mockResolvedValue(undefined);

    await service.renew(41, { quoteVersion: confirmed.quoteVersion }, { sub: 3 } as never);

    expect(tx.club_subscriptions.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      is_linked_to_sessions: false,
      sessions_count: null,
      status: 'active',
      gender: 'female',
    }) });
    expect(tx.club_members.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { start_date: '2026-09-09', end_date: '2026-10-09', is_active: true },
    });
    expect(db.club_members.update).not.toHaveBeenCalled();
  });

  it('rejects a repeated confirmation when another renewal has already changed the locked queue tail', async () => {
    const confirmed = await service.quote(41, { paidAmount: 0 }, { sub: 3 } as never);
    lifecycle.findTail.mockResolvedValue({ id: 42, branchId: 2, memberId: 9, endDate: '2026-10-31', isLinkedToSessions: true, sessionsCount: 12, sessionsUsed: 0 });
    db.$transaction.mockImplementationOnce(async (work: (client: typeof db) => unknown) => work(db));

    await expect(service.renew(41, { paidAmount: 0, quoteVersion: confirmed.quoteVersion }, { sub: 3 } as never)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SUBSCRIPTION_RENEWAL_QUOTE_CHANGED' }),
    });
    expect(db.club_subscriptions.create).not.toHaveBeenCalled();
  });

  it('never appends a renewal after the canonical branch/audience accounting day is closed', async () => {
    const confirmed = await service.quote(41, { paidAmount: 0 }, { sub: 3 } as never);
    db.business_audit_log.findMany.mockResolvedValueOnce([{
      entity_id: '2026-09-09:2:female',
      action: 'daily_close_close',
    }]);
    db.$transaction.mockImplementationOnce(async (work: (client: typeof db) => unknown) => work(db));

    await expect(service.renew(41, {
      paidAmount: 0,
      quoteVersion: confirmed.quoteVersion,
    }, { sub: 3 } as never)).rejects.toThrow('اليوم المالي مقفل');

    expect(db.business_audit_log.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        entity_id: { in: ['2026-09-09:2:all', '2026-09-09:2:female'] },
      }),
    }));
    expect(db.club_subscriptions.create).not.toHaveBeenCalled();
  });
});
