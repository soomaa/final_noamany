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

/** Booked freezes, renewals that move with a freeze, editing and deleting a freeze (22 Nov). */
describe('ClubSubscriptionsService freeze booking, renewals, edit and delete', () => {
  const today = localDateString();
  const end = addDays(today, 20);
  const base = {
    id: 41, branch_id: 1, member_id: 7, subscription_number: 'B868-9', subscription_type_id: 3,
    subscription_start_date: addDays(today, -10), subscription_end_date: end, status: 'active',
    is_linked_to_sessions: false, sessions_count: null, sessions_used: 0,
  };
  // The renewal sold for the period after the subscription (starts the day after it ends).
  const renewal = { ...base, id: 42, subscription_number: 'B868-10', subscription_start_date: addDays(end, 1), subscription_end_date: addDays(end, 31), status: 'upcoming' };

  let tx: any;
  let prisma: any;
  let service: ClubSubscriptionsService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn(),
      club_subscription_types: { findUnique: jest.fn().mockResolvedValue(null) },
      club_subscription_freezes: {
        create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]),
      },
      club_subscriptions: {
        findUnique: jest.fn().mockResolvedValue(base),
        // renewal queue: the renewal once, then nothing after it
        findFirst: jest.fn().mockResolvedValueOnce(renewal).mockResolvedValue(null),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...base, ...data })),
      },
    };
    prisma = {
      club_subscriptions: { findUnique: jest.fn().mockResolvedValue(base) },
      club_subscription_freezes: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      club_attendance: { findFirst: jest.fn().mockResolvedValue(null) },
      club_members: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (fn: (client: any) => unknown) => fn(tx)),
    };
    service = new ClubSubscriptionsService(
      prisma as unknown as PrismaService,
      {} as ClubReceiptsService,
      {} as ClubSubscriptionAccountingService,
      { log: jest.fn() } as unknown as BusinessAuditService,
      {} as AutomationEngineService,
      { isBranchAllowed: jest.fn().mockReturnValue(true) } as unknown as BranchScopeService,
      {} as PermissionEngineService,
      { resolveDiscount: jest.fn() } as never,
      {} as never,
    );
    jest.spyOn(service as any, 'syncMemberProfileFromSubscription').mockResolvedValue(undefined);
  });

  it('books a freeze for a later day without freezing the member today', async () => {
    const start = addDays(today, 3);
    await (service.freeze as any)(41, undefined, 'سفر', 5, undefined, start, addDays(start, 5));
    expect(tx.club_subscription_freezes.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ freeze_start_date: start, planned_days: 5, is_active: false }),
    });
    expect(tx.club_subscriptions.update).not.toHaveBeenCalled();
  });

  it('refuses a booking more than 90 days ahead and a start more than 30 days back', async () => {
    await expect((service.freeze as any)(41, 5, undefined, 5, undefined, addDays(today, 91))).rejects.toThrow('90');
    await expect((service.freeze as any)(41, 5, undefined, 5, undefined, addDays(today, -31))).rejects.toThrow('30');
  });

  it('refuses a backdated start when the member came after it', async () => {
    prisma.club_attendance.findFirst.mockResolvedValue({ attendance_date: addDays(today, -2) });
    await expect((service.freeze as any)(41, 5, undefined, 5, undefined, addDays(today, -5))).rejects.toThrow('سجّل حضور');
  });

  it('moves the waiting renewal when a freeze starts today', async () => {
    await (service.freeze as any)(41, 5, undefined, 5, undefined, today);
    expect(tx.club_subscriptions.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 42 },
      data: expect.objectContaining({ subscription_start_date: addDays(end, 6), subscription_end_date: addDays(end, 36) }),
    }));
    expect(tx.club_subscriptions.update).toHaveBeenCalledWith({ where: { id: 41 }, data: { status: 'frozen', subscription_end_date: addDays(end, 5) } });
  });

  it('starts a booked freeze on its day (daily job)', async () => {
    prisma.club_subscription_freezes.findMany.mockResolvedValue([{ id: 9, subscription_id: 41, freeze_start_date: today, planned_days: 4, is_active: false, actual_days: null }]);
    const started = await service.startDueFreezes();
    expect(started).toBe(1);
    expect(tx.club_subscription_freezes.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { is_active: true, original_end_date: end } });
    expect(tx.club_subscriptions.update).toHaveBeenCalledWith({ where: { id: 41 }, data: { status: 'frozen', subscription_end_date: addDays(end, 4) } });
  });

  it('deletes a running freeze: its days come off the end date and the renewal moves back', async () => {
    const frozen = { ...base, status: 'frozen', subscription_end_date: addDays(end, 5) };
    tx.club_subscriptions.findUnique.mockResolvedValue(frozen);
    tx.club_subscriptions.findFirst = jest.fn()
      .mockResolvedValueOnce({ ...renewal, subscription_start_date: addDays(end, 6), subscription_end_date: addDays(end, 36) })
      .mockResolvedValue(null);
    tx.club_subscription_freezes.findFirst.mockResolvedValue({ id: 9, subscription_id: 41, freeze_start_date: today, planned_days: 5, actual_days: null, is_active: true });
    await service.deleteFreeze(41, 9);
    expect(tx.club_subscription_freezes.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    expect(tx.club_subscriptions.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 42 }, data: expect.objectContaining({ subscription_start_date: addDays(end, 1) }),
    }));
    expect(tx.club_subscriptions.update).toHaveBeenCalledWith({ where: { id: 41 }, data: { subscription_end_date: end, status: 'active' } });
  });

  it('shortens an ended freeze: the end date moves back by the difference', async () => {
    tx.club_subscriptions.findFirst = jest.fn().mockResolvedValue(null);
    tx.club_subscription_freezes.findFirst.mockResolvedValue({ id: 8, subscription_id: 41, freeze_start_date: addDays(today, -9), planned_days: 7, actual_days: 7, is_active: false });
    await service.editFreezeDays(41, 8, 4);
    expect(tx.club_subscription_freezes.update).toHaveBeenCalledWith({
      where: { id: 8 }, data: { planned_days: 4, actual_days: 4, freeze_end_date: addDays(today, -5) },
    });
    expect(tx.club_subscriptions.update).toHaveBeenCalledWith({ where: { id: 41 }, data: { subscription_end_date: addDays(end, -3), status: 'active' } });
  });

  it('keeps the freezes of a subscription synced from the old system read-only', async () => {
    tx.club_subscriptions.findUnique.mockResolvedValue({ ...base, subscription_number: 'LEG-S-28229' });
    await expect(service.deleteFreeze(41, 9)).rejects.toThrow('السيستم القديم');
    prisma.club_subscriptions.findUnique.mockResolvedValue({ ...base, subscription_number: 'LEG-S-28229' });
    await expect((service.freeze as any)(41, 5)).rejects.toThrow('السيستم القديم');
  });
});
