import { projectedFreezeEnd, FreezeDates } from '../club-subscriptions/freeze-end-projection';
import { selectCurrentSubscriptionsForMemberDisplay } from "../club-subscriptions/club-subscription.utils";

export interface MemberProfileSubscriptionInput {
  id: number;
  subscription_number: string;
  subscription_type: string | null;
  subscription_type_id?: number | null;
  freezes?: FreezeDates[];
  status: string;
  subscription_start_date: string;
  subscription_end_date: string;
  is_linked_to_sessions: boolean;
  sessions_count: number | null;
  sessions_used: number;
}

export interface MemberProfileAttendanceInput {
  id: number;
  subscription_id: number | null;
  attendance_date: string;
  check_in_time: Date;
  check_out_time: Date | null;
  duration: number | null;
  status: string;
}

function dateValue(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function daysBetween(from: string, to: string): number {
  return Math.floor((dateValue(to) - dateValue(from)) / 86_400_000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function subscriptionStatus(
  subscription: MemberProfileSubscriptionInput,
  today: string,
): string {
  if (subscription.status === "frozen") return "frozen";
  if (today < subscription.subscription_start_date) return "upcoming";
  if (today > subscription.subscription_end_date) return "expired";
  if (
    subscription.is_linked_to_sessions &&
    subscription.sessions_count != null &&
    subscription.sessions_used >= subscription.sessions_count
  ) {
    return "expired";
  }
  return "active";
}

/**
 * Attendance created before per-subscription check-in has no subscription_id.
 * Reconstruct the subscription reception would have selected on that date:
 * the eligible subscription with the latest end date, then the newest id.
 * Explicit links always win and an unresolved row stays unlinked.
 */
export function assignLegacyAttendanceToSubscriptions(input: {
  subscriptions: MemberProfileSubscriptionInput[];
  attendances: MemberProfileAttendanceInput[];
}): MemberProfileAttendanceInput[] {
  const candidates = [...input.subscriptions].sort((left, right) =>
    right.subscription_end_date.localeCompare(left.subscription_end_date) ||
    right.id - left.id,
  );

  return input.attendances.map((attendance) => {
    if (attendance.subscription_id != null) return attendance;
    const subscription = candidates.find(
      (candidate) =>
        attendance.attendance_date >= candidate.subscription_start_date &&
        attendance.attendance_date <= candidate.subscription_end_date,
    );
    return subscription
      ? { ...attendance, subscription_id: subscription.id }
      : attendance;
  });
}

export function buildMemberProfileSummary(input: {
  today: string;
  subscriptions: MemberProfileSubscriptionInput[];
  attendances: MemberProfileAttendanceInput[];
  renewalSubscriptionIds: Set<number>;
  renewalCount: number;
}) {
  const attendanceDays = new Set(
    input.attendances.map((row) => row.attendance_date),
  );
  const sortedAttendance = [...input.attendances].sort(
    (a, b) => b.check_in_time.getTime() - a.check_in_time.getTime(),
  );
  const attendanceBySubscription = new Map<
    number,
    MemberProfileAttendanceInput[]
  >();
  const resolvedAttendances = assignLegacyAttendanceToSubscriptions(input);
  for (const row of resolvedAttendances) {
    if (row.subscription_id == null) continue;
    const rows = attendanceBySubscription.get(row.subscription_id) ?? [];
    rows.push(row);
    attendanceBySubscription.set(row.subscription_id, rows);
  }
  const subscriptions = input.subscriptions.map((subscription) => {
    const rows = attendanceBySubscription.get(subscription.id) ?? [];
    const distinctDays = new Set(rows.map((row) => row.attendance_date));
    const totalDays = Math.max(
      0,
      daysBetween(
        subscription.subscription_start_date,
        subscription.subscription_end_date,
      ),
    );
    const sessionsRemaining =
      subscription.sessions_count == null
        ? null
        : Math.max(0, subscription.sessions_count - subscription.sessions_used);
    const elapsedDays = clamp(
      daysBetween(subscription.subscription_start_date, input.today),
      0,
      totalDays,
    );
    const attendanceRate =
      subscription.is_linked_to_sessions && subscription.sessions_count
        ? clamp(
            Math.round(
              (subscription.sessions_used / subscription.sessions_count) * 100,
            ),
            0,
            100,
          )
        : clamp(
            Math.round((distinctDays.size / Math.max(elapsedDays, 1)) * 100),
            0,
            100,
          );

    return {
      id: subscription.id,
      subscriptionNumber: subscription.subscription_number,
      subscriptionTypeId: subscription.subscription_type_id ?? null,
      subscriptionType: subscription.subscription_type,
      status: subscriptionStatus(subscription, input.today),
      startDate: subscription.subscription_start_date,
      endDate: subscription.subscription_end_date,
      projectedEndDate: projectedFreezeEnd(subscription.subscription_end_date, subscription.freezes?.[0], input.today),
      totalDays,
      elapsedDays,
      remainingDays: clamp(
        daysBetween(input.today, subscription.subscription_end_date),
        0,
        totalDays,
      ),
      isLinkedToSessions: subscription.is_linked_to_sessions,
      sessionsCount: subscription.sessions_count,
      sessionsUsed: subscription.sessions_used,
      sessionsRemaining,
      attendanceDays: distinctDays.size,
      attendanceEntries: rows.length,
      attendanceRate,
      lastAttendanceDate: rows.reduce<string | null>(
        (latest, row) =>
          !latest || row.attendance_date > latest
            ? row.attendance_date
            : latest,
        null,
      ),
      isRenewal: input.renewalSubscriptionIds.has(subscription.id),
    };
  });

  // Cards: current period per plan lineage. Totals still count full history.
  const visibleSubscriptions =
    selectCurrentSubscriptionsForMemberDisplay(subscriptions);

  return {
    totals: {
      subscriptions: input.subscriptions.length,
      renewals: input.renewalCount,
      attendanceDays: attendanceDays.size,
      attendanceEntries: input.attendances.length,
      lastAttendanceDate: sortedAttendance[0]?.attendance_date ?? null,
    },
    subscriptions: visibleSubscriptions,
    recentAttendance: sortedAttendance.slice(0, 100).map((row) => ({
      id: row.id,
      subscriptionId: row.subscription_id,
      attendanceDate: row.attendance_date,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      duration: row.duration,
      status: row.status,
    })),
  };
}
