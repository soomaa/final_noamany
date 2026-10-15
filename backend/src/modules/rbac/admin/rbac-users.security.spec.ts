import { ForbiddenException } from '@nestjs/common';
import { RbacUsersService } from './rbac-users.service';

describe('RBAC user administration security', () => {
  const createService = () => {
    const prisma = { $transaction: jest.fn() };
    const engine = { invalidateUser: jest.fn() };
    const audit = { log: jest.fn() };
    return {
      service: new RbacUsersService(prisma as never, engine as never, audit as never),
      prisma,
    };
  };

  it('blocks assigning roles to the actor own account before any database mutation', async () => {
    const { service, prisma } = createService();
    await expect(service.setUserRoles(7, { roleIds: [1] }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks editing the actor own exceptions before any database mutation', async () => {
    const { service, prisma } = createService();
    await expect(service.setExceptions(7, { changes: [] }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks clearing the actor own exceptions before any database mutation', async () => {
    const { service, prisma } = createService();
    await expect(service.clearExceptions(7, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
