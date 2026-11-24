import { ForbiddenException } from '@nestjs/common';
import { SuspendStatus } from '../utils/suspend-status.util';

/**
 * Approval chain shared by leaves (hr_all_agzat_orders) and permissions (hr_all_ozonat_orders).
 *
 * Owner's decision (24 Nov 2026): direct manager → HR → department manager.
 * The legacy general-manager step (approve_moder_3am) was always mandatory, never optional, so it
 * is dropped for new requests; rows that were already waiting for the general manager before this
 * change can still be finished by their recipient (or HR / an admin).
 *
 * Routing rules:
 *   - never route to the requester (publisher or the employee's own login);
 *   - the direct-manager and department-manager steps are skipped when nobody (other than the
 *     requester) holds them;
 *   - the HR step is never skipped: no HR officer (job-title code 44) → an admin account.
 *
 * Progress is read from the per-stage enum('yes','no','wait') flags (a skipped step is stored as
 * 'yes' with no stage date and a «تخطي» history row), so no new enum values are needed in
 * `actions_sends`, and rows created under the old order keep working.
 */

export type ChainStageKey = 'approve_direct_manager' | 'approve_hr' | 'approve_moder_edara';
/** Pending stage of a row; `approve_moder_3am` only for rows created under the old chain. */
export type PendingStage = ChainStageKey | 'approve_moder_3am';

export const APPROVAL_CHAIN_ORDER: readonly ChainStageKey[] = [
  'approve_direct_manager',
  'approve_hr',
  'approve_moder_edara',
];

export const HR_JOB_TITLE_CODE = 44;

export const STAGE_LABEL_AR: Record<PendingStage, string> = {
  approve_direct_manager: 'المدير المباشر',
  approve_hr: 'الموارد البشرية',
  approve_moder_edara: 'مدير الإدارة',
  approve_moder_3am: 'المدير العام',
};

export const STAGE_DATE_COLUMN: Record<PendingStage, string> = {
  approve_direct_manager: 'approve_direct_manager_date',
  approve_hr: 'approve_hr_date',
  approve_moder_edara: 'approve_moder_edara_date',
  approve_moder_3am: 'approve_moder_3am_date',
};

/**
 * FINAL APPROVAL — the one status payroll may count.
 * Leaves and permissions are finally approved when `suspend === 4` (SuspendStatus.APPROVED);
 * the same write also sets `close_talab = 'yes'`. Intermediate approvals now write 1
 * (SuspendStatus.APPROVED_L1) and rejections 2.
 */
export const FINAL_APPROVAL_SUSPEND = SuspendStatus.APPROVED;
export const INTERMEDIATE_APPROVAL_SUSPEND = SuspendStatus.APPROVED_L1;

export function isFinalApproval(row: { suspend: number | null | undefined }): boolean {
  return row.suspend === FINAL_APPROVAL_SUSPEND;
}

export interface ChainFlags {
  suspend: number | null;
  actions_sends?: string | null;
  close_talab?: string | null;
  approve_direct_manager?: string | null;
  approve_hr?: string | null;
  approve_moder_edara?: string | null;
  approve_moder_3am?: string | null;
  cancel?: string | null;
}

/** The stage waiting for a decision, or null when the request is closed / not in the chain. */
export function pendingStage(row: ChainFlags): PendingStage | null {
  if (row.cancel === 'yes') return null;
  if (row.close_talab === 'yes') return null;
  if (row.suspend === SuspendStatus.REJECTED || row.suspend === SuspendStatus.CANCELLED) return null;
  const state = row.actions_sends ?? '';
  // Demo / pre-chain legacy rows never entered the approval chain.
  if (state === 'start' || state === 'progress' || state === 'close_talab' || state === '') return null;
  const flags = [row.approve_direct_manager, row.approve_hr, row.approve_moder_edara, row.approve_moder_3am];
  if (flags.some((f) => f === 'no')) return null;
  for (const stage of APPROVAL_CHAIN_ORDER) {
    if (row[stage] !== 'yes') return stage;
  }
  // Every new-order step is done but the row is still open: created under the old chain and
  // waiting for the general manager.
  return row.approve_moder_3am === 'yes' ? null : 'approve_moder_3am';
}

/** Department-manager job-title code (legacy routing on emp_type / edara_id). */
export function departmentManagerCode(ctx: { empType?: number | null; edaraId?: number | null }): number {
  if (ctx.edaraId === 30) return 32;
  if (ctx.edaraId === 10) return 42;
  return ctx.empType === 1 ? 32 : 36;
}

export interface Recipient {
  userId: number;
  name: string | null;
  empId: number | null;
  /** 'admin' when no HR officer exists and the HR step went to an admin account. */
  fallback?: 'admin';
}

