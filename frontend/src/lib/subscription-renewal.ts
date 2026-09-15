export type SubscriptionRenewalScheduleMode = 'immediate' | 'after_current' | 'after_queue';
export type SubscriptionRenewalQuote = {
  sourceSubscriptionId: number; tailSubscriptionId: number; subscriptionTypeId: number | null;
  specialClassTypeId: number | null; privatePackageId: number | null; privateTrainerId: number | null;
  subscriptionType: string; sessionsCount: number | null; startDate: string; endDate: string;
  scheduleMode: SubscriptionRenewalScheduleMode; grossValue: number; discountEnabled: boolean;
  discountCodeId: number | null; discountPercentage: number | null; discountValue: number; netValue: number;
  paidAmount: number; remainingAmount: number; currentOutstandingAmount: number; quoteVersion: string;
};
export const renewalEditableFields = ['discount', 'payment'] as const;
export function renewalPrimaryAction(quote: Pick<SubscriptionRenewalQuote, 'scheduleMode'>) {
  if (quote.scheduleMode === 'immediate') return 'بدء التجديد الآن';
  return quote.scheduleMode === 'after_queue' ? 'إضافة التجديد للطابور' : 'تأكيد التجديد المجدول';
}
export function readRenewalConflict(error: unknown): { subscriptionId: number } | null {
  const body = (error as { response?: { data?: { code?: unknown; existingSubscriptionId?: unknown; canRenew?: unknown } } })?.response?.data;
  return body?.code === 'SUBSCRIPTION_RENEWAL_REQUIRED' && body.canRenew === true && Number.isInteger(body.existingSubscriptionId) && Number(body.existingSubscriptionId) > 0 ? { subscriptionId: Number(body.existingSubscriptionId) } : null;
}
