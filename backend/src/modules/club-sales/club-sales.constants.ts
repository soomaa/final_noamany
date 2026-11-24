export const LEAD_SOURCES = [
  'facebook_campaign',
  'instagram_ads',
  'friend_referral',
  'walk_in',
  'website',
  'member_invitation',
  // A lapsed member the team calls back is neither a walk-in nor a campaign lead, and the
  // renewal hand-off export stamps every row with it so the pipeline can be reported on.
  'renewal',
  // Someone browsing the member app as a guest who asked to be contacted about a package.
  'app_browse',
  // The app's "create account" form: a join request — the club issues the login itself.
  'app_signup',
  // A guest recorded with an employee's invitation code («دعوة بكود موظف»).
  'staff_invitation',
] as const;

/** Sources only the system writes — never typed on the form or imported from Excel. */
export const SYSTEM_LEAD_SOURCES: readonly LeadSource[] = ['member_invitation', 'staff_invitation'];

export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  facebook_campaign: 'حملة فيسبوك',
  instagram_ads: 'إعلانات إنستغرام',
  friend_referral: 'ترشيح صديق',
  walk_in: 'زيارة مباشرة',
  website: 'الموقع الإلكتروني',
  member_invitation: 'دعوة صديق / Member Invitation',
  renewal: 'تجديد اشتراك منتهي',
  app_browse: 'تطبيق الموبايل (زائر)',
  app_signup: 'طلب انضمام من التطبيق',
  staff_invitation: 'دعوة موظف',
};

/**
 * FIT90's lead vocabulary — what the ported sales workspace and potential-members screen write.
 * `in_progress` and `follow_later` are EMS's pre-port statuses: still accepted so rows written
 * before the data migration read correctly, but no screen offers them any more.
 */
export const LEAD_STATUSES = [
  'new',
  'contacted',
  'no_answer',
  'unreachable',
  'follow_up',
  'visit_arranged',
  'qualified',
  'membership_done',
  'converted',
  'lost',
  'in_progress',
  'follow_later',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Each legacy EMS status and the FIT90 status that replaced it (the data migration's map). */
export const LEGACY_LEAD_STATUS: Partial<Record<LeadStatus, LeadStatus>> = {
  in_progress: 'contacted',
  follow_later: 'follow_up',
};

/**
 * The reporting buckets EMS's dashboards were built on, widened to FIT90's finer statuses so
 * the sales reports keep adding up whichever vocabulary a row was written in.
 */
export const IN_PROGRESS_STATUSES: readonly LeadStatus[] = ['in_progress', 'contacted', 'no_answer', 'unreachable', 'visit_arranged'];
export const FOLLOW_LATER_STATUSES: readonly LeadStatus[] = ['follow_later', 'follow_up'];
/** Ready for reception to take payment — FIT90's `membership_done` is EMS's `qualified`. */
export const QUALIFIED_STATUSES: readonly LeadStatus[] = ['qualified', 'membership_done'];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'جديد',
  contacted: 'تم التواصل',
  no_answer: 'لم يرد',
  unreachable: 'تعذّر الوصول',
  follow_up: 'متابعة',
  visit_arranged: 'زيارة محددة',
  qualified: 'مؤهل',
  membership_done: 'تم الاشتراك',
  converted: 'تم التحويل',
  lost: 'غير مهتم',
  in_progress: 'تم التواصل',
  follow_later: 'متابعة',
};

export const LEAD_ACTIVITY_TYPES = ['note', 'call', 'conversation', 'meeting', 'system'] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

export const INTERESTED_PROGRAMS = ['annual', 'monthly', 'pt', 'sessions', 'other'] as const;
export type InterestedProgram = (typeof INTERESTED_PROGRAMS)[number];

export const PROGRAM_LABELS: Record<InterestedProgram, string> = {
  annual: 'سنوي',
  monthly: 'شهري',
  pt: 'تدريب شخصي',
  sessions: 'حصص',
  other: 'أخرى',
};

export function isLeadSource(value: string): value is LeadSource {
  return (LEAD_SOURCES as readonly string[]).includes(value);
}

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function normalizePhone(phone: string): string {
  const asciiDigits = phone
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0));
  const compact = asciiDigits.replace(/[^\d+]/g, '').trim();
  const hasInternationalPrefix = compact.startsWith('+') || compact.startsWith('00');
  const digits = compact.replace(/\D/g, '').replace(hasInternationalPrefix ? /^00/ : /^$/, '');
  return `${hasInternationalPrefix ? '+' : ''}${digits}`;
}

export function phoneIdentityKey(phone: string): string {
  return normalizePhone(phone).replace(/^\+/, '');
}

export interface LeadPipelineSummary {
  new: number;
  inProgress: number;
  followLater: number;
  qualified: number;
  converted: number;
  lost: number;
}

export function summarizeLeadPipeline(leads: Array<{ status: string }>): LeadPipelineSummary {
  return leads.reduce<LeadPipelineSummary>((summary, lead) => {
    if (lead.status === 'new') summary.new += 1;
    if ((IN_PROGRESS_STATUSES as readonly string[]).includes(lead.status)) summary.inProgress += 1;
    if ((FOLLOW_LATER_STATUSES as readonly string[]).includes(lead.status)) summary.followLater += 1;
    if ((QUALIFIED_STATUSES as readonly string[]).includes(lead.status)) summary.qualified += 1;
    if (lead.status === 'converted') summary.converted += 1;
    if (lead.status === 'lost') summary.lost += 1;
    return summary;
  }, { new: 0, inProgress: 0, followLater: 0, qualified: 0, converted: 0, lost: 0 });
}

export interface CommissionTierInput {
  minAchievementPct: number;
  maxAchievementPct?: number | null;
  commissionPercent: number;
  label?: string | null;
}

export function pickCommissionTier<T extends { minAchievementPct: number; maxAchievementPct?: number | null; commissionPercent: number }>(
  tiers: T[],
  achievementPct: number,
): T | null {
  const sorted = [...tiers].sort((a, b) => a.minAchievementPct - b.minAchievementPct);
  const match = sorted.find((tier) => {
    const minOk = achievementPct + 0.0001 >= tier.minAchievementPct;
    const maxOk = tier.maxAchievementPct == null || achievementPct <= Number(tier.maxAchievementPct) + 0.0001;
    return minOk && maxOk;
  });
  if (match) return match;

  // Nothing covered this achievement — either the brackets leave a gap, or the result sits
  // below all of them. Falling back to the LAST tier (as this did) paid the top rate to
  // someone who missed the target entirely: with brackets 80-80 / 100-100 / 120+, an
  // achievement of 50% earned the 120%+ commission.
  //
  // The bracket whose floor was actually passed is the only defensible reading, and below
  // every floor earns nothing.
  const passed = sorted.filter((tier) => achievementPct + 0.0001 >= tier.minAchievementPct);
  return passed.length ? passed[passed.length - 1] : null;
}

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const startStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`;
  const endExclusive = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-01`;
  const endInclusive = new Date(end.getTime() - 86400000);
  const endStr = `${endInclusive.getFullYear()}-${pad(endInclusive.getMonth() + 1)}-${pad(endInclusive.getDate())}`;
  return { start, end, startStr, endExclusive, endStr };
}
