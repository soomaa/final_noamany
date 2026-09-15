export interface ReceptionSubscriptionVisibilityInput { id: number; subscriptionTypeId?: number | null; specialClassTypeId?: number | null; privatePackageId?: number | null; subscriptionType?: string | null; status?: string | null; subscriptionStartDate: string; subscriptionEndDate: string; isLinkedToSessions?: boolean; sessionsCount?: number | null; sessionsUsed?: number | null; }
export function isReceptionSubscriptionExpired(subscription: ReceptionSubscriptionVisibilityInput, today: string) {
  if (String(subscription.status ?? '').toLowerCase() === 'expired') return true;
  if (subscription.subscriptionEndDate < today && !subscription.subscriptionEndDate.startsWith('2099')) return true;
  return Boolean(subscription.isLinkedToSessions && (subscription.sessionsCount ?? 0) > 0 && (subscription.sessionsUsed ?? 0) >= (subscription.sessionsCount ?? 0));
}
function packageIdentity(subscription: ReceptionSubscriptionVisibilityInput) {
  if (subscription.subscriptionTypeId != null) return `type:${subscription.subscriptionTypeId}`;
  if (subscription.specialClassTypeId != null) return `class:${subscription.specialClassTypeId}`;
  if (subscription.privatePackageId != null) return `private:${subscription.privatePackageId}`;
  const name = String(subscription.subscriptionType ?? '').trim().toLocaleLowerCase('ar-EG').replace(/\s+/g, ' ');
  return name ? `name:${name}` : `subscription:${subscription.id}`;
}
function rank(subscription: ReceptionSubscriptionVisibilityInput, today: string) {
  if (isReceptionSubscriptionExpired(subscription, today)) return 3;
  if (String(subscription.status ?? '').toLowerCase() === 'upcoming' || subscription.subscriptionStartDate > today) return 2;
  return String(subscription.status ?? '').toLowerCase() === 'frozen' ? 1 : 0;
}
function compare<T extends ReceptionSubscriptionVisibilityInput>(a: T, b: T, today: string) {
  return rank(a, today) - rank(b, today) || b.subscriptionEndDate.localeCompare(a.subscriptionEndDate) || b.subscriptionStartDate.localeCompare(a.subscriptionStartDate) || b.id - a.id;
}
export function selectReceptionSubscriptions<T extends ReceptionSubscriptionVisibilityInput>(subscriptions: readonly T[], today: string): T[] {
  const selected = new Map<string, T>();
  for (const subscription of subscriptions) { const key = packageIdentity(subscription); const current = selected.get(key); if (!current || compare(subscription, current, today) < 0) selected.set(key, subscription); }
  return [...selected.values()].sort((a, b) => compare(a, b, today));
}
