import { BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { STAGE_LABEL_AR, PendingStage, pendingStage, ChainFlags } from './approval-chain';
import { SuspendStatus } from '../utils/suspend-status.util';

/**
 * Shared pieces of the HR request flow (25 Nov 2026): return-with-comment, the visible timeline
 * and the unified status chip, for leaves (hr_all_agzat_orders), permissions
 * (hr_all_ozonat_orders) and overtime requests (hr_overtime_requests).
 *
 * "Return" (إرجاع للتعديل): the approver of the pending step writes a comment and the request goes
 * back to the person who filed it (the employee, or the manager for a manager-entered overtime).
 * They see the comment, edit and resubmit; the request resumes at the step that returned it.
 * Leaves / permissions keep their legacy enum columns untouched: the returned state lives in
 * hr_request_returns (migration 20261125110000_hr_request_flow), read with raw SQL.
 */

export type FlowRequestType = 'leave' | 'permission' | 'overtime' | 'request';

export type FlowAction =
  | 'submit'
  | 'accept'
  | 'reject'
  | 'return'
  | 'resubmit'
  | 'cancel'
  | 'skip'
  | 'recorded'
  | 'edit';

export const FLOW_ACTION_LABEL_AR: Record<FlowAction, string> = {
  submit: 'تقديم الطلب',
  accept: 'موافقة',
  reject: 'رفض',
  return: 'إرجاع للتعديل',
  resubmit: 'إعادة إرسال بعد التعديل',
  cancel: 'إلغاء',
  skip: 'تخطي',
  recorded: 'تسجيل في الحضور',
  edit: 'تعديل',
};

/** Unified status chip shown on every request card (web + mobile). */
export type FlowStatus =
  | 'pending_manager'
  | 'pending_hr'
  | 'pending_dept'
  | 'pending_gm'
  | 'returned'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export const FLOW_STATUS_LABEL_AR: Record<FlowStatus, string> = {
  pending_manager: 'بانتظار المدير',
  pending_hr: 'بانتظار HR',
  pending_dept: 'بانتظار مدير الإدارة',
  pending_gm: 'بانتظار المدير العام',
  returned: 'مرتجع',
  approved: 'موافق',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
};

export const STAGE_FLOW_STATUS: Record<PendingStage, FlowStatus> = {
  approve_direct_manager: 'pending_manager',
  approve_hr: 'pending_hr',
  approve_moder_edara: 'pending_dept',
  approve_moder_3am: 'pending_gm',
};

export function stageLabel(stage: string | null | undefined): string | null {
  if (!stage) return null;
  return STAGE_LABEL_AR[stage as PendingStage] ?? stage;
}

/** Flow status of a leave / permission row (`returned` = an open hr_request_returns row). */
export function chainFlowStatus(row: ChainFlags, returned: boolean): FlowStatus {
  if (row.cancel === 'yes' || row.suspend === SuspendStatus.CANCELLED) return 'cancelled';
  const flags = [row.approve_direct_manager, row.approve_hr, row.approve_moder_edara, row.approve_moder_3am];
  if (row.suspend === SuspendStatus.REJECTED || flags.some((f) => f === 'no')) return 'rejected';
  const stage = pendingStage(row);
  if (stage) return returned ? 'returned' : STAGE_FLOW_STATUS[stage];
  if (row.suspend === SuspendStatus.APPROVED || row.close_talab === 'yes') return 'approved';
  // Demo / pre-chain legacy rows that never entered the chain.
  return 'pending_manager';
}

export interface TimelineEntry {
  at: string;
  action: FlowAction | string;
  actionLabel: string;
  stage: string | null;
  stageLabel: string | null;
  by: number | null;
  byName: string | null;
  to: number | null;
  toName: string | null;
  comment: string | null;
  override: boolean;
}

export interface ReturnInfo {
  id: number;
  stage: string;
  stageLabel: string | null;
  comment: string;
  returnedBy: number | null;
  returnedByName: string | null;
  returnedTo: number | null;
  at: string | null;
}

/** Raw-SQL surface used here (keeps the specs easy to mock). */
export interface FlowPrisma {
  $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T>;
  $executeRaw: (query: Prisma.Sql) => Promise<number>;
}

const logger = new Logger('HrRequestFlow');

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value == null ? new Date().toISOString() : String(value);
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function timelineEntry(input: {
  at?: string | Date | null;
  action: FlowAction | string;
  stage?: string | null;
  by?: number | null;
  byName?: string | null;
  to?: number | null;
  toName?: string | null;
  comment?: string | null;
  override?: boolean;
}): TimelineEntry {
  return {
    at: iso(input.at ?? new Date()),
    action: input.action,
    actionLabel: FLOW_ACTION_LABEL_AR[input.action as FlowAction] ?? String(input.action),
    stage: input.stage ?? null,
    stageLabel: stageLabel(input.stage),
    by: input.by ?? null,
    byName: input.byName ?? null,
    to: input.to ?? null,
    toName: input.toName ?? null,
    comment: input.comment?.trim() || null,
    override: input.override === true,
  };
}

/** Best-effort: a missing table (migration not applied yet) never fails the decision itself. */
export async function recordTimeline(
  prisma: FlowPrisma,
  type: FlowRequestType,
  requestId: number,
  entry: {
    action: FlowAction;
    stage?: string | null;
    by?: number | null;
    byName?: string | null;
    to?: number | null;
    toName?: string | null;
    comment?: string | null;
    override?: boolean;
  },
): Promise<void> {
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO hr_request_timeline
        (request_type, request_id, action, stage, actor_user_id, actor_name, to_user_id, to_user_name, comment, override, created_at)
      VALUES (${type}, ${requestId}, ${entry.action}, ${entry.stage ?? null}, ${entry.by ?? null},
              ${entry.byName?.slice(0, 100) ?? null}, ${entry.to ?? null}, ${entry.toName?.slice(0, 100) ?? null},
              ${entry.comment?.trim().slice(0, 1000) || null}, ${entry.override ? 1 : 0}, NOW())`);
  } catch (error) {
    logger.warn(`timeline ${type}#${requestId} not stored: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function loadTimeline(prisma: FlowPrisma, type: FlowRequestType, requestId: number): Promise<TimelineEntry[]> {
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT action, stage, actor_user_id, actor_name, to_user_id, to_user_name, comment, override, created_at
        FROM hr_request_timeline
       WHERE request_type = ${type} AND request_id = ${requestId}
       ORDER BY id ASC`);
    return (rows ?? []).map((r) =>
      timelineEntry({
        at: r.created_at as Date | string,
        action: String(r.action),
        stage: (r.stage as string | null) ?? null,
        by: num(r.actor_user_id),
        byName: (r.actor_name as string | null) ?? null,
        to: num(r.to_user_id),
        toName: (r.to_user_name as string | null) ?? null,
        comment: (r.comment as string | null) ?? null,
        override: Number(r.override ?? 0) === 1,
      }),
    );
  } catch {
    return [];
  }
}

/**
 * New requests write a full timeline (starting with `submit`). Requests filed before it existed
 * show their legacy history up to the first timeline day, then the timeline.
 */
export function mergeTimeline(legacy: TimelineEntry[], timeline: TimelineEntry[]): TimelineEntry[] {
  if (!timeline.length) return legacy;
  if (timeline.some((t) => t.action === 'submit')) return timeline;
  const firstDay = timeline[0].at.slice(0, 10);
  return [...legacy.filter((l) => l.at.slice(0, 10) < firstDay), ...timeline];
}

function mapReturn(r: Record<string, unknown>): ReturnInfo {
  return {
    id: Number(r.id),
    stage: String(r.stage),
    stageLabel: stageLabel(String(r.stage)),
    comment: String(r.comment ?? ''),
    returnedBy: num(r.returned_by),
    returnedByName: (r.returned_by_name as string | null) ?? null,
    returnedTo: num(r.returned_to_user_id),
    at: r.created_at != null ? iso(r.created_at) : null,
  };
}

/** Open returns of many rows at once (list pages). Missing table → none. */
export async function openReturnsFor(
  prisma: FlowPrisma,
  type: FlowRequestType,
  ids: number[],
): Promise<Map<number, ReturnInfo>> {
  const out = new Map<number, ReturnInfo>();
  if (!ids.length) return out;
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT id, request_id, stage, returned_by, returned_by_name, returned_to_user_id, comment, created_at
        FROM hr_request_returns
       WHERE request_type = ${type} AND status = 'open' AND request_id IN (${Prisma.join(ids)})
       ORDER BY id ASC`);
    for (const r of rows ?? []) out.set(Number(r.request_id), mapReturn(r));
  } catch {
    // migration not applied yet
  }
  return out;
}

