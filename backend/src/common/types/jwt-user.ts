/** Staff identity and current authorization scope. */
export interface JwtUser {
  /** users.user_id (JWT `sub`) */
  sub: number;
  /** Server-side staff session id; populated on authenticated requests. */
  sessionId?: string;
  /** users.level — 1 admin, 2 employee, 3 branch/dept manager */
  level: number | null;
  /** employees.id — canonical database identity used by foreign keys. */
  employeeId: number | null;
  /** employees.emp_code — human/business identifier displayed on documents. */
  employeeCode: number | null;
  /** @deprecated Legacy alias of employeeId. New code must use employeeId/employeeCode. */
  emp_code: number | null;
  /** employees.branch_id_fk (or 0); any host fan-out is explicit configuration. */
  branch: number;
  /** Optional live normalized branch assignments (used by multi-branch sales staff). */
  branchIds?: number[];
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
  /** Optional workforce-provider record id for provider-scoped APIs. */
  trainer_id: number | null;
}
