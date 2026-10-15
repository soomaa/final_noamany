import { Prisma } from '@prisma/client';
import { roundMoney } from '../club-sales/club-sales.constants';

export type TrainerReceiptSource = {
  receiptId: number;
  trainerId: number;
  date: string;
  base: number;
  commission: number;
  settled: boolean;
};

export async function trainerReceiptSource(
  db: Prisma.TransactionClient,
  trainerId: number,
  receipt: { id: number; amount: unknown; receipt_date: string },
  snapshots: Array<{
    receipt_id: number;
    trainer_id: number;
    receipt_date: string;
    base_amount: unknown;
    commission_amount: unknown;
  }>,
): Promise<TrainerReceiptSource | null> {
  const saved = snapshots.find((source) => source.receipt_id === receipt.id);
  if (saved?.trainer_id !== undefined && saved.trainer_id !== trainerId) return null;
  if (saved) {
    return {
      receiptId: saved.receipt_id,
      trainerId,
      date: saved.receipt_date,
      base: Number(saved.base_amount),
      commission: Number(saved.commission_amount),
      settled: true,
    };
  }
  const salary = await db.club_trainer_salaries.findFirst({
    where: {
      trainer_id: trainerId,
      effective_date: { lte: receipt.receipt_date },
      OR: [{ end_date: null }, { end_date: { gte: receipt.receipt_date } }],
    },
    orderBy: { effective_date: 'desc' },
  });
  const base = Number(receipt.amount);
  return {
    receiptId: receipt.id,
    trainerId,
    date: receipt.receipt_date,
    base,
    commission: roundMoney(base * Number(salary?.subscription_commission_percentage ?? 0) / 100),
    settled: false,
  };
}

export async function settleTrainerReceiptSources(
  tx: Prisma.TransactionClient,
  sources: TrainerReceiptSource[],
) {
  const pending = sources.filter((source) => !source.settled);
  if (!pending.length) return;
  await tx.club_trainer_receipt_commissions.createMany({
    data: pending.map((source) => ({
      receipt_id: source.receiptId,
      trainer_id: source.trainerId,
      receipt_date: source.date,
      base_amount: source.base,
      commission_amount: source.commission,
    })),
    skipDuplicates: true,
  });
}
