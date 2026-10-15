import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubSubscriptionsService } from './club-subscriptions.service';
import { PrivateSubscriptionsService } from './private-subscriptions.service';

/**
 * Private session packages carry the same 1..N price matrix as the regular session packages,
 * so a 10-session package can be sold for 3 sessions at the configured price.
 */
describe('PrivateSubscriptionsService session price matrix', () => {
  const user = { sub: 7, level: 1, branch: 1 } as JwtUser;
  const prisma = {
    club_private_packages: { create: jest.fn(), findFirst: jest.fn() },
    club_members: { findFirst: jest.fn() },
    club_trainers: { findFirst: jest.fn() },
    tbl_branches: { count: jest.fn() },
  };
  const branchScope = { isBranchAllowed: jest.fn(() => true) };
  const subscriptions = { create: jest.fn() };
  const service = new PrivateSubscriptionsService(
    prisma as unknown as PrismaService,
    subscriptions as unknown as ClubSubscriptionsService,
    branchScope as unknown as BranchScopeService,
  );

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('stores a full 1..N matrix, keeping the supplied overrides', async () => {
    prisma.tbl_branches.count.mockResolvedValue(1);
    prisma.club_private_packages.create.mockImplementation(async ({ data }: { data: any }) => ({
      id: 3, kind: data.kind, name: data.name, price: data.price,
      duration_days: data.duration_days, sessions_count: data.sessions_count,
      is_active: true, legacy_subscription_type_id: null,
      created_at: new Date(), updated_at: new Date(),
      branches: [{ branch_id: 1 }],
      session_prices: data.session_prices.create.map((row: any, i: number) => ({ id: i, ...row })),
    }));

    const result = await service.createPackage({
      kind: 'sessions', name: 'برايفت ١٠ حصص', price: 1000, durationDays: 30,
      sessionsCount: 4, branchIds: [1],
      sessionPrices: [{ sessionsCount: 2, price: 450 }],
    } as never, user);

    // 1 and 3..4 keep the proportional default (1000 ÷ 4 = 250/session); 2 keeps the override.
    expect(result.sessionPrices).toEqual([
      { sessionsCount: 1, price: 250 },
      { sessionsCount: 2, price: 450 },
      { sessionsCount: 3, price: 750 },
      { sessionsCount: 4, price: 1000 },
    ]);
  });

  it('drops the matrix for a duration-based package', async () => {
    prisma.tbl_branches.count.mockResolvedValue(1);
    prisma.club_private_packages.create.mockImplementation(async ({ data }: { data: any }) => ({
      id: 4, kind: data.kind, name: data.name, price: data.price,
      duration_days: data.duration_days, sessions_count: null, is_active: true,
      legacy_subscription_type_id: null, created_at: new Date(), updated_at: new Date(),
      branches: [{ branch_id: 1 }], session_prices: [],
    }));

    const result = await service.createPackage({
      kind: 'subscription', name: 'برايفت شهري', price: 800, durationDays: 30, branchIds: [1],
    } as never, user);

    expect(result.sessionPrices).toEqual([]);
    expect(prisma.club_private_packages.create.mock.calls[0][0].data.session_prices.create).toEqual([]);
  });

  it('prices a partial sale from the matrix instead of charging the full package', async () => {
    prisma.club_members.findFirst.mockResolvedValue({ id: 10, name: 'Member', branch_id: 1, gender: 'male' });
    prisma.club_trainers.findFirst.mockResolvedValue({ id: 30, name: 'Coach' });
    prisma.club_private_packages.findFirst.mockResolvedValue({
      id: 20, kind: 'sessions', name: 'Private 4', price: 1000, duration_days: 30,
      sessions_count: 4, branches: [{ branch_id: 1 }],
      session_prices: [
        { sessions_count: 1, price: 250 },
        { sessions_count: 2, price: 450 },
        { sessions_count: 3, price: 750 },
        { sessions_count: 4, price: 1000 },
      ],
    });
    subscriptions.create.mockResolvedValue({ id: 40 });
    jest.spyOn(service, 'findEnrollment').mockResolvedValue({ id: 40 } as never);

    await service.createEnrollment({
      memberId: 10, packageId: 20, trainerId: 30, sessionsCount: 2,
      discountValue: 0, paidAmount: 450,
    } as never, user);

    expect(subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionValue: 450, sessionsCount: 2, isLinkedToSessions: true }),
      user,
      { privateEnrollment: true },
    );
  });

  it('clamps a sale above the package maximum and falls back to the full price', async () => {
    prisma.club_members.findFirst.mockResolvedValue({ id: 10, name: 'Member', branch_id: 1, gender: 'male' });
    prisma.club_trainers.findFirst.mockResolvedValue({ id: 30, name: 'Coach' });
    prisma.club_private_packages.findFirst.mockResolvedValue({
      id: 20, kind: 'sessions', name: 'Private 4', price: 1000, duration_days: 30,
      sessions_count: 4, branches: [{ branch_id: 1 }], session_prices: [],
    });
    subscriptions.create.mockResolvedValue({ id: 41 });
    jest.spyOn(service, 'findEnrollment').mockResolvedValue({ id: 41 } as never);

    await service.createEnrollment({
      memberId: 10, packageId: 20, trainerId: 30, sessionsCount: 99,
      discountValue: 0, paidAmount: 0,
    } as never, user);

    expect(subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionValue: 1000, sessionsCount: 4 }),
      user,
      { privateEnrollment: true },
    );
  });
});
