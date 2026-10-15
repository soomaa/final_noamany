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
});

