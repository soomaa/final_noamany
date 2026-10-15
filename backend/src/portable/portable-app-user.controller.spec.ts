import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { PortableAppUserController } from './portable-app-user.controller';

describe('PortableAppUserController', () => {
  const prisma = {
    api_users: { findUnique: jest.fn() },
  };
  const controller = new PortableAppUserController(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => jest.resetAllMocks());

  it('exposes only the read contract needed by employee profile', async () => {
    prisma.api_users.findUnique.mockResolvedValue({
      user_id: 44,
      user_name: 'Employee',
      user_phone: '01000000000',
      user_email: 'employee@example.test',
      user_city: 'Cairo',
      status: 1,
      m_image: null,
      user_pass: 'must-not-leak',
      rand_key: 1234,
    });

    await expect(controller.get(44)).resolves.toEqual({
      id: 44,
      name: 'Employee',
      phone: '01000000000',
      email: 'employee@example.test',
      city: 'Cairo',
      status: 1,
      image: null,
    });
    expect(Object.getOwnPropertyNames(PortableAppUserController.prototype)).toEqual([
      'constructor',
      'get',
    ]);
  });

  it('fails closed for an unknown compatibility account', async () => {
    prisma.api_users.findUnique.mockResolvedValue(null);
    await expect(controller.get(999)).rejects.toBeInstanceOf(NotFoundException);
  });
});
