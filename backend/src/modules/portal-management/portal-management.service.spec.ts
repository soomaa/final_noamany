import { BadRequestException } from '@nestjs/common';
import { PortalManagementService } from './portal-management.service';

describe('PortalManagementService membership plan types', () => {
  const prisma: any = {
    tbl_branches: { findMany: jest.fn() },
    employees: { findMany: jest.fn() },
    club_subscription_types: { findMany: jest.fn(), findFirst: jest.fn() },
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  };
  const service = new PortalManagementService(prisma);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.tbl_branches.findMany.mockResolvedValue([]);
    prisma.tbl_branches.findUnique = jest.fn().mockResolvedValue({ branch_id: 1 });
    prisma.employees.findMany.mockResolvedValue([]);
    prisma.$queryRawUnsafe.mockResolvedValue([]);
    prisma.$executeRawUnsafe.mockResolvedValue(1);
  });

  it('offers only active subscription types available to every branch', async () => {
    prisma.club_subscription_types.findMany.mockResolvedValue([
      { id: 7, name: 'ربع سنوي', price: 900, days: 90 },
    ]);

    await expect(service.options()).resolves.toEqual(expect.objectContaining({
      subscriptionTypes: [{ id: 7, name: 'ربع سنوي', price: 900, days: 90 }],
    }));
    expect(prisma.club_subscription_types.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { is_active: true, apply_to_all_branches: true },
    }));
  });

  it('rejects a website membership plan linked to an unavailable system type', async () => {
    prisma.club_subscription_types.findFirst.mockResolvedValue(null);

    await expect(service.create('membership-plans', {
      title: 'باقة الموقع', status: 'active', data: { subscriptionTypeId: 19, displayOrder: 1 },
    }, 4)).rejects.toEqual(expect.any(BadRequestException));
  });

  it('stores zero as the class price when the optional price is omitted', async () => {
    await service.update('classes', 14, {
      title: 'Yoga',
      status: 'active',
      branchId: 1,
      data: { classType: 2, day: 'الاثنين', time: '18:00' },
    }, 7);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('`price`=?'),
      'Yoga', 1, 2, 0, 'الاثنين', '18:00', null, 7, 14,
    );
  });
});
