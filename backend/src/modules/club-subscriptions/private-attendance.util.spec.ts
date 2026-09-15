import { recordPrivateAttendanceCommission } from './private-attendance.util';

describe('recordPrivateAttendanceCommission', () => {
  const tx = {
    club_subscriptions: { findUnique: jest.fn() },
    club_trainer_salaries: { findFirst: jest.fn() },
    club_private_attendance_commissions: { createMany: jest.fn() },
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('allocates a sessions package across its included sessions and snapshots the trainer rate', async () => {
    tx.club_subscriptions.findUnique.mockResolvedValue({
      id: 7,
      subscription_value: 1000,
      discount_value: 100,
      sessions_count: 10,
      sessions_used: 3,
      is_linked_to_sessions: true,
      private_package: { kind: 'sessions' },
      private_trainer: { id: 4 },
    });
    tx.club_trainer_salaries.findFirst.mockResolvedValue({ subscription_commission_percentage: 20 });
    tx.club_private_attendance_commissions.createMany.mockResolvedValue({ count: 1 });

    await recordPrivateAttendanceCommission(tx, {
      attendanceId: 91,
      subscriptionId: 7,
      attendanceDate: '2026-08-03',
    });

    expect(tx.club_private_attendance_commissions.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        attendance_id: 91,
        commission_sequence: 3,
        revenue_base: 90,
        commission_percentage: 20,
        commission_amount: 18,
      })],
      skipDuplicates: true,
    });
  });

  it('awards a duration package only on sequence one', async () => {
    tx.club_subscriptions.findUnique.mockResolvedValue({
      id: 8,
      subscription_value: 800,
      discount_value: 0,
      sessions_count: null,
      sessions_used: 0,
      is_linked_to_sessions: false,
      private_package: { kind: 'subscription' },
      private_trainer: { id: 5 },
    });
    tx.club_trainer_salaries.findFirst.mockResolvedValue({ subscription_commission_percentage: 15 });
    tx.club_private_attendance_commissions.createMany.mockResolvedValue({ count: 1 });

    await recordPrivateAttendanceCommission(tx, {
      attendanceId: 92,
      subscriptionId: 8,
      attendanceDate: '2026-08-03',
    });

    expect(tx.club_private_attendance_commissions.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({
          commission_sequence: 1,
          revenue_base: 800,
          commission_amount: 120,
        })],
      }),
    );
  });

  it('does nothing for a regular subscription', async () => {
    tx.club_subscriptions.findUnique.mockResolvedValue({ private_package: null, private_trainer: null });
    await recordPrivateAttendanceCommission(tx, {
      attendanceId: 93,
      subscriptionId: 9,
      attendanceDate: '2026-08-03',
    });
    expect(tx.club_private_attendance_commissions.createMany).not.toHaveBeenCalled();
  });
});