export interface ChainEmployee {
  id: number;
  emp_code: number | null;
  manger: string | null;
  emp_type: number | null;
  edara_id: number | null;
}

/** Minimal Prisma surface used here (keeps the unit specs easy to mock). */
export interface ChainPrisma {
  employees: { findFirst: (args: any) => Promise<any>; findUnique: (args: any) => Promise<any> };
  users: { findFirst: (args: any) => Promise<any>; findUnique: (args: any) => Promise<any>; findMany?: (args: any) => Promise<any[]> };
  hr_egraat_emp_setting: { findFirst: (args: any) => Promise<any>; findMany?: (args: any) => Promise<any[]> };
}

/** Login user for an employee row (users.emp_code holds employees.id; emp_code fallback for old imports). */
async function userForEmployee(
  prisma: ChainPrisma,
  emp: { id: number; emp_code: number | null },
  exclude: Set<number>,
): Promise<{ user_id: number } | null> {
  const refs = [emp.id, emp.emp_code].filter((v): v is number => v != null);
  for (const ref of refs) {
    const user = await prisma.users.findFirst({
      where: { emp_code: ref, approved: 1, ...(exclude.size ? { user_id: { notIn: [...exclude] } } : {}) },
      select: { user_id: true },
    });
    if (user) return user;
  }
  return null;
}

/** Direct manager (employees.manger holds employees.id, emp_code for later imports). */
export async function resolveDirectManager(
  prisma: ChainPrisma,
  emp: ChainEmployee | null,
  exclude: Set<number>,
): Promise<Recipient | null> {
  const ref = emp?.manger ? parseInt(emp.manger, 10) : NaN;
  if (!Number.isFinite(ref) || ref <= 0) return null;
  const manager = await prisma.employees.findFirst({
    where: { OR: [{ id: ref }, { emp_code: ref }] },
    select: { id: true, emp_code: true, employee: true },
  });
  if (!manager || manager.id === emp?.id) return null;
  const user = await userForEmployee(prisma, manager, exclude);
  if (!user) return null;
  return { userId: user.user_id, name: manager.employee ?? null, empId: manager.id };
}

/** Active holder of a job-title code (hr_egraat_emp_setting), never one of `exclude`. */
export async function resolveByJobTitleCode(
  prisma: ChainPrisma,
  code: number,
  exclude: Set<number>,
): Promise<Recipient | null> {
  const settings: any[] = prisma.hr_egraat_emp_setting.findMany
    ? await prisma.hr_egraat_emp_setting.findMany({ where: { job_title_code_fk: code, person_suspend: 1 }, orderBy: { id: 'asc' } })
    : [await prisma.hr_egraat_emp_setting.findFirst({ where: { job_title_code_fk: code, person_suspend: 1 } })].filter(Boolean);
  for (const setting of settings) {
    const ref = setting?.person_id ?? (setting?.person_code ? parseInt(setting.person_code, 10) : null);
    if (!ref) continue;
    const emp = await prisma.employees.findFirst({
      where: { OR: [{ id: ref }, { emp_code: ref }] },
      select: { id: true, emp_code: true, employee: true },
    });
    const user = emp
      ? await userForEmployee(prisma, emp, exclude)
      : await prisma.users.findFirst({
          where: { emp_code: ref, approved: 1, ...(exclude.size ? { user_id: { notIn: [...exclude] } } : {}) },
          select: { user_id: true },
        });
    if (user) return { userId: user.user_id, name: emp?.employee ?? setting.person_name ?? null, empId: emp?.id ?? null };
  }
  return null;
}

/** Last resort for the HR step: an active admin account (users.level = 1). */
export async function resolveAdmin(prisma: ChainPrisma, exclude: Set<number>): Promise<Recipient | null> {
  const user = await prisma.users.findFirst({
    where: { level: 1, approved: 1, ...(exclude.size ? { user_id: { notIn: [...exclude] } } : {}) },
    orderBy: { user_id: 'asc' },
    select: { user_id: true, name: true },
  });
  return user ? { userId: user.user_id, name: user.name ?? null, empId: null, fallback: 'admin' } : null;
}

export async function resolveStageRecipient(
  prisma: ChainPrisma,
  stage: ChainStageKey,
  emp: ChainEmployee | null,
  exclude: Set<number>,
): Promise<Recipient | null> {
  switch (stage) {
    case 'approve_direct_manager':
      return resolveDirectManager(prisma, emp, exclude);
    case 'approve_hr':
      return (await resolveByJobTitleCode(prisma, HR_JOB_TITLE_CODE, exclude)) ?? resolveAdmin(prisma, exclude);
    case 'approve_moder_edara':
      return resolveByJobTitleCode(
        prisma,
        departmentManagerCode({ empType: emp?.emp_type ?? null, edaraId: emp?.edara_id ?? null }),
        exclude,
      );
  }
}

