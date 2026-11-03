import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toNum } from './club-fitness.utils';

/**
 * The ONE place that decides what a trainer has earned. Both the admin payout screen
 * (club-trainers.service) and the trainer's own portal (trainer-portal.service) call it.
 *
 * Rules:
 *  - Group class: earns only for members who actually ATTENDED, at the class price, times the
 *    class-commission % in force on the class date. Registered/absent members were not trained,
 *    so they earn nothing. A cancelled class never earns, even if stale attendance exists. A class
 *    counts once it is completed or has real attendance (reception may mark attendance before the
 *    status cron completes it).
 *  - Private sessions: the commission snapshotted at each check-in
 *    (club_private_attendance_commissions), so a later % change never rewrites history.
 *  - No commission on subscription receipts: the "subscription" % on the salary row is the
 *    private-session % (private-attendance.util uses it), so applying it to every receipt of a
 *    subscription the captain sold paid the private % a second time on regular sales.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export interface TrainerSalaryRow {
  effective_date: string;
  end_date: string | null;
  class_commission_percentage: Prisma.Decimal | number | null;
  subscription_commission_percentage?: Prisma.Decimal | number | null;
}

export interface EarningClassInput {
  id: number;
  class_name: string;
  class_date: string;
  status: string;
  price: Prisma.Decimal | number | null;
  enrollments: Array<{ attendance_status: string }>;
}

export function salaryAt<T extends TrainerSalaryRow>(salaries: T[], date: string): T | null {
  let best: T | null = null;
  for (const row of salaries) {
    if (row.effective_date > date) continue;
    if (row.end_date && row.end_date < date) continue;
    if (!best || row.effective_date > best.effective_date) best = row;
  }
  return best;
}

export function attendedCount(cls: EarningClassInput): number {
  return cls.enrollments.filter((row) => row.attendance_status === 'attended').length;
}

export function isExecutedClass(cls: EarningClassInput): boolean {
  return cls.status !== 'cancelled' && (cls.status === 'completed' || attendedCount(cls) > 0);
}

export function classEarningItems(classes: EarningClassInput[], salaries: TrainerSalaryRow[]) {
  return classes.filter(isExecutedClass).map((cls) => {
    const attended = attendedCount(cls);
    const unitPrice = toNum(cls.price);
    const commissionPercentage = toNum(salaryAt(salaries, cls.class_date)?.class_commission_percentage);
    const revenue = roundMoney(attended * unitPrice);
    return {
      classId: cls.id,
      className: cls.class_name,
      classDate: cls.class_date,
      attended,
      unitPrice,
      commissionPercentage,
      revenue,
      amount: roundMoney(revenue * (commissionPercentage / 100)),
    };
  });
}

function dateFilter(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

export async function computeTrainerEarnings(db: Db, trainerId: number, from?: string, to?: string) {
  const range = dateFilter(from, to);
  const [classes, salaries, privateRows] = await Promise.all([
    db.club_classes.findMany({
      where: { trainer_id: trainerId, is_deleted: false, status: { not: 'cancelled' }, ...(range ? { class_date: range } : {}) },
      select: {
        id: true,
        class_name: true,
        class_date: true,
        status: true,
        price: true,
        enrollments: { select: { attendance_status: true } },
      },
      orderBy: [{ class_date: 'asc' }, { start_time: 'asc' }],
    }),
    db.club_trainer_salaries.findMany({
      where: { trainer_id: trainerId },
      select: { effective_date: true, end_date: true, class_commission_percentage: true },
    }),
    db.club_private_attendance_commissions.findMany({
      where: { trainer_id: trainerId, ...(range ? { attendance_date: range } : {}) },
      include: { subscription: { select: { subscription_type: true, member_id: true } } },
      orderBy: [{ attendance_date: 'desc' }, { id: 'desc' }],
    }),
  ]);
  const classItems = classEarningItems(classes as EarningClassInput[], salaries as TrainerSalaryRow[]);
  const classRevenue = roundMoney(classItems.reduce((sum, row) => sum + row.revenue, 0));
  const classCommission = roundMoney(classItems.reduce((sum, row) => sum + row.amount, 0));
  const privateItems = (privateRows as Array<{
    id: number;
    subscription_id: number;
    attendance_date: string;
    commission_sequence: number;
    revenue_base: Prisma.Decimal;
    commission_percentage: Prisma.Decimal;
    commission_amount: Prisma.Decimal;
    subscription?: { subscription_type: string | null; member_id: number | null } | null;
  }>).map((row) => ({
    id: row.id,
    subscriptionId: row.subscription_id,
    subscriptionType: row.subscription?.subscription_type ?? null,
    memberId: row.subscription?.member_id ?? null,
    attendanceDate: row.attendance_date,
    sequence: row.commission_sequence,
    revenue: toNum(row.revenue_base),
    commissionPercentage: toNum(row.commission_percentage),
    amount: toNum(row.commission_amount),
  }));
  const privateRevenue = roundMoney(privateItems.reduce((sum, row) => sum + row.revenue, 0));
  const privateCommission = roundMoney(privateItems.reduce((sum, row) => sum + row.amount, 0));
  return {
    classItems,
    privateItems,
    classRevenue,
    classCommission,
    privateRevenue,
    privateCommission,
    earned: roundMoney(classCommission + privateCommission),
  };
}

/**
 * Payments that cover any day of [from, to]. Old rows without a period count by payment date.
 * With the period rule below, a payment with a period that overlaps a payout period is always
 * that very period, so "overlapping" never deducts another period's money in the payout screen.
 */
export function overlappingPaymentsWhere(trainerId: number, from?: string, to?: string): Prisma.club_trainer_earning_paymentsWhereInput {
  if (!from && !to) return { trainer_id: trainerId };
  const lo = from ?? '0000-01-01';
  const hi = to ?? '9999-12-31';
  return {
    trainer_id: trainerId,
    OR: [
      { period_from: { not: null, lte: hi }, period_to: { not: null, gte: lo } },
      { period_from: null, payment_date: { gte: lo, lte: hi } },
    ],
  };
}

/**
 * Payout periods may not partly overlap. Each day's earnings belong to exactly one payout
 * period, so a day can never be paid twice: a new payment must use exactly the same period as
 * an earlier one (paying the rest of it) or a period that shares no day with any other.
 */
export async function payoutPeriodConflicts(db: Db, trainerId: number, from: string, to: string) {
  const rows: Array<{ period_from: string | null; period_to: string | null }> = await db.club_trainer_earning_payments.findMany({
    where: { trainer_id: trainerId, period_from: { not: null, lte: to }, period_to: { not: null, gte: from } },
    select: { period_from: true, period_to: true },
  });
  const seen = new Set<string>();
  return rows
    .filter((row) => !(row.period_from === from && row.period_to === to))
    .map((row) => ({ periodFrom: row.period_from!, periodTo: row.period_to! }))
    .filter((row) => {
      const key = `${row.periodFrom}:${row.periodTo}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function assertNoPayoutConflict(conflicts: Array<{ periodFrom: string; periodTo: string }>) {
  if (!conflicts.length) return;
  const list = conflicts.map((row) => `${row.periodFrom} → ${row.periodTo}`).join('، ');
  throw new BadRequestException(
    `الفترة تتداخل مع فترة صرف سابقة (${list}). اختر نفس الفترة لصرف باقيها، أو فترة لا تشترك معها في أي يوم.`,
  );
}
