import { ClubLockersService } from './club-lockers.service';

function fixture(status = 'active') {
  let sub: Record<string, any> = { id: 1, main_branch_id: 2, locker_id: 3, member_id: null,
    customer_name: 'عضو', subscription_number: 'L1', subscription_start_date: '2026-10-01',
    subscription_end_date: '2026-10-30', status, paid_amount: 0, subscription_value: 100,
    discount_enabled: false, discount_value: 0, type: { has_stop: true, stop_days: 10 } };
  let available = false;
  let tail = Promise.resolve();
  const payments: number[] = [];
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    club_locker_subscriptions: {
      findUnique: jest.fn(async () => ({ ...sub })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(async ({ data }) => (sub = { ...sub, ...data })),
    },
    club_locker_handoffs: { findFirst: jest.fn().mockResolvedValue(null) },
    club_lockers: {
      findUnique: jest.fn(async () => ({ id: 3, is_available: available })),
      update: jest.fn(async ({ data }) => { available = data.is_available; return {}; }),
    },
  };
  const prisma = { ...tx,
    $transaction: async (work: (client: typeof tx) => Promise<unknown>) => {
      const previous = tail; let release!: () => void;
      tail = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try { return await work(tx); } finally { release(); }
    },
  };
  const service = new ClubLockersService(prisma as never, { recordPayment: async (_tx, input) => { payments.push(input.amount); } } as never,
    { isBranchAllowed: () => true } as never);
  return { service, tx, payments, sub: () => sub, available: () => available };
}

describe('locker subscription integrity', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-15T09:00:00Z')); });
  afterEach(() => jest.useRealTimers());

  it('reports frozen and explicitly released subscriptions without deriving them as active', () => {
    const { service } = fixture();
    for (const status of ['frozen', 'expired']) expect((service as any).mapSub({ subscription_start_date: '2026-10-01', subscription_end_date: '2026-10-30', status }).status).toBe(status);
  });

  it('supports MySQL bigint sequence results', async () => {
    const { service, tx } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ maxNum: BigInt(41) }] as never).mockResolvedValueOnce([]);
    expect(await (service as any).generateLockNumber(tx)).toBe('LOCK000042');
  });

  it('extends a locker only once when two freeze actions race', async () => {
    const { service, sub } = fixture();
    const results = await Promise.allSettled([service.freezeSubscription(1, 5), service.freezeSubscription(1, 5)]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(sub()).toMatchObject({ status: 'frozen', subscription_end_date: '2026-11-04' });
  });

  it('rejects fractional freeze days', async () => {
    await expect(fixture().service.freezeSubscription(1, 1.5)).rejects.toThrow();
  });

  it('preserves a frozen locker during an ordinary edit and refuses changing its dates', async () => {
    const { service, sub } = fixture('frozen');
    await service.updateSubscription(1, { customerName: 'اسم جديد' });
    expect(sub().status).toBe('frozen');
    await expect(service.updateSubscription(1, { subscriptionEndDate: '2026-11-01' })).rejects.toThrow();
  });

  it('records only one payment when two identical paid-total edits race', async () => {
    const { service, payments, sub } = fixture();
    await Promise.all([service.updateSubscription(1, { paidAmount: 60 }), service.updateSubscription(1, { paidAmount: 60 })]);
    expect(payments).toEqual([60]); expect(sub().paid_amount).toBe(60);
  });

  it('refuses to reactivate a released subscription after the locker was taken', async () => {
    await expect(fixture('expired').service.updateSubscription(1, { subscriptionEndDate: '2026-11-01' })).rejects.toThrow('غير متاح');
  });

  it('releases a frozen locker immediately and clears its freeze marker', async () => {
    const { service, sub, available } = fixture('frozen');
    await service.releaseSubscription(1);
    expect(sub()).toMatchObject({ status: 'expired', subscription_end_date: '2026-10-14', freeze_start_date: null });
    expect(available()).toBe(true);
  });

  it('does not expire a subscription renewed after the cron scan', async () => {
    const { service, tx, sub } = fixture();
    (tx.club_locker_subscriptions as any).findMany = jest.fn().mockResolvedValue([{ ...sub(), subscription_end_date: '2026-10-14' }]);
    // prisma shares the delegate with tx; its stale scan must not overwrite the live row.
    expect(await service.expireAndReleaseLockers()).toEqual({ subs: 0, lockers: 0 });
    expect(sub().status).toBe('active');
  });
});
