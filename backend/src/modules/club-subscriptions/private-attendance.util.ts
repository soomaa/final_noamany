import { Prisma } from '@prisma/client';
import { toNum } from './club-subscription.utils';

/**
 * Snapshot the trainer's private-session earning at check-in time. `createMany(skipDuplicates)`
 * plus the database sequence key makes retries safe and guarantees a duration package earns once,
 * while a sessions package earns exactly once for each consumed session.
 */
export async function recordPrivateAttendanceCommission(
  tx: Prisma.TransactionClient,
  input: { attendanceId: number; subscriptionId: number; attendanceDate: string },
) {
  const subscription = await tx.club_subscriptions.findUnique({
    where: { id: input.subscriptionId },
    include: { private_package: true, private_trainer: true },
  });
  if (!subscription?.private_package || !subscription.private_trainer) return null;

  const sequence = subscription.is_linked_to_sessions
    ? subscription.sessions_used
    : 1;
  if (sequence < 1) return null;

  const [salary, trainerSetting] = await Promise.all([
    tx.club_trainer_salaries.findFirst({
      where: {
        trainer_id: subscription.private_trainer.id,
        effective_date: { lte: input.attendanceDate },
        OR: [{ end_date: null }, { end_date: { gte: input.attendanceDate } }],
      },
      orderBy: { effective_date: 'desc' },
    }),
    subscription.private_trainer.employee_id
      ? tx.club_trainer_commission_settings.findUnique({ where: { employee_id: subscription.private_trainer.employee_id } })
      : Promise.resolve(null),
  ]);
  const percentage = trainerSetting?.private_commission_mode === 'fixed'
    ? toNum(trainerSetting.private_commission_percent)
    : toNum(salary?.subscription_commission_percentage);
  const netValue = Math.max(0, toNum(subscription.subscription_value) - toNum(subscription.discount_value));
  const revenueBase = subscription.is_linked_to_sessions
    ? Math.round((netValue / Math.max(1, subscription.sessions_count ?? 1)) * 100) / 100
    : netValue;
  const commissionAmount = Math.round(revenueBase * percentage) / 100;

  await tx.club_private_attendance_commissions.createMany({
    data: [{
      attendance_id: input.attendanceId,
      subscription_id: subscription.id,
      trainer_id: subscription.private_trainer.id,
      commission_sequence: sequence,
      attendance_date: input.attendanceDate,
      revenue_base: revenueBase,
      commission_percentage: percentage,
      commission_amount: commissionAmount,
    }],
    skipDuplicates: true,
  });
  return { trainerId: subscription.private_trainer.id, sequence, revenueBase, percentage, commissionAmount };
}
