import { AuthService } from '../auth/auth.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { UserAdminService } from '../user-admin/user-admin.service';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAccountsController } from './admin-accounts.controller';
import { legacyHash } from '../auth/legacy-hash.util';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateAdminAccountDto } from './dto/admin-account.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersService } from './users.service';

describe('password-confirmed standalone administrators', () => {
  const actor = { sub: 9, level: 1 } as JwtUser;
  const dto = { currentPassword: 'owner-secret', username: 'new_admin', password: ' new-secret ' };
  let account: any;
  let prisma: any;
  let service: AdminAccountsService;
  let afterLock: (() => void) | undefined;

  beforeEach(() => {
    account = { user_id: 9, level: 1, approved: 1, password: legacyHash('owner-secret') };
    afterLock = undefined;
    prisma = {
      users: {
        findUnique: jest.fn(async () => ({ ...account })),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data, select }) => Object.fromEntries(
          Object.keys(select).map((key) => [key, key === 'user_id' ? 31 : data[key]]),
        )),
      },
      employees: { create: jest.fn(), findUnique: jest.fn() },
      $queryRaw: jest.fn(async () => { afterLock?.(); return []; }),
      $transaction: jest.fn(async (work) => work(prisma)),
    };
    service = new AdminAccountsService(prisma);
  });

  it('checks the authenticated actor, not a supplied username or creator id', async () => {
    await expect(service.verify({ ...actor, level: 2 }, 'owner-secret')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.findUnique).not.toHaveBeenCalled();
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it.each([null, { level: 2, approved: 1 }, { level: 1, approved: 0 }])('rejects missing, demoted, and disabled actors in the database: %j', async (row) => {
    prisma.users.findUnique.mockResolvedValue(row);
    await expect(service.create(actor, dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('wrong or missing owner password cannot create an administrator', async () => {
    for (const currentPassword of ['', 'wrong', undefined]) {
      await expect(service.create(actor, { ...dto, currentPassword } as any)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('verification creates nothing and does not authorize a later request with the wrong password', async () => {
    await expect(service.verify(actor, 'owner-secret')).resolves.toEqual({ verified: true });
    expect(prisma.users.create).not.toHaveBeenCalled();
    await expect(service.create(actor, { ...dto, currentPassword: 'wrong' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('creates a login without employee queries and exposes no credentials', async () => {
    const result = await service.create(actor, { ...dto, username: '  new_admin  ', level: 2, empCode: 92 } as any);
    const data = prisma.users.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ username: 'new_admin', name: 'new_admin', level: 1, approved: 1 });
    expect(data.emp_code === null || data.emp_code === 0).toBe(true);
    expect(await bcrypt.compare(dto.password, data.password)).toBe(true);
    expect(await bcrypt.compare(dto.password.trim(), data.password)).toBe(false);
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('user_pass');
    expect(result).not.toHaveProperty('currentPassword');
    expect(prisma.employees.create).not.toHaveBeenCalled();
    expect(prisma.employees.findUnique).not.toHaveBeenCalled();
  });

  it('accepts bcrypt owner passwords as well as the supported legacy hashes', async () => {
    account.password = await bcrypt.hash('owner-secret', 4);
    await expect(service.verify(actor, 'owner-secret')).resolves.toEqual({ verified: true });
    await expect(service.verify(actor, 'wrong')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checks duplicates inside the serialized transaction before writing', async () => {
    prisma.users.findFirst.mockResolvedValue({ user_id: 12 });
    await expect(service.create(actor, dto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it.each(['password', 'level', 'approved'])('does not create if the actor %s changes during creation', async (field) => {
    afterLock = () => { account[field] = field === 'password' ? legacyHash('changed') : 0; };
    await expect(service.create(actor, dto)).rejects.toThrow();
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('rejects oversized UTF-8 passwords instead of silently truncating bcrypt input', async () => {
    await expect(service.create(actor, { ...dto, password: 'ع'.repeat(40) })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it.each(['abc', 'x'.repeat(41), '_retired_hidden'])('rejects invalid or hidden usernames: %s', async (username) => {
    await expect(service.create(actor, { ...dto, username })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('validates creation fields and trims usernames while leaving passwords exact', async () => {
    const input = plainToInstance(CreateAdminAccountDto, { ...dto, username: ' new_admin ' });
    expect(await validate(input)).toEqual([]);
    expect(input.username).toBe('new_admin');
    expect(input.password).toBe(dto.password);
    expect((await validate(plainToInstance(CreateAdminAccountDto, { username: 'valid_name', password: 'short' }))).length).toBeGreaterThan(0);
  });

  it('keeps both password endpoints authenticated and throttled', () => {
    const guards = Reflect.getMetadata('__guards__', AdminAccountsController);
    expect(guards.map((guard: any) => guard.name)).toEqual(['JwtAuthGuard', 'ThrottlerGuard']);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', AdminAccountsController)).toBe(10);
  });

  it('the legacy create endpoint cannot bypass the confirmation workflow', async () => {
    const legacy = Object.create(UsersService.prototype) as UsersService;
    await expect((legacy.create as any)({ level: 1 }, actor.sub, actor)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('the legacy update endpoint cannot promote a staff login to bypass confirmation', async () => {
    const legacy = Object.create(UsersService.prototype) as any;
    legacy.prisma = prisma;
    prisma.users.findUnique.mockResolvedValue({ user_id: 25, level: 2 });
    await expect(legacy.update(25, { level: 1 }, actor.sub, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('the alternate user-admin route also requires the dedicated confirmation flow', async () => {
    const legacy = Object.create(UserAdminService.prototype) as any;
    legacy.prisma = prisma;
    await expect(legacy.create({ level: 1 }, actor.sub)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.users.findUnique.mockResolvedValue({ user_id: 25, level: 2 });
    await expect(legacy.update(25, { level: 1 }, actor.sub)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('the created standalone account can authenticate without an employee record', async () => {
    await service.create(actor, dto);
    const record = { ...prisma.users.create.mock.calls[0][0].data, user_id: 31, image: null };
    prisma.users.findFirst.mockResolvedValue(record);
    prisma.users.findUnique.mockResolvedValue(record);
    const auth = Object.create(AuthService.prototype) as any;
    auth.prisma = prisma;
    auth.config = { get: jest.fn() };
    auth.signTokens = jest.fn(async () => ({ accessToken: 'fixture-access', refreshToken: 'fixture-refresh' }));
    const result = await auth.login(dto.username, dto.password);
    expect(result.user).toMatchObject({ sub: 31, level: 1, branch: 0 });
    expect(prisma.employees.create).not.toHaveBeenCalled();
    await expect(auth.login(dto.username, 'wrong')).rejects.toThrow();
  });

  it('the created account receives system administrator permissions without employee roles', async () => {
    await service.create(actor, dto);
    const record = { ...prisma.users.create.mock.calls[0][0].data, user_id: 31 };
    prisma.users.findUnique.mockResolvedValue(record);
    const engine = new PermissionEngineService(prisma, { get: jest.fn(), set: jest.fn() } as any);
    const effective = await engine.getEffective(31);
    expect(effective.superAdmin).toBe(true);
    expect(effective.keys.has('admin.users:create')).toBe(true);
  });

});
