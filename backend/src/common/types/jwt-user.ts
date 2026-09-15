/**
 * JWT claims — mirror the 7 legacy CodeIgniter session keys
 * (userid, level, emp_code, image, name, branch, man_women_type).
 */
export interface JwtUser {
  /** users.user_id (JWT `sub`) */
  sub: number;
  /** Optional server-side auth session identity for revocation-aware hosts. */
  sessionId?: string;
  /** users.level — 1 admin, 2 employee, 3 branch/dept manager */
  level: number | null;
  /** users.emp_code — linkage to the employee row (legacy stores employees.id here) */
  emp_code: number | null;
  /** Canonical employee row identity; kept optional for legacy JWT compatibility. */
  employeeId?: number | null;
  /** Human-facing employee code; kept separate from relational identity. */
  employeeCode?: number | null;
  /** employees.branch_id_fk (or 0). NOTE: branch === 3 is a virtual parent of [6,7,3]. */
  branch: number;
  /** Resolved branch display name (available without org.branches permission). */
  branch_name: string | null;
  /** Normalized authorization scope: 0 = men, 1 = women, -1 = invalid/fail-closed. */
  man_women_type: number;
  name: string | null;
  /** Avatar path — employee photo preferred over default user placeholder. */
  image: string | null;
  /** Employee job title (المسمى الوظيفي) for profile display. */
  job_title: string | null;
  /** True only when the linked employee currently has an active trainer roster row. */
  is_trainer: boolean;
  /** club_trainers.id for trainer-scoped APIs. */
  trainer_id: number | null;
}
