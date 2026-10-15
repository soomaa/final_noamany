export const LEAD_SOURCES = [
  'facebook_campaign',
  'instagram_ads',
  'friend_referral',
  'walk_in',
  'website',
  'member_invitation',
  'renewal',
  'mobile_app',
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  facebook_campaign: 'حملة فيسبوك',
  instagram_ads: 'إعلانات إنستغرام',
  friend_referral: 'ترشيح صديق',
  walk_in: 'زيارة مباشرة',
  website: 'الموقع الإلكتروني',
  member_invitation: 'دعوة صديق / Member Invitation',
  renewal: 'تجديد اشتراك منتهي',
  mobile_app: 'تطبيق ONE80',
};

export const LEAD_STATUSES = ['new', 'in_progress', 'follow_later', 'qualified', 'converted', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'جديد',
  in_progress: 'قيد المتابعة',
  follow_later: 'متابعة لاحقًا',
  qualified: 'مؤهل',
  converted: 'تم التحويل',
  lost: 'مفقود',
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
    if (lead.status === 'in_progress') summary.inProgress += 1;
    if (lead.status === 'follow_later') summary.followLater += 1;
    if (lead.status === 'qualified') summary.qualified += 1;
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
  return match ?? sorted[sorted.length - 1] ?? null;
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
