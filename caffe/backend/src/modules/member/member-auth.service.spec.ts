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
      update: jest.fn(),
    },
    club_members: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    am_member_notifications: { deleteMany: jest.fn() },
    am_invitations: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const service = new MemberAuthService(
    prisma as unknown as PrismaService,
    {} as JwtService,
    { get: jest.fn() } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_members.findFirst.mockResolvedValue({ id: 45 });
    prisma.club_members.update.mockResolvedValue({ id: 45 });
    prisma.am_member_notifications.deleteMany.mockResolvedValue({ count: 2 });
    prisma.am_invitations.updateMany.mockResolvedValue({ count: 1 });
    prisma.api_users.update.mockResolvedValue({ user_id: 12 });
    prisma.$transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
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
