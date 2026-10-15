/**
 * JWT claims — mirror the 7 legacy CodeIgniter session keys
 * (userid, level, emp_code, image, name, branch, man_women_type).
 */
export interface JwtUser {
  /** users.user_id (JWT `sub`) */
  sub: number;
  /** users.level — 1 admin, 2 employee, 3 branch/dept manager */
  level: number | null;
  /** users.emp_code — linkage to the employee row (legacy stores employees.id here) */
  emp_code: number | null;
  /** employees.branch_id_fk (or 0). NOTE: branch === 3 is a virtual parent of [6,7,3]. */
  branch: number;
  /** Resolved branch display name (available without org.branches permission). */
  branch_name: string | null;
  /** employees.emp_type — men/women dashboard scope (or 0) */
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
