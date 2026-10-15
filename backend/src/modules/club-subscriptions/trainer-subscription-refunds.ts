import { Prisma } from '@prisma/client';
import { roundMoney } from '../club-sales/club-sales.constants';
import {
  settleTrainerReceiptSources,
  trainerReceiptSource,
  type TrainerReceiptSource,
} from '../club-fitness/trainer-receipt-commissions';

const money = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function calculateTrainerCommissionClawback(input: {
  earnedCommission: number;
  refundableBase: number;
  refundAmount: number;
}) {
  if (input.earnedCommission <= 0 || input.refundableBase <= 0 || input.refundAmount <= 0) return 0;
  return money(Math.min(input.earnedCommission, input.earnedCommission * (input.refundAmount / input.refundableBase)));
}

export async function applyTrainerCommissionRefund(
  tx: any,
  input: { subscriptionId: number; refundAmount: number; refundableBase: number },
) {
  const rows = await tx.club_private_attendance_commissions.findMany({
    where: { subscription_id: input.subscriptionId },
    select: { id: true, commission_amount: true, refunded_amount: true },
    orderBy: { id: 'asc' },
  });
  const totalEarned = rows.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.commission_amount)), 0);
  const available = rows.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.commission_amount) - Number(row.refunded_amount)), 0);
  const proportional = calculateTrainerCommissionClawback({
    earnedCommission: totalEarned,
    refundableBase: input.refundableBase,
    refundAmount: input.refundAmount,
  });
  const clawback = money(Math.min(available, proportional));
  let remaining = clawback;
  for (const row of rows) {
    if (remaining <= 0) break;
    const rowAvailable = Math.max(0, Number(row.commission_amount) - Number(row.refunded_amount));
    const amount = Math.min(rowAvailable, remaining);
    if (amount > 0) await tx.club_private_attendance_commissions.update({ where: { id: row.id }, data: { refunded_amount: { increment: money(amount) } } });
    remaining = money(remaining - amount);
  }
  return clawback;
}

export async function recordTrainerSubscriptionRefund(
  tx: Prisma.TransactionClient,
  input: {
    refundId: number;
    subscriptionId: number;
    refundDate: string;
    refundAmount: number;
  },
) {
  const subscription = await tx.club_subscriptions.findUnique({
    where: { id: input.subscriptionId },
    select: {
      id: true,
      employee_id: true,
      receipts: {
        where: { status: { in: ['مدفوعة', 'paid'] } },
        select: { id: true, amount: true, receipt_date: true },
      },
    },
  });
  if (!subscription?.receipts.length) return [];

  const receiptIds = subscription.receipts.map((receipt) => receipt.id);
  const snapshots = await tx.club_trainer_receipt_commissions.findMany({
    where: { receipt_id: { in: receiptIds } },
  });
  const currentTrainer = subscription.employee_id
    ? await tx.club_trainers.findFirst({
        where: { employee_id: subscription.employee_id },
        select: { id: true },
      })
    : null;
  const sources: TrainerReceiptSource[] = [];
  for (const receipt of subscription.receipts) {
    const saved = snapshots.find((snapshot) => snapshot.receipt_id === receipt.id);
    const trainerId = saved?.trainer_id ?? currentTrainer?.id;
    if (!trainerId) continue;
    const source = await trainerReceiptSource(tx, trainerId, receipt, snapshots);
    if (source) sources.push(source);
  }
  if (!sources.length) return [];
  await settleTrainerReceiptSources(tx, sources);

  const paidBase = subscription.receipts.reduce((sum, receipt) => sum + Number(receipt.amount), 0);
  if (paidBase <= 0) return [];
  const grouped = new Map<number, { base: number; commission: number }>();
  for (const source of sources) {
    const current = grouped.get(source.trainerId) ?? { base: 0, commission: 0 };
    current.base += source.base;
    current.commission += source.commission;
    grouped.set(source.trainerId, current);
  }
  const rows = [...grouped.entries()].map(([trainerId, source]) => ({
    refund_id: input.refundId,
    subscription_id: input.subscriptionId,
    trainer_id: trainerId,
    refund_date: input.refundDate,
    base_amount: roundMoney(input.refundAmount * source.base / paidBase),
    commission_amount: roundMoney(input.refundAmount * source.commission / paidBase),
  }));
  await tx.club_trainer_subscription_refund_commissions.createMany({
    data: rows,
    skipDuplicates: true,
  });
  return rows;
}