export async function openReturn(prisma: FlowPrisma, type: FlowRequestType, requestId: number): Promise<ReturnInfo | null> {
  return (await openReturnsFor(prisma, type, [requestId])).get(requestId) ?? null;
}

/** Ids of every open return of a type (HR inbox "مرتجع" filter). */
export async function openReturnIds(prisma: FlowPrisma, type: FlowRequestType): Promise<Map<number, ReturnInfo>> {
  const out = new Map<number, ReturnInfo>();
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT id, request_id, stage, returned_by, returned_by_name, returned_to_user_id, comment, created_at
        FROM hr_request_returns WHERE request_type = ${type} AND status = 'open'`);
    for (const r of rows ?? []) out.set(Number(r.request_id), mapReturn(r));
  } catch {
    // migration not applied yet
  }
  return out;
}

/** Opens a return. Unlike the timeline this must persist, or the request would look pending. */
export async function createReturn(
  prisma: FlowPrisma,
  input: {
    type: FlowRequestType;
    requestId: number;
    stage: string;
    by: number | null;
    byName: string | null;
    to: number | null;
    comment: string;
  },
): Promise<void> {
  try {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE hr_request_returns SET status = 'closed', resolved_at = NOW()
       WHERE request_type = ${input.type} AND request_id = ${input.requestId} AND status = 'open'`);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO hr_request_returns
        (request_type, request_id, stage, returned_by, returned_by_name, returned_to_user_id, comment, status, created_at)
      VALUES (${input.type}, ${input.requestId}, ${input.stage}, ${input.by}, ${input.byName?.slice(0, 100) ?? null},
              ${input.to}, ${input.comment.slice(0, 1000)}, 'open', NOW())`);
  } catch (error) {
    logger.error(`return ${input.type}#${input.requestId} failed: ${error instanceof Error ? error.message : String(error)}`);
    throw new BadRequestException('تعذر إرجاع الطلب: قاعدة البيانات تحتاج تحديث (hr_request_returns)');
  }
}

