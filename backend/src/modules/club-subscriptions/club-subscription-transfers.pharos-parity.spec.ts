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
    sub: 1, employeeId: null, employeeCode: null,
    level: 1,
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

  describe('time subscription price-difference upgrades', () => {
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
    const preview = () => service.previewPlanTransfer({
      subscriptionId: source.id, toSubscriptionTypeId: sessionsTarget.id,
      toStartDate: today,
    }, user);
    it('charges exactly 600 and retains the original start even mid-period', async () => {
      expect(await preview()).toMatchObject({
        consumedValue: 0, transferableCredit: 500, additionalDue: 600,
        creditApplied: 500, targetValue: 1100, refundAmount: 0,
        toStartDate: source.subscription_start_date,
        toEndDate: addDays(source.subscription_start_date, 89),
      });
    });
    it('carries prior transfer credit and subtracts completed refunds only', async () => {
      prisma.club_subscriptions.findUnique.mockResolvedValue({
        ...source, subscription_value: 1100, paid_amount: 600,
        transferred_credit_amount: 500, is_linked_to_sessions: false,
      });
      prisma.club_subscription_refunds.aggregate.mockResolvedValue({ _sum: { refund_amount: 100 } });
      expect(await preview()).toMatchObject({ transferableCredit: 1000, additionalDue: 100 });
    });
    it('does not credit unpaid debt or discounts as cash', async () => {
      prisma.club_subscriptions.findUnique.mockResolvedValue({
        ...source, subscription_value: 500, paid_amount: 200,
        discount_enabled: true, discount_value: 50, remaining_amount: 250,
        is_linked_to_sessions: false,
      });
      expect(await preview()).toMatchObject({ transferableCredit: 200, additionalDue: 900 });
    });
    it.each(['cash', 'visa'] as const)('records only the 600 difference via %s and carries the 500 as settlement credit', async (paymentMethod) => {
      const destination = { id: 99, subscription_number: 'PT41T2N1' };
      const tx = {
        ...prisma,
        $queryRaw: jest.fn().mockResolvedValue([]),
        club_subscriptions: {
          ...prisma.club_subscriptions,
          create: jest.fn().mockResolvedValue(destination),
          update: jest.fn().mockResolvedValue({}),
        },
        club_subscription_refunds: {
          ...prisma.club_subscription_refunds, findFirst: jest.fn().mockResolvedValue(null),
        },
        club_subscription_transfers: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({ id: 20, branch_id: 6 }),
        },
        club_subscription_freezes: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };
      const receipts = { createForSubscription: jest.fn().mockResolvedValue({ receipt_number: 'R600' }) };
      const accounting = { postJournal: jest.fn().mockResolvedValue(undefined) };
      const savingService = new ClubSubscriptionTransfersService(
        { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } as unknown as PrismaService,
        receipts as unknown as ClubReceiptsService,
        accounting as unknown as ClubSubscriptionAccountingService,
        { log: jest.fn().mockResolvedValue(undefined) } as unknown as BusinessAuditService,
        branchScope as unknown as BranchScopeService,
        discountCodes,
      );
      await savingService.create({
        subscriptionId: source.id, toSubscriptionTypeId: sessionsTarget.id,
        toStartDate: today, additionalPaidAmount: 600, paymentMethod,
      }, user);
      expect(tx.club_subscriptions.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        subscription_start_date: source.subscription_start_date,
        subscription_end_date: addDays(source.subscription_start_date, 89),
        subscription_value: 1100, paid_amount: 600,
        transferred_credit_amount: 500, remaining_amount: 0,
      }) });
      expect(receipts.createForSubscription).toHaveBeenCalledTimes(1);
      expect(receipts.createForSubscription).toHaveBeenCalledWith(99, 600, expect.any(Object), tx);
      expect(accounting.postJournal).toHaveBeenCalledWith(expect.objectContaining({ paidAmount: 600, kind: 'payment', paymentMethod }), tx);
      expect(tx.club_subscriptions.update).toHaveBeenCalledWith({
        where: { id: source.id }, data: expect.objectContaining({ transferred_out_amount: 500, remaining_amount: 0, status: 'expired' }),
      });
    });

    it('allows an unpaid active subscription and charges the entire new price', async () => {
      prisma.club_subscriptions.findUnique.mockResolvedValue({
        ...source, paid_amount: 0, is_linked_to_sessions: false,
      });
      expect(await preview()).toMatchObject({ transferableCredit: 0, additionalDue: 1100 });
    });
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
});
