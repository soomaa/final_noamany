/**
 * Spoken check-in result (client, 24 Nov: «مقبول / مرفوض»). Uses the browser's own
 * SpeechSynthesis voices — nothing is downloaded. Pure helpers here so they can be unit-tested.
 */
export type EntryVoiceCue = 'granted' | 'rejected' | 'expired';

export const ENTRY_VOICE_TEXT: Record<EntryVoiceCue, string> = {
  granted: 'مقبول',
  rejected: 'مرفوض',
  expired: 'الاشتراك منتهي',
};

type VoiceLike = { lang: string; name: string; localService?: boolean };

/** Egyptian Arabic first, then Saudi, then any Arabic voice; `null` when the device has none. */
export function pickArabicVoice<T extends VoiceLike>(voices: readonly T[]): T | null {
  const norm = (lang: string) => lang.replace('_', '-').toLowerCase();
  return voices.find((v) => norm(v.lang) === 'ar-eg')
    ?? voices.find((v) => norm(v.lang) === 'ar-sa')
    ?? voices.find((v) => norm(v.lang).startsWith('ar'))
    ?? null;
}

type ReasonLike = { code?: string; severity?: string; messageAr?: string; messageEn?: string };

/**
 * Whether a refusal is specifically an expired subscription (the client's favourite cue). The
 * entitlement engine says `subscription_not_active`, or `no_active_subscription` with the date the
 * last one ended; a member who never subscribed is a plain «مرفوض».
 */
export function isExpiryRefusal(reasons: readonly ReasonLike[] | null | undefined): boolean {
  return (reasons ?? []).some((r) => r.severity !== 'warn' && (
    r.code === 'subscription_not_active'
    || (r.code === 'no_active_subscription' && /ended|انته/i.test(`${r.messageEn ?? ''} ${r.messageAr ?? ''}`))
  ));
}

/** The refusal reasons carried on a failed check-in response, if any. */
export function refusalReasons(error: unknown): ReasonLike[] {
  const data = (error as { response?: { data?: { entitlement?: { reasons?: ReasonLike[] } } } } | null)?.response?.data;
  return data?.entitlement?.reasons ?? [];
}
