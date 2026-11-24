import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import type { SubscriptionUtilizationDto } from './dto/subscription-utilization.dto';

/**
 * «التزام الأعضاء» — how much of each subscription the member actually used.
 * Same rules as Meta Fit's report (rate = distinct attendance days / elapsed days, or sessions
 * used / sessions for session packages; 75%+ committed, 40%+ medium, below that weak), but the
 * status filter runs in the database and check-ins are aggregated in SQL, because Noamany has
 * tens of thousands of subscriptions and hundreds of thousands of check-ins.
 */

export type UtilizationStatus = 'active' | 'expired' | 'upcoming' | 'frozen';
export type RateBucket = 'high' | 'medium' | 'low';

export function rateBucket(rate: number): RateBucket {
  if (rate >= 75) return 'high';
  if (rate >= 40) return 'medium';
  return 'low';
}

const DAY_MS = 86_400_000;
const dateValue = (date: string) => {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
};
const daysBetween = (from: string, to: string) => Math.floor((dateValue(to) - dateValue(from)) / DAY_MS);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface UtilizationSubscriptionInput {
  status: string;
  subscription_start_date: string;
  subscription_end_date: string;
  is_linked_to_sessions: boolean;
  sessions_count: number | null;
  sessions_used: number;
}

export interface UtilizationAttendance {
  entries: number;
  days: number;
  lastDate: string | null;
}

export function utilizationStatus(sub: UtilizationSubscriptionInput, today: string): UtilizationStatus {
  if (sub.status === 'frozen') return 'frozen';
  if (today < sub.subscription_start_date.slice(0, 10)) return 'upcoming';
  if (today > sub.subscription_end_date.slice(0, 10)) return 'expired';
  if (sub.is_linked_to_sessions && sub.sessions_count != null && sub.sessions_used >= sub.sessions_count) return 'expired';
  return 'active';
}

export function utilizationFigures(sub: UtilizationSubscriptionInput, attendance: UtilizationAttendance, today: string) {
  const start = sub.subscription_start_date.slice(0, 10);
  const end = sub.subscription_end_date.slice(0, 10);
  const totalDays = Math.max(0, daysBetween(start, end));
  const elapsedDays = clamp(daysBetween(start, today), 0, totalDays);
  const attendanceRate = sub.is_linked_to_sessions && sub.sessions_count
    ? clamp(Math.round((sub.sessions_used / sub.sessions_count) * 100), 0, 100)
    : clamp(Math.round((attendance.days / Math.max(elapsedDays, 1)) * 100), 0, 100);
  return {
    status: utilizationStatus(sub, today),
    startDate: start,
    endDate: end,
    totalDays,
    remainingDays: clamp(daysBetween(today, end), 0, totalDays),
    isLinkedToSessions: sub.is_linked_to_sessions,
    sessionsCount: sub.sessions_count,
    sessionsUsed: sub.sessions_used,
    sessionsRemaining: sub.sessions_count == null ? null : Math.max(0, sub.sessions_count - sub.sessions_used),
    attendanceDays: attendance.days,
    attendanceEntries: attendance.entries,
    attendanceRate,
    lastAttendanceDate: attendance.lastDate,
  };
}

/** Narrows the rows in the database; the exact status is still decided by utilizationStatus. */
function statusWhere(status: SubscriptionUtilizationDto['status'], today: string): Prisma.club_subscriptionsWhereInput {
  switch (status) {
    case 'frozen':
      return { status: 'frozen' };
    case 'upcoming':
      return { NOT: { status: 'frozen' }, subscription_start_date: { gt: today } };
    case 'active':
      return { NOT: { status: 'frozen' }, subscription_start_date: { lte: today }, subscription_end_date: { gte: today } };
    case 'expired':
      // Ended by date, or still in date but possibly out of sessions (checked exactly afterwards).
      return { NOT: { status: 'frozen' }, OR: [{ subscription_end_date: { lt: today } }, { is_linked_to_sessions: true }] };
    default:
      return {};
  }
}

