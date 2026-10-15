export interface FollowUpSubscription {
  id: number;
  memberId: number;
  branchId: number;
  packageKey: string;
  startDate: string;
  endDate: string;
  status: string;
  sessionsCount: number | null;
  sessionsUsed: number;
  isLinkedToSessions: boolean;
  successorId: number | null;
  transferred: boolean;
  lastAttendance: string | null;
  lastSessionDate: string | null;
  lastFreezeEnd: string | null;
}
const days = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86400000));
const exhausted = (s: FollowUpSubscription) => s.isLinkedToSessions && s.sessionsCount !== null && s.sessionsUsed >= s.sessionsCount;
const covered = (s: FollowUpSubscription, today: string) => s.status === 'frozen' || (s.endDate >= today && !exhausted(s));

/** Classify complete package histories BEFORE applying list filters or pagination. */
export function classifyFollowUps<T extends FollowUpSubscription>(rows: T[], today: string, mode: 'not_renewed' | 'absent', absenceDays: number) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.memberId}:${row.branchId}:${row.packageKey}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const result: (T & { daysSince: number | null; reason: 'expired' | 'exhausted' | 'absent'; effectiveEndDate: string | null })[] = [];
  for (const group of groups.values()) {
    const latestTransfer = group.filter(s => s.transferred).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id)[0];
    const eligible = group.filter(s => !s.transferred && (!latestTransfer || s.startDate > latestTransfer.startDate || (s.startDate === latestTransfer.startDate && s.id > latestTransfer.id)));
    if (mode === 'not_renewed') {
      if (eligible.some(s => covered(s, today))) continue;
      const latest = eligible.filter(s => !s.successorId && s.startDate <= today)
        .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id)[0];
      if (!latest) continue;
      const reason = exhausted(latest) ? 'exhausted' : 'expired';
      const end = reason === 'exhausted'
        ? (latest.lastSessionDate && latest.lastSessionDate <= latest.endDate ? latest.lastSessionDate : latest.endDate < today ? latest.endDate : null)
        : latest.endDate;
      result.push({ ...latest, reason, effectiveEndDate: end, daysSince: end ? days(end, today) : null });
    } else {
      const current = eligible.filter(s => s.status !== 'frozen' && s.startDate <= today && covered(s, today))
        .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id)[0];
      if (!current?.lastAttendance) continue;
      const baseline = [current.lastAttendance, current.startDate, current.lastFreezeEnd ?? ''].sort().at(-1)!;
      const elapsed = days(baseline, today);
      if (elapsed >= absenceDays) result.push({ ...current, reason: 'absent', daysSince: elapsed, effectiveEndDate: current.endDate });
    }
  }
  return result.sort((a, b) => (b.lastAttendance ?? '').localeCompare(a.lastAttendance ?? '') || b.id - a.id);
}

/** Match the effective entitlement end, including both selected boundary dates. */
export function matchesExpiryRange(endDate: string | null, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  return !!endDate && (!from || endDate >= from) && (!to || endDate <= to);
}
