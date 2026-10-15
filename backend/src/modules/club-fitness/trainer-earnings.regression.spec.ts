import { ClubTrainersService } from './club-trainers.service';

function fixture() {
  const prisma = {
    club_trainers: { findFirst: jest.fn().mockResolvedValue({ id: 9, employee_id: 44 }) },
    club_trainer_receipt_commissions: { findMany: jest.fn().mockResolvedValue([{
      receipt_id: 3,
      trainer_id: 9,
      receipt_date: '2026-08-01',
      base_amount: 1000,
      commission_amount: 100,
    }]) },
    club_classes: { findMany: jest.fn().mockResolvedValue([]) },
    club_class_guest_attendance: { findMany: jest.fn().mockResolvedValue([]) },
    club_receipts: { findMany: jest.fn().mockResolvedValue([{ id: 3, amount: 1000, receipt_date: '2026-08-01' }]) },
    club_private_attendance_commissions: { findMany: jest.fn().mockResolvedValue([]) },
    club_trainer_earning_payments: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    club_trainer_commission_settings: { findUnique: jest.fn().mockResolvedValue(null) },
    club_trainer_subscription_refund_commissions: { findMany: jest.fn().mockResolvedValue([{
      base_amount: 500,
      commission_amount: 50,
    }]) },
    club_trainer_salaries: { findFirst: jest.fn() },
  };
  return { prisma, service: new ClubTrainersService(prisma as never, {} as never) };
}

describe('trainer earnings regression', () => {
  it('uses attendance snapshots and adds guest cash once, rather than package contracts', async () => {
    const { prisma, service } = fixture();
    prisma.club_classes.findMany.mockResolvedValue([{ id: 12, status: 'scheduled', class_date: '2026-09-10', price: 250, enrollments: [
      { member_id: 8, attendance_status: 'attended', session_value_snapshot: 100, commission_percentage_snapshot: 50 },
      { member_id: 10, attendance_status: 'booked', session_value_snapshot: null },
    ] }] as never);
    prisma.club_class_guest_attendance.findMany.mockResolvedValue([{ amount: 250, commission_percentage: 50 }] as never);
    await expect(service.earningsSummary(9, '2026-09-01', '2026-09-30')).resolves.toMatchObject({ classRevenue: 350, classCommission: 175 });
  });
  it('uses immutable receipt commission and carries a refund in its accounting period', async () => {
    const { prisma, service } = fixture();
    await expect(service.earningsSummary(9, '2026-09-01', '2026-09-30')).resolves.toMatchObject({
      subscriptionRevenue: 500,
      subscriptionCommission: 50,
      refundBase: 500,
      refundCommission: 50,
      earned: 50,
      remaining: 50,
      overpaid: 0,
    });
    expect(prisma.club_trainer_salaries.findFirst).not.toHaveBeenCalled();
  });

  it('keeps the recovery balance visible when a prior payout is now above entitlement', async () => {
    const { prisma, service } = fixture();
    prisma.club_trainer_earning_payments.aggregate.mockResolvedValue({ _sum: { amount: 100 } });
    await expect(service.earningsSummary(9, '2026-09-01', '2026-09-30')).resolves.toMatchObject({
      earned: 50,
      paid: 100,
      remaining: 0,
      overpaid: 50,
    });
  });
});
