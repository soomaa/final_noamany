import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionsService } from './club-subscriptions.service';
import { addDays } from './club-subscription.utils';
import { localDateString } from '../club-members/club-member.utils';

describe('ClubSubscriptionsService.freeze', () => {
  const today = localDateString();
  const freezeEnd = addDays(today, 5);
  const originalEnd = addDays(today, 20);
  const subscription = {
    id: 41,
    branch_id: 1,
    subscription_start_date: addDays(today, -10),
    subscription_end_date: originalEnd,
    subscription_type_id: null,
    status: 'active',
    is_linked_to_sessions: false,
    sessions_count: null,
    sessions_used: 0,
  };
  const tx = {
    club_subscription_freezes: { create: jest.fn() },
    club_subscriptions: { update: jest.fn() },
  };
  const prisma = {
    club_subscriptions: { findUnique: jest.fn() },
    club_subscription_freezes: { findFirst: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };
  const branchScope = { isBranchAllowed: jest.fn() };
  const audit = { log: jest.fn() };

  const service = new ClubSubscriptionsService(
    prisma as unknown as PrismaService,
    {} as ClubReceiptsService,
    {} as ClubSubscriptionAccountingService,
    audit as unknown as BusinessAuditService,
    {} as AutomationEngineService,
    branchScope as unknown as BranchScopeService,
    {} as PermissionEngineService,
    { resolveDiscount: jest.fn() } as unknown as import('./club-discount-codes.service').ClubDiscountCodesService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    branchScope.isBranchAllowed.mockReturnValue(true);
    prisma.club_subscriptions.findUnique.mockResolvedValue(subscription);
    prisma.club_subscription_freezes.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
    tx.club_subscriptions.update.mockResolvedValue({ ...subscription, status: 'frozen' });
    audit.log.mockResolvedValue(undefined);
  });

  it('extends the subscription end date by the selected freeze period as soon as the freeze starts', async () => {
    await (service.freeze as any)(41, undefined, 'سفر', 5, undefined, today, freezeEnd);

    expect(tx.club_subscription_freezes.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        freeze_start_date: today,
        freeze_end_date: freezeEnd,
        planned_days: 5,
        original_end_date: originalEnd,
      }),
    });
    expect(tx.club_subscriptions.update).toHaveBeenCalledWith({
      where: { id: 41 },
      data: { status: 'frozen', subscription_end_date: addDays(originalEnd, 5) },
    });
  });
});
