import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { localDateString } from '../club-members/club-member.utils';
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
    club_subscription_types: { findUnique: jest.fn() },
    club_subscription_refunds: { aggregate: jest.fn() },
    club_subscription_type_session_prices: { findMany: jest.fn() },
  };
  const branchScope = {
    isBranchAllowed: jest.fn().mockReturnValue(true),
    allowedBranchIds: jest.fn().mockReturnValue(null),
  };
  const service = new ClubSubscriptionTransfersService(
    prisma as unknown as PrismaService,
    {} as ClubReceiptsService,
    {} as ClubSubscriptionAccountingService,
    {} as BusinessAuditService,
    branchScope as unknown as BranchScopeService,
  );
  const user = {
    sub: 1,
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
    prisma.club_subscription_types.findUnique.mockResolvedValue(sessionsTarget);
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
    prisma.club_subscription_types.findUnique.mockResolvedValue({
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

  it('rejects a target plan assigned to another branch', async () => {
    prisma.club_subscription_types.findUnique.mockResolvedValue({
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

