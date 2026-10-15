export type EntitlementSeverity = 'block' | 'warn';

export interface EntitlementReason {
  code: string;
  messageAr: string;
  messageEn: string;
  severity: EntitlementSeverity;
}

export interface EntitlementSubscriptionSnapshot {
  id: number;
  subscriptionNumber: string;
  subscriptionType: string | null;
  status: string;
  derivedStatus: string;
  startDate: string;
  endDate: string;
  remainingAmount: number;
  isTimeBased: boolean;
  timeFrom: string | null;
  timeTo: string | null;
  isLinkedToSessions: boolean;
  isSpecial: boolean;
  specialClassTypeId: number | null;
  sessionsCount: number | null;
  sessionsUsed: number;
  sessionsRemaining: number | null;
  /** Period subscriptions only: days left until endDate (null for session-based). */
  daysRemaining: number | null;
  allowMultipleDailyEntries: boolean;
  branchId: number;
}

export interface EntitlementMemberSnapshot {
  id: number;
  memberCode: string;
  name: string;
  phone: string | null;
  branchId: number;
  isActive: boolean;
}

export interface EntitlementResult {
  allowed: boolean;
  member: EntitlementMemberSnapshot;
  activeSubscription: EntitlementSubscriptionSnapshot | null;
  /**
   * Most relevant subscription for display when check-in is denied
   * (expired / frozen / no active) — includes endDate for reception UX.
   */
  latestSubscription: EntitlementSubscriptionSnapshot | null;
  reasons: EntitlementReason[];
  warnings: EntitlementReason[];
}

export interface ValidateEntitlementOptions {
  memberId: number;
  branchId?: number;
  /** When set, validate/pick THIS subscription (reception chose it) instead of auto-picking. */
  subscriptionId?: number;
  at?: Date;
  blockOnOutstanding?: boolean;
  requireActiveSubscription?: boolean;
}
