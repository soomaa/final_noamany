import { BadRequestException } from '@nestjs/common';
import { ClubSubscriptionRefundsService } from './club-subscription-refunds.service';
import { addDays, deriveSessionAwareStatus } from './club-subscription.utils';
import { localDateString } from '../club-members/club-member.utils';

function makeService(sub: Record<string, unknown>, opts: { completedRefunds?: number } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  let refundRow: Record<string, unknown> | null = null;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: sub.id }]),
    club_subscriptions: {
      findUnique: jest.fn(async ({ where }) => where.id ? sub : null),
      update: jest.fn(async ({ data }) => {
        updates.push(data);
        return { ...sub, ...data };
      }),
    },
    club_subscription_refunds: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { refund_amount: null } }),
      count: jest.fn().mockResolvedValue(opts.completedRefunds ?? 0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }) => (refundRow = { id: 1, ...data })),
      updateMany: jest.fn(async () => {
        refundRow = { ...refundRow, status: 'completed' };
        return { count: 1 };
      }),
      findUnique: jest.fn(async () => refundRow),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const accounting = { postJournal: jest.fn() };
  const receipts = { recalculateSubscriptionPayments: jest.fn() };
  const audit = { log: jest.fn() };
  const branchScope = { isBranchAllowed: () => true, allowedBranchIds: () => null };
  const service = new ClubSubscriptionRefundsService(
    prisma as never,
    accounting as never,
    receipts as never,
    audit as never,
    branchScope as never,
  );
  return { service, updates, accounting };
}

describe('ClubSubscriptionRefundsService — refund closes the subscription', () => {
  const today = localDateString();
  const baseSub = {
    id: 7,
    member_id: 3,
    branch_id: 1,
    customer_name: 'Test',
    subscription_number: 'S-7',
    subscription_type: 'monthly',
    subscription_start_date: addDays(today, -10),
    subscription_end_date: addDays(today, 19),
    subscription_value: 300,
    discount_enabled: false,
    discount_value: 0,
    paid_amount: 100,
    payment_method: 'cash',
    is_linked_to_sessions: false,
    sessions_count: null,
    sessions_used: 0,
  };

  it('a zero refund (consumption covers the paid amount) still closes the subscription today', async () => {
    const { service, updates, accounting } = makeService(baseSub);
    const out = (await service.create({ subscriptionId: 7, stopDate: today })) as { refundAmount: number; status: string };

    expect(out.refundAmount).toBe(0);
    expect(out.status).toBe('completed');
    const close = updates.find((u) => u.status === 'expired')!;
    expect(close.subscription_end_date).toBe(addDays(today, -1));
    expect(deriveSessionAwareStatus({
      startDate: baseSub.subscription_start_date,
      endDate: close.subscription_end_date as string,
      isLinkedToSessions: false,
    })).toBe('expired');
    expect(accounting.postJournal).not.toHaveBeenCalled();
  });

  it('burns remaining sessions so a session package cannot be used after refund', async () => {
    const sub = { ...baseSub, is_linked_to_sessions: true, sessions_count: 12, sessions_used: 11 };
    const { service, updates } = makeService(sub);
    await service.create({ subscriptionId: 7, stopDate: today });

    const close = updates.find((u) => u.status === 'expired')!;
    expect(close.sessions_used).toBe(12);
    expect(deriveSessionAwareStatus({
      startDate: sub.subscription_start_date,
      endDate: close.subscription_end_date as string,
      isLinkedToSessions: true,
      sessionsCount: 12,
      sessionsUsed: close.sessions_used as number,
    })).toBe('expired');
  });

  it('refuses a second refund on an already refunded subscription', async () => {
    const { service } = makeService(baseSub, { completedRefunds: 1 });
    await expect(service.create({ subscriptionId: 7, stopDate: today })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
