import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { localDateString } from '../club-members/club-member.utils';
import { ClubDiscountCodesService } from './club-discount-codes.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubSubscriptionTransfersService } from './club-subscription-transfers.service';
import { addDays } from './club-subscription.utils';

describe('ClubSubscriptionTransfersService plan conversion preview', () => {
  const today = localDateString();
  const source = {
    id: 41,
    branch_id: 6,
    subscription_type_id: 1,
    subscription_type: 'يوجا قديمة',
    subscription_start_date: addDays(today, -10),
    subscription_end_date: addDays(today, 20),
    subscription_value: 550,
    discount_enabled: false,
    discount_value: 0,
    paid_amount: 550,
    transferred_credit_amount: 0,
    status: 'active',
    is_linked_to_sessions: true,
    sessions_count: 5,
    sessions_used: 2,
  };
  const sessionsTarget = {
    id: 2,
    name: 'يوجا جديدة',
    price: 500,
    days: 30,
    is_active: true,
    is_linked_to_sessions: true,
    sessions_count: 5,
    branch_id: 6,
    apply_to_all_branches: false,
    branches: [{ branch_id: 6 }],
  };
  const prisma = {
    club_subscriptions: { findUnique: jest.fn() },
    club_subscription_types: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    club_subscription_refunds: { aggregate: jest.fn() },
    club_subscription_type_session_prices: { findMany: jest.fn() },
  };
  const branchScope = {
    isBranchAllowed: jest.fn().mockReturnValue(true),
    allowedBranchIds: jest.fn().mockReturnValue(null),
  };
  const discountCodes = new ClubDiscountCodesService(prisma as unknown as PrismaService);
  const sourceType = {
    id: 1,
    name: 'يوجا قديمة',
    price: 550,
    days: 30,
    is_active: true,
    is_linked_to_sessions: true,
    sessions_count: 5,
  };
  let targetType: Record<string, unknown> = {};
  const setTarget = (type: Record<string, unknown>) => { targetType = type; };
  const service = new ClubSubscriptionTransfersService(
    prisma as unknown as PrismaService,
    {} as ClubReceiptsService,
    {} as ClubSubscriptionAccountingService,
    {} as BusinessAuditService,
    branchScope as unknown as BranchScopeService,
    discountCodes,
  );
  const user = {
    sub: 1,
    level: 1,
    employeeId: 1,
    employeeCode: 1001,
    emp_code: 1,
    branch: 0,
    branch_name: null,
    man_women_type: 0,
    name: 'Admin',
    image: null,
    job_title: null,
    is_trainer: false,
    trainer_id: null,
  } satisfies JwtUser;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_subscriptions.findUnique.mockResolvedValue(source);
    targetType = sessionsTarget;
    prisma.club_subscription_types.findUnique.mockImplementation(({ where }: { where: { id: number } }) =>
      Promise.resolve(where.id === sourceType.id ? sourceType : targetType));
    prisma.club_subscription_refunds.aggregate.mockResolvedValue({ _sum: { refund_amount: null } });
    // Empty matrix → proportional fallback (package 500 / 5 = 100 per session).
    prisma.club_subscription_type_session_prices.findMany.mockResolvedValue([]);
    branchScope.isBranchAllowed.mockReturnValue(true);
  });

  it('upgrades monthly sessions for the exact price difference and keeps the original attendance', async () => {
    prisma.club_subscriptions.findUnique.mockResolvedValue({ ...source, subscription_value: 350, paid_amount: 350, sessions_count: 13, sessions_used: 1 });
    setTarget({ ...sessionsTarget, price: 600, sessions_count: 26 });
    expect(await service.previewPlanTransfer({ subscriptionId: source.id, toSubscriptionTypeId: sessionsTarget.id, toStartDate: today, targetSessionsCount: 26, preservePeriod: true }, user)).toMatchObject({ pricingMode: 'price_difference', targetSessionsCount: 26, consumedSessions: 1, targetValue: 600, transferableCredit: 350, additionalDue: 250, refundAmount: 0, toStartDate: source.subscription_start_date });
  });

  it('buys all selected sessions even when old credit only covers part of the package', async () => {
    const preview = await service.previewPlanTransfer({ subscriptionId: source.id, toSubscriptionTypeId: sessionsTarget.id, toStartDate: today, targetSessionsCount: 5 }, user);
    expect(preview).toMatchObject({ targetSessionsCount: 5, targetValue: 500, creditApplied: 330, additionalDue: 170, refundAmount: 0 });
  });

  it('rejects entitlement beyond the selected package', async () => {
    await expect(service.previewPlanTransfer({ subscriptionId: source.id, toSubscriptionTypeId: sessionsTarget.id, toStartDate: today, targetSessionsCount: 6 }, user)).rejects.toThrow('عدد الحصص');
  });

  it('turns 330 EGP credit into three 100 EGP sessions and a real 30 EGP refund', async () => {
    const preview = await service.previewPlanTransfer({
      subscriptionId: source.id,
      toSubscriptionTypeId: sessionsTarget.id,
      toStartDate: today,
    }, user);

    expect(preview).toMatchObject({
      consumedValue: 220,
      transferableCredit: 330,
      targetUnitPrice: 100,
      targetSessionsCount: 3,
      targetValue: 300,
      creditApplied: 300,
      refundAmount: 30,
      additionalDue: 0,
    });
  });

  it('shows the additional amount due when converting sessions to a dearer subscription', async () => {
    setTarget({
      ...sessionsTarget,
      id: 3,
      name: 'اشتراك شهري',
      price: 500,
      is_linked_to_sessions: false,
      sessions_count: null,
    });

    const preview = await service.previewPlanTransfer({
      subscriptionId: source.id,
      toSubscriptionTypeId: 3,
      toStartDate: today,
    }, user);

    expect(preview).toMatchObject({
      transferableCredit: 330,
      targetSessionsCount: null,
      targetValue: 500,
      creditApplied: 330,
      refundAmount: 0,
      additionalDue: 170,
    });
  });

  it('charges attended sessions at the package price list, not the bulk per-session rate', async () => {
    // 5 sessions sold for 100 (20 each) but one session alone costs 100 and two cost 180.
    prisma.club_subscriptions.findUnique.mockResolvedValue({
      ...source, subscription_value: 100, paid_amount: 100, sessions_used: 1,
    });
    prisma.club_subscription_type_session_prices.findMany.mockImplementation(
      ({ where }: { where: { subscription_type_id: number } }) => Promise.resolve(
        where.subscription_type_id === sourceType.id
          ? [{ sessions_count: 1, price: 100 }, { sessions_count: 2, price: 180 }]
          : [],
      ),
    );
    sourceType.price = 100;
    setTarget({ ...sessionsTarget, id: 3, price: 1000, is_linked_to_sessions: false, sessions_count: null });
    try {
      const preview = await service.previewPlanTransfer({
        subscriptionId: source.id, toSubscriptionTypeId: 3, toStartDate: today,
      }, user).catch((error: Error) => error);
      // Credit is fully consumed by the single attended session (100), so nothing is left to move.
      expect(preview).toBeInstanceOf(Error);
      expect((preview as Error).message).toBe('لا يوجد رصيد مدفوع غير مستهلك قابل للتحويل');

      prisma.club_subscriptions.findUnique.mockResolvedValue({
        ...source, subscription_value: 500, paid_amount: 500, sessions_used: 2,
      });
      sourceType.price = 500;
      expect(await service.previewPlanTransfer({
        subscriptionId: source.id, toSubscriptionTypeId: 3, toStartDate: today,
      }, user)).toMatchObject({
        consumedSessions: 2,
        // matrix scaled by branch/default price ratio (500/500): two sessions = 180
        consumedValue: 180,
        transferableCredit: 320,
        additionalDue: 680,
      });
    } finally {
      sourceType.price = 550;
    }
  });

  it('applies a fixed discount to the difference only and stores it on the new subscription', async () => {
    setTarget({ ...sessionsTarget, id: 3, price: 500, is_linked_to_sessions: false, sessions_count: null });
    const preview = await service.previewPlanTransfer({
      subscriptionId: source.id, toSubscriptionTypeId: 3, toStartDate: today,
      discountEnabled: true, discountValue: 100,
    }, user);
    expect(preview).toMatchObject({
      transferableCredit: 330, targetValue: 500, discountValue: 100,
      discountEnabled: true, additionalDue: 70, refundAmount: 0,
    });

    const capped = await service.previewPlanTransfer({
      subscriptionId: source.id, toSubscriptionTypeId: 3, toStartDate: today,
      discountEnabled: true, discountValue: 400,
    }, user);
    // A discount larger than the 170 difference is capped — it never becomes cash back.
    expect(capped).toMatchObject({ discountValue: 170, requestedDiscountValue: 400, additionalDue: 0, refundAmount: 0 });
  });

  it('rejects a target plan assigned to another branch', async () => {
    setTarget({
      ...sessionsTarget,
      branch_id: 7,
      branches: [{ branch_id: 7 }],
    });

    await expect(service.previewPlanTransfer({
      subscriptionId: source.id,
      toSubscriptionTypeId: sessionsTarget.id,
      toStartDate: today,
    }, user)).rejects.toThrow('الخطة المختارة غير متاحة في فرع الاشتراك الحالي');
  });

  it.each([
    { paid: 500, net: 500, refund: 0, transferred: 0, credit: 500, due: 1300 },
    { paid: 500, net: 0, refund: 0, transferred: 0, credit: 500, due: 1300 },
    { paid: 300, refund: 0, transferred: 0, credit: 300, due: 1500 },
    { paid: 500, refund: 100, transferred: 0, credit: 400, due: 1400 },
    { paid: 500, refund: 0, transferred: 100, credit: 500, due: 1300 },
  ])('upgrades a used day using $credit paid credit and $due additional due', async ({ paid, net = 500, refund, transferred, credit, due }) => {
    prisma.club_subscriptions.findUnique.mockResolvedValue({
      ...source, subscription_value: net, paid_amount: paid,
      transferred_out_amount: transferred, is_linked_to_sessions: false,
      sessions_count: null, sessions_used: 0,
      subscription_start_date: addDays(today, -1), subscription_end_date: today,
    });
    setTarget({
      ...sessionsTarget, price: 1800, is_linked_to_sessions: false, sessions_count: null,
    });
    prisma.club_subscription_refunds.aggregate.mockResolvedValue({ _sum: { refund_amount: refund } });
    const preview = await service.previewPlanTransfer({
      subscriptionId: source.id, toSubscriptionTypeId: sessionsTarget.id, toStartDate: today,
    }, user);
    expect(preview).toMatchObject({
      pricingMode: 'price_difference', transferableCredit: credit, creditApplied: credit,
      targetValue: 1800, additionalDue: due, refundAmount: 0,
    });
  });

  it.each([undefined, [{ method: 'cash' as const, amount: 500 }, { method: 'visa' as const, amount: 800 }]])('records only 1300 new money with payments %j and prevents reusing the upgraded source', async (payments) => {
    const oldSubscription = { ...source, subscription_value: 500, paid_amount: 500,
      transferred_out_amount: 0, is_linked_to_sessions: false, sessions_count: null,
      subscription_start_date: addDays(today, -1), subscription_end_date: today };
    prisma.club_subscriptions.findUnique.mockImplementation(async () => oldSubscription);
    setTarget({
      ...sessionsTarget, price: 1800, is_linked_to_sessions: false, sessions_count: null,
    });
    let destination: any;
    const tx: any = {
      ...prisma,
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_subscriptions: {
        ...prisma.club_subscriptions,
        create: jest.fn(async ({ data }) => (destination = { ...data, id: 99 })),
        update: jest.fn(async ({ data }) => Object.assign(oldSubscription, data)),
      },
      club_subscription_refunds: { ...prisma.club_subscription_refunds, findFirst: jest.fn().mockResolvedValue(null) },
      club_subscription_transfers: { count: jest.fn().mockResolvedValue(0), create: jest.fn(async ({ data }) => ({ ...data, id: 5 })) },
      club_subscription_freezes: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const receipts = { createForSubscription: jest.fn().mockResolvedValue({ receipt_number: 'UPGRADE-1' }) };
    const accounting = { postJournal: jest.fn() };
    const createService = new ClubSubscriptionTransfersService(
      { $transaction: (fn: any) => fn(tx) } as never, receipts as never, accounting as never,
      { log: jest.fn() } as never, branchScope as never, discountCodes,
    );
    const body = { subscriptionId: source.id, toSubscriptionTypeId: sessionsTarget.id,
      toStartDate: today, additionalPaidAmount: 1300, paymentMethod: 'cash' as const, payments };
    await createService.create(body, user);
    expect(destination).toMatchObject({ subscription_value: 1800, paid_amount: 1300,
      transferred_credit_amount: 500, remaining_amount: 0 });
    expect(receipts.createForSubscription).toHaveBeenCalledWith(99, 1300, expect.objectContaining({ paymentMethod: 'cash' }), tx);
    expect(accounting.postJournal).toHaveBeenCalledWith(expect.objectContaining({ paidAmount: 1300, kind: 'payment' }), tx);
    if (payments) {
      expect(receipts.createForSubscription).toHaveBeenCalledWith(99, 1300, expect.objectContaining({ payments }), tx);
      expect(accounting.postJournal).toHaveBeenCalledWith(expect.objectContaining({ payments, paidAmount: 1300 }), tx);
    }
    expect(oldSubscription.transferred_out_amount).toBe(500);
    await expect(createService.create(body, user)).rejects.toThrow('الاشتراك النشط');
    expect(receipts.createForSubscription).toHaveBeenCalledTimes(1);
  });

  describe('time → time start choice', () => {
    beforeEach(() => {
      prisma.club_subscriptions.findUnique.mockResolvedValue({
        ...source, subscription_value: 500, paid_amount: 500,
        is_linked_to_sessions: false, sessions_count: null, sessions_used: 0,
      });
      setTarget({
        ...sessionsTarget, price: 1100, days: 90,
        is_linked_to_sessions: false, sessions_count: null,
      });
    });

    it('can start the new plan today instead, crediting only the unused days', async () => {
      const result = await service.previewPlanTransfer({
        subscriptionId: source.id, toSubscriptionTypeId: sessionsTarget.id,
        toStartDate: today, startFrom: 'today',
      }, user);
      // 30-day period, 10 days used: 500 × 20/30 ≈ 333.33 credit; the 90 days run from today.
      expect(result).toMatchObject({
        canChooseStart: true, startFrom: 'today', pricingMode: 'unused_credit',
        toStartDate: today, toEndDate: addDays(today, 89),
      });
      expect(result.transferableCredit).toBeCloseTo(333.3, 0);
      expect(result.additionalDue).toBeCloseTo(766.7, 0);
    });

    it('keeps the original dates by default when downgrading (e.g. gym + fitness → gym only)', async () => {
      setTarget({ ...sessionsTarget, price: 300, days: 30, is_linked_to_sessions: false, sessions_count: null });
      expect(await service.previewPlanTransfer({
        subscriptionId: source.id, toSubscriptionTypeId: sessionsTarget.id, toStartDate: today,
      }, user)).toMatchObject({
        canChooseStart: true, startFrom: 'original', pricingMode: 'price_difference',
        toStartDate: source.subscription_start_date,
        toEndDate: addDays(source.subscription_start_date, 29), refundAmount: 200, additionalDue: 0,
      });
    });
  });
});
