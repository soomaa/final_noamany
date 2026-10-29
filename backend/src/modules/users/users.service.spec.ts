jest.mock('../rbac/job-title-role.util', () => ({ syncEmployeeUserRole: jest.fn() }));

import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { UsersService } from './users.service';

const admin = { sub: 1, level: 1, branch: 0, emp_code: null } as unknown as JwtUser;
const branchManager = { sub: 50, level: 3, branch: 2, emp_code: 500 } as unknown as JwtUser;

describe('UsersService.create', () => {
  it('updates an existing employee login instead of creating a duplicate account', async () => {
    const prisma = {
      employees: { findFirst: jest.fn().mockResolvedValue({ id: 90, employee: 'موظف', branch_id_fk: 2 }) },
      users: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ user_id: 7 })
          .mockResolvedValueOnce(null),
        findUnique: jest.fn().mockResolvedValue({ user_id: 7, level: 2, emp_code: 90, branch_id_fk: 2 }),
        update: jest.fn().mockResolvedValue({ user_id: 7, level: 2, emp_code: 90 }),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ user_id: 7, level: 2, emp_code: 90 }),
      },
    };
    const service = new UsersService(prisma as never, new BranchScopeService());

    await service.create({ username: 'employee.login', password: 'safe-password', level: 2, empCode: 1001 }, admin);

    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.update).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: 7 } }));
  });
});

describe('UsersService anti-escalation (non-system-admin actor)', () => {
  const build = (target: { level: number | null; emp_code: number | null; branch_id_fk: number | null }, superRole = false, empBranch = 2) => {
    const prisma = {
      employees: {
        findFirst: jest.fn().mockResolvedValue({ id: 90, employee: 'موظف', branch_id_fk: empBranch }),
        findUnique: jest.fn().mockResolvedValue({ branch_id_fk: empBranch }),
      },
      users: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ user_id: 7, ...target }),
        update: jest.fn().mockResolvedValue({ user_id: 7, level: 2, emp_code: 90 }),
        create: jest.fn().mockResolvedValue({ user_id: 8, level: 2, emp_code: 90 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ user_id: 7, level: 2, emp_code: 90 }),
      },
      rbac_user_roles: { findFirst: jest.fn().mockResolvedValue(superRole ? { id: 1 } : null) },
    };
    return { prisma, service: new UsersService(prisma as never, new BranchScopeService()) };
  };

  it('rejects creating a level-1 login', async () => {
    const { prisma, service } = build({ level: 2, emp_code: 90, branch_id_fk: 2 });
    await expect(
      service.create({ username: 'x', password: 'safe-password', level: 1, fullname: 'x' }, branchManager),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('rejects creating a login for an employee of a foreign branch', async () => {
    const { prisma, service } = build({ level: 2, emp_code: 90, branch_id_fk: 2 }, false, 4);
    await expect(
      service.create({ username: 'x', password: 'safe-password', level: 2, empCode: 1001 }, branchManager),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('allows creating a login for an employee of a Tanta sub-branch', async () => {
    const { prisma, service } = build({ level: 2, emp_code: 90, branch_id_fk: 5 }, false, 5);
    await service.create({ username: 'x', password: 'safe-password', level: 2, empCode: 1001 }, branchManager);
    expect(prisma.users.create).toHaveBeenCalled();
  });

  it('refuses to edit / reset the password of a level-1 admin', async () => {
    const { prisma, service } = build({ level: 1, emp_code: null, branch_id_fk: 2 });
    await expect(
      service.update(7, { username: 'admin', password: 'new-password', level: 1, fullname: 'a' }, branchManager),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.update).not.toHaveBeenCalled();
  });

  it('refuses to edit an RBAC super-admin', async () => {
    const { prisma, service } = build({ level: 2, emp_code: 90, branch_id_fk: 2 }, true);
    await expect(
      service.update(7, { username: 'u', password: 'new-password', level: 2, empCode: 1001 }, branchManager),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.update).not.toHaveBeenCalled();
  });

  it('refuses to promote an in-branch employee login to level 1', async () => {
    const { prisma, service } = build({ level: 2, emp_code: 90, branch_id_fk: 2 });
    await expect(
      service.update(7, { username: 'u', level: 1, fullname: 'u' }, branchManager),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.update).not.toHaveBeenCalled();
  });

  it('refuses to edit a login from a foreign branch', async () => {
    const { prisma, service } = build({ level: 2, emp_code: 90, branch_id_fk: 4 }, false, 4);
    await expect(
      service.update(7, { username: 'u', level: 2, empCode: 1001 }, branchManager),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.update).not.toHaveBeenCalled();
  });

  it('lets a branch manager edit an in-branch employee login', async () => {
    const { prisma, service } = build({ level: 2, emp_code: 90, branch_id_fk: 2 });
    await service.update(7, { username: 'u', level: 2, empCode: 1001 }, branchManager);
    expect(prisma.users.update).toHaveBeenCalled();
  });

  it('keeps system admins unrestricted', async () => {
    const { prisma, service } = build({ level: 1, emp_code: null, branch_id_fk: null }, true);
    await service.update(7, { username: 'admin', level: 1, fullname: 'a' }, admin);
    expect(prisma.users.update).toHaveBeenCalled();
  });
});