export async function resolveReturn(
  prisma: FlowPrisma,
  type: FlowRequestType,
  requestId: number,
  status: 'resubmitted' | 'closed',
): Promise<void> {
  try {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE hr_request_returns SET status = ${status}, resolved_at = NOW()
       WHERE request_type = ${type} AND request_id = ${requestId} AND status = 'open'`);
  } catch {
    // migration not applied yet: nothing was ever opened
  }
}

/** A return needs a comment the requester can act on. */
export function requireReturnComment(comment: string | null | undefined): string {
  const text = String(comment ?? '').trim();
  if (text.length < 3) throw new BadRequestException('اكتب سبب الإرجاع للتعديل (تعليق للمقدم)');
  return text.slice(0, 1000);
}

/** A legacy history row (hr_all_agzat_history / hr_all_ozonat_history) as a timeline entry. */
export function legacyHistoryEntry(input: {
  date: string | null | undefined;
  fromUser: number | null | undefined;
  fromName: string | null | undefined;
  toUser: number | null | undefined;
  toName: string | null | undefined;
  msg: string | null | undefined;
  reasonAction: string | null | undefined;
}): TimelineEntry {
  const msg = input.msg ?? '';
  const reason = input.reasonAction ?? '';
  const stage = /^approve_/.test(reason) ? reason : reason.startsWith('skip_') ? reason.slice(5) : null;
  const action: FlowAction =
    reason === 'send_to_direct_manager' || msg.startsWith('تحويل')
      ? 'submit'
      : msg.includes('إرجاع')
        ? 'return'
        : msg.includes('إعادة إرسال')
          ? 'resubmit'
          : msg.includes('رفض')
            ? 'reject'
            : msg.includes('إلغاء') || reason === 'cancel'
              ? 'cancel'
              : msg.startsWith('تخطي')
                ? 'skip'
                : 'accept';
  const entry = timelineEntry({
    at: input.date ?? null,
    action,
    stage,
    by: input.fromUser || null,
    byName: input.fromName ?? null,
    to: input.toUser || null,
    toName: input.toName ?? null,
    comment: msg && msg !== FLOW_ACTION_LABEL_AR[action] ? msg : null,
  });
  return entry;
}
