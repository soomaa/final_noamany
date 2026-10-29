import type { AuthUser } from '@/types';

/** Mirrors the backend isSystemAdmin: a level-1 account or an active RBAC super-admin role. */
export function isSystemAdminUser(user: AuthUser | null | undefined): boolean {
  return user?.level === 1 || user?.is_super_admin === true;
}

/** Branch managers (level 3) see their branch's staff; everyone else only sees themselves. */
export function isBranchManagerUser(user: AuthUser | null | undefined): boolean {
  return !isSystemAdminUser(user) && user?.level === 3;
}

/**
 * The branch a staff member is locked to, or null when they may choose freely (admins).
 * The backend enforces the same rule; the UI only preselects and locks the field.
 */
export function lockedBranchId(user: AuthUser | null | undefined): number | null {
  if (!user || isSystemAdminUser(user)) return null;
  return user.branch > 0 ? user.branch : null;
}
