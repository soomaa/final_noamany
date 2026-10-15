import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeesService } from './employees.service';

describe('EmployeesService.provisionUser account ownership', () => {
  const prisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    employees: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    api_users: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    users: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    staff_auth_sessions: {
      updateMany: jest.fn(),
    },
    rbac_roles: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    rbac_user_roles: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    department_jobs: {
      findUnique: jest.fn(),
    },
  };

  const permissionEngine = { invalidateUser: jest.fn() };
  const service = new EmployeesService(
    prisma as unknown as PrismaService,
    permissionEngine as never,
    {} as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (work: ((client: typeof prisma) => unknown) | Promise<unknown>[]) =>
      Array.isArray(work) ? Promise.all(work) : work(prisma));
    prisma.employees.findUnique.mockResolvedValue({ personal_photo: null, mosma_wazefy_code: 5 });
    prisma.employees.findFirst.mockResolvedValue(null);
    prisma.api_users.findFirst.mockResolvedValue(null);
    prisma.api_users.update.mockResolvedValue({});
    prisma.api_users.delete.mockResolvedValue({});
    prisma.staff_auth_sessions.updateMany.mockResolvedValue({ count: 1 });
    prisma.users.update.mockResolvedValue({});
    prisma.department_jobs.findUnique.mockResolvedValue({ id: 5, name: 'موظف' });
    prisma.rbac_roles.upsert.mockResolvedValue({ id: 3 });
    prisma.rbac_roles.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.rbac_user_roles.deleteMany.mockResolvedValue({ count: 0 });
    prisma.rbac_user_roles.upsert.mockResolvedValue({});
  });

  it('rejects a username belonging to another account without modifying that account', async () => {
    prisma.users.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ user_id: 7, emp_code: 900, username: 'admin' });

    await expect(
      (service as any).provisionUser(
        101,
        'New Employee',
        '01000000000',
        1,
        3,
        undefined,
        { username: 'admin', password: 'new-password' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.users.update).not.toHaveBeenCalled();
    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.rbac_user_roles.upsert).not.toHaveBeenCalled();
  });

  it('preflights duplicate login ownership before a MyISAM employee write can begin', async () => {
    prisma.users.findFirst.mockResolvedValueOnce({ user_id: 7, username: 'admin' });

    await expect(
      (service as any).preflightProvisionUser(
        null,
        '01000000000',
        { username: 'admin', password: 'new-password' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.users.update).not.toHaveBeenCalled();
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('updates only the account already linked to the same employee', async () => {
    prisma.users.findFirst
      .mockResolvedValueOnce({ user_id: 11, emp_code: 101, username: 'old-name' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ user_id: 11, emp_code: 101, username: 'safe-name' });
    prisma.rbac_roles.findUnique.mockResolvedValue({ id: 3 });
    prisma.rbac_user_roles.upsert.mockResolvedValue({});

    await (service as any).provisionUser(
      101,
      'Same Employee',
      '01000000000',
      2,
      3,
      '01099999999',
      { username: 'safe-name' },
    );

    expect(prisma.users.update).toHaveBeenCalledWith({
      where: { user_id: 11 },
      data: { name: 'Same Employee', branch_id_fk: 2, username: 'safe-name' },
    });
    expect(prisma.users.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ password: expect.anything() }),
      }),
    );
    expect(prisma.users.create).not.toHaveBeenCalled();
  });

  it('stores a new staff password only as bcrypt with no plaintext mirror', async () => {
    prisma.users.findFirst.mockResolvedValue(null);
    prisma.users.create.mockResolvedValue({ user_id: 12 });
    prisma.rbac_roles.findUnique.mockResolvedValue({ id: 3 });
    prisma.rbac_user_roles.upsert.mockResolvedValue({});

    await (service as any).provisionUser(
      102,
      'Secure Employee',
      '01100000000',
      2,
      3,
      undefined,
      { username: 'secure-user', password: 'strong-password' },
    );

    const createCall = prisma.users.create.mock.calls[0][0];
    expect(await bcrypt.compare('strong-password', createCall.data.password)).toBe(true);
    expect(createCall.data).toMatchObject({
      app_pass: null,
      pass_demo: null,
      user_pass: null,
      x_y_z: null,
    });
  });

  it('disables canonical mobile login and revokes sessions before removing the legacy app row', async () => {
    prisma.employees.findUnique.mockResolvedValue({ id: 101, app_user_id: 44 });
    prisma.users.findFirst.mockResolvedValue({ user_id: 11, emp_code: 101 });
    prisma.api_users.findUnique.mockResolvedValue({ user_id: 44, status: 1 });
    (prisma.employees as typeof prisma.employees & { update: jest.Mock }).update = jest.fn().mockResolvedValue({});

    await service.removeAppUser(101);

    expect(prisma.users.update).toHaveBeenCalledWith({ where: { user_id: 11 }, data: { approved: 0 } });
    expect(prisma.staff_auth_sessions.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { user_id: 11, revoked_at: null },
      data: expect.objectContaining({ revocation_reason: 'app-user-removed' }),
    }));
    expect(prisma.api_users.update).toHaveBeenCalledWith({ where: { user_id: 44 }, data: { status: 0 } });
    expect(prisma.api_users.delete).toHaveBeenCalledWith({ where: { user_id: 44 } });
  });

  it('does not disable staff login when the employee has no linked app account', async () => {
    prisma.employees.findUnique.mockResolvedValue({ id: 101, app_user_id: null });

    await service.removeAppUser(101);

    expect(prisma.users.findFirst).not.toHaveBeenCalled();
    expect(prisma.users.update).not.toHaveBeenCalled();
    expect(prisma.staff_auth_sessions.updateMany).not.toHaveBeenCalled();
  });

  it('keeps removal fail-closed when legacy physical deletion fails', async () => {
    prisma.employees.findUnique.mockResolvedValue({ id: 101, app_user_id: 44 });
    prisma.users.findFirst.mockResolvedValue({ user_id: 11, emp_code: 101 });
    prisma.api_users.findUnique.mockResolvedValue({ user_id: 44, status: 1 });
    prisma.api_users.delete.mockRejectedValueOnce(new Error('legacy delete failed'));
    const employeesUpdate = jest.fn().mockResolvedValue({});
    (prisma.employees as typeof prisma.employees & { update: jest.Mock }).update =
      employeesUpdate;

    await expect(service.removeAppUser(101)).resolves.toEqual({
      success: true,
      legacyCleanupPending: true,
    });

    expect(prisma.users.update).toHaveBeenCalledWith({
      where: { user_id: 11 },
      data: { approved: 0 },
    });
    expect(prisma.staff_auth_sessions.updateMany).toHaveBeenCalled();
    expect(prisma.api_users.update).toHaveBeenCalledWith({
      where: { user_id: 44 },
      data: { status: 0 },
    });
    expect(employeesUpdate).toHaveBeenCalledTimes(1);
  });
});
