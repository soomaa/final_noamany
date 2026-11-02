/** Parse legacy varchar date/time strings (ISO, unix seconds, DD/MM/YYYY). */
export function parseLegacyDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10) + 'T12:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (/^\d{8,10}$/.test(s)) {
    const n = parseInt(s, 10);
    const ms = s.length > 10 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmY = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmY) {
    const d = new Date(+dmY[3], +dmY[2] - 1, +dmY[1], 12);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toIsoDate(raw: string | null | undefined): string | undefined {
  const d = parseLegacyDate(raw);
  return d ? d.toISOString().slice(0, 10) : raw ?? undefined;
}

/** The business timezone; the legacy PHP system also runs on Africa/Cairo (index.php). */
export const BUSINESS_TIMEZONE = 'Africa/Cairo';
const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE });
const businessClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** Today's date (YYYY-MM-DD) in Cairo, whatever timezone the server runs in. */
export function todayIso(now = new Date()): string {
  return businessDate.format(now);
}

/** Cairo wall-clock time of `now`, as fields. */
export function businessClockParts(now = new Date()) {
  const p = Object.fromEntries(businessClock.formatToParts(now).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour % 24, minute: +p.minute, second: +p.second };
}

/** Minutes since Cairo midnight. */
export function businessNowMinutes(now = new Date()): number {
  const { hour, minute } = businessClockParts(now);
  return hour * 60 + minute;
}

/** Cairo wall-clock of `now` encoded as if it were UTC — comparable with Date.UTC(wall-clock fields). */
export function businessWallClockMs(now = new Date()): number {
  const c = businessClockParts(now);
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
}

/** Legacy tbl_hdoor_emps.action_date_s may be ISO date or unix-seconds string. */
export function legacyDateMatchValues(isoDate: string): string[] {
  const base = isoDate.slice(0, 10);
  // PHP wrote strtotime(Y-m-d) in Africa/Cairo; also accept the server-local midnight used before.
  const local = String(Math.floor(new Date(base + 'T00:00:00').getTime() / 1000));
  return [...new Set([base, String(businessMidnightEpoch(base)), local])];
}

/** Unix seconds of Cairo midnight for a YYYY-MM-DD date — what PHP's strtotime(date) stored. */
export function businessMidnightEpoch(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const noonUtc = Date.UTC(y, m - 1, d, 12);
  const offsetMs = businessWallClockMs(new Date(noonUtc)) - noonUtc;
  return Math.floor((Date.UTC(y, m - 1, d) - offsetMs) / 1000);
}

/** A legacy stored date as YYYY-MM-DD. Unix seconds (PHP strtotime) are read on the Cairo calendar,
 *  where toIsoDate's UTC day would be one day early for a Cairo-midnight timestamp. */
export function legacyBusinessIsoDate(raw: string | null | undefined): string | undefined {
  const s = raw?.trim();
  if (s && /^\d{8,10}$/.test(s)) return todayIso(new Date(parseInt(s, 10) * 1000));
  return toIsoDate(raw);
}

/** Legacy form dates: "d/m/Y" or "d-m-Y" (PHP strtotime after str_replace('/', '-')) or ISO. */
export function normalizeLegacyInputDate(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  const dmY = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmY) return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
  return s.replace(/\//g, '-').slice(0, 10);
}

export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function diffDaysFromToday(raw: string | null | undefined): number | null {
  const d = parseLegacyDate(raw);
  if (!d) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  d.setHours(12, 0, 0, 0);
  return daysBetween(today, d);
}
