import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeesService } from './employees.service';

describe('EmployeesService.provisionUser account ownership', () => {
  const prisma = {
    employees: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    api_users: {
      findFirst: jest.fn(),
    },
    users: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    rbac_roles: {
      findUnique: jest.fn(),
    },
    rbac_user_roles: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const service = new EmployeesService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.employees.findUnique.mockResolvedValue({ personal_photo: null });
    prisma.employees.findFirst.mockResolvedValue(null);
    prisma.api_users.findFirst.mockResolvedValue(null);
    prisma.users.update.mockResolvedValue({});
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
    expect(prisma.rbac_user_roles.deleteMany).not.toHaveBeenCalled();
  });

  it('updates only the account already linked to the same employee', async () => {
    prisma.users.findFirst
      .mockResolvedValueOnce({ user_id: 11, emp_code: 101, username: 'old-name' })
      .mockResolvedValueOnce(null);
    prisma.rbac_roles.findUnique.mockResolvedValue({ id: 3 });
    prisma.rbac_user_roles.deleteMany.mockResolvedValue({ count: 1 });
    prisma.rbac_user_roles.create.mockResolvedValue({});

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
    prisma.rbac_user_roles.deleteMany.mockResolvedValue({ count: 0 });
    prisma.rbac_user_roles.create.mockResolvedValue({});

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

  it('creates the automatic fingerprint account without dashboard permissions', async () => {
    prisma.users.findFirst.mockResolvedValue(null);
    prisma.users.create.mockResolvedValue({ user_id: 13 });

    await (service as any).provisionUser(
      103,
      'Fingerprint Employee',
      '01200000000',
      2,
      undefined,
      undefined,
      { username: '01200000000' },
    );

    const createCall = prisma.users.create.mock.calls[0][0];
    expect(await bcrypt.compare('102030', createCall.data.password)).toBe(true);
    expect(createCall.data).toMatchObject({
      username: '01200000000',
      emp_code: 103,
      role_id_fk: undefined,
      must_change_password: false,
    });
    expect(prisma.rbac_user_roles.create).not.toHaveBeenCalled();
  });
});
