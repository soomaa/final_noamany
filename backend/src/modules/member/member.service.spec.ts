import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppManagementService } from '../app-management/app-management.service';
import { MemberService } from './member.service';

describe('MemberService.listPoints', () => {
  const prisma = {
    club_members: { findFirst: jest.fn() },
    tbl_branches: { findUnique: jest.fn() },
    club_member_point_transactions: { findMany: jest.fn() },
    club_subscriptions: { findMany: jest.fn() },
    club_trainers: { findMany: jest.fn() },
    club_classes: { findMany: jest.fn() },
    club_class_schedule_slots: { findMany: jest.fn() },
    club_trainer_schedule_slots: { findMany: jest.fn() },
    $queryRawUnsafe: jest.fn(),
  };
  const appManagement = { getAbout: jest.fn() };
  const service = new MemberService(
    prisma as unknown as PrismaService,
    { get: jest.fn() } as unknown as ConfigService,
    appManagement as unknown as AppManagementService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('shows a positive manual point adjustment as earned points', async () => {
    prisma.club_member_point_transactions.findMany.mockResolvedValue([
      {
        id: 41,
        transaction_type: 'manual_adjustment',
        points: 25,
        action_name: 'مكافأة من إدارة النقاط',
        subscription_id: null,
        occurred_at: new Date('2026-09-22T10:00:00.000Z'),
        created_at: new Date('2026-09-22T10:00:00.000Z'),
      },
    ]);

    await expect(service.listPoints(118779)).resolves.toEqual({
      balance: 25,
      totalEarned: 25,
      totalRedeemed: 0,
      history: [expect.objectContaining({ id: 41, type: 'earn', points: 25, balanceAfter: 25 })],
    });
  });

  it('returns a CODE128 barcode descriptor in the member profile', async () => {
    prisma.club_members.findFirst.mockResolvedValue({
      id: 44,
      name: 'عضو الاختبار',
      phone: '01000000000',
      profile_picture: null,
      branch_id: 2,
      member_code: 'C12299',
      is_active: true,
    });
    prisma.tbl_branches.findUnique.mockResolvedValue({ branch_name: 'فرع طنطا' });
    appManagement.getAbout.mockResolvedValue({ termsOfService: '', privacyPolicy: '' });

    await expect(service.getProfile(44)).resolves.toMatchObject({
      memberCode: 'C12299',
      barcode: 'C12299',
      barcodeFormat: 'CODE128',
    });
  });

  it('lists an active trainer even when they have no class, schedule, or branch employee record', async () => {
    prisma.club_trainers.findMany.mockResolvedValue([
      {
        id: 77,
        employee_id: null,
        name: 'مدرب التطبيق',
        specialization: 'لياقة بدنية',
        experience: '3 سنوات',
        bio: null,
        image_url: null,
        rating_avg: 4.5,
      },
    ]);
    prisma.club_classes.findMany.mockResolvedValue([]);
    prisma.club_class_schedule_slots.findMany.mockResolvedValue([]);
    prisma.club_trainer_schedule_slots.findMany.mockResolvedValue([]);

    await expect(service.listTrainers(2)).resolves.toEqual([
      expect.objectContaining({ id: 77, name: 'مدرب التطبيق', branchId: 2 }),
    ]);
  });

  it('lists at most 20 portal classes for the member branch and selected audience', async () => {
    prisma.club_classes.findMany.mockResolvedValue([]);
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        id: 3,
        class_title: 'fitness كلاس',
        branch_id: 2,
        class_type: 1,
        price: 150,
        day: 'الأربعاء',
        time: '18:00',
        date: '2026-09-23',
      },
    ]);

    await expect(service.listClasses(2, 118779, 'men')).resolves.toEqual({
      total: 1,
      audiences: [
        expect.objectContaining({
          audience: 'men',
          label: 'رجال',
          count: 1,
          classes: [expect.objectContaining({ id: 3, className: 'fitness كلاس', branchId: 2, price: 150 })],
        }),
      ],
    });
  });
});
