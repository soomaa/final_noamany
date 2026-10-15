export type SubscriptionRenewalScheduleMode = 'immediate' | 'after_current' | 'after_queue' | 'from_today';

export type SubscriptionRenewalStartMode = 'extend' | 'today';

export type SubscriptionRenewalQuote = {
  purchasedBenefits?: Record<string, unknown>;
  sourceSubscriptionId: number;
  tailSubscriptionId: number;
  subscriptionTypeId: number | null;
  specialClassTypeId: number | null;
  privatePackageId: number | null;
  privateTrainerId: number | null;
  subscriptionType: string;
  sessionsCount: number | null;
  startDate: string;
  endDate: string;
  scheduleMode: SubscriptionRenewalScheduleMode;
  startMode?: SubscriptionRenewalStartMode;
  canStartToday?: boolean;
  closesSubscriptionId?: number | null;
  forfeitedDays?: number | null;
  forfeitedSessions?: number | null;
  grossValue: number;
  discountEnabled: boolean;
  discountCodeId: number | null;
  discountPercentage: number | null;
  discountValue: number;
  netValue: number;
  paidAmount: number;
  remainingAmount: number;
  currentOutstandingAmount: number;
  quoteVersion: string;
};

export const renewalEditableFields = ['promotion', 'discount', 'payment'] as const;

export function renewalPrimaryAction(quote: Pick<SubscriptionRenewalQuote, 'scheduleMode'>) {
  if (quote.scheduleMode === 'immediate' || quote.scheduleMode === 'from_today') return 'بدء التجديد الآن';
  if (quote.scheduleMode === 'after_queue') return 'إضافة التجديد للطابور';
  return 'تأكيد التجديد المجدول';
}

export function readRenewalConflict(error: unknown): { subscriptionId: number } | null {
  if (!error || typeof error !== 'object') return null;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== 'object') return null;
  const data = (response as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const body = data as { code?: unknown; existingSubscriptionId?: unknown; canRenew?: unknown };
  if (body.code !== 'SUBSCRIPTION_RENEWAL_REQUIRED' || body.canRenew !== true || !Number.isInteger(body.existingSubscriptionId) || Number(body.existingSubscriptionId) < 1) return null;
  return { subscriptionId: Number(body.existingSubscriptionId) };
}
