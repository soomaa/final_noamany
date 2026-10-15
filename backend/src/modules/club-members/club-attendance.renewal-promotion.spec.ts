import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { EntitlementService } from '../gym-ops/entitlement.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { ClubSubscriptionLifecycleService } from '../club-subscriptions/club-subscription-lifecycle.service';
import { WebhookService } from '../webhooks/webhook.service';
import { ClubAttendanceService } from './club-attendance.service';
import { ClubMembersService } from './club-members.service';

describe('ClubAttendanceService renewal promotion', () => {
  it('promotes the queued renewal in the same transaction after consuming the final session', async () => {
    const attendance = {
      id: 70,
      member_id: 9,
      member_code: 'A000009',
      member_name: 'Member',
      subscription_id: 41,
      subscription_type: 'Yoga',
      branch_id: 2,
      check_in_time: new Date('2026-08-29T10:00:00+03:00'),
      check_out_time: null,
      attendance_date: '2026-08-29',
      status: 'checked_in',
      duration: null,
      notes: null,
      is_grace_session: false,
      override_reason: null,
      created_by: 5,
      created_at: new Date(),
    };
    const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      club_subscriptions: {
        findUnique: jest.fn().mockResolvedValue({ member_id: 9, branch_id: 2, status: 'active', freezes: [], sessions_count: 5, sessions_used: 5 }),
      },
      club_attendance: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(attendance),
        update: jest.fn(),
      },
      club_class_enrollments: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    const prisma = {
      // No recent visit, so the duplicate-press guard never short-circuits this case.
      club_attendance: { findFirst: jest.fn().mockResolvedValue(null) },
      club_subscriptions: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ member_id: 9, branch_id: 2 })
          .mockResolvedValueOnce({ private_package_id: null }),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const members = {
      resolveByIdOrCode: jest.fn().mockResolvedValue({
        id: 9,
        member_code: 'A000009',
        name: 'Member',
        branch_id: 2,
      }),
    };
    const entitlement = {
      validate: jest.fn().mockResolvedValue({
        allowed: true,
        reasons: [], warnings: [],
        activeSubscription: {
          id: 41,
          subscriptionType: 'Yoga',
          specialClassTypeId: null,
          isLinkedToSessions: true,
          sessionsRemaining: 1,
          endDate: '2026-09-01',
        },
      }),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const automation = { emit: jest.fn() };
    const webhooks = { dispatch: jest.fn() };
    const permissions = { canAny: jest.fn() };
    const branchScope = { resolveListFilter: jest.fn() };
    const lifecycle = {
      promoteAfterQuotaExhaustion: jest.fn().mockResolvedValue({
        activatedSubscriptionId: 52,
        shiftedSubscriptionIds: [52],
        shiftDays: 3,
      }),
      syncActivatedMember: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ClubAttendanceService(
      prisma as unknown as PrismaService,
      members as unknown as ClubMembersService,
      entitlement as unknown as EntitlementService,
      audit as unknown as BusinessAuditService,
      automation as unknown as AutomationEngineService,
      webhooks as unknown as WebhookService,
      permissions as unknown as PermissionEngineService,
      branchScope as unknown as BranchScopeService,
      lifecycle as unknown as ClubSubscriptionLifecycleService,
    );

    await service.checkIn(
      { memberId: 9, consumeSession: true },
      { sub: 5, level: 2, branch: 2 } as never,
      new Date('2026-08-29T10:00:00+03:00'),
    );

    expect(lifecycle.promoteAfterQuotaExhaustion).toHaveBeenCalledWith(
      41,
      '2026-08-29',
      tx,
    );
    expect(lifecycle.syncActivatedMember).toHaveBeenCalledWith(52);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'club_subscription',
        entityId: 52,
        action: 'subscription_renewal_activated_early',
      }),
    );
  });
});

