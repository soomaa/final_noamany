export interface ReceptionSubscriptionVisibilityInput {
  id: number;
  subscriptionTypeId?: number | null;
  specialClassTypeId?: number | null;
  privatePackageId?: number | null;
  subscriptionType?: string | null;
  status?: string | null;
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  isLinkedToSessions?: boolean;
  sessionsCount?: number | null;
  sessionsUsed?: number | null;
}

export function isReceptionSubscriptionExpired(
  subscription: ReceptionSubscriptionVisibilityInput,
  today: string,
): boolean {
  if (String(subscription.status ?? '').toLowerCase() === 'expired') return true;
  if (
    subscription.subscriptionEndDate &&
    subscription.subscriptionEndDate < today &&
    !subscription.subscriptionEndDate.startsWith('2099')
  ) {
    return true;
  }
  if (subscription.isLinkedToSessions && (subscription.sessionsCount ?? 0) > 0) {
    return (subscription.sessionsUsed ?? 0) >= (subscription.sessionsCount ?? 0);
  }
  return false;
}

function packageIdentity(subscription: ReceptionSubscriptionVisibilityInput): string {
  if (subscription.subscriptionTypeId != null) return `type:${subscription.subscriptionTypeId}`;
  if (subscription.specialClassTypeId != null) return `class:${subscription.specialClassTypeId}`;
  if (subscription.privatePackageId != null) return `private:${subscription.privatePackageId}`;
  const normalizedName = String(subscription.subscriptionType ?? '')
    .trim()
    .toLocaleLowerCase('ar-EG')
    .replace(/\s+/g, ' ');
  return normalizedName ? `name:${normalizedName}` : `subscription:${subscription.id}`;
}

function visibilityRank(subscription: ReceptionSubscriptionVisibilityInput, today: string): number {
  if (isReceptionSubscriptionExpired(subscription, today)) return 3;
  const status = String(subscription.status ?? '').toLowerCase();
  if (status === 'upcoming' || subscription.subscriptionStartDate > today) return 2;
  if (status === 'frozen') return 1;
  return 0;
}

function compareSubscriptions<T extends ReceptionSubscriptionVisibilityInput>(a: T, b: T, today: string) {
  const rankDifference = visibilityRank(a, today) - visibilityRank(b, today);
  if (rankDifference !== 0) return rankDifference;
  const endDifference = b.subscriptionEndDate.localeCompare(a.subscriptionEndDate);
  if (endDifference !== 0) return endDifference;
  const startDifference = b.subscriptionStartDate.localeCompare(a.subscriptionStartDate);
  if (startDifference !== 0) return startDifference;
  return b.id - a.id;
}

export function selectReceptionSubscriptions<T extends ReceptionSubscriptionVisibilityInput>(
  subscriptions: readonly T[],
  today: string,
): T[] {
  const selected = new Map<string, T>();
  for (const subscription of subscriptions) {
    const key = packageIdentity(subscription);
    const current = selected.get(key);
    if (!current || compareSubscriptions(subscription, current, today) < 0) {
      selected.set(key, subscription);
    }
  }
  return [...selected.values()].sort((a, b) => compareSubscriptions(a, b, today));
}
