/**
 * Pure helpers of «إشعارات الموبايل للأعضاء»: Cairo-time schedule math, quiet hours, message
 * variables, audience normalisation and the FCM topic plan. No database access here.
 */
import { BadRequestException } from '@nestjs/common';
import { MEMBER_TOPIC_ALL, memberBranchTopic, memberGenderTopic } from '../push/push.service';

export const CAIRO = 'Africa/Cairo';

// ── Cairo time ────────────────────────────────────────────────────────────────

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAIRO,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** Cairo wall clock of an instant: date 'YYYY-MM-DD', time 'HH:MM'. */
export function cairoParts(at: Date): { date: string; time: string } {
  const p = Object.fromEntries(partsFormatter.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

function offsetMs(at: Date): number {
  const p = Object.fromEntries(partsFormatter.formatToParts(at).map((x) => [x.type, x.value]));
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return local - Math.floor(at.getTime() / 1000) * 1000;
}

/** Cairo local date + 'HH:MM' → the UTC instant (DST-aware). */
export function cairoToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMs(new Date(guess));
  const second = guess - offsetMs(new Date(t));
  if (second !== t) t = second;
  return new Date(t);
}

/** Start of today's Cairo day as an instant (for the per-member daily limit). */
export function cairoDayStart(at = new Date()): Date {
  return cairoToUtc(cairoParts(at).date, '00:00');
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const lastDayOfMonth = (date: string) => {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

// ── schedules ─────────────────────────────────────────────────────────────────

export type ScheduleKind = 'once' | 'daily' | 'weekly' | 'monthly' | 'interval';
export const SCHEDULE_KINDS: ScheduleKind[] = ['once', 'daily', 'weekly', 'monthly', 'interval'];

export interface ScheduleSpec {
  kind: ScheduleKind;
  /** once: the instant. */
  runAt?: Date | null;
  /** 'HH:MM' Cairo, for every kind except once. */
  time?: string | null;
  /** weekly: 0 = Sunday … 6 = Saturday. */
  weekdays?: number[];
  /** monthly: day 1–31 (a shorter month uses its last day). */
  monthDay?: number | null;
  /** interval: every N days counted from startDate (or anchorDate). */
  intervalDays?: number | null;
  /** «على مدار فترة» — Cairo dates, inclusive. */
  startDate?: string | null;
  endDate?: string | null;
  /** interval without a startDate: the day it was created. */
  anchorDate?: string | null;
}

function matchesDay(spec: ScheduleSpec, day: string): boolean {
  switch (spec.kind) {
    case 'daily':
      return true;
    case 'weekly':
      return (spec.weekdays ?? []).includes(weekday(day));
    case 'monthly': {
      const want = Math.min(spec.monthDay ?? 1, lastDayOfMonth(day));
      return Number(day.slice(8, 10)) === want;
    }
    case 'interval': {
      const anchor = spec.startDate ?? spec.anchorDate ?? day;
      const diff = dayNumber(day) - dayNumber(anchor);
      return diff >= 0 && diff % Math.max(1, spec.intervalDays ?? 1) === 0;
    }
    default:
      return false;
  }
}

/** The first run strictly after `after`, or null when the schedule is over. */
export function nextRun(spec: ScheduleSpec, after: Date): Date | null {
  if (spec.kind === 'once') return spec.runAt && spec.runAt > after ? spec.runAt : null;
  const time = spec.time ?? '09:00';
  let day = cairoParts(after).date;
  if (spec.startDate && spec.startDate > day) day = spec.startDate;
  for (let i = 0; i < 800; i += 1) {
    if (spec.endDate && day > spec.endDate) return null;
    if (matchesDay(spec, day)) {
      const at = cairoToUtc(day, time);
      if (at > after) return at;
    }
    day = addDays(day, 1);
  }
  return null;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ScheduleInput {
  kind?: string;
  runAt?: string | null;
  time?: string | null;
  weekdays?: number[] | null;
  monthDay?: number | null;
  intervalDays?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

/** Validate the dashboard's schedule form. runAt is Cairo local 'YYYY-MM-DDTHH:MM'. */
export function parseSchedule(input: ScheduleInput | undefined | null): ScheduleSpec {
  const kind = input?.kind as ScheduleKind;
  if (!SCHEDULE_KINDS.includes(kind)) throw new BadRequestException('اختار نوع الجدولة');
  const startDate = input?.startDate?.trim() || null;
  const endDate = input?.endDate?.trim() || null;
  if ((startDate && !DATE.test(startDate)) || (endDate && !DATE.test(endDate))) throw new BadRequestException('تاريخ الفترة مش مظبوط');
  if (startDate && endDate && startDate > endDate) throw new BadRequestException('بداية الفترة لازم تكون قبل نهايتها');
  if (kind === 'once') {
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(input?.runAt ?? '');
    if (!m || !HHMM.test(m[2])) throw new BadRequestException('اختار تاريخ ووقت الإرسال');
    return { kind, runAt: cairoToUtc(m[1], m[2]) };
  }
  const time = input?.time?.trim() ?? '';
  if (!HHMM.test(time)) throw new BadRequestException('اكتب الوقت بالشكل HH:MM');
  const spec: ScheduleSpec = { kind, time, startDate, endDate };
  if (kind === 'weekly') {
    const days = [...new Set((input?.weekdays ?? []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
    if (!days.length) throw new BadRequestException('اختار يوم واحد على الأقل في الأسبوع');
    spec.weekdays = days;
  }
  if (kind === 'monthly') {
    const day = Number(input?.monthDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) throw new BadRequestException('يوم الشهر من 1 لـ 31');
    spec.monthDay = day;
  }
  if (kind === 'interval') {
    const n = Number(input?.intervalDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) throw new BadRequestException('كل كام يوم؟ من 1 لـ 365');
    spec.intervalDays = n;
  }
  return spec;
}

// ── quiet hours ───────────────────────────────────────────────────────────────

/** Is the Cairo clock inside [start, end)? A window may cross midnight (23:00 → 08:00). */
export function inQuietHours(at: Date, start: string, end: string): boolean {
  if (start === end) return false;
  const t = cairoParts(at).time;
  return start < end ? t >= start && t < end : t >= start || t < end;
}

// ── variables ─────────────────────────────────────────────────────────────────

export const MESSAGE_VARIABLES = ['name', 'first_name', 'branch'] as const;
const VAR_RE = /\{(name|first_name|branch)\}/g;

export const hasVariables = (...texts: (string | null | undefined)[]) => texts.some((t) => !!t && /\{(name|first_name|branch)\}/.test(t));

export function renderVariables(text: string, member: { name: string; branch: string }): string {
  const name = member.name.trim();
  const vars: Record<string, string> = { name, first_name: name.split(/\s+/)[0] ?? name, branch: member.branch };
  return text.replace(VAR_RE, (_, key: string) => vars[key] ?? '');
}

// ── audience ──────────────────────────────────────────────────────────────────

export type AudienceKind = 'all' | 'active' | 'expiring' | 'expired' | 'birthday' | 'absent' | 'members';
export const AUDIENCE_KINDS: AudienceKind[] = ['all', 'active', 'expiring', 'expired', 'birthday', 'absent', 'members'];

export interface PushAudience {
  kind: AudienceKind;
  branchIds: number[];
  gender: 'male' | 'female' | null;
  /** expiring within N / expired within the last N / absent ≥ N days. */
  days: number | null;
  memberIds: number[];
}

const DEFAULT_DAYS: Partial<Record<AudienceKind, number>> = { expiring: 3, expired: 7, absent: 7 };

export function normalizeAudience(raw: unknown): PushAudience {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind = a.kind as AudienceKind;
  if (!AUDIENCE_KINDS.includes(kind)) throw new BadRequestException('اختار الجمهور');
  const ints = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : []);
  const gender = a.gender === 'male' || a.gender === 'female' ? a.gender : null;
  let days: number | null = null;
  if (kind in DEFAULT_DAYS) {
    const n = a.days == null || a.days === '' ? DEFAULT_DAYS[kind]! : Number(a.days);
    if (!Number.isInteger(n) || n < 1 || n > 365) throw new BadRequestException('عدد الأيام من 1 لـ 365');
    days = n;
  }
  const memberIds = kind === 'members' ? ints(a.memberIds) : [];
  if (kind === 'members' && memberIds.length === 0) throw new BadRequestException('اختار عضو واحد على الأقل');
  if (memberIds.length > 5000) throw new BadRequestException('أقصى عدد 5000 عضو');
  return { kind, branchIds: kind === 'members' ? [] : ints(a.branchIds), gender: kind === 'members' ? null : gender, days, memberIds };
}

/** Arabic one-liner for the history list. */
export function audienceSummary(a: PushAudience, branchNames: Map<number, string>): string {
  const label: Record<AudienceKind, string> = {
    all: 'كل الأعضاء',
    active: 'المشتركين الحاليين',
    expiring: `اشتراكهم بيخلص خلال ${a.days} يوم`,
    expired: `اشتراكهم خلص في آخر ${a.days} يوم`,
    birthday: 'عيد ميلادهم النهارده',
    absent: `غايبين ${a.days} يوم أو أكتر`,
    members: `${a.memberIds.length} عضو محدد`,
  };
  const parts = [label[a.kind]];
  if (a.branchIds.length) parts.push(a.branchIds.map((id) => branchNames.get(id) ?? `فرع ${id}`).join('، '));
  if (a.gender) parts.push(a.gender === 'male' ? 'رجالة' : 'ستات');
  return parts.join(' · ').slice(0, 500);
}

/**
 * Topic plan: plain «كل الأعضاء» (optionally by branches / gender) without variables goes to FCM
 * topics; anything computed or personalised goes per member by token. FCM conditions allow ≤ 5 topics.
 */
export function topicTarget(a: PushAudience, personalised: boolean): { topic: string } | { condition: string } | null {
  if (personalised || a.kind !== 'all') return null;
  const branches = a.branchIds.map(memberBranchTopic);
  const gender = a.gender ? memberGenderTopic(a.gender) : null;
  if (!branches.length && !gender) return { topic: MEMBER_TOPIC_ALL };
  if (branches.length + (gender ? 1 : 0) > 5) return null;
  if (branches.length === 1 && !gender) return { topic: branches[0] };
  if (!branches.length && gender) return { topic: gender };
  const inTopics = (t: string) => `'${t}' in topics`;
  const branchExpr = branches.length === 1 ? inTopics(branches[0]) : `(${branches.map(inTopics).join(' || ')})`;
  return { condition: gender ? `${branchExpr} && ${inTopics(gender)}` : branchExpr };
}
