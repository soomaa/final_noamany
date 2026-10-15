export type TrainerProfileTab = 'overview' | 'schedule' | 'targets' | 'earnings' | 'ratings';

export function resolveTrainerTab(
  requested: string | null | undefined,
  permitted: TrainerProfileTab[],
): TrainerProfileTab {
  if (!permitted.length) return 'overview';
  return permitted.includes(requested as TrainerProfileTab)
    ? requested as TrainerProfileTab
    : permitted[0];
}

export function profilePath(id: number, tab?: TrainerProfileTab) {
  const base = `/club/fitness/trainers/${id}`;
  return tab ? `${base}?tab=${tab}` : base;
}

export function clampAchievement(value: number) {
  const actual = Math.max(0, Number.isFinite(value) ? value : 0);
  return { actual, bar: Math.min(100, actual) };
}

export function starRows(distribution: Record<'1' | '2' | '3' | '4' | '5', number>) {
  return ([5, 4, 3, 2, 1] as const).map((stars) => ({
    stars,
    count: distribution[String(stars) as keyof typeof distribution] ?? 0,
  }));
}
