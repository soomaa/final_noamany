import { ConflictException } from '@nestjs/common';
import { ClubSubscriptionLifecycleService } from './club-subscription-lifecycle.service';

describe('ClubSubscriptionLifecycleService', () => {
  const rows = new Map<number, Record<string, unknown>>();
  const tx = {
    club_subscriptions: {
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) => rows.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: { where: { id: number }; data: object }) => ({ ...rows.get(where.id), ...data })),
    },
  };
  const service = new ClubSubscriptionLifecycleService(tx as never);
  const node = (id: number, start: string, end: string, successorId?: number, extra: Record<string, unknown> = {}) => ({
    id, member_id: 9, branch_id: 2, subscription_start_date: start, subscription_end_date: end,
    is_linked_to_sessions: true, sessions_count: 5, sessions_used: id === 10 ? 5 : 0,
    status: id === 10 ? 'expired' : 'upcoming',
    renewal_successor: successorId ? { id: successorId, member_id: 9, branch_id: 2 } : null,
    freezes: [], ...extra,
  });

  beforeEach(() => {
    jest.clearAllMocks(); rows.clear();
    rows.set(10, node(10, '2026-08-01', '2026-08-31', 11));
    rows.set(11, node(11, '2026-09-01', '2026-10-01', 12));
    rows.set(12, node(12, '2026-10-02', '2026-11-01'));
  });

  it('moves the full queued renewal lineage earlier when sessions end early', async () => {
    await expect(service.promoteAfterQuotaExhaustion(10, '2026-08-29', tx as never)).resolves.toEqual({
      activatedSubscriptionId: 11, shiftedSubscriptionIds: [11, 12], shiftDays: 3,
    });
    expect(tx.club_subscriptions.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 11 }, data: expect.objectContaining({ subscription_start_date: '2026-08-29', status: 'active' }),
    }));
  });

  it('rejects a renewal lineage that changes member ownership', async () => {
    rows.set(11, node(11, '2026-09-01', '2026-10-01', 12, { member_id: 99 }));
    await expect(service.findTail(10, tx as never)).rejects.toBeInstanceOf(ConflictException);
  });
});
