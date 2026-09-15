export type TrainerProfileTab = 'overview' | 'schedule' | 'targets' | 'earnings' | 'ratings';

export function resolveTrainerTab(requested: string | null | undefined, permitted: TrainerProfileTab[]): TrainerProfileTab {
  if (!permitted.length) return 'overview';
  const normalized = requested === 'target' ? 'targets' : requested;
  return permitted.includes(normalized as TrainerProfileTab) ? normalized as TrainerProfileTab : permitted[0];
}

export function profilePath(id: number, tab?: TrainerProfileTab) {
  return tab ? `/club/fitness/trainers/${id}?tab=${tab}` : `/club/fitness/trainers/${id}`;
}

export function clampAchievement(value: number) {
  const actual = Math.max(0, Number.isFinite(value) ? value : 0);
  return { actual, bar: Math.min(100, actual) };
}

export function starRows(distribution: Record<'1' | '2' | '3' | '4' | '5', number>) {
  return ([5, 4, 3, 2, 1] as const).map((stars) => ({ stars, count: distribution[String(stars) as keyof typeof distribution] ?? 0 }));
}

export function resolveTargetPeriod<T extends { periodMonth: string }>(periods: T[], month: string): T | null {
  return periods.find((period) => period.periodMonth === month) ?? null;
}

export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` };
}
