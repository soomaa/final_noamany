export function parseOptionalGuestAge(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 120) return undefined;
  return n;
}

export function parseOptionalMemberId(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function invitationLeadPackage(subscription: {
  subscription_type_id: number | null;
  subscription_type?: string | null;
  type?: { id: number; name: string } | null;
}) {
  const subscriptionTypeId = subscription.subscription_type_id ?? subscription.type?.id ?? null;
  const interestedProgram = subscription.type?.name?.trim()
    || subscription.subscription_type?.trim()
    || null;
  return {
    subscriptionTypeId,
    interestedProgram,
  };
}
