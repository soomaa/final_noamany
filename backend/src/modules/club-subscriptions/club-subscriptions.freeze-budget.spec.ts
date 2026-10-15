import { BadRequestException } from '@nestjs/common';
import { ClubSubscriptionsService } from './club-subscriptions.service';

/**
 * A package may cap the TOTAL number of days a subscription stays frozen
 * (freeze_total_days) on top of the legacy cap on how many TIMES it may be frozen
 * (freeze_days). Budget is consumed by the actual days of every past freeze.
 */
describe('ClubSubscriptionsService freeze budget (إجمالي أيام التجميد)', () => {
  const SUB = {
    id: 5,
    member_id: 9,
    branch_id: 2,
    subscription_type_id: 7,
    status: 'active',
    subscription_start_date: '2026-09-01',
    subscription_end_date: '2026-12-01',
    is_linked_to_sessions: false,
    sessions_count: null,
    sessions_used: 0,
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-17T09:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  const build = (
    typeRow: Record<string, unknown>,
    pastFreezes: Array<Record<string, unknown>>,
    activeFreeze: Record<string, unknown> | null = null,
  ) => {
    const created: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      club_class_enrollments: { count: jest.fn().mockResolvedValue(0) },
      
      club_subscriptions: {
        findUnique: jest.fn(async ({ where }) => where.id ? SUB : null),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          updated.push(data);
          return { ...SUB, ...data };
        }),
      },
      club_subscription_types: { findUnique: jest.fn().mockResolvedValue(typeRow) },
      club_subscription_freezes: {
        findFirst: jest.fn().mockResolvedValue(activeFreeze),
        count: jest.fn().mockResolvedValue(pastFreezes.length),
        findMany: jest.fn(async ({ where }: { where: Record<string, any> }) =>
          pastFreezes.filter((f) => (where.id?.not ? f.id !== where.id.not : true)).map(f => ({ ...f, is_active: activeFreeze?.id === f.id })),
        ),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 99, ...data };
        }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          updated.push(data);
          return data;
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    const service = new ClubSubscriptionsService(
      prisma as never,
      {} as never,
      {} as never,
      { log: jest.fn() } as never,
      {} as never,
      { isBranchAllowed: () => true, allowedBranchIds: () => null } as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, created, updated };
  };

  const type = (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    is_linked_to_freeze: true,
    freeze_days: null,
    freeze_total_days: 50,
    ...overrides,
  });

  it('refuses a planned freeze longer than the remaining budget', async () => {
    const { service } = build(type(), [{ id: 1, actual_days: 45, planned_days: 45 }]);
    await expect(service.freeze(5, 10, 'سفر', 3)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses any freeze once the whole budget is spent', async () => {
    const { service } = build(type(), [{ id: 1, actual_days: 50, planned_days: 0 }]);
    await expect(service.freeze(5, 0, undefined, 3)).rejects.toThrow(/استنفاذ إجمالي أيام التجميد/);
  });

  it('caps an open-ended freeze at the remaining budget', async () => {
    const { service, created } = build(type(), [{ id: 1, actual_days: 20, planned_days: 20 }]);
    await service.freeze(5, 0, undefined, 3);
    // 50 - 20 = 30 days left → the freeze is pre-dated to end after 30 days.
    expect(created[0]).toMatchObject({ freeze_start_date: '2026-09-17', freeze_end_date: '2026-10-17', planned_days: 0 });
  });

  it('leaves open-ended freezes uncapped when the package sets no budget', async () => {
    const { service, created } = build(type({ freeze_total_days: null }), []);
    await service.freeze(5, 0, undefined, 3);
    expect(created[0]).toMatchObject({ freeze_end_date: null });
  });

  it('never extends the subscription past the budget on unfreeze', async () => {
    const active = {
      id: 9,
      subscription_id: 5,
      freeze_start_date: '2026-08-18',
      original_end_date: '2026-12-01',
      planned_days: 0,
    };
    // 30 days of budget already used elsewhere + 30 days frozen → only 20 days may be added.
    const { service, updated } = build(type(), [{ id: 1, actual_days: 30, planned_days: 30 }, active], active);
    await service.unfreeze(5, 3);
    expect(updated.find((d) => 'actual_days' in d)).toMatchObject({ actual_days: 20 });
    expect(updated.find((d) => 'subscription_end_date' in d)).toMatchObject({ subscription_end_date: '2026-12-21' });
  });
});
