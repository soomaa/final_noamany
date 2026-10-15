import { assertTrainerPaymentPeriod, calculateTrainerEarnings } from './trainer-earnings';

describe('canonical trainer earnings', () => {
  const input = {
    attendanceCommission: 220,
    targetCommission: 110,
    paid: 50,
  };

  it.each([
    ['attendance', 220],
    ['tiered', 110],
    ['combined', 330],
  ] as const)('uses the explicit %s commission mode everywhere', (commissionMode, earned) => {
    expect(calculateTrainerEarnings({ ...input, commissionMode })).toEqual({
      earned,
      paid: 50,
      payable: earned - 50,
      remaining: earned - 50,
      overpaid: 0,
    });
  });

  it('keeps an overpaid balance visible after a refund reduces entitlement', () => {
    expect(calculateTrainerEarnings({
      attendanceCommission: 220,
      targetCommission: 110,
      commissionMode: 'attendance',
      paid: 300,
    })).toEqual({ earned: 220, paid: 300, payable: -80, remaining: 0, overpaid: 80 });
  });

  it('allows partial payments for the exact period and rejects a different overlapping period', async () => {
    const tx = {
      club_trainer_earning_payments: {
        findMany: jest.fn().mockResolvedValue([
          { period_from: '2026-09-01', period_to: '2026-09-30' },
        ]),
      },
    };

    await expect(assertTrainerPaymentPeriod(tx as never, 9, '2026-09-01', '2026-09-30'))
      .resolves.toBeUndefined();
    await expect(assertTrainerPaymentPeriod(tx as never, 9, '2026-09-02', '2026-10-01'))
      .rejects.toThrow('فترة متداخلة');
  });
});
