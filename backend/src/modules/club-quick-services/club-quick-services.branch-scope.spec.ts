import { ForbiddenException } from '@nestjs/common';
import { ClubQuickServicesService } from './club-quick-services.service';

function makeService() {
  const prisma = {
    club_quick_services: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new ClubQuickServicesService(
    prisma as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
}

describe('club quick services reception branch isolation', () => {
  it('locks a receptionist catalog to global services and the exact login branch', async () => {
    const { service, prisma } = makeService();

    await service.catalog({ sub: 12, level: 2, branch: 2 } as never);

    expect(prisma.club_quick_services.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          is_active: true,
          OR: [{ branch_id: null }, { branch_id: 2 }],
        },
      }),
    );
  });

  it('rejects a foreign branch request from a receptionist', async () => {
    const { service } = makeService();

    await expect(
      service.catalog({ sub: 12, level: 2, branch: 2 } as never, 3),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});


describe('club quick services direct access isolation', () => {
  function makeScopedService() {
    const prisma = {
      club_quick_services: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      club_members: { findFirst: jest.fn() },
    };
    const branchScope = {
      isBranchAllowed: jest.fn((user: { level?: number; branch?: number }, branchId: number) =>
        user?.level === 1 || user?.branch === branchId,
      ),
    };
    const service = new ClubQuickServicesService(prisma as never, {} as never, branchScope as never);
    return { service, prisma };
  }

  it('rejects direct lookup of a service owned by another branch', async () => {
    const { service, prisma } = makeScopedService();
    prisma.club_quick_services.findUnique.mockResolvedValue({ id: 9, branch_id: 3 });

    await expect(
      service.findOne(9, { sub: 12, level: 2, branch: 2 } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not let a branch employee edit or remove a global service', async () => {
    const { service, prisma } = makeScopedService();
    prisma.club_quick_services.findUnique.mockResolvedValue({ id: 9, branch_id: null });
    const user = { sub: 12, level: 2, branch: 2 } as never;

    await expect(
      service.update(9, { name: 'خدمة', price: 10, branchId: 2 } as never, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(9, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.club_quick_services.update).not.toHaveBeenCalled();
  });

  it('refuses to sell a branch service to a member of another branch', async () => {
    const { service, prisma } = makeScopedService();
    prisma.club_quick_services.findFirst.mockResolvedValue({
      id: 9, name: 'خدمة', price: 50, branch_id: 1, creates_sales_lead: false,
    });
    prisma.club_members.findFirst.mockResolvedValue({ id: 5, name: 'عضو', branch_id: 2 });

    await expect(
      service.sell(
        { serviceId: 9, memberId: 5, paymentMethod: 'cash' } as never,
        { sub: 1, level: 1, branch: 1 } as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
