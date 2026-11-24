import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * hr_attendance_exception_resolutions is a NEW table: production runs a hand-patched Prisma Client
 * that never regenerates, so every read/write here is raw SQL (see attendance-device-agent.service).
 * shift_id 0 = "the whole day" (MySQL unique keys ignore NULLs, so 0 is stored instead of NULL).
 */

export const RESOLUTION_DECISIONS = ['present', 'absent', 'leave', 'excused', 'permission'] as const;
export type ResolutionDecision = (typeof RESOLUTION_DECISIONS)[number];

export const CASE_TYPES = ['no_punch', 'missing_checkin', 'missing_checkout', 'late', 'early_leave'] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export interface ResolutionRecord {
  id: number;
  empCode: number;
  workDate: string;
  /** null = applies to the whole day */
  shiftId: number | null;
  branchId: number | null;
  caseType: string;
  decision: ResolutionDecision;
  checkIn: string | null;
  checkOut: string | null;
  leaveTypeId: number | null;
  reason: string;
  attendanceId: number | null;
  createdRow: boolean;
  resolvedBy: number | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
}

interface RawResolution {
  id: number | bigint;
  emp_code: number | bigint;
  work_date: string;
  shift_id: number | bigint | null;
  branch_id: number | bigint | null;
  case_type: string;
  decision: string;
  check_in: string | null;
  check_out: string | null;
  leave_type_id: number | bigint | null;
  reason: string;
  attendance_id: number | bigint | null;
  created_row: number | bigint | boolean | null;
  resolved_by: number | bigint | null;
  resolved_by_name: string | null;
  resolved_at: Date | string | null;
}

const num = (value: number | bigint | null | undefined): number | null =>
  value == null ? null : Number(value);

export function mapResolution(row: RawResolution): ResolutionRecord {
  const shift = num(row.shift_id);
  return {
    id: Number(row.id),
    empCode: Number(row.emp_code),
    workDate: String(row.work_date).slice(0, 10),
    shiftId: shift ? shift : null,
    branchId: num(row.branch_id),
    caseType: row.case_type,
    decision: row.decision as ResolutionDecision,
    checkIn: row.check_in,
    checkOut: row.check_out,
    leaveTypeId: num(row.leave_type_id),
    reason: row.reason,
    attendanceId: num(row.attendance_id),
    createdRow: Boolean(Number(row.created_row ?? 0)),
    resolvedBy: num(row.resolved_by),
    resolvedByName: row.resolved_by_name,
    resolvedAt: row.resolved_at instanceof Date ? row.resolved_at.toISOString() : row.resolved_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawDb = { $queryRaw?: (...args: any[]) => Promise<any> };

const logger = new Logger('AttendanceExceptionResolutions');

/**
 * Resolutions for the employees over [from, to]. A database without the migration (or a test double
 * without $queryRaw) yields [] so payroll keeps its pre-resolution behaviour instead of failing.
 */
export async function loadResolutions(
  db: RawDb,
  empCodes: number[],
  from: string,
  to: string,
): Promise<ResolutionRecord[]> {
  if (!empCodes.length || typeof db.$queryRaw !== 'function') return [];
  try {
    const rows: RawResolution[] = await db.$queryRaw(Prisma.sql`
      SELECT id, emp_code, work_date, shift_id, branch_id, case_type, decision, check_in, check_out,
             leave_type_id, reason, attendance_id, created_row, resolved_by, resolved_by_name, resolved_at
      FROM hr_attendance_exception_resolutions
      WHERE emp_code IN (${Prisma.join(empCodes)})
        AND work_date BETWEEN ${from} AND ${to}
    `);
    return (rows ?? []).map(mapResolution);
  } catch (error) {
    logger.warn(`hr_attendance_exception_resolutions unreadable (migration applied?): ${(error as Error).message}`);
    return [];
  }
}

/** Lookup by (date, shift) with a whole-day (shift 0) resolution as fallback. */
export class ResolutionIndex {
  private readonly byKey = new Map<string, ResolutionRecord>();
  private readonly byDate = new Map<string, ResolutionRecord[]>();

  constructor(records: ResolutionRecord[]) {
    for (const record of records) {
      this.byKey.set(`${record.workDate}|${record.shiftId ?? 0}`, record);
      const list = this.byDate.get(record.workDate) ?? [];
      list.push(record);
      this.byDate.set(record.workDate, list);
    }
  }

  forSlot(date: string, shiftId: number | null | undefined): ResolutionRecord | undefined {
    return (shiftId ? this.byKey.get(`${date}|${shiftId}`) : undefined) ?? this.byKey.get(`${date}|0`);
  }

  /** A single-shift day: the slot's own resolution, else whole-day, else the only one recorded. */
  forDay(date: string, shiftId?: number | null): ResolutionRecord | undefined {
    const direct = this.forSlot(date, shiftId);
    if (direct) return direct;
    const list = this.byDate.get(date) ?? [];
    return list.length === 1 ? list[0] : undefined;
  }

  exact(date: string, shiftId: number | null | undefined): ResolutionRecord | undefined {
    return this.byKey.get(`${date}|${shiftId ?? 0}`);
  }
}
