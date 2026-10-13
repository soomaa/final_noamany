import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';

describe('AuthService profile image', () => {
  it('updates only the signed-in account and its linked employee photo', async () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 17, emp_code: 42, approved: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      employees: {
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const service = new AuthService(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.updateProfileImage(17, 'human_resources/emp_photo/avatar-17.jpg'),
    ).resolves.toEqual({ image: 'human_resources/emp_photo/avatar-17.jpg' });

    expect(prisma.users.update).toHaveBeenCalledWith({
      where: { user_id: 17 },
      data: { image: 'human_resources/emp_photo/avatar-17.jpg' },
    });
    expect(prisma.employees.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { personal_photo: 'human_resources/emp_photo/avatar-17.jpg' },
    });
  });
});

describe('AuthService password security', () => {
  it('rejects a refresh token issued before the current password version', async () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({
          user_id: 17, approved: 1, password: 'current-password-hash', level: 2,
          emp_code: null, name: 'موظف', image: null, branch_id_fk: 0,
        }),
      },
    };
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 17, pver: 'stale-version' }),
      signAsync: jest.fn().mockResolvedValue('new-access-token'),
    };
    const config = { get: jest.fn((key: string) => key === 'jwt.refreshSecret' ? 'refresh-secret' : 'access-secret') };
    const service = new AuthService(prisma as never, jwt as never, config as never, {} as never);

    await expect(service.refresh('old-refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a new password that bcrypt would truncate', async () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 17, approved: 1, password: await bcrypt.hash('old-pass', 4) }),
        update: jest.fn(),
      },
    };
    const config = { get: jest.fn().mockReturnValue(4) };
    const service = new AuthService(prisma as never, {} as never, config as never, {} as never);

    await expect(service.changePassword(17, 'old-pass', 'a'.repeat(73))).rejects.toThrow('72');
  });

  it('issues a usable refresh version after rehashing a legacy password at login', async () => {
    const prisma = {
      users: {
        findFirst: jest.fn().mockResolvedValue({ user_id: 17, approved: 1, password: null, x_y_z: 'legacy-pass' }),
        findUnique: jest.fn().mockResolvedValue({
          user_id: 17, approved: 1, level: 2, emp_code: null, name: 'موظف', image: null, branch_id_fk: 0,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };
    const config = {
      get: jest.fn((key: string) => ({ bcryptRounds: 4, 'jwt.accessSecret': 'access-secret', 'jwt.refreshSecret': 'refresh-secret', 'jwt.accessTtl': '2h', 'jwt.refreshTtl': '7d' })[key]),
    };
    const service = new AuthService(prisma as never, jwt as never, config as never, {} as never);

    await service.login('legacy-user', 'legacy-pass');

    const newHash = prisma.users.update.mock.calls[0][0].data.password as string;
    const expectedVersion = createHmac('sha256', 'refresh-secret').update(newHash).digest('base64url');
    expect(jwt.signAsync.mock.calls[1][0]).toEqual({ sub: 17, pver: expectedVersion });
  });
});
