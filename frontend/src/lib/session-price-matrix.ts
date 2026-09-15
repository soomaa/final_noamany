/**
 * Session package pricing matrix helpers (mirrors backend club-subscription.utils).
 * When price or max session count changes, regenerate defaults for non-overridden rows.
 */

export type SessionPriceRow = { sessionsCount: number; price: number };

export function roundSessionMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildDefaultSessionPriceMatrix(
  packagePrice: number,
  sessionsCount: number,
): SessionPriceRow[] {
  const max = Math.max(0, Math.floor(sessionsCount) || 0);
  if (max < 1) return [];
  const unit = packagePrice / max;
  return Array.from({ length: max }, (_, i) => ({
    sessionsCount: i + 1,
    price: roundSessionMoney(unit * (i + 1)),
  }));
}

/**
 * Rebuild matrix when package price / count change.
 * Keeps manually overridden rows (by sessionsCount) when they still fit in 1..newMax.
 */
export function mergeSessionPriceMatrix(opts: {
  packagePrice: number;
  sessionsCount: number;
  previous: SessionPriceRow[];
  overridden: Set<number>;
}): SessionPriceRow[] {
  const defaults = buildDefaultSessionPriceMatrix(opts.packagePrice, opts.sessionsCount);
  return defaults.map((row) => {
    if (opts.overridden.has(row.sessionsCount)) {
      const prev = opts.previous.find((p) => p.sessionsCount === row.sessionsCount);
      if (prev) return prev;
    }
    return row;
  });
}

export function resolveSessionMatrixPrice(opts: {
  packagePrice: number;
  maxSessions: number;
  selectedSessions: number;
  matrix?: SessionPriceRow[] | null;
}): number {
  const selected = Math.max(1, Math.floor(opts.selectedSessions) || 1);
  const max = Math.max(1, Math.floor(opts.maxSessions) || 1);
  const clamped = Math.min(selected, max);
  const hit = opts.matrix?.find((row) => row.sessionsCount === clamped);
  if (hit && Number.isFinite(hit.price)) return roundSessionMoney(hit.price);
  return roundSessionMoney((opts.packagePrice / max) * clamped);
}

