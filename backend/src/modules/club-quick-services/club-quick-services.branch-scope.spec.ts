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

