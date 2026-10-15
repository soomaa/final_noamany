/** Maps legacy `users.level` (CodeIgniter) to the modern RBAC role key. */
export const LEGACY_LEVEL_TO_ROLE: Record<number, string> = {
  1: 'super_admin',
  2: 'employee',
  3: 'branch_manager',
};

export function legacyRoleKeyForLevel(level: number | null | undefined): string {
  return LEGACY_LEVEL_TO_ROLE[level ?? 0] ?? 'employee';
}
