import type { JwtUser } from '../../common/types/jwt-user';

function normalizeTitle(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Restrict legacy level-1 reception accounts to their own cashier activity. */
export function canViewAllCashiers(user: JwtUser, rbacSuperAdmin: boolean): boolean {
  if (!rbacSuperAdmin) return false;
  if (user.emp_code == null) return true;

  const title = normalizeTitle(user.job_title);
  return /(^|\s)(مدير النظام|مسؤول النظام|system admin(?:istrator)?|super admin|administrator|owner)(\s|$)/i.test(title);
}
