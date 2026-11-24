import { ForbiddenException } from '@nestjs/common';
import { JwtUser } from '../types/jwt-user';
import { isSystemAdmin } from './system-admin.util';

/**
 * Branch manager and men/women management supervisor (client permission sheet, 22 Nov 2026).
 *
 * - مدير فرع / مديرة فرع: their own branch; reports limited to a period (today, or the current and the
 *   previous month, or the current month, or the current year), lists read-only.
 * - مشرف إدارة حريمي / رجالي: the same sheet for one section (women or men) across every branch,
 *   with the branch filter open.
 *
 * Detected from the job title (staff get their job-title role; users.level is 2 or 3 for the same
 * title in production), never for a system admin.
 */
export type ManagerKind = 'branch' | 'section';
export type ManagerPeriod = 'today' | 'twoMonths' | 'month' | 'year';

function title(user?: JwtUser | null): string {
  return (user?.job_title ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function managerKind(user?: JwtUser | null): ManagerKind | null {
  if (!user || isSystemAdmin(user)) return null;
  const t = title(user);
  if (/مشرف[ةه]?\s*(?:ال)?[إا]دار[ةه]\s*(?:ال)?(?:حريمي|رجالي)/.test(t)) return 'section';
  if (/مدير[ةه]?\s*(?:ال)?فرع/.test(t)) return 'branch';
  return null;
}

/** The section (members and staff) a manager is responsible for; null = both. */
export function managerSection(user?: JwtUser | null): 'male' | 'female' | null {
  const kind = managerKind(user);
  if (!kind) return null;
  const t = title(user);
  if (/حريمي/.test(t)) return 'female';
  if (/رجالي/.test(t)) return 'male';
  if (user?.man_women_type === 2) return 'female';
  if (user?.man_women_type === 1) return 'male';
  // «مديرة فرع» runs the women's side, «مدير فرع» the men's (Nada's voice note, 22 Nov).
  return /مدير[ةه]/.test(t) ? 'female' : 'male';
}

const cairoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });

export function cairoToday(now = new Date()): string {
  return cairoDay.format(now);
}

/** First and last allowed day (YYYY-MM-DD, Cairo) of a manager period. */
export function managerPeriodBounds(period: ManagerPeriod, now = new Date()): { from: string; to: string } {
  const today = cairoToday(now);
  const [y, m] = today.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'month':
      return { from: `${y}-${pad(m)}-01`, to: today };
    case 'year':
      return { from: `${y}-01-01`, to: today };
    case 'twoMonths': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: today };
    }
  }
}

/**
 * Clamp a requested day range into the manager's allowed period. Missing ends default to the
 * period ends; a range wholly outside the period collapses to the nearest allowed day so the
 * report comes back empty-ish instead of leaking older data. Non-managers get the request back.
 */
export function clampManagerDays(
  user: JwtUser | null | undefined,
  period: ManagerPeriod,
  from?: string | null,
  to?: string | null,
): { from?: string; to?: string; clamped: boolean } {
  if (!managerKind(user)) return { from: from ?? undefined, to: to ?? undefined, clamped: false };
  const b = managerPeriodBounds(period);
  const valid = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : undefined);
  let f = valid(from) ?? b.from;
  let t = valid(to) ?? b.to;
  if (f < b.from) f = b.from;
  if (f > b.to) f = b.to;
  if (t > b.to) t = b.to;
  if (t < b.from) t = b.from;
  if (t < f) t = f;
  return { from: f, to: t, clamped: true };
}

/** Message used when a manager tries to change a record the sheet keeps read-only. */
export const MANAGER_READ_ONLY = 'صلاحيتك عرض بس: التعديل والحذف مش متاحين لمدير الفرع';

/** Lists in the sheet are read-only for managers: throw before any edit / delete. */
export function assertManagerMayModify(user?: JwtUser | null): void {
  if (managerKind(user)) throw new ForbiddenException(MANAGER_READ_ONLY);
}