export async function subscriptionUtilizationReport(
  prisma: PrismaService,
  q: SubscriptionUtilizationDto,
  scope: { branchIds: number[] | null; gender: 'male' | 'female' | null; today: string },
) {
  const search = q.search?.trim();
  const status = q.status ?? 'active';
  const where: Prisma.club_subscriptionsWhereInput = {
    member_id: { not: null },
    ...(scope.branchIds !== null ? { branch_id: { in: scope.branchIds } } : {}),
    member: { is: { is_deleted: false, ...(scope.gender ? { gender: scope.gender } : {}) } },
    AND: [
      statusWhere(status, scope.today),
      ...(search
        ? [{
            OR: [
              { subscription_number: { contains: search } },
              { subscription_type: { contains: search } },
              { customer_name: { contains: search } },
              { member: { is: { OR: [{ name: { contains: search } }, { member_code: { contains: search } }, { phone: { contains: search } }] } } },
            ],
          }]
        : []),
    ],
  };

  const subscriptions = await prisma.club_subscriptions.findMany({
    where,
    select: {
      id: true,
      subscription_number: true,
      subscription_type: true,
      status: true,
      subscription_start_date: true,
      subscription_end_date: true,
      is_linked_to_sessions: true,
      sessions_count: true,
      sessions_used: true,
      branch_id: true,
      member: { select: { id: true, member_code: true, name: true, phone: true, profile_picture: true, branch_id: true } },
    },
    orderBy: [{ subscription_end_date: 'asc' }, { id: 'desc' }],
  });

  // Check-ins per subscription, aggregated in SQL in chunks.
  const attendance = new Map<number, UtilizationAttendance>();
  const ids = subscriptions.map((sub) => sub.id);
  for (let i = 0; i < ids.length; i += 5000) {
    const chunk = ids.slice(i, i + 5000);
    const rows = await prisma.$queryRaw<{ subscription_id: number; entries: bigint; days: bigint; last_date: string | null }[]>(Prisma.sql`
      SELECT subscription_id, COUNT(*) AS entries, COUNT(DISTINCT attendance_date) AS days, MAX(attendance_date) AS last_date
      FROM club_attendance
      WHERE subscription_id IN (${Prisma.join(chunk)})
      GROUP BY subscription_id
    `);
    for (const row of rows) {
      attendance.set(Number(row.subscription_id), {
        entries: Number(row.entries),
        days: Number(row.days),
        lastDate: row.last_date ? String(row.last_date).slice(0, 10) : null,
      });
    }
  }

  const none: UtilizationAttendance = { entries: 0, days: 0, lastDate: null };
  const rows = subscriptions.flatMap((sub) => {
    if (!sub.member) return [];
    const figures = utilizationFigures(sub, attendance.get(sub.id) ?? none, scope.today);
    return [{
      subscriptionId: sub.id,
      subscriptionNumber: sub.subscription_number,
      subscriptionType: sub.subscription_type,
      ...figures,
      branchId: sub.branch_id,
      member: {
        id: sub.member.id,
        memberCode: sub.member.member_code,
        name: sub.member.name,
        phone: sub.member.phone,
        profilePicture: sub.member.profile_picture,
        branchId: sub.member.branch_id,
      },
    }];
  });

  const statusFiltered = status === 'all' ? rows : rows.filter((row) => row.status === status);
  const bucketCounts = { high: 0, medium: 0, low: 0 };
  for (const row of statusFiltered) bucketCounts[rateBucket(row.attendanceRate)] += 1;
  const filtered = q.rateBucket && q.rateBucket !== 'all'
    ? statusFiltered.filter((row) => rateBucket(row.attendanceRate) === q.rateBucket)
    : statusFiltered;
  const sorted = q.sort === 'attendanceRate'
    ? [...filtered].sort((a, b) => (q.order === 'asc' ? a.attendanceRate - b.attendanceRate : b.attendanceRate - a.attendanceRate))
    : filtered;

  const page = q.allRows === 'true'
    ? paginated(sorted, filtered.length, 1, Math.max(filtered.length, 1))
    : paginated(sorted.slice(q.skip, q.skip + q.take), filtered.length, q.page, q.pageSize);
  return {
    ...page,
    buckets: { all: statusFiltered.length, ...bucketCounts },
  };
}
