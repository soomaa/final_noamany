/**
 * JWT claims — mirror the 7 legacy CodeIgniter session keys
 * (userid, level, emp_code, image, name, branch, man_women_type).
 */
export interface JwtUser {
  /** users.user_id (JWT `sub`) */
  sub: number;
  /** users.level — 1 admin, 2 employee, 3 branch/dept manager */
  level: number | null;
  /** Resolved active RBAC super-admin role. Never trusted directly from a stale token. */
  is_super_admin?: boolean;
  /** users.emp_code — linkage to the employee row (legacy stores employees.id here) */
  emp_code: number | null;
  /** employees.branch_id_fk (or 0). NOTE: branch === 3 is a virtual parent of [6,7,3]. */
  branch: number;
  /** Resolved branch display name (available without org.branches permission). */
  branch_name: string | null;
  /** employees.emp_type — 1 men, 2 women, 3 both (or legacy 0). */
  man_women_type: number;
  /** Effective gender sections refreshed from active individual exceptions. */
  member_sections?: Array<'male' | 'female'>;
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
