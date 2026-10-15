import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type TrainerCommissionMode = 'attendance' | 'tiered' | 'combined';

const money = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function calculateTrainerEarnings(input: {
  attendanceCommission: number;
  targetCommission: number;
  commissionMode: TrainerCommissionMode;
  paid: number;
}) {
  const attendance = money(input.attendanceCommission);
  const target = money(input.targetCommission);
  const earned = input.commissionMode === 'tiered'
    ? target
    : input.commissionMode === 'combined'
      ? money(attendance + target)
      : attendance;
  const paid = money(input.paid);
  const payable = money(earned - paid);
  return {
    earned,
    paid,
    payable,
    remaining: Math.max(0, payable),
    overpaid: Math.max(0, money(-payable)),
  };
}

export function trainerPaymentPeriodWhere(trainerId: number, periodFrom: string, periodTo: string) {
  return {
    trainer_id: trainerId,
    OR: [
      { period_from: { lte: periodTo }, period_to: { gte: periodFrom } },
      { period_from: null, period_to: null, payment_date: { gte: periodFrom, lte: periodTo } },
    ],
  };
}

export async function assertTrainerPaymentPeriod(
  tx: Prisma.TransactionClient,
  trainerId: number,
  periodFrom: string,
  periodTo: string,
) {
  const rows = await tx.club_trainer_earning_payments.findMany({
    where: trainerPaymentPeriodWhere(trainerId, periodFrom, periodTo),
    select: { period_from: true, period_to: true },
  });
  if (rows.some((row) => row.period_from != null && row.period_to != null
    && (row.period_from !== periodFrom || row.period_to !== periodTo))) {
    throw new BadRequestException(
      'توجد مستحقات مدرب مصروفة عن فترة متداخلة؛ استخدم نفس فترة الصرف السابقة لتسوية المتبقي',
    );
  }
}
