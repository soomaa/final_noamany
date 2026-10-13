import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClubDiscountCodesService, memberGrantExpiryOn } from './club-discount-codes.service';

describe('ClubDiscountCodesService.resolveDiscount', () => {
  const prisma = {
    tbl_discount_codes: { findUnique: jest.fn() },
    club_members: { findFirst: jest.fn() },
  };
  const service = new ClubDiscountCodesService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('calculates the amount from the saved percentage on the server', async () => {
    prisma.tbl_discount_codes.findUnique.mockResolvedValue({
      id: 7,
      title: 'SUMMER20',
      nesba: 20,
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

  it('rejects a discount code that does not exist in the original catalog', async () => {
    prisma.tbl_discount_codes.findUnique.mockResolvedValue(null);
    await expect(service.resolveDiscount({ subscriptionValue: 500, discountCodeId: 7 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a usage report whose start date is after its end date', async () => {
    await expect(service.usageReport({ fromDate: '2026-09-10', toDate: '2026-09-01' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('finds a member by membership code or by phone in the legacy phone formats', async () => {
    prisma.club_members.findFirst.mockResolvedValue({ id: 44, name: 'عضو تجريبي', member_code: 'A10467', phone: '01012345678' });

    await expect(service.findMemberForDiscountGrant('A10467')).resolves.toEqual({
      id: 44, name: 'عضو تجريبي', memberCode: 'A10467', phone: '01012345678',
    });
    await expect(service.findMemberForDiscountGrant('+201012345678')).resolves.toEqual({
      id: 44, name: 'عضو تجريبي', memberCode: 'A10467', phone: '01012345678',
    });
    expect(prisma.club_members.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { OR: [
        { phone: { contains: '201012345678' } },
        { phone: { contains: '0201012345678' } },
        { phone: { contains: '+2201012345678' } },
        { phone: { contains: '20201012345678' } },
      ] },
    }));
  });

  it('uses the legacy month-end expiry date as the saved member-code expiry', () => {
    expect(memberGrantExpiryOn(new Date('2026-09-21T12:00:00.000Z'))).toBe('2026-09-30');
    expect(memberGrantExpiryOn(new Date('2026-10-31T12:00:00.000Z'))).toBe('2026-11-30');
  });
});
