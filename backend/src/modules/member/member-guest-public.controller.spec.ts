import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AppManagementService } from '../app-management/app-management.service';
import { MemberCompatController } from './member-compat.controller';
import { MemberService } from './member.service';

describe('MemberCompatController public guest discovery', () => {
  const member = {
    listPackages: jest.fn(),
    listTrainers: jest.fn(),
  };
  const controller = Reflect.construct(MemberCompatController, [
    member as unknown as MemberService,
    {} as AppManagementService,
  ]) as MemberCompatController;

  beforeEach(() => jest.clearAllMocks());

  it.each([undefined, '', '0', '-2', '1.5', 'branch'])(
    'rejects a missing or invalid offers branchId (%s)',
    async (branchId) => {
      await expect(controller.guestOffers(branchId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(member.listPackages).not.toHaveBeenCalled();
    },
  );

  it('filters branch packages to offers and returns only public fields', async () => {
    member.listPackages.mockResolvedValue([
      { id: 1, name: 'Regular', isSpecialOffer: false, promoEnabled: false },
      {
        id: 2,
        name: 'Special',
        isSpecialOffer: true,
        promoEnabled: false,
        price: 900,
        cost: 400,
      },
      {
        id: 3,
        name: 'Promo',
        isSpecialOffer: false,
        promoEnabled: true,
        promoMarketingMessage: 'Limited time',
        promoImage: '/uploads/promo.png',
        promoDiscountPercent: 20,
        promoEndsAt: '2026-10-01T00:00:00.000Z',
        employeeId: 99,
      },
    ]);

    const result = await controller.guestOffers('7');

    expect(member.listPackages).toHaveBeenCalledWith(7);
    expect(result).toEqual([
      { id: 2, title: 'Special', branchId: 7 },
      {
        id: 3,
        title: 'Promo',
        branchId: 7,
        marketingMessage: 'Limited time',
        imageUrl: '/uploads/promo.png',
        discountPercent: 20,
        endsAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    expect(Object.keys(result[0])).not.toEqual(
      expect.arrayContaining(['price', 'cost', 'employeeId']),
    );
  });

  it('scopes trainers and removes employee and administrative fields', async () => {
    member.listTrainers.mockResolvedValue([
      {
        id: 8,
        employeeId: 77,
        name: 'Coach Mona',
        specialization: 'Strength',
        experience: '5 years',
        bio: 'Public bio',
        imageUrl: '/uploads/mona.png',
        rating: 4.8,
        branchId: 4,
        availability: [{ weekday: 1 }],
        salary: 100,
      },
    ]);

    const result = await controller.guestTrainers('4');

    expect(member.listTrainers).toHaveBeenCalledWith(4);
    expect(result).toEqual([
      {
        id: 8,
        name: 'Coach Mona',
        specialization: 'Strength',
        experience: '5 years',
        bio: 'Public bio',
        imageUrl: '/uploads/mona.png',
        rating: 4.8,
        branchId: 4,
      },
    ]);
  });

  it.each(['guestOffers', 'guestTrainers'] as const)(
    '%s is public and throttled without an auth guard',
    (method) => {
      const handler = MemberCompatController.prototype[method];
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(guards).toEqual([ThrottlerGuard]);
    },
  );
});
