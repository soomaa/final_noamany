import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClubSubscriptionLifecycleService } from './club-subscription-lifecycle.service';

describe('ClubSubscriptionLifecycleService', () => {
  const rows = new Map<number, Record<string, unknown>>();
  const tx = {
    club_subscriptions: {
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) => rows.get(where.id) ?? null),
      update: jest.fn(async ({ where, data }: { where: { id: number }; data: object }) => ({
        ...rows.get(where.id),
        ...data,
      })),
    },
  };
  const prisma = tx as unknown as PrismaService;
  const service = new ClubSubscriptionLifecycleService(prisma);

  const node = (
    id: number,
    start: string,
    end: string,
    successorId?: number,
    overrides: Record<string, unknown> = {},
  ) => ({
    id,
    member_id: 9,
    branch_id: 2,
    subscription_start_date: start,
    subscription_end_date: end,
    is_linked_to_sessions: true,
    sessions_count: 5,
    sessions_used: id === 10 ? 5 : 0,
    status: id === 10 ? 'expired' : 'upcoming',
    renewal_successor: successorId ? { id: successorId, member_id: 9, branch_id: 2 } : null,
    freezes: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    rows.clear();
    rows.set(10, node(10, '2026-08-01', '2026-08-31', 11));
    rows.set(11, node(11, '2026-09-01', '2026-10-01', 12));
    rows.set(12, node(12, '2026-10-02', '2026-11-01'));
  });

  it('moves the successor to today and shifts every descendant by the same days', async () => {
    const result = await service.promoteAfterQuotaExhaustion(
      10,
      '2026-08-29',
      tx as never,
    );

    expect(result).toEqual({
      activatedSubscriptionId: 11,
      shiftedSubscriptionIds: [11, 12],
      shiftDays: 3,
    });
    expect(tx.club_subscriptions.update).toHaveBeenNthCalledWith(1, {
      where: { id: 11 },
      data: expect.objectContaining({
        subscription_start_date: '2026-08-29',
        subscription_end_date: '2026-09-28',
        status: 'active',
      }),
    });
    expect(tx.club_subscriptions.update).toHaveBeenNthCalledWith(2, {
      where: { id: 12 },
      data: expect.objectContaining({
        subscription_start_date: '2026-09-29',
        subscription_end_date: '2026-10-29',
        status: 'upcoming',
      }),
    });
  });

  it('is idempotent when the successor already starts today', async () => {
    rows.set(11, node(11, '2026-08-29', '2026-09-28', 12));

    await expect(
      service.promoteAfterQuotaExhaustion(10, '2026-08-29', tx as never),
    ).resolves.toMatchObject({
      activatedSubscriptionId: 11,
      shiftDays: 0,
      shiftedSubscriptionIds: [],
    });
    expect(tx.club_subscriptions.update).not.toHaveBeenCalled();
  });

  it('rejects a chain that crosses to another member', async () => {
    rows.set(11, node(11, '2026-09-01', '2026-10-01', 12, { member_id: 99 }));

    await expect(service.findTail(10, tx as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects renewal when any queued descendant is frozen', async () => {
    rows.set(12, node(12, '2026-10-02', '2026-11-01', undefined, {
      status: 'frozen', freezes: [{ id: 77 }],
    }));
    await expect(service.findTail(10, tx as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not shift descendants when a later queued period is frozen', async () => {
    rows.set(12, node(12, '2026-10-02', '2026-11-01', undefined, {
      status: 'frozen', freezes: [{ id: 77 }],
    }));
    await expect(service.promoteAfterQuotaExhaustion(10, '2026-08-29', tx as never))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.club_subscriptions.update).not.toHaveBeenCalled();
  });
});
