import {
  cairoDateString,
  cairoMidnightUtc,
  dateOnlyParts,
} from './cairo-date';

/** Parse legacy varchar date/time strings (ISO, unix seconds, DD/MM/YYYY). */
export function parseLegacyDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    try {
      return cairoMidnightUtc(s.slice(0, 10));
    } catch {
      return null;
    }
  }

  if (/^\d{8,10}$/.test(s)) {
    const n = parseInt(s, 10);
    const ms = s.length > 10 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmY = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmY) {
    const iso = `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
    try {
      return cairoMidnightUtc(iso);
    } catch {
      return null;
    }
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toIsoDate(raw: string | null | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return raw ?? undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const iso = value.slice(0, 10);
    try {
      dateOnlyParts(iso);
      return iso;
    } catch {
      return raw ?? undefined;
    }
  }
  const dmY = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmY) {
    const iso = `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;
    try {
      dateOnlyParts(iso);
      return iso;
    } catch {
      return raw ?? undefined;
    }
  }
  const d = parseLegacyDate(raw);
  return d ? cairoDateString(d) : raw ?? undefined;
}

export function todayIso(): string {
  return cairoDateString();
}

/** Legacy tbl_hdoor_emps.action_date_s may be ISO date or unix-seconds string. */
export function legacyDateMatchValues(isoDate: string): string[] {
  const base = isoDate.slice(0, 10);
  const epoch = String(Math.floor(cairoMidnightUtc(base).getTime() / 1000));
  return [base, epoch];
}

export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function diffDaysFromToday(raw: string | null | undefined): number | null {
  const target = toIsoDate(raw);
  if (!target || !/^\d{4}-\d{2}-\d{2}$/.test(target)) return null;
  const toOrdinal = (value: string) => {
    const { year, month, day } = dateOnlyParts(value);
    return Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000);
  };
  return toOrdinal(target) - toOrdinal(cairoDateString());
}
