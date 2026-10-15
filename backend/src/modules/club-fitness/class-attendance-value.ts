/** Attribution of one attendance, not a second receipt or the entire contract value. */
export function packageSessionValue(subscription: {
  subscription_value: unknown; discount_enabled?: boolean; discount_value?: unknown; sessions_count: number | null;
} | null | undefined): number | null {
  if (!subscription || !subscription.sessions_count || subscription.sessions_count <= 0) return null;
  const net = Number(subscription.subscription_value) - (subscription.discount_enabled ? Number(subscription.discount_value ?? 0) : 0);
  if (!Number.isFinite(net) || net < 0) return null;
  return Math.round(net / subscription.sessions_count * 10000) / 10000;
}

export function attendanceCommission(value: number, percentage: number) {
  return Math.round(value * percentage) / 100;
}
