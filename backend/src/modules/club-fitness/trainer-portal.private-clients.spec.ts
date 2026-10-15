import { TrainerPortalService } from './trainer-portal.service';

describe('trainer portal private clients', () => {
  it('returns only active private subscriptions assigned to the signed-in trainer', async () => {
    const prisma = {
      club_trainers: { findFirst: jest.fn().mockResolvedValue({ id: 16, is_active: true, is_deleted: false }) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new TrainerPortalService(prisma as never);

    await (service as any).privateClients({ trainer_id: 16, emp_code: 2 } as never, '2026-09-09');

    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ private_trainer_id: 16, status: 'active', subscription_end_date: { gte: '2026-09-09' } }),
    }));
  });

  it('checks in only an active private subscription owned by the signed-in trainer', async () => {
    const prisma = {
      club_trainers: { findFirst: jest.fn().mockResolvedValue({ id: 16, is_active: true, is_deleted: false }) },
      club_subscriptions: {
        findFirst: jest.fn().mockResolvedValue({ id: 41, member_id: 7, branch_id: 3 }),
      },
    };
    const attendance = { checkIn: jest.fn().mockResolvedValue({ id: 99 }) };
    const user = { trainer_id: 16, emp_code: 2, branch: 3 } as never;
    const service = new TrainerPortalService(prisma as never, attendance as never);

    await expect(service.privateCheckIn(user, 41)).resolves.toEqual({ id: 99 });

    expect(prisma.club_subscriptions.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 41, private_trainer_id: 16, status: 'active' }),
    }));
    expect(attendance.checkIn).toHaveBeenCalledWith({
      memberId: 7,
      branchId: 3,
      subscriptionId: 41,
      consumeSession: true,
      notes: 'تسجيل من بوابة المدرب',
    }, user);
  });
});
