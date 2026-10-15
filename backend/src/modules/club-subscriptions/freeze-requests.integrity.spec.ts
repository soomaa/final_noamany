import { BadRequestException } from '@nestjs/common';
import { FreezeRequestsService } from './freeze-requests.service';

describe('member freeze requests: atomic decisions and scheduling', () => {
  const user = { sub: 9, branch: 1, level: 1 } as any;
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-15T09:00:00Z')));
  afterEach(() => jest.useRealTimers());

  function setup(status: string | null = 'pending') {
    let state: any = {
      sub: { id: 1, member_id: 7, branch_id: 1, status: 'active', subscription_end_date: '2027-12-31' },
      requests: status ? [{ id: 1, subscription_id: 1, member_id: 7, branch_id: 1, status,
        start_date: '2026-10-15', days: 5, reason: 'سفر', decided_by: 9 }] : [],
    };
    let failWrite = false;
    const clone = (value: any) => structuredClone(value);
    const models = (read: () => any) => ({
      club_subscriptions: { findUnique: jest.fn(async () => clone(read().sub)) },
      club_freeze_requests: {
        findUnique: jest.fn(async ({ where }) => clone(read().requests.find((row: any) => row.id === where.id) ?? null)),
        findFirst: jest.fn(async ({ where }) => clone(read().requests.find((row: any) => row.subscription_id === where.subscription_id && where.status.in.includes(row.status)) ?? null)),
        findMany: jest.fn(async () => clone(read().requests.filter((row: any) => row.status === 'scheduled'))),
        create: jest.fn(async ({ data }) => { const row = { id: read().requests.length + 1, ...data }; read().requests.push(row); return clone(row); }),
        update: jest.fn(async ({ where, data }) => {
          if (failWrite) throw new Error('request update failed');
          return Object.assign(read().requests.find((row: any) => row.id === where.id), data);
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          const rows = read().requests.filter((row: any) => row.id === where.id && row.status === where.status);
          rows.forEach((row: any) => Object.assign(row, data)); return { count: rows.length };
        }),
      },
    });
    let currentTx: any;
    let txState: any;
    let tail = Promise.resolve();
    const prisma: any = {
      ...models(() => state), am_member_notifications: { create: jest.fn() },
      $transaction: jest.fn((work: any) => {
        const result = tail.then(async () => {
          txState = clone(state);
          currentTx = { ...models(() => txState), $queryRaw: jest.fn().mockResolvedValue([]) };
          const result = await work(currentTx);
          state = txState;
          return result;
        });
        tail = result.then(() => undefined, () => undefined);
        return result;
      }),
    };
    const subscriptions = {
      assertFreezable: jest.fn(),
      freeze: jest.fn(async (_id, _days, _reason, _actor, _user, client) => {
        const target = client === currentTx ? txState : state;
        if (target.sub.status === 'frozen') throw new BadRequestException('مجمّد بالفعل');
        target.sub.status = 'frozen';
      }),
    };
    const service = new FreezeRequestsService(prisma, subscriptions as never, { isBranchAllowed: () => true } as never);
    return { service, prisma, subscriptions, failWrites: () => { failWrite = true; }, get state() { return state; } };
  }

  it('permits exactly one decision when approval and rejection race', async () => {
    const f = setup();
    const results = await Promise.allSettled([f.service.approve(1, user), f.service.reject(1, 'إلغاء', user)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(f.state.requests[0].status).toBe('approved');
    expect(f.state.sub.status).toBe('frozen');
    expect(f.prisma.am_member_notifications.create).toHaveBeenCalledTimes(1);
  });
  it('rolls back the freeze if recording the approved request fails', async () => {
    const f = setup(); f.failWrites();
    await expect(f.service.approve(1, user)).rejects.toThrow('request update failed');
    expect(f.state.requests[0].status).toBe('pending');
    expect(f.state.sub.status).toBe('active');
    expect(f.prisma.am_member_notifications.create).not.toHaveBeenCalled();
  });
  it('does not duplicate a member request submitted twice at the same time', async () => {
    const f = setup(null);
    const payload = { subscriptionId: 1, startDate: '2026-10-20', days: 5 };
    const results = await Promise.allSettled([f.service.createFromApp({ memberId: 7 } as any, payload), f.service.createFromApp({ memberId: 7 } as any, payload)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(f.state.requests).toHaveLength(1);
  });
  it('does not let a scheduled job overwrite a rejection or apply a freeze twice', async () => {
    const f = setup('scheduled');
    await Promise.allSettled([f.service.runDueScheduled('2026-10-15'), f.service.reject(1, undefined, user)]);
    const status = f.state.requests[0].status;
    expect(['approved', 'rejected']).toContain(status);
    expect(f.state.sub.status === 'frozen').toBe(status === 'approved');
    expect(f.subscriptions.freeze.mock.calls.length).toBeLessThanOrEqual(1);
  });
  it('keeps scheduled requests retryable after a transient failure', async () => {
    const f = setup('scheduled');
    f.subscriptions.freeze.mockRejectedValueOnce(new Error('connection lost'));
    expect(await f.service.runDueScheduled('2026-10-15')).toEqual({ due: 1, applied: 0 });
    expect(f.state.requests[0].status).toBe('scheduled');
    expect(await f.service.runDueScheduled('2026-10-15')).toEqual({ due: 1, applied: 1 });
  });
  it('rejects rollover dates and requests that start beyond the subscription expiry', async () => {
    const f = setup(null);
    await expect(f.service.createFromApp({ memberId: 7 } as any, { subscriptionId: 1, startDate: '2027-02-30', days: 5 })).rejects.toThrow('غير صحيح');
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    await expect(f.service.createFromApp({ memberId: 7 } as any, { subscriptionId: 1, startDate: '2028-01-01', days: 5 })).rejects.toThrow('انتهاء');
  });
  it('still allows rejection of an obsolete request after the subscription expires', async () => {
    const f = setup('scheduled');
    f.state.requests[0].start_date = '2026-10-20';
    f.state.sub.subscription_end_date = '2026-10-19';
    await expect(f.service.reject(1, undefined, user)).resolves.toMatchObject({ status: 'rejected' });
    expect(f.subscriptions.freeze).not.toHaveBeenCalled();
  });
  it('refuses to freeze a subscription that has since been reassigned to another member', async () => {
    const f = setup(); f.state.sub.member_id = 99;
    await expect(f.service.approve(1, user)).rejects.toThrow('صاحب الاشتراك');
    expect(f.subscriptions.freeze).not.toHaveBeenCalled();
  });
});
