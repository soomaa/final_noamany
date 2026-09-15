import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClubDiscountCodesService } from './club-discount-codes.service';

describe('ClubDiscountCodesService.resolveDiscount', () => {
  const prisma = {
    club_discount_codes: { findUnique: jest.fn() },
  };
  const service = new ClubDiscountCodesService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('calculates the amount from the saved percentage on the server', async () => {
    prisma.club_discount_codes.findUnique.mockResolvedValue({
      id: 7,
      code: 'SUMMER20',
      percentage: 20,
      is_active: true,
    });

    await expect(service.resolveDiscount({
      subscriptionValue: 500,
      discountCodeId: 7,
      discountEnabled: true,
      discountValue: 499,
    })).resolves.toEqual({
      discountEnabled: true,
      discountCodeId: 7,
      discountPercentage: 20,
      discountValue: 100,
    });
  });

  it('treats a manual discount as a fixed EGP amount', async () => {
    await expect(service.resolveDiscount({
      subscriptionValue: 500,
      discountEnabled: true,
      discountValue: 75,
    })).resolves.toEqual({
      discountEnabled: true,
      discountCodeId: null,
      discountPercentage: null,
      discountValue: 75,
    });
  });

  it('rejects inactive discount codes', async () => {
    prisma.club_discount_codes.findUnique.mockResolvedValue({ id: 7, percentage: 20, is_active: false });
    await expect(service.resolveDiscount({ subscriptionValue: 500, discountCodeId: 7 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a code before its validity window begins', async () => {
    prisma.club_discount_codes.findUnique.mockResolvedValue({
      id: 7,
      percentage: 20,
      is_active: true,
      valid_from: '2099-01-01',
      valid_to: '2099-12-31',
      max_uses: null,
      audience: 'all_users',
      members: [],
      _count: { subscriptions: 0, locker_subscriptions: 0 },
    });

    await expect(service.resolveDiscount({ subscriptionValue: 500, discountCodeId: 7, memberId: 11 } as never))
      .rejects.toThrow('كود الخصم غير ساري في التاريخ الحالي');
  });

  it('rejects a code after reaching its maximum number of uses', async () => {
    prisma.club_discount_codes.findUnique.mockResolvedValue({
      id: 7,
      percentage: 20,
      is_active: true,
      valid_from: null,
      valid_to: null,
      max_uses: 2,
      audience: 'all_users',
      members: [],
      _count: { subscriptions: 1, locker_subscriptions: 1 },
    });

    await expect(service.resolveDiscount({ subscriptionValue: 500, discountCodeId: 7, memberId: 11 } as never))
      .rejects.toThrow('تم استنفاد عدد استخدامات كود الخصم');
  });

  it('allows a member-specific code only for selected members', async () => {
    prisma.club_discount_codes.findUnique.mockResolvedValue({
      id: 7,
      percentage: 20,
      is_active: true,
      valid_from: null,
      valid_to: null,
      max_uses: null,
      audience: 'specific_users',
      members: [{ member_id: 22 }],
      _count: { subscriptions: 0, locker_subscriptions: 0 },
    });

    await expect(service.resolveDiscount({ subscriptionValue: 500, discountCodeId: 7, memberId: 11 } as never))
      .rejects.toThrow('كود الخصم غير متاح لهذا العضو');
    await expect(service.resolveDiscount({ subscriptionValue: 500, discountCodeId: 7, memberId: 22 } as never))
      .resolves.toMatchObject({ discountValue: 100 });
  });
});

describe('ClubDiscountCodesService administration', () => {
  const prisma = {
    club_discount_codes: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new ClubDiscountCodesService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('rejects a member-specific code that has no selected members', async () => {
    prisma.club_discount_codes.findUnique.mockResolvedValue(null);
    await expect(service.create({
      code: 'VIP',
      percentage: 10,
      audience: 'specific_users',
    })).rejects.toThrow('اختر عضوًا واحدًا على الأقل');
    expect(prisma.club_discount_codes.create).not.toHaveBeenCalled();
  });

  it('rejects switching an existing all-users code to specific users without a selection', async () => {
    prisma.club_discount_codes.findUnique.mockResolvedValue({
      id: 7,
      code: 'VIP',
      audience: 'all_users',
      valid_from: null,
      valid_to: null,
    });
    await expect(service.update(7, { audience: 'specific_users' }))
      .rejects.toThrow('اختر عضوًا واحدًا على الأقل');
    expect(prisma.club_discount_codes.update).not.toHaveBeenCalled();
  });
});