export type RouteResult =
  | { final: false; stage: ChainStageKey; recipient: Recipient | null; skipped: ChainStageKey[] }
  | { final: true; skipped: ChainStageKey[] };

/**
 * Next stage after `after` (null = a brand-new request). Optional steps nobody can take are
 * skipped; the HR step is mandatory (recipient null only if there is no HR officer and no admin
 * at all — HR / admins can still act on it through the override).
 */
export async function routeNext(
  prisma: ChainPrisma,
  after: PendingStage | null,
  emp: ChainEmployee | null,
  exclude: Set<number>,
  done: Partial<Record<ChainStageKey, string | null>> = {},
): Promise<RouteResult> {
  if (after === 'approve_moder_3am') return { final: true, skipped: [] };
  const start = after == null ? 0 : APPROVAL_CHAIN_ORDER.indexOf(after) + 1;
  const skipped: ChainStageKey[] = [];
  for (const stage of APPROVAL_CHAIN_ORDER.slice(start)) {
    if (done[stage] === 'yes') continue; // already passed under the old order
    const recipient = await resolveStageRecipient(prisma, stage, emp, exclude);
    if (recipient) return { final: false, stage, recipient, skipped };
    if (stage === 'approve_hr') return { final: false, stage, recipient: null, skipped };
    skipped.push(stage);
  }
  return { final: true, skipped };
}

/** Login ids that belong to the requester: the publisher and the employee's own account(s). */
export async function requesterUserIds(
  prisma: ChainPrisma,
  emp: { id: number; emp_code: number | null } | null,
  publisher?: number | null,
): Promise<Set<number>> {
  const ids = new Set<number>();
  if (publisher) ids.add(publisher);
  if (emp) {
    const refs = [emp.id, emp.emp_code].filter((v): v is number => v != null);
    const rows = prisma.users.findMany
      ? await prisma.users.findMany({ where: { emp_code: { in: refs } }, select: { user_id: true } })
      : [];
    for (const r of rows ?? []) ids.add(r.user_id);
  }
  return ids;
}

/** Is this login an active HR officer (job-title code 44)? */
export async function isHrOfficer(prisma: ChainPrisma, userId: number): Promise<boolean> {
  const account = await prisma.users.findUnique({ where: { user_id: userId }, select: { emp_code: true } });
  if (account?.emp_code == null) return false;
  const emp = await prisma.employees.findFirst({
    where: { OR: [{ id: account.emp_code }, { emp_code: account.emp_code }] },
    select: { id: true, emp_code: true },
  });
  const refs = [account.emp_code, emp?.id, emp?.emp_code].filter((v): v is number => v != null);
  const hit = await prisma.hr_egraat_emp_setting.findFirst({
    where: {
      job_title_code_fk: HR_JOB_TITLE_CODE,
      person_suspend: 1,
      OR: [{ person_id: { in: refs } }, { person_code: { in: refs.map(String) } }],
    },
    select: { id: true },
  });
  return hit != null;
}

export type ApproverRole = 'recipient' | 'hr' | 'admin';

/**
 * Only the routed recipient, or HR / an admin (override), may act on a pending step.
 * A requester can never decide on their own request unless they are a system admin.
 */
export async function authorizeApprover(
  prisma: ChainPrisma,
  actor: { userId?: number | null; isSuperAdmin?: boolean },
  row: { current_to_user_id: number | null },
  requester: Set<number>,
  extraHrCheck?: (userId: number) => Promise<boolean>,
): Promise<{ role: ApproverRole; override: boolean }> {
  const userId = actor.userId;
  if (userId == null) throw new ForbiddenException('غير مصرح لك باعتماد هذا الطلب');
  const account = await prisma.users.findUnique({ where: { user_id: userId }, select: { level: true } });
  const isAdmin = account?.level === 1 || actor.isSuperAdmin === true;
  if (requester.has(userId) && !isAdmin) {
    throw new ForbiddenException('لا يمكنك اعتماد طلبك بنفسك');
  }
  if (row.current_to_user_id != null && row.current_to_user_id === userId) {
    return { role: 'recipient', override: false };
  }
  if (isAdmin) return { role: 'admin', override: true };
  if ((await isHrOfficer(prisma, userId)) || (extraHrCheck && (await extraHrCheck(userId)))) {
    return { role: 'hr', override: true };
  }
  throw new ForbiddenException('هذا الطلب غير محول إليك');
}
