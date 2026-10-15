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

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Legacy tbl_hdoor_emps.action_date_s may be ISO date or unix-seconds string. */
export function legacyDateMatchValues(isoDate: string): string[] {
  const base = isoDate.slice(0, 10);
  const epoch = String(Math.floor(new Date(base + 'T00:00:00').getTime() / 1000));
  return [base, epoch];
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
