import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { UserAdminService } from '../user-admin/user-admin.service';

describe('system user role grant ceiling', () => {
  const restrictedEngine = {
    getEffective: jest.fn().mockResolvedValue({ superAdmin: false, keys: new Set(['admin.users:create']) }),
    effectiveForRoleIds: jest.fn().mockResolvedValue({
      superAdmin: false,
      keys: new Set(['admin.users:create', 'admin.roles:manage']),
    }),
    invalidateUser: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('rejects create linked to a more privileged job title before creating the user', async () => {
    const prisma = {
      users: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      employees: {
        findFirst: jest.fn().mockResolvedValue({
          id: 22,
          employee: 'موظف',
          branch_id_fk: 1,
          mosma_wazefy_code: 15,
        }),
      },
      department_jobs: { findUnique: jest.fn().mockResolvedValue({ id: 15, name: 'إدارة حساسة' }) },
      rbac_roles: { upsert: jest.fn().mockResolvedValue({ id: 91 }) },
    };
    const service = new UsersService(prisma as never, restrictedEngine as never);

    await expect(service.create({
      username: 'staff-user',
      password: 'secure-password',
      level: 2,
      empCode: 1001,
    }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('rejects changing the actor own employee link before updating the account', async () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 7, level: 2, emp_code: 20, role_id_fk: 90 }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      employees: {
        findFirst: jest.fn().mockResolvedValue({
          id: 22,
          employee: 'المستخدم نفسه',
          branch_id_fk: 1,
          mosma_wazefy_code: 15,
        }),
      },
      department_jobs: { findUnique: jest.fn().mockResolvedValue({ id: 15, name: 'دور جديد' }) },
      rbac_roles: { upsert: jest.fn().mockResolvedValue({ id: 91 }) },
      rbac_user_roles: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new UsersService(prisma as never, restrictedEngine as never);

    await expect(service.update(7, {
      username: 'staff-user',
      level: 2,
      empCode: 1002,
    }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.update).not.toHaveBeenCalled();
  });

  it('rejects user-admin create above the actor ceiling before persistence', async () => {
    const prisma = {
      rbac_roles: { findUnique: jest.fn().mockResolvedValue({ id: 91 }) },
      users: { create: jest.fn() },
    };
    const service = new UserAdminService(
      prisma as never,
      { get: jest.fn().mockReturnValue(4) } as unknown as ConfigService,
      restrictedEngine as never,
      { revokeAllForUser: jest.fn() } as never,
      { log: jest.fn() } as never,
    );

    await expect(service.create({
      username: 'staff-user',
      name: 'موظف',
      password: 'secure-password',
      level: 2,
    }, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.create).not.toHaveBeenCalled();
  });
});
