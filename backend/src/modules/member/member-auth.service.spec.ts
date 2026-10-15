import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MemberAuthService } from './member-auth.service';

describe('MemberAuthService.deleteAccount', () => {
  const prisma = {
    api_users: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    club_members: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    am_member_notifications: { deleteMany: jest.fn() },
    am_invitations: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
  const service = new MemberAuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    { get: jest.fn() } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_members.findFirst.mockResolvedValue({ id: 45 });
    prisma.club_members.update.mockResolvedValue({ id: 45 });
    prisma.am_member_notifications.deleteMany.mockResolvedValue({ count: 2 });
    prisma.am_invitations.updateMany.mockResolvedValue({ count: 1 });
    prisma.api_users.update.mockResolvedValue({ user_id: 12 });
    jwt.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');
    prisma.$transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
  });

  it('resolves the branch-bound membership before loading its app identity', async () => {
    prisma.club_members.findMany.mockResolvedValue([{
      id: 46,
      app_user_id: 13,
      branch_id: 2,
      member_code: 'B001352',
      name: 'عضو فرع ب',
      phone: '01000000000',
      subscriptions: [],
    }]);
    prisma.api_users.findMany.mockResolvedValue([{
      user_id: 13,
      user_phone: '01000000000',
      user_name: 'عضو فرع ب',
      user_pass: await bcrypt.hash('000000', 4),
      status: 1,
    }]);

    const result = await service.login('01000000000', '000000', 2);
    if (result.requiresBranchSelection) throw new Error('unexpected branch picker');

    expect(prisma.club_members.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branch_id: 2 }),
    }));
    expect(prisma.api_users.findMany).toHaveBeenCalledWith({ where: { user_id: { in: [13] } } });
    expect(result.user).toEqual(expect.objectContaining({
      memberId: 46,
      branchId: 2,
      memberCode: 'B001352',
    }));
  });

  it('keeps the single-branch login response exactly as the released app expects', async () => {
    prisma.club_members.findMany.mockResolvedValue([{
      id: 46, app_user_id: 13, branch_id: 2, member_code: 'B001352', name: 'عضو', phone: '01000000000', subscriptions: [],
    }]);
    prisma.api_users.findMany.mockResolvedValue([{
      user_id: 13, user_phone: '01000000000', user_name: 'عضو', user_pass: await bcrypt.hash('000000', 4), status: 1,
    }]);

    const result = await service.login('01000000000', '000000');

    expect(Object.keys(result).sort()).toEqual(['accessToken', 'message', 'mustChangePassword', 'refreshToken', 'user']);
    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      message: 'تم تسجيل الدخول بنجاح',
      mustChangePassword: true,
      user: {
        sub: 13, memberId: 46, branchId: 2, memberCode: 'B001352', phone: '01000000000', name: 'عضو', type: 'member',
      },
    });
  });

  it('rejects an incorrect password without changing the account', async () => {
    prisma.api_users.findUnique.mockResolvedValue({
      user_id: 12,
      status: 1,
      user_pass: await bcrypt.hash('correct-password', 4),
    });

    await expect(service.deleteAccount(12, 45, 'wrong-password')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('anonymizes and deactivates the app identity while retaining the membership', async () => {
    prisma.api_users.findUnique.mockResolvedValue({
      user_id: 12,
      status: 1,
      user_pass: await bcrypt.hash('correct-password', 4),
    });

    await expect(service.deleteAccount(12, 45, 'correct-password')).resolves.toEqual({
      message: 'تم حذف حساب التطبيق بنجاح',
      accountDeleted: true,
      membershipDeleted: false,
    });
    expect(prisma.club_members.update).toHaveBeenCalledWith({
      where: { id: 45 },
      data: { app_user_id: null },
    });
    expect(prisma.api_users.update).toHaveBeenCalledWith({
      where: { user_id: 12 },
      data: expect.objectContaining({
        user_name: null,
        user_phone: null,
        user_email: null,
        user_pass: null,
        status: 0,
      }),
    });
    expect(prisma.am_member_notifications.deleteMany).toHaveBeenCalledWith({
      where: { member_id: 45 },
    });
  });
});
