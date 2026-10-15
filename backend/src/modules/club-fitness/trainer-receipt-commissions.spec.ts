import { settleTrainerReceiptSources, trainerReceiptSource } from './trainer-receipt-commissions';

describe('trainer receipt commission snapshots', () => {
  it('keeps the saved trainer and commission after salary or subscription ownership changes', async () => {
    const db = { club_trainer_salaries: { findFirst: jest.fn() } };
    const saved = [{
      receipt_id: 4,
      trainer_id: 9,
      receipt_date: '2026-09-01',
      base_amount: 1000,
      commission_amount: 100,
    }];

    await expect(trainerReceiptSource(db as never, 9, {
      id: 4,
      amount: 1000,
      receipt_date: '2026-09-01',
    }, saved as never)).resolves.toEqual({
      receiptId: 4,
      trainerId: 9,
      date: '2026-09-01',
      base: 1000,
      commission: 100,
      settled: true,
    });
    expect(db.club_trainer_salaries.findFirst).not.toHaveBeenCalled();
  });

  it('snapshots only newly calculated receipt sources when a payout is recorded', async () => {
    const tx = { club_trainer_receipt_commissions: { createMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await settleTrainerReceiptSources(tx as never, [
      { receiptId: 4, trainerId: 9, date: '2026-09-01', base: 1000, commission: 100, settled: true },
      { receiptId: 5, trainerId: 9, date: '2026-09-02', base: 500, commission: 50, settled: false },
    ]);
    expect(tx.club_trainer_receipt_commissions.createMany).toHaveBeenCalledWith({
      data: [{ receipt_id: 5, trainer_id: 9, receipt_date: '2026-09-02', base_amount: 500, commission_amount: 50 }],
      skipDuplicates: true,
    });
  });
});
