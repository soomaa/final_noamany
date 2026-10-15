import {
  applyTrainerCommissionRefund,
  calculateTrainerCommissionClawback,
  recordTrainerSubscriptionRefund,
} from './trainer-subscription-refunds';

describe('trainer commission refund clawback', () => {
  it('reverses the paid-value share and never exceeds earned commission', () => {
    expect(calculateTrainerCommissionClawback({ earnedCommission: 120, refundableBase: 1000, refundAmount: 250 })).toBe(30);
    expect(calculateTrainerCommissionClawback({ earnedCommission: 120, refundableBase: 100, refundAmount: 500 })).toBe(120);
    expect(calculateTrainerCommissionClawback({ earnedCommission: 0, refundableBase: 1000, refundAmount: 250 })).toBe(0);
  });

  it('distributes the clawback over remaining commission without double-reversing refunded rows', async () => {
    const tx = {
      club_private_attendance_commissions: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, commission_amount: 50, refunded_amount: 20 },
          { id: 2, commission_amount: 70, refunded_amount: 0 },
        ]),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    await expect(applyTrainerCommissionRefund(tx, {
      subscriptionId: 9,
      refundableBase: 1000,
      refundAmount: 500,
    })).resolves.toBe(60);

    expect(tx.club_private_attendance_commissions.update).toHaveBeenNthCalledWith(1, {
      where: { id: 1 },
      data: { refunded_amount: { increment: 30 } },
    });
    expect(tx.club_private_attendance_commissions.update).toHaveBeenNthCalledWith(2, {
      where: { id: 2 },
      data: { refunded_amount: { increment: 30 } },
    });
  });

  it('captures the original receipt rate and posts the reversal in the refund period', async () => {
    const tx = {
      club_subscriptions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 12,
          employee_id: 44,
          receipts: [{ id: 3, amount: 1000, receipt_date: '2026-08-01' }],
        }),
      },
      club_trainers: { findFirst: jest.fn().mockResolvedValue({ id: 9, employee_id: 44 }) },
      club_trainer_receipt_commissions: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      club_trainer_salaries: {
        findFirst: jest.fn().mockResolvedValue({ subscription_commission_percentage: 10 }),
      },
      club_trainer_subscription_refund_commissions: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await recordTrainerSubscriptionRefund(tx as never, {
      refundId: 7,
      subscriptionId: 12,
      refundDate: '2026-09-09',
      refundAmount: 500,
    });

    expect(tx.club_trainer_receipt_commissions.createMany).toHaveBeenCalled();
    expect(tx.club_trainer_subscription_refund_commissions.createMany).toHaveBeenCalledWith({
      data: [{
        refund_id: 7,
        subscription_id: 12,
        trainer_id: 9,
        refund_date: '2026-09-09',
        base_amount: 500,
        commission_amount: 50,
      }],
      skipDuplicates: true,
    });
  });
});
