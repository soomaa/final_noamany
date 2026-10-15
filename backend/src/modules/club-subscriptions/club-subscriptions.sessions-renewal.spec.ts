import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { ClubDiscountCodesService } from './club-discount-codes.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubSubscriptionLifecycleService } from './club-subscription-lifecycle.service';
import { ClubSubscriptionsService } from './club-subscriptions.service';

describe('ClubSubscriptionsService session renewal promotion', () => {
  it('promotes a queued renewal when reception consumes the final session manually', async () => {
    const source = {
      id: 41,
      branch_id: 2,
      member_id: 9,
      subscription_start_date: '2026-08-01',
      subscription_end_date: '2026-09-01',
      subscription_type_id: 7,
      status: 'active',
      freezes: [],
      is_linked_to_sessions: true,
      sessions_count: 5,
      sessions_used: 4,
    };
    const updated = { ...source, sessions_used: 5 };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      club_subscriptions: {
        update: jest.fn().mockResolvedValue(updated),
        findUnique: jest.fn().mockResolvedValue(updated),
      },
    };
    const prisma = {
      club_subscriptions: { findUnique: jest.fn().mockResolvedValue(source) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const lifecycle = {
      promoteAfterQuotaExhaustion: jest.fn().mockResolvedValue({
        activatedSubscriptionId: 52,
        shiftedSubscriptionIds: [52],
        shiftDays: 3,
      }),
      syncActivatedMember: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ClubSubscriptionsService(
      prisma as unknown as PrismaService,
      { createForSubscription: jest.fn() } as unknown as ClubReceiptsService,
      { postJournal: jest.fn() } as unknown as ClubSubscriptionAccountingService,
      audit as unknown as BusinessAuditService,
      { emit: jest.fn() } as unknown as AutomationEngineService,
      { isBranchAllowed: jest.fn().mockReturnValue(true) } as unknown as BranchScopeService,
      { isSuperAdmin: jest.fn() } as unknown as PermissionEngineService,
      { resolveDiscount: jest.fn() } as unknown as ClubDiscountCodesService,
      lifecycle as unknown as ClubSubscriptionLifecycleService,
    );

    await service.useSession(41, { sub: 5 } as never);

    expect(lifecycle.promoteAfterQuotaExhaustion).toHaveBeenCalledWith(
      41,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      tx,
    );
    expect(lifecycle.syncActivatedMember).toHaveBeenCalledWith(52);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 52,
        action: 'subscription_renewal_activated_early',
      }),
    );
  });
});

