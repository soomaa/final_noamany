/**
 * Pure permit rules for WhatsApp-Web sending — no I/O, so every limit is unit-testable.
 * The service loads the client row + today's/this month's usage and asks `decidePermit`.
 */

export const MIN_DELAY_FLOOR_SEC = 3;
/** The gym-side page a subscription turns on (tenant entitlement key). */
export const WHATSAPP_PAGE_KEY = 'club.whatsapp';
/** A sender that stops asking keeps the number this long after its last permit. */
export const LOCK_GRACE_SEC = 120;

export interface PermitClient {
  enabled: boolean;
  daily_limit: number;
  monthly_limit: number;
  min_delay_sec: number;
  max_delay_sec: number;
  pause_every: number;
  pause_sec: number;
  send_from: string;
  send_to: string;
  timezone: string;
  lock_holder: string | null;
  lock_label: string | null;
  lock_expires_at: Date | null;
  next_allowed_at: Date | null;
}

export type DenyCode = 'disabled' | 'locked' | 'outside_hours' | 'daily_limit' | 'monthly_limit' | 'too_fast';

export type PermitDecision =
  | { ok: true; delaySec: number; lockSec: number }
  | { ok: false; code: DenyCode; message: string; retryAfterSec: number | null; lockedBy?: string | null };

export interface LocalClock {
  day: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  minutes: number; // minutes since local midnight
  seconds: number; // seconds since local midnight
}

export function localClock(now: Date, timezone: string): LocalClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    month: `${get('year')}-${get('month')}`,
    minutes: hour * 60 + minute,
    seconds: hour * 3600 + minute * 60 + Number(get('second')),
  };
}

export function parseHhMm(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** [from, to) in local minutes; `to` before `from` means the window runs past midnight. */
export function withinHours(minutes: number, from: string, to: string): boolean {
  const start = parseHhMm(from);
  const end = parseHhMm(to);
  if (start === null || end === null || start === end) return true;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** Seconds from `minutes` (local) until the window opens again. */
export function secondsUntilOpen(clock: LocalClock, from: string): number {
  const start = (parseHhMm(from) ?? 0) * 60;
  const diff = start - clock.seconds;
  return diff > 0 ? diff : diff + 86400;
}

/**
 * A gap in [min, max] that leans toward the short end with an occasional long one, like a person working
 * through a list. An even spread (every value equally likely) is an easy machine pattern to spot.
 */
export function randomDelay(min: number, max: number, rand: () => number = Math.random): number {
  const lo = Math.max(MIN_DELAY_FLOOR_SEC, Math.min(min, max));
  const hi = Math.max(lo, max);
  const r = Math.min(Math.max(rand(), 0), 0.999999);
  return lo + Math.floor(Math.pow(r, 1.8) * (hi - lo + 1));
}

/** The long break is anywhere from 40% to 100% of the configured length (300 s → 2–5 minutes), so it isn't clockwork. */
export function longPauseDelay(pauseSec: number, maxDelaySec: number, rand: () => number = Math.random): number {
  const base = Math.max(pauseSec, maxDelaySec);
  const r = Math.min(Math.max(rand(), 0), 1);
  return Math.max(maxDelaySec, Math.round(base * (0.4 + r * 0.6)));
}

export function decidePermit(input: {
  client: PermitClient;
  senderId: string;
  usedToday: number;
  usedMonth: number;
  now: Date;
  rand?: () => number;
}): PermitDecision {
  const { client, senderId, usedToday, usedMonth, now } = input;
  const clock = localClock(now, client.timezone);

  if (!client.enabled) {
    return { ok: false, code: 'disabled', message: 'الإرسال موقوف لهذا الحساب — تواصل مع مزوّد الخدمة', retryAfterSec: null };
  }
  const lockActive = client.lock_holder && client.lock_expires_at && client.lock_expires_at > now;
  if (lockActive && client.lock_holder !== senderId) {
    const retry = Math.ceil((client.lock_expires_at!.getTime() - now.getTime()) / 1000);
    return {
      ok: false,
      code: 'locked',
      message: `الرقم بيبعت دلوقتي من: ${client.lock_label ?? 'جهاز تاني'}`,
      retryAfterSec: Math.max(5, retry),
      lockedBy: client.lock_label,
    };
  }
  if (!withinHours(clock.minutes, client.send_from, client.send_to)) {
    return {
      ok: false,
      code: 'outside_hours',
      message: `الإرسال متاح من ${client.send_from} لحد ${client.send_to} بس`,
      retryAfterSec: secondsUntilOpen(clock, client.send_from),
    };
  }
  if (usedToday >= client.daily_limit) {
    return {
      ok: false,
      code: 'daily_limit',
      message: `خلص الحد اليومي (${client.daily_limit} رسالة)`,
      retryAfterSec: 86400 - clock.seconds,
    };
  }
  if (usedMonth >= client.monthly_limit) {
    return { ok: false, code: 'monthly_limit', message: `خلص الحد الشهري (${client.monthly_limit} رسالة)`, retryAfterSec: null };
  }
  // The pacing gap belongs to the number, so a sender taking over the lock still waits it out.
  if (client.next_allowed_at && client.next_allowed_at.getTime() - now.getTime() > 1000) {
    return {
      ok: false,
      code: 'too_fast',
      message: 'لسه بدري على الرسالة الجاية',
      retryAfterSec: Math.ceil((client.next_allowed_at.getTime() - now.getTime()) / 1000),
    };
  }

  const longPause = client.pause_every > 0 && (usedToday + 1) % client.pause_every === 0;
  const delaySec = longPause
    ? longPauseDelay(client.pause_sec, client.max_delay_sec, input.rand)
    : randomDelay(client.min_delay_sec, client.max_delay_sec, input.rand);
  return { ok: true, delaySec, lockSec: delaySec + LOCK_GRACE_SEC };
}
