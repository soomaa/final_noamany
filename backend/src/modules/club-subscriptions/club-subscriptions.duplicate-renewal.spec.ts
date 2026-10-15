import { ConflictException } from '@nestjs/common';
import { ClubSubscriptionsService } from './club-subscriptions.service';

describe('ClubSubscriptionsService duplicate renewal guidance', () => {
  // The fixture subscription ends 2026-09-01; past that date it is no longer live and
  // no duplicate conflict is raised. Pin the clock so the guard is exercised for real.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a structured 409 that routes the sale into same-package renewal', async () => {
    const prisma = {
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 41,
            status: 'active',
            subscription_start_date: '2026-08-01',
            subscription_end_date: '2026-09-01',
            is_linked_to_sessions: false,
            sessions_count: null,
            sessions_used: 0,
          },
        ]),
      },
    };
    const service = new ClubSubscriptionsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    let caught: unknown;
    try {
      await (service as any).assertNoDuplicateLiveSubscription({
        memberId: 9,
        subscriptionTypeId: 7,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toEqual({
      statusCode: 409,
      code: 'SUBSCRIPTION_RENEWAL_REQUIRED',
      message: 'العضو لديه نفس الباقة بالفعل — استخدم تجديد / تمديد',
      existingSubscriptionId: 41,
      canRenew: true,
    });
  });

  it('uses the immutable private package id instead of its mutable display name', async () => {
    const prisma = { club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new ClubSubscriptionsService(
      prisma as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
    );
    await (service as any).assertNoDuplicateLiveSubscription({
      memberId: 9, privatePackageId: 8, subscriptionType: 'Renamed package',
    });
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ private_package_id: 8 }) }),
    );
  });
});
