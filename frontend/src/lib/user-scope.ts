import type { AuthUser } from '@/types';

/** Mirrors the backend isSystemAdmin: a level-1 account or an active RBAC super-admin role. */
export function isSystemAdminUser(user: AuthUser | null | undefined): boolean {
  return user?.level === 1 || user?.is_super_admin === true;
}

/** Branch managers (level 3) see their branch's staff; everyone else only sees themselves. */
export function isBranchManagerUser(user: AuthUser | null | undefined): boolean {
  return !isSystemAdminUser(user) && user?.level === 3;
}

/** مدير / مديرة فرع or مشرف إدارة حريمي / رجالي (client permission sheet, 22 Nov). Mirrors backend managerKind. */
export function isManagerSheetUser(user: AuthUser | null | undefined): boolean {
  if (!user || isSystemAdminUser(user)) return false;
  const t = (user.job_title ?? '').replace(/\s+/g, ' ');
  return /مدير[ةه]?\s*(?:ال)?فرع/.test(t) || isSectionSupervisorUser(user);
}

/** مشرف إدارة حريمي / رجالي: one section across every branch, branch filter open (client, 22 Nov). */
export function isSectionSupervisorUser(user: AuthUser | null | undefined): boolean {
  if (!user || isSystemAdminUser(user)) return false;
  return /مشرف[ةه]?\s*(?:ال)?[إا]دار[ةه]\s*(?:ال)?(?:حريمي|رجالي)/.test((user.job_title ?? '').replace(/\s+/g, ' '));
}

/**
 * The branch a staff member is locked to, or null when they may choose freely (admins).
 * The backend enforces the same rule; the UI only preselects and locks the field.
 */
export function lockedBranchId(user: AuthUser | null | undefined): number | null {
  if (!user || isSystemAdminUser(user) || isSectionSupervisorUser(user)) return null;
  return user.branch > 0 ? user.branch : null;
}

export type MemberGender = 'male' | 'female';

/**
 * The men/women section (رجالي/حريمي) a staff member is locked to, or null when they may
 * see both (admins, employees registered as «الكل», or an active section exception).
 * Mirrors the backend BranchScopeService.memberGenderFilter, which enforces it.
 */
/**
 * Never locked any more (client, 22 Nov): a حريمي/رجالي employee opens on their own section but
 * can choose «الكل», and searches always reach every member. Kept so callers stay unchanged.
 */
export function lockedMemberGender(_user: AuthUser | null | undefined): MemberGender | null {
  return null;
}

/**
 * The section a screen OPENS on: the employee's own (employees.emp_type: 1 men, 2 women; or the
 * server's member_gender), else مديرة فرع → حريمي and مدير فرع → رجالي. Null = start on الكل.
 * Everyone can switch to the other section or to الكل.
 */
export function preferredMemberGender(user: AuthUser | null | undefined): MemberGender | null {
  if (!user || isSystemAdminUser(user)) return null;
  if (user.member_gender) return user.member_gender;
  if (user.man_women_type === 0 || user.man_women_type === 1) return 'male';
  if (user.man_women_type === 2) return 'female';
  const title = (user.job_title ?? '').replace(/\s+/g, ' ').trim();
  if (/مدير[ةه] ?فرع/.test(title)) return 'female';
  if (/مدير ?فرع/.test(title) || user.level === 3) return 'male';
  return null;
}

export const MEMBER_GENDER_OPTIONS: { value: MemberGender; label: string }[] = [
  { value: 'male', label: 'رجالي' },
  { value: 'female', label: 'حريمي' },
];
