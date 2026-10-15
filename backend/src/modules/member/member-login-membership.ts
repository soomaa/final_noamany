export interface LoginSubscription {
  branch_id: number;
  subscription_start_date: string;
  subscription_end_date: string;
  status: string;
  is_linked_to_sessions: boolean;
  sessions_count: number | null;
  sessions_used: number;
}
export interface LoginMembership {
  branch_id: number;
  subscriptions?: LoginSubscription[];
}

/** How usable a membership is today, best first. */
export type MembershipStanding = 'active' | 'frozen' | 'upcoming' | 'expired' | 'none';

const STANDING_RANK: Record<MembershipStanding, number> = {
  active: 4,
  frozen: 3,
  upcoming: 2,
  expired: 1,
  none: 0,
};

/**
 * Where a membership stands today, from its own branch's subscriptions only.
 * Dates and session balances decide, never the cached `status` alone — except
 * `frozen`, which must not read as active on a paused membership. `endsAt` is
 * the end date of the period that gave the standing (the latest one for
 * expired), so the branch picker can say "ينتهي في …".
 */
export function membershipStanding(
  member: LoginMembership,
  today: string,
): { standing: MembershipStanding; endsAt: string | null } {
  const periods = (member.subscriptions ?? []).filter((s) => s.branch_id === member.branch_id);
  const available = (s: LoginSubscription) =>
    !s.is_linked_to_sessions || s.sessions_count == null || s.sessions_used < s.sessions_count;
  const latestEnd = (rows: LoginSubscription[]) =>
    rows.reduce<string | null>(
      (end, s) => (end == null || s.subscription_end_date > end ? s.subscription_end_date : end),
      null,
    );

  const current = periods.filter(
    (s) =>
      s.status !== 'frozen' &&
      s.subscription_start_date <= today &&
      s.subscription_end_date >= today &&
      available(s),
  );
  if (current.length) return { standing: 'active', endsAt: latestEnd(current) };
  const frozen = periods.filter((s) => s.status === 'frozen');
  if (frozen.length) return { standing: 'frozen', endsAt: latestEnd(frozen) };
  const upcoming = periods.filter(
    (s) =>
      s.status !== 'frozen' &&
      s.subscription_start_date > today &&
      s.subscription_end_date >= s.subscription_start_date &&
      available(s),
  );
  if (upcoming.length) return { standing: 'upcoming', endsAt: latestEnd(upcoming) };
  if (periods.length) return { standing: 'expired', endsAt: latestEnd(periods) };
  return { standing: 'none', endsAt: null };
}

/** Sort key for the branch picker: the membership the member can use today comes first. */
export function standingRank(standing: MembershipStanding): number {
  return STANDING_RANK[standing];
}
