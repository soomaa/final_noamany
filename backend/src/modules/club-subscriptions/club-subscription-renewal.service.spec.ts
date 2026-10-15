import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubDiscountCodesService } from './club-discount-codes.service';
import { ClubSubscriptionLifecycleService } from './club-subscription-lifecycle.service';
import { ClubSubscriptionRenewalService } from './club-subscription-renewal.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';

describe('ClubSubscriptionRenewalService.quote', () => {
  const prisma = {
    $transaction: jest.fn(),
    club_subscriptions: { findUnique: jest.fn() },
    club_subscription_types: { findUnique: jest.fn() },
    club_subscription_type_branch_prices: { findMany: jest.fn() },
    club_class_types: { findUnique: jest.fn() },
    club_trainers: { findFirst: jest.fn().mockResolvedValue({ id: 8, is_active: true, is_deleted: false }) },
    club_private_packages: { findUnique: jest.fn() },
  };
  const lifecycle = { findTail: jest.fn() };
  const branchScope = { isBranchAllowed: jest.fn() };
  const discounts = { resolveDiscount: jest.fn() };
  const receipts = { createForSubscription: jest.fn() };
  const accounting = { postJournal: jest.fn() };
  const audit = { log: jest.fn() };
  const automation = { emit: jest.fn() };
  const service = new ClubSubscriptionRenewalService(
    prisma as unknown as PrismaService,
    lifecycle as unknown as ClubSubscriptionLifecycleService,
    branchScope as unknown as BranchScopeService,
    discounts as unknown as ClubDiscountCodesService,
    receipts as unknown as ClubReceiptsService,
    accounting as unknown as ClubSubscriptionAccountingService,
    audit as unknown as BusinessAuditService,
    automation as unknown as AutomationEngineService,
  );
  const user = { sub: 5 } as never;

  // The fixture subscription runs 2026-08-03 → 2026-09-02. Once real "now" passes that
  // end date the quote flips to an immediate renewal and these expectations break, so
  // pin the clock inside the subscription's active window.
  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    branchScope.isBranchAllowed.mockReturnValue(true);
    prisma.club_subscriptions.findUnique.mockResolvedValue({
      id: 41,
      branch_id: 2,
      member_id: 9,
      subscription_type_id: 7,
      special_class_type_id: null,
      private_package_id: null,
      private_trainer_id: null,
      private_discount_type: 'trainer-commission-v2',
      member: { member_code: 'A000009' },
      subscription_type: '12 Sessions',
      subscription_start_date: '2026-08-03',
      subscription_end_date: '2026-09-02',
      sessions_count: 12,
      sessions_used: 4,
      is_linked_to_sessions: true,
      remaining_amount: 125,
      status: 'active',
    });
    lifecycle.findTail.mockResolvedValue({
      id: 41,
      memberId: 9,
      branchId: 2,
      startDate: '2026-08-03',
      endDate: '2026-09-02',
      isLinkedToSessions: true,
      sessionsCount: 12,
      sessionsUsed: 4,
      status: 'active',
    });
    prisma.club_subscription_types.findUnique.mockResolvedValue({
      id: 7,
      name: '12 Sessions',
      price: 500,
      days: 30,
      sessions_count: 12,
      is_linked_to_sessions: true,
      is_active: true,
      branch_id: null,
      apply_to_all_branches: true,
      branches: [],
      session_prices: [],
    });
    prisma.club_subscription_type_branch_prices.findMany.mockResolvedValue([
      { subscription_type_id: 7, branch_id: 2, price: 600 },
    ]);
    discounts.resolveDiscount.mockResolvedValue({
      discountEnabled: false,
      discountCodeId: null,
      discountPercentage: null,
      discountValue: 0,
    });
  });

  it('uses the same package current branch price instead of the historical sale value', async () => {
    const quote = await service.quote(41, {}, user);

    expect(quote).toMatchObject({
      subscriptionTypeId: 7,
      subscriptionType: '12 Sessions',
      grossValue: 600,
      sessionsCount: 12,
      currentOutstandingAmount: 125,
    });
  });

  it('rejects memberless renewals before opening a transaction', async () => {
    prisma.club_subscriptions.findUnique.mockResolvedValueOnce({
      id: 70,
      branch_id: 2,
      member_id: null,
      status: 'active',
      freezes: [],
    });
    await expect(service.renew(70, {}, user)).rejects.toThrow(
      'التجديد المجدول متاح لاشتراكات الأعضاء المسجلين فقط',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('calculates dates without accepting date or target-plan inputs', async () => {
    const quote = await service.quote(41, {}, user);

    expect(quote).toMatchObject({
      startDate: '2026-09-03',
      endDate: '2026-10-02',
      scheduleMode: 'after_current',
    });
  });

  it('offers «renew from today» while the current period still runs', async () => {
    const extend = await service.quote(41, {}, user);
    expect(extend).toMatchObject({ startMode: 'extend', canStartToday: true, closesSubscriptionId: null });

    const today = await service.quote(41, { startMode: 'today' }, user);
    expect(today).toMatchObject({
      startDate: '2026-08-20',
      endDate: '2026-09-18',
      scheduleMode: 'from_today',
      startMode: 'today',
      closesSubscriptionId: 41,
      forfeitedSessions: 8,
    });
    expect(today.quoteVersion).not.toBe(extend.quoteVersion);
  });

  it('refuses «renew from today» when a renewal is already queued after the current period', async () => {
    lifecycle.findTail.mockResolvedValueOnce({
      id: 42,
      memberId: 9,
      branchId: 2,
      startDate: '2026-09-03',
      endDate: '2026-10-02',
      isLinkedToSessions: true,
      sessionsCount: 12,
      sessionsUsed: 0,
      status: 'upcoming',
    });
    await expect(service.quote(41, { startMode: 'today' }, user)).rejects.toThrow('يوجد تجديد مجدول');
  });

  it('prices a special-class renewal from the current session price', async () => {
    prisma.club_subscriptions.findUnique.mockResolvedValueOnce({
      id: 51,
      branch_id: 2,
      member_id: 9,
      subscription_type_id: null,
      special_class_type_id: 4,
      private_package_id: null,
      private_trainer_id: null,
      subscription_type: 'Yoga',
      sessions_count: 3,
      sessions_used: 0,
      is_linked_to_sessions: true,
      remaining_amount: 0,
      status: 'active',
    });
    lifecycle.findTail.mockResolvedValueOnce({
      id: 51,
      memberId: 9,
      branchId: 2,
      startDate: '2026-08-03',
      endDate: '2026-09-02',
      isLinkedToSessions: true,
      sessionsCount: 3,
      sessionsUsed: 0,
      status: 'active',
    });
    prisma.club_class_types.findUnique.mockResolvedValueOnce({
      id: 4,
      name: 'Yoga',
      single_session_price: 120,
      subscription_sessions_count: 5,
      subscription_validity_days: 30,
      is_active: true,
      is_deleted: false,
    });

    await expect(service.quote(51, {}, user)).resolves.toMatchObject({
      specialClassTypeId: 4,
      subscriptionType: 'Yoga',
      sessionsCount: 3,
      grossValue: 360,
    });
  });

  it('prices a private renewal from the current package price and duration', async () => {
    prisma.club_subscriptions.findUnique.mockResolvedValueOnce({
      id: 61,
      branch_id: 2,
      member_id: 9,
      subscription_type_id: null,
      special_class_type_id: null,
      private_package_id: 8,
      private_trainer_id: 3,
      subscription_type: 'Private 8',
      sessions_count: 8,
      sessions_used: 0,
      is_linked_to_sessions: true,
      remaining_amount: 0,
      status: 'active',
    });
    lifecycle.findTail.mockResolvedValueOnce({
      id: 61,
      memberId: 9,
      branchId: 2,
      startDate: '2026-08-03',
      endDate: '2026-09-02',
      isLinkedToSessions: true,
      sessionsCount: 8,
      sessionsUsed: 0,
      status: 'active',
    });
    prisma.club_private_packages.findUnique.mockResolvedValueOnce({
      id: 8,
      name: 'Private 8',
      price: 1400,
      duration_days: 45,
      sessions_count: 8,
      is_active: true,
      branches: [{ branch_id: 2 }],
    });

    await expect(service.quote(61, {}, user)).resolves.toMatchObject({
      privatePackageId: 8,
      privateTrainerId: 3,
      grossValue: 1400,
      sessionsCount: 8,
      endDate: '2026-10-17',
    });
  });

  it('lets staff select an available trainer for the new period only', async () => {
    prisma.club_subscriptions.findUnique.mockResolvedValueOnce({
      id: 61,
      branch_id: 2,
      member_id: 9,
      subscription_type_id: null,
      special_class_type_id: null,
      private_package_id: 8,
      private_trainer_id: 3,
      subscription_type: 'Private 8',
      sessions_count: 8,
      sessions_used: 0,
      is_linked_to_sessions: true,
      remaining_amount: 0,
      status: 'active',
    });
    lifecycle.findTail.mockResolvedValueOnce({
      id: 61,
      memberId: 9,
      branchId: 2,
      startDate: '2026-08-03',
      endDate: '2026-09-02',
      isLinkedToSessions: true,
      sessionsCount: 8,
      sessionsUsed: 0,
      status: 'active',
    });
    prisma.club_private_packages.findUnique.mockResolvedValueOnce({
      id: 8,
      name: 'Private 8',
      price: 1400,
      duration_days: 45,
      sessions_count: 8,
      is_active: true,
      branches: [{ branch_id: 2 }],
    });

    await expect(service.quote(61, { privateTrainerId: 99 }, user)).resolves.toMatchObject({
      privatePackageId: 8,
      privateTrainerId: 99,
      grossValue: 1400,
      sessionsCount: 8,
      endDate: '2026-10-17',
    });
  });

  it('atomically appends a current-price renewal and keeps the old debt untouched', async () => {
    const source = {
      ...(await prisma.club_subscriptions.findUnique.mock.results[0]?.value),
      id: 41,
      branch_id: 2,
      member_id: 9,
      customer_name: 'Member',
      subscription_type_id: 7,
      special_class_type_id: null,
      private_package_id: null,
      private_trainer_id: null,
      subscription_type: '12 Sessions',
      subscription_start_date: '2026-08-03',
      subscription_end_date: '2026-09-02',
      sessions_count: 12,
      sessions_used: 4,
      is_linked_to_sessions: true,
      remaining_amount: 125,
      status: 'active',
      created_by: 4,
      private_discount_type: 'trainer-commission-v2',
      member: { member_code: 'A000009' },
    };
    const created = {
      ...source,
      id: 42,
      subscription_number: 'A000009-2',
      subscription_start_date: '2026-09-03',
      subscription_end_date: '2026-10-03',
      subscription_value: 600,
      paid_amount: 600,
      remaining_amount: 0,
      sessions_used: 0,
      renewed_from_subscription_id: 41,
      status: 'upcoming',
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ acquired: 1 }]),
      club_subscriptions: {
        findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
          where.id === 42 ? created : source,
        ),
        findMany: jest.fn().mockResolvedValue([{ subscription_number: 'A000009' }]),
        create: jest.fn().mockResolvedValue(created),
        update: jest.fn(),
      },
      club_subscription_types: prisma.club_subscription_types,
      club_subscription_type_branch_prices: prisma.club_subscription_type_branch_prices,
      club_members: {
        findUnique: jest.fn().mockResolvedValue({ member_code: 'A000009' }),
        update: jest.fn(),
      },
    };
    (prisma as typeof prisma & { $transaction: jest.Mock }).$transaction = jest
      .fn()
      .mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
    receipts.createForSubscription.mockResolvedValue({ receipt_number: 'R-NEW' });
    accounting.postJournal.mockResolvedValue(undefined);
    audit.log.mockResolvedValue(undefined);
    automation.emit.mockResolvedValue(undefined);

    const result = await service.renew(
      41,
      { paidAmount: 600, paymentMethod: 'cash' },
      user,
    );

    expect(result.quote).toMatchObject({ grossValue: 600, currentOutstandingAmount: 125 });
    expect(result.subscription).toMatchObject({ memberCode: 'A000009' });
    expect(String(tx.$queryRaw.mock.calls[0]?.[0])).toContain('FOR UPDATE');
    expect(tx.club_subscriptions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        renewed_from_subscription_id: 41,
        subscription_type_id: 7,
        subscription_value: 600,
        subscription_start_date: '2026-09-03',
        paid_amount: 600,
        private_discount_type: 'trainer-commission-v2',
      }),
    });
    expect(tx.club_subscriptions.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 41 },
        data: expect.objectContaining({ remaining_amount: expect.anything() }),
      }),
    );
  });

});
