jest.mock('../rbac/job-title-role.util', () => ({ syncEmployeeUserRole: jest.fn() }));

import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { AdminAccountsService } from './admin-accounts.service';
import { UsersService } from './users.service';

/**
 * حسابات النظام lifecycle (Fatma, 19 Nov): an active account signs in; an inactive one cannot
 * and its open sessions stop; a deleted one is gone; its username can be used again.
 */

const admin = { sub: 1, level: 1, branch: 0, emp_code: null, is_super_admin: true } as unknown as JwtUser;

const config = {
  get: jest.fn((key: string) => ({
    bcryptRounds: 4,
    'jwt.accessSecret': 'access-secret',
    'jwt.refreshSecret': 'refresh-secret',
    'jwt.accessTtl': '2h',
    'jwt.refreshTtl': '7d',
  } as Record<string, unknown>)[key]),
};

function authFor(users: Array<{ user_id: number; username: string; approved: number; password: string }>) {
  const byId = new Map(users.map((u) => [u.user_id, u]));
  const prisma = {
    users: {
      // Mirrors MySQL: filter by username, then honour the requested ordering.
      findFirst: jest.fn(async ({ where, orderBy }: { where: { username: string }; orderBy?: unknown }) => {
        const rows = users.filter((u) => u.username === where.username);
        if (orderBy) rows.sort((a, b) => b.approved - a.approved || b.user_id - a.user_id);
        return rows[0] ?? null;
      }),
      findUnique: jest.fn(async ({ where }: { where: { user_id: number } }) => {
        const u = byId.get(where.user_id);
        return u ? { ...u, level: 2, emp_code: null, name: u.username, image: null, branch_id_fk: 0 } : null;
      }),
      update: jest.fn(),
    },
    rbac_user_roles: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token'), verifyAsync: jest.fn() };
  const memberAuth = { login: jest.fn().mockRejectedValue(new UnauthorizedException('بيانات الدخول غير صحيحة')) };
  return { prisma, jwt, memberAuth, service: new AuthService(prisma as never, jwt as never, config as never, memberAuth as never) };
}

function strategyFor(account: { approved: number } | null) {
  return new JwtStrategy(
    { get: jest.fn().mockReturnValue('access-secret') } as never,
    {
      users: { findUnique: jest.fn().mockResolvedValue(account ? { ...account, level: 2, emp_code: null } : null) },
      rbac_user_roles: { findFirst: jest.fn().mockResolvedValue(null) },
      rbac_user_section_exceptions: { findMany: jest.fn().mockResolvedValue([]) },
      employees: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never,
  );
}

const session = { sub: 7, level: 2, emp_code: null, branch: 0, man_women_type: 3, name: 'x', image: null, job_title: null, is_trainer: false, trainer_id: null } as unknown as JwtUser;

describe('system accounts: active / inactive', () => {
  it('an active account logs in as staff', async () => {
    const hash = await bcrypt.hash('secret-1', 4);
    const { service, memberAuth } = authFor([{ user_id: 7, username: 'reception1', approved: 1, password: hash }]);
    const result = await service.login('reception1', 'secret-1');
    expect(result.accountType).toBe('staff');
    expect(result.accessToken).toBe('signed-token');
    expect(memberAuth.login).not.toHaveBeenCalled();
  });

  it('an inactive account cannot log in, even with the right password', async () => {
    const hash = await bcrypt.hash('secret-1', 4);
    const { service, jwt } = authFor([{ user_id: 7, username: 'reception1', approved: 0, password: hash }]);
    await expect(service.login('reception1', 'secret-1')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('an open session stops the moment the account is made inactive', async () => {
    await expect(strategyFor({ approved: 1 }).validate(session)).resolves.toMatchObject({ sub: 7 });
    await expect(strategyFor({ approved: 0 }).validate(session)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('an inactive account cannot refresh its session either', async () => {
    const { service, jwt, prisma } = authFor([{ user_id: 7, username: 'reception1', approved: 0, password: 'h' }]);
    jwt.verifyAsync.mockResolvedValue({ sub: 7, pver: 'whatever' });
    (prisma.users.findUnique as jest.Mock).mockResolvedValue({ user_id: 7, approved: 0, password: 'h' });
    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('an admin cannot switch off their own account', async () => {
    const service = new UsersService({ users: { findUnique: jest.fn() } } as never, new BranchScopeService());
    await expect(service.toggleApproved(1, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('system accounts: delete and re-create', () => {
  it('deleting removes the login and its grants', async () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 7, level: 2, emp_code: null, branch_id_fk: 0 }),
        delete: jest.fn().mockReturnValue('delete-user'),
        update: jest.fn(),
      },
      permissions: { deleteMany: jest.fn().mockReturnValue('perms') },
      rbac_user_exceptions: { deleteMany: jest.fn().mockReturnValue('exceptions') },
      rbac_user_roles: { deleteMany: jest.fn().mockReturnValue('roles'), findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const service = new UsersService(prisma as never, new BranchScopeService());
    await expect(service.remove(7, admin)).resolves.toEqual({ userId: 7, retired: false });
    expect(prisma.$transaction).toHaveBeenCalledWith(['perms', 'exceptions', 'roles', 'delete-user']);
    expect(prisma.users.update).not.toHaveBeenCalled();
  });

  it('when other records still point at the login, it is retired: renamed, disabled, password cleared', async () => {
    const fk = new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' });
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 7, level: 2, emp_code: null, branch_id_fk: 0 }),
        delete: jest.fn().mockReturnValue('delete-user'),
        update: jest.fn().mockReturnValue('retire-user'),
      },
      permissions: { deleteMany: jest.fn() },
      rbac_user_exceptions: { deleteMany: jest.fn() },
      rbac_user_roles: { deleteMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockRejectedValueOnce(fk).mockResolvedValueOnce([]),
    };
    const service = new UsersService(prisma as never, new BranchScopeService());
    await expect(service.remove(7, admin)).resolves.toEqual({ userId: 7, retired: true });
    const data = prisma.users.update.mock.calls[0][0].data;
    expect(data.username).toMatch(/^_retired_7_/);
    expect(data).toMatchObject({ approved: 0, password: null, user_pass: null, app_pass: null });
  });

  it('a deleted account is not listed and its session is rejected', async () => {
    const prisma = {
      users: { findMany: jest.fn().mockResolvedValue([]) },
      rbac_user_roles: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new UsersService(prisma as never, new BranchScopeService());
    await service.findAll();
    expect(prisma.users.findMany.mock.calls[0][0].where.NOT).toEqual({ username: { startsWith: '_retired_' } });
    await expect(strategyFor(null).validate(session)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('an admin cannot delete their own account', async () => {
    const service = new UsersService({ users: { findUnique: jest.fn() } } as never, new BranchScopeService());
    await expect(service.remove(1, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('after a delete the same username can be used for a new account', async () => {
    const actorHash = await bcrypt.hash('admin-pass', 4);
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 1, approved: 1, password: actorHash }),
        // The deleted login is gone (or renamed `_retired_…`), so nothing clashes any more.
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ user_id: 30, username: 'nada', name: 'ندى', level: 1, approved: 1 }),
      },
      rbac_roles: { findUnique: jest.fn().mockResolvedValue({ id: 16 }) },
      rbac_user_roles: { create: jest.fn() },
    };
    const service = new AdminAccountsService(prisma as never);
    await expect(
      service.create(admin, { currentPassword: 'admin-pass', username: 'nada', fullname: 'ندى', password: 'new-pass' }),
    ).resolves.toMatchObject({ user_id: 30, username: 'nada' });
    expect(prisma.users.create.mock.calls[0][0].data).toMatchObject({ username: 'nada', name: 'ندى', level: 1, approved: 1 });
    expect(prisma.rbac_user_roles.create).toHaveBeenCalledWith({ data: { user_id: 30, role_id: 16, created_by: 1 } });
  });

  it('a username still held by a live account is refused', async () => {
    const actorHash = await bcrypt.hash('admin-pass', 4);
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 1, approved: 1, password: actorHash }),
        findFirst: jest.fn().mockResolvedValue({ user_id: 9 }),
        create: jest.fn(),
      },
    };
    const service = new AdminAccountsService(prisma as never);
    await expect(
      service.create(admin, { currentPassword: 'admin-pass', username: 'nada', password: 'new-pass' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('Add Admin refuses a wrong password for the acting admin', async () => {
    const prisma = { users: { findUnique: jest.fn().mockResolvedValue({ user_id: 1, approved: 1, password: await bcrypt.hash('admin-pass', 4) }) } };
    await expect(new AdminAccountsService(prisma as never).verify(admin, 'wrong')).rejects.toThrow('كلمة مرور حسابك غير صحيحة');
  });

  it('the re-created account logs in even while an old disabled login keeps the same username', async () => {
    const hash = await bcrypt.hash('secret-2', 4);
    const { service } = authFor([
      { user_id: 7, username: 'nada', approved: 0, password: await bcrypt.hash('old', 4) },
      { user_id: 30, username: 'nada', approved: 1, password: hash },
    ]);
    const result = await service.login('nada', 'secret-2');
    expect(result.accountType).toBe('staff');
    expect((result.user as { sub: number }).sub).toBe(30);
  });
});

describe('profile name', () => {
  it('renames only the signed-in account', async () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 7, approved: 1, level: 2, emp_code: null, name: 'جديد', image: null, branch_id_fk: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      rbac_user_roles: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new AuthService(prisma as never, {} as never, config as never, {} as never);
    await service.updateProfileName(7, '  اسم   جديد ');
    expect(prisma.users.update).toHaveBeenCalledWith({ where: { user_id: 7 }, data: { name: 'اسم جديد' } });
  });
});
