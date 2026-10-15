import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClubPackageCategoriesService } from './club-package-categories.service';
import { isPromoLive, parsePackageCategories, withOffersTag } from './package-categories';

describe('package categories helpers', () => {
  const keys = new Set(['men_gym', 'offers', 'kids']);

  it('distinguishes "field absent" from "clear every tag" and dedupes', () => {
    expect(parsePackageCategories({}, keys)).toBeNull();
    expect(parsePackageCategories({ categories: [] }, keys)).toEqual([]);
    expect(parsePackageCategories({ categories: ['kids', ' kids ', 'men_gym'] }, keys)).toEqual([
      'kids',
      'men_gym',
    ]);
  });

  it('rejects unknown keys and non-array payloads', () => {
    expect(() => parsePackageCategories({ categories: ['nope'] }, keys)).toThrow(BadRequestException);
    expect(() => parsePackageCategories({ categories: 'kids' }, keys)).toThrow(BadRequestException);
  });

  it('auto-tags a live promo into offers once', () => {
    const now = Date.parse('2026-09-27T10:00:00Z');
    expect(isPromoLive(true, null, now)).toBe(true);
    expect(isPromoLive(true, new Date('2026-09-26T00:00:00Z'), now)).toBe(false);
    expect(isPromoLive(false, null, now)).toBe(false);
    expect(withOffersTag(['kids'], true)).toEqual(['kids', 'offers']);
    expect(withOffersTag(['offers'], true)).toEqual(['offers']);
    expect(withOffersTag(['kids'], false)).toEqual(['kids']);
  });
});

describe('ClubPackageCategoriesService', () => {
  function setup() {
    const prisma = {
      club_package_categories: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      club_subscription_type_categories: {
        groupBy: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      club_subscription_types: { findMany: jest.fn().mockResolvedValue([]) },
      club_private_packages: { count: jest.fn().mockResolvedValue(0) },
      club_class_types: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    return { prisma, service: new ClubPackageCategoriesService(prisma as unknown as PrismaService) };
  }

  const category = (id: number, key: string, extra: Record<string, unknown> = {}) => ({
    id,
    key,
    name: key,
    name_en: null,
    icon: null,
    sort_order: id * 10,
    is_active: true,
    is_system: false,
    ...extra,
  });

  it('never deletes a system section', async () => {
    const { service, prisma } = setup();
    prisma.club_package_categories.findUnique.mockResolvedValue(category(1, 'offers', { is_system: true }));
    await expect(service.remove(1)).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('counts only the packages the member branch can buy, plus private/classes and live promos', async () => {
    const { service, prisma } = setup();
    prisma.club_package_categories.findMany.mockResolvedValue([
      category(1, 'men_gym'),
      category(2, 'offers', { is_system: true, icon: 'public-file:abc' }),
      category(3, 'private', { is_system: true }),
      category(4, 'classes', { is_system: true }),
      category(5, 'kids'),
    ]);
    prisma.club_subscription_types.findMany.mockResolvedValue([
      // Available at branch 1 and on a live promo.
      {
        id: 1, branch_id: 1, apply_to_all_branches: false, promo_enabled: true, promo_ends_at: null,
        branches: [], categories: [{ category: 'men_gym' }],
      },
      // Another branch only — ignored.
      {
        id: 2, branch_id: 2, apply_to_all_branches: false, promo_enabled: false, promo_ends_at: null,
        branches: [{ branch_id: 2 }], categories: [{ category: 'men_gym' }, { category: 'kids' }],
      },
      // Global.
      {
        id: 3, branch_id: null, apply_to_all_branches: true, promo_enabled: false, promo_ends_at: null,
        branches: [], categories: [{ category: 'kids' }],
      },
    ]);
    prisma.club_private_packages.count.mockResolvedValue(2);
    prisma.club_class_types.count.mockResolvedValue(3);

    const rows = await service.listForBranch(1, '/uploads');
    const counts = Object.fromEntries(rows.map((r) => [r.key, r.count]));
    expect(counts).toEqual({ men_gym: 1, offers: 1, private: 2, classes: 3, kids: 1 });
    expect(rows[1].iconUrl).toBe('/api/uploads/public/abc');
    expect(rows[0].labelEn).toBe('men_gym');
  });
});
