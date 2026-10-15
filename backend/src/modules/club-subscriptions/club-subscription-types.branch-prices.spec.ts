import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubPackageCategoriesService } from './club-package-categories.service';
import { ClubSubscriptionTypesService } from './club-subscription-types.service';

describe('ClubSubscriptionTypesService branch prices', () => {
  const existingRow = {
    id: 9,
    name: 'شهري',
    branch_id: 1,
    apply_to_all_branches: false,
    price: 500,
    days: 30,
    is_part_of_target: false,
    invitations_count: 0,
    inbody_count: 0,
    is_special_offer: false,
    is_for_students: false,
    show_in_app: true,
    notify_customers: false,
    notify_on_expiry: false,
    wallet_points: null,
    offer_validity: null,
    is_linked_to_sessions: false,
    sessions_count: null,
    allow_multiple_daily_entries: true,
    is_linked_to_freeze: false,
    freeze_days: null,
    freeze_total_days: null,
    includes_spa: false,
    spa_count: null,
    is_active: true,
    promo_enabled: false,
    promo_price: null,
    promo_discount_percent: null,
    promo_image: null,
    promo_ends_at: null,
    promo_marketing_message: null,
    app_notes: null,
    categories: [{ category: 'men_gym' }],
    branches: [{ branch_id: 1 }, { branch_id: 2 }],
    class_types: [],
    session_prices: [],
    branch_prices: [{ branch_id: 1, price: 450 }],
  };

  const prisma = {
    club_subscription_types: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue(existingRow),
    },
    club_subscription_type_branches: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    club_subscription_type_classes: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    club_subscription_type_session_prices: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    club_subscription_type_branch_prices: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    tbl_branches: {
      count: jest.fn().mockResolvedValue(2),
    },
  };
  const branchScope = {
    allowedBranchIds: jest.fn().mockReturnValue([1, 2]),
    isBranchAllowed: jest.fn().mockReturnValue(true),
    resolveListFilter: jest.fn().mockReturnValue([1]),
  };
  const service = new ClubSubscriptionTypesService(
    prisma as unknown as PrismaService,
    branchScope as unknown as BranchScopeService,
    { validKeys: jest.fn().mockResolvedValue(new Set(['men_gym'])) } as unknown as ClubPackageCategoriesService,
    { notifyNewOffer: jest.fn().mockResolvedValue({ sent: 0 }) } as never,
  );
  const user = { sub: 1, level: 1, branch: 1 } as JwtUser;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_subscription_types.findUnique.mockResolvedValue(existingRow);
  });

  it('replaces branch price overrides on update', async () => {
    await service.update(
      9,
      {
        branchPrices: [
          { branchId: 1, price: 400 },
          { branchId: 2, price: 550 },
        ],
      },
      user,
    );

    expect(prisma.club_subscription_type_branch_prices.deleteMany).toHaveBeenCalledWith({
      where: { subscription_type_id: 9 },
    });
    expect(prisma.club_subscription_type_branch_prices.createMany).toHaveBeenCalledWith({
      data: [
        { subscription_type_id: 9, branch_id: 1, price: 400 },
        { subscription_type_id: 9, branch_id: 2, price: 550 },
      ],
    });
  });
  it('drops overrides for branches the package is not assigned to and leaves them alone when absent', async () => {
    prisma.tbl_branches.count.mockResolvedValueOnce(1);
    await service.update(9, { branchPrices: [{ branchId: 1, price: 400 }, { branchId: 5, price: 10 }] }, user);
    expect(prisma.club_subscription_type_branch_prices.createMany).toHaveBeenCalledWith({
      data: [{ subscription_type_id: 9, branch_id: 1, price: 400 }],
    });
    jest.clearAllMocks();
    prisma.club_subscription_types.findUnique.mockResolvedValue(existingRow);
    await service.update(9, { name: 'شهري' }, user);
    expect(prisma.club_subscription_type_branch_prices.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a negative branch price', async () => {
    await expect(
      service.update(9, { branchPrices: [{ branchId: 1, price: -1 }] }, user),
    ).rejects.toThrow('سعر الفرع غير صالح');
  });

  it('maps branch prices, categories and app notes on read', async () => {
    const row = await service.findOne(9, user);
    expect(row.categories).toEqual(['men_gym']);
    expect(row.appNotes).toBeNull();
  });

  it('turns a branch manager edit of a global package into a branch-local copy', async () => {
    const globalRow = {
      ...existingRow,
      branch_id: null,
      apply_to_all_branches: true,
      branches: [],
    };
    prisma.club_subscription_types.findUnique.mockResolvedValue(globalRow);
    prisma.club_subscription_types.findFirst.mockResolvedValue(null);
    branchScope.allowedBranchIds.mockReturnValue([1]);
    const create = jest.spyOn(service, 'create').mockResolvedValue({ id: 44 } as never);

    await service.update(9, { price: 725, appNotes: 'خاص بالفرع' }, { sub: 8, level: 2, branch: 1 } as JwtUser);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 725,
        appNotes: 'خاص بالفرع',
        applyToAllBranches: false,
        branchIds: [1],
        branchId: 1,
      }),
      expect.objectContaining({ sub: 8, branch: 1 }),
      9,
      false,
    );
    expect(prisma.club_subscription_types.update).not.toHaveBeenCalled();
  });

  it('shows the branch-local copy instead of its global source in that branch', async () => {
    const globalRow = {
      ...existingRow,
      id: 9,
      branch_id: null,
      apply_to_all_branches: true,
      source_subscription_type_id: null,
      branches: [],
    };
    const overrideRow = {
      ...existingRow,
      id: 44,
      name: 'شهري - الفرع',
      price: 425,
      branch_id: 1,
      apply_to_all_branches: false,
      source_subscription_type_id: 9,
      branches: [{ branch_id: 1 }],
    };
    prisma.club_subscription_types.findMany.mockResolvedValue([globalRow, overrideRow]);

    await expect(service.listActive(undefined, { level: 2, branch: 1 } as JwtUser)).resolves.toEqual([
      expect.objectContaining({ id: 44, name: 'شهري - الفرع', price: 425 }),
    ]);
  });
});
