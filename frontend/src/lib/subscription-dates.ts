/** Shift a calendar date without changing days at timezone or DST boundaries. */
export function shiftSubscriptionDate(date: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(days)) return '';
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return '';
  parsed.setUTCDate(parsed.getUTCDate() + days);
  const shifted = parsed.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(shifted) ? shifted : '';
}
