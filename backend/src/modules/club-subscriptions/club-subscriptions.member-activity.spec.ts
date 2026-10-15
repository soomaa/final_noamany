import { ClubSubscriptionsService } from './club-subscriptions.service';

describe('ClubSubscriptionsService member activity reconciliation', () => {
  it('keeps the member active when the edited subscription is expired but another package is live', async () => {
    const expired = {
      id: 20,
      member_id: 7,
      subscription_start_date: '2025-01-01',
      subscription_end_date: '2025-01-31',
      subscription_type_id: null,
      status: 'expired',
      is_linked_to_sessions: true,
      sessions_count: 8,
      sessions_used: 8,
    };
    const liveZumba = {
      id: 21,
      member_id: 7,
      subscription_start_date: '2020-01-01',
      subscription_end_date: '2098-12-31',
      subscription_type_id: null,
      status: 'active',
      is_linked_to_sessions: true,
      sessions_count: 8,
      sessions_used: 3,
    };
    const prisma = {
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([liveZumba, expired]),
      },
      club_members: {
        update: jest.fn().mockResolvedValue({ id: 7 }),
      },
      club_subscription_types: { findUnique: jest.fn() },
      club_membership_types: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
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

    await (service as unknown as {
      syncMemberProfileFromSubscription(subscription: typeof expired): Promise<void>;
    }).syncMemberProfileFromSubscription(expired);

    expect(prisma.club_members.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        start_date: liveZumba.subscription_start_date,
        end_date: liveZumba.subscription_end_date,
        is_active: true,
      },
    });
  });
});
