import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubSubscriptionsService } from './club-subscriptions.service';
import { PrivateSubscriptionsService } from './private-subscriptions.service';

describe('PrivateSubscriptionsService package branch scope', () => {
  const user = { sub: 7, level: 3, branch: 1 } as JwtUser;
  const prisma = {
    club_private_packages: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    club_members: { findFirst: jest.fn() },
    club_trainers: { findFirst: jest.fn() },
    club_private_package_branches: { deleteMany: jest.fn() },
    tbl_branches: { count: jest.fn() },
    $transaction: jest.fn(),
  };
  const branchScope = {
    isBranchAllowed: jest.fn((_: JwtUser, branchId: number) => branchId === 1),
  };
  const subscriptions = { create: jest.fn() };
  const service = new PrivateSubscriptionsService(
    prisma as unknown as PrismaService,
    subscriptions as unknown as ClubSubscriptionsService,
    branchScope as unknown as BranchScopeService,
  );

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('does not let a branch user rewrite a package that also belongs to another branch', async () => {
    prisma.club_private_packages.findUnique.mockResolvedValue({
      id: 5,
      branches: [{ branch_id: 1 }, { branch_id: 2 }],
    });

    await expect(service.updatePackage(5, {
      kind: 'subscription',
      name: 'Private Monthly',
      price: 500,
      durationDays: 30,
      branchIds: [1],
    }, user)).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not let a branch user deactivate another branch package', async () => {
    prisma.club_private_packages.findUnique.mockResolvedValue({
      id: 6,
      branches: [{ branch_id: 2 }],
    });

    await expect(service.deactivatePackage(6, user)).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.club_private_packages.update).not.toHaveBeenCalled();
  });

  it('preserves the purchased package name and falls back to the real member gender for legacy rows', () => {
    const mapped = (service as any).mapEnrollment({
      id: 88,
      subscription_number: 'LEG-88',
      member_id: 10,
      customer_name: 'Member',
      private_trainer: null,
      private_package_id: 20,
      private_package: { name: 'Renamed catalog package' },
      subscription_type: 'Original purchased package',
      registration_date: '2026-01-01',
      subscription_start_date: '2026-01-01',
      subscription_end_date: '2026-01-31',
      is_linked_to_sessions: false,
      sessions_count: null,
      sessions_used: 0,
      subscription_value: 500,
      private_discount_type: null,
      discount_value: 0,
      paid_amount: 500,
      remaining_amount: 0,
      receipt_number: null,
      receipts: [],
      gender: null,
      payment_method: 'cash',
      branch_id: 1,
      created_by: 7,
      status: 'expired',
      created_at: new Date('2026-01-01T00:00:00Z'),
      member: { member_code: 'A10', name: 'Member', gender: 'female' },
    }, 'Admin');

    expect(mapped.subscriptionType).toBe('Original purchased package');
    expect(mapped.gender).toBe('female');
  });

  it('uses the validated internal path and preserves the private/special marker', async () => {
    prisma.club_members.findFirst.mockResolvedValue({
      id: 10,
      name: 'Member',
      branch_id: 1,
      gender: 'male',
    });
    prisma.club_private_packages.findFirst.mockResolvedValue({
      id: 20,
      kind: 'sessions',
      name: 'Private 10',
      price: 1000,
      duration_days: 30,
      sessions_count: 10,
      branches: [{ branch_id: 1 }],
    });
    prisma.club_trainers.findFirst.mockResolvedValue({ id: 30, name: 'Coach' });
    subscriptions.create.mockResolvedValue({ id: 40 });
    jest.spyOn(service, 'findEnrollment').mockResolvedValue({ id: 40 } as never);

    await service.createEnrollment({
      memberId: 10,
      packageId: 20,
      trainerId: 30,
      discountValue: 0,
      paidAmount: 500,
    }, user);

    expect(subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        privatePackageId: 20,
        privateTrainerId: 30,
        isSpecial: true,
        isLinkedToSessions: true,
      }),
      7,
      { privateEnrollment: true },
    );
  });
});
