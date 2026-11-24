import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { EmployeeType } from '../../common/constants/hr-codes';
import { JwtUser } from '../../common/types/jwt-user';
import {
  businessMidnightEpoch,
  businessNowMinutes,
  legacyBusinessIsoDate,
  legacyDateMatchValues,
  todayIso,
} from '../../common/utils/legacy-date.util';
import { managerKind, managerSection } from '../../common/utils/manager-scope.util';
import { SuspendStatus } from '../../common/utils/suspend-status.util';
import { finalApprovalSuspendFilter, isFinallyApproved } from '../payroll/leave-approval.util';
import { matchRowsToSlots } from '../payroll/payroll-attendance.util';
import { HrPayrollSettingsService } from '../hr-payroll-settings/hr-payroll-settings.service';
import { ListAttendanceExceptionsDto, ResolveAttendanceExceptionDto } from './dto/attendance-exceptions.dto';
import {
  CaseType,
  ResolutionIndex,
  ResolutionRecord,
  loadResolutions,
} from './resolutions.repo';
import {
  ARABIC_WEEKDAYS,
  ScheduleEmployee,
  ScheduleResolver,
  ScheduledSlot,
  ShiftTimes,
  SlotSource,
  eachIsoDay,
  minutesToLegacyTime,
  shiftNominalMinutes,
  timeToMinutes,
  utcWeekday,
} from './scheduled-shifts.util';

/** Longest catch-up range one request may scan. */
export const MAX_RANGE_DAYS = 31;

/** A case still open this many days after its date is «قديم مفتوح» (red banner, HR escalation). */
export const STALE_AFTER_DAYS = 2;

/** How far back the pending summary, the banner and the reminders look for open cases. */
export const PENDING_LOOKBACK_DAYS = 14;

/** Per-user cache of GET /attendance/exceptions/pending-summary. */
const SUMMARY_TTL_MS = 60_000;

export type StaffSection = 'male' | 'female';

/** employees.emp_type: 0/1 رجالي, 2 حريمي, 3 (or anything else) = both sections. */
export function staffSection(empType: number | null | undefined): StaffSection | null {
  if (empType === 0 || empType === 1) return 'male';
  if (empType === 2) return 'female';
  return null;
}

/** Open for more than STALE_AFTER_DAYS: the case's day is at least that many days before today. */
export function isStaleDate(date: string, today: string): boolean {
  return daysBetween(date, today) >= STALE_AFTER_DAYS;
}

/** ISO day `days` before `iso`. */
export function shiftIsoDate(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

/** A case belongs to a scope by the branch it was worked in or the employee's home branch. */
export function caseInScope(
  item: Pick<AttendanceExceptionItem, 'branchId' | 'homeBranchId' | 'section'>,
  branches: number[] | null,
  section: StaffSection | null,
): boolean {
  if (section && item.section && item.section !== section) return false;
  if (!branches) return true;
  return (item.branchId != null && branches.includes(item.branchId))
    || (item.homeBranchId != null && branches.includes(item.homeBranchId));
}

export interface PendingSummary {
  /** Open (undecided) cases in the caller's scope since `since`. */
  open: number;
  /** Of which open for STALE_AFTER_DAYS days or more. */
  stale: number;
  oldestOpenDate: string | null;
  since: string;
  staleAfterDays: number;
  branches: Array<{ branchId: number | null; branchName: string | null; open: number; stale: number }>;
}

/** Order used to pick the case type a resolution is filed under. */
const CASE_PRIORITY: CaseType[] = ['no_punch', 'missing_checkin', 'missing_checkout', 'late', 'early_leave'];

export interface AttendanceExceptionItem {
  key: string;
  empCode: number;
  empId: number;
  employeeName: string;
  jobTitle: string | null;
  branchId: number | null;
  branchName: string | null;
  /** The employee's own branch (employees.branch_id_fk); differs from branchId for a visiting shift. */
  homeBranchId: number | null;
  /** Staff section from employees.emp_type; null = both. */
  section: StaffSection | null;
  date: string;
  weekday: string;
  shiftId: number | null;
  shiftTitle: string | null;
  source: SlotSource;
  expectedIn: string | null;
  expectedOut: string | null;
  checkIn: string | null;
  checkOut: string | null;
  lateMin: number;
  earlyLeaveMin: number;
  /** Minutes behind the main case: late / early-leave minutes, or the shift length for no_punch. */
  minutes: number;
  caseType: string;
  caseTypes: CaseType[];
  attendanceId: number | null;
  /** A leave for the day approved by the direct manager but not yet finally approved. */
  pendingLeave: boolean;
  resolution: ResolutionRecord | null;
}

type AttendanceRow = {
  hodoor_id: number;
  member_code: number | null;
  action_date: string | null;
  action_date_s: string | null;
  hdoor_time: string | null;
  ensraf_time: string | null;
  late_min: number | null;
  mobaker_min: number | null;
  dwam_id_fk: number;
  sheft_type: number;
  branch_id_fk: number;
  tasgel_type: string | null;
};

type EmployeeRow = {
  id: number;
  emp_code: number | null;
  employee: string | null;
  mosma_wazefy_n: string | null;
  branch_id_fk: number | null;
  emp_type?: number | null;
};

function rowDate(row: { action_date: string | null; action_date_s: string | null }): string {
  const direct = row.action_date?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  return legacyBusinessIsoDate(row.action_date_s)?.slice(0, 10) ?? '';
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function permissionDate(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{8,10}$/.test(s)) return legacyBusinessIsoDate(s)?.slice(0, 10) ?? null;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : null;
}

/**
 * «الحالات اليومية»: every abnormal attendance case of a branch for a day (or a catch-up range),
 * and the manager's decision on each one. Decisions feed payroll (PayrollEngineService) and a
 * `present` decision back-fills the missing attendance row with the manager's approximate times.
 */
@Injectable()
export class AttendanceExceptionsService {
  /** Env fallback (PAYROLL_DEFAULT_OFF_DAY) when the settings service is not wired (specs). */
  private readonly envDefaultOffDay: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: BranchScopeService,
    config?: ConfigService,
    /** «إعدادات الحضور والمرتبات»: default weekly off day and the tracking start date. */
    @Optional() private readonly hrSettings?: HrPayrollSettingsService,
  ) {
    this.envDefaultOffDay = config?.get<string>('payroll.defaultOffDay') ?? 'Friday';
  }

  /** Default off day + tracking start, read at request time (cached ~60 s by the settings service). */
  private async rules(): Promise<{ defaultOffDay: string; trackingStart: string | null }> {
    try {
      const settings = this.hrSettings ? await this.hrSettings.get() : null;
      return {
        defaultOffDay: settings?.defaultWeeklyOffDay ?? this.envDefaultOffDay,
        trackingStart: settings?.exceptionsTrackingStartDate ?? null,
      };
    } catch {
      return { defaultOffDay: this.envDefaultOffDay, trackingStart: null };
    }
  }

  // ---------------------------------------------------------------------------
  // LIST
  // ---------------------------------------------------------------------------

  async list(q: ListAttendanceExceptionsDto, user: JwtUser, now = new Date()) {
    const today = todayIso(now);
    let from = q.from ?? q.date ?? today;
    let to = q.to ?? q.date ?? from;
    if (to > today) to = today;
    if (from > to) throw new BadRequestException('لا يمكن عرض حالات لتاريخ لم يأتِ بعد');
    if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
      throw new BadRequestException(`الحد الأقصى للفترة ${MAX_RANGE_DAYS} يومًا`);
    }
    // Nothing before the tracking start date («بداية متابعة الحالات») is ever listed.
    const { trackingStart } = await this.rules();
    if (trackingStart && from < trackingStart) from = trackingStart;
    const branches = this.scope.resolveListFilter(user, q.branchId);
    const gender = q.gender ?? this.defaultSection(user) ?? 'all';
    const section = gender === 'all' ? null : gender;
    const [employees, branchOptions] = await Promise.all([
      this.scopedEmployees(branches),
      this.branchOptions(user),
    ]);
    let items = from > to ? [] : await this.computeCases(employees, from, to, branches, now);
    if (section) items = items.filter((item) => caseInScope(item, null, section));
    if (q.status === 'open') items = items.filter((item) => !item.resolution);
    if (q.status === 'stale') items = items.filter((item) => !item.resolution && isStaleDate(item.date, today));
    if (q.status === 'resolved') items = items.filter((item) => item.resolution);

    const byType: Record<CaseType, number> = { no_punch: 0, missing_checkin: 0, missing_checkout: 0, late: 0, early_leave: 0 };
    for (const item of items) for (const type of item.caseTypes) byType[type] += 1;
    return {
      from,
      to,
      trackingStartDate: trackingStart,
      gender,
      staleAfterDays: STALE_AFTER_DAYS,
      branchOptions,
      items,
      counters: {
        total: items.length,
        open: items.filter((item) => !item.resolution).length,
        resolved: items.filter((item) => item.resolution).length,
        byType,
      },
    };
  }

  /** A men/women section manager (مشرف إدارة حريمي / رجالي) opens on their own section. */
  defaultSection(user: JwtUser): StaffSection | null {
    return managerKind(user) === 'section' ? managerSection(user) : null;
  }

  /** Branches the caller may pick: their scope (branch + sub-branches), or every branch. */
  private async branchOptions(user: JwtUser): Promise<Array<{ id: number; name: string | null }>> {
    const allowed = this.scope.allowedBranchIds(user);
    if (allowed && !allowed.length) return [];
    const rows = await this.prisma.tbl_branches.findMany({
      where: allowed ? { branch_id: { in: allowed } } : undefined,
      select: { branch_id: true, branch_name: true },
      orderBy: { branch_id: 'asc' },
    });
    return rows.map((row) => ({ id: row.branch_id, name: row.branch_name }));
  }

  // ---------------------------------------------------------------------------
  // PENDING SUMMARY (banner) / OPEN CASES (reminders)
  // ---------------------------------------------------------------------------

  private readonly summaryCache = new Map<number, { at: number; value: Promise<PendingSummary> }>();

  /**
   * Open cases in the caller's scope over the last PENDING_LOOKBACK_DAYS days, for the banner shown
   * on every page. Cached per user for a minute (and dropped when anyone records a decision).
   */
  async pendingSummary(user: JwtUser, now = new Date()): Promise<PendingSummary> {
    const hit = this.summaryCache.get(user.sub);
    if (hit && now.getTime() - hit.at < SUMMARY_TTL_MS) return hit.value;
    const value = this.computePendingSummary(user, now);
    this.summaryCache.set(user.sub, { at: now.getTime(), value });
    value.catch(() => this.summaryCache.delete(user.sub));
    if (this.summaryCache.size > 1000) {
      const oldest = this.summaryCache.keys().next().value;
      if (oldest !== undefined) this.summaryCache.delete(oldest);
    }
    return value;
  }

  private async computePendingSummary(user: JwtUser, now: Date): Promise<PendingSummary> {
    const today = todayIso(now);
    const since = shiftIsoDate(today, PENDING_LOOKBACK_DAYS - 1);
    const branches = this.scope.allowedBranchIds(user);
    const items = branches && !branches.length ? [] : await this.openCases(branches, since, today, now);
    return summarize(items.filter((item) => caseInScope(item, branches, this.defaultSection(user))), since, today);
  }

  /** Open (undecided) cases over [from, to] for the branches (null = all). */
  async openCases(branches: number[] | null, from: string, to: string, now = new Date()): Promise<AttendanceExceptionItem[]> {
    // Banner, reminders and escalations never see cases before the tracking start date.
    const { trackingStart } = await this.rules();
    if (trackingStart && from < trackingStart) from = trackingStart;
    if (from > to) return [];
    const employees = await this.scopedEmployees(branches);
    const items = await this.computeCases(employees, from, to, branches, now);
    return items.filter((item) => !item.resolution);
  }

  /** Leave types (holiday_setting rows that are not official holidays) for the resolve dialog. */
  async leaveTypes() {
    const rows = await this.prisma.holiday_setting.findMany({
      where: { OR: [{ active: 'yes' }, { active: null }], NOT: { agaza_ttype: 1 } },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  /** Active employees in scope; with weekly schedules also those with a shift slot in the branch. */
  private async scopedEmployees(branches: number[] | null): Promise<EmployeeRow[]> {
    const select = { id: true, emp_code: true, employee: true, mosma_wazefy_n: true, branch_id_fk: true, emp_type: true } as const;
    const base: Prisma.employeesWhereInput = {
      employee_type: EmployeeType.ACTIVE,
      OR: [{ leave_emp: null }, { leave_emp: 0 }],
      emp_code: { not: null },
    };
    if (!branches) {
      return this.prisma.employees.findMany({ where: base, select, orderBy: [{ employee: 'asc' }] });
    }
    const visiting: number[] = [];
    const settings = await this.prisma.attendance_weekly_schedule_settings.findUnique({ where: { id: 1 } });
    if (settings?.enabled) {
      const slots = await this.prisma.employee_weekly_schedule_slots.findMany({
        where: { branch_id: { in: branches }, shift_id: { not: null }, schedule: { status: 'active' } },
        select: { schedule: { select: { employee_id: true } } },
      });
      visiting.push(...new Set(slots.map((slot) => slot.schedule.employee_id)));
    }
    return this.prisma.employees.findMany({
      where: {
        AND: [
          base,
          { OR: [{ branch_id_fk: { in: branches } }, ...(visiting.length ? [{ id: { in: visiting } }] : [])] },
        ],
      },
      select,
      orderBy: [{ employee: 'asc' }],
    });
  }

  /**
   * Cases for the employees over [from, to] (both ≤ today). `branches` (null = all) limits the
   * cases to slots worked in, or employees belonging to, those branches.
   */
  async computeCases(
    employeeRows: EmployeeRow[],
    from: string,
    to: string,
    branches: number[] | null,
    now = new Date(),
  ): Promise<AttendanceExceptionItem[]> {
    const employees = employeeRows.filter((employee): employee is EmployeeRow & { emp_code: number } => employee.emp_code != null);
    if (!employees.length) return [];
    const codes = employees.map((employee) => employee.emp_code);
    const dates = [...eachIsoDay(from, to)];
    const today = todayIso(now);
    const nowMinutes = businessNowMinutes(now);

    const scheduleEmployees: ScheduleEmployee[] = employees.map((employee) => ({
      id: employee.id,
      emp_code: employee.emp_code,
      branch_id_fk: employee.branch_id_fk,
    }));
    const { defaultOffDay } = await this.rules();
    const [schedule, rows, holidays, leaves, permissions, resolutionList] = await Promise.all([
      ScheduleResolver.load(this.prisma, scheduleEmployees, from, to, { defaultOffDay, includeSpecial: true }),
      this.prisma.tbl_hdoor_emps.findMany({
        where: {
          member_code: { in: codes },
          OR: [
            { action_date: { in: dates } },
            { action_date_s: { in: dates.flatMap((date) => legacyDateMatchValues(date)) } },
          ],
        },
        select: {
          hodoor_id: true, member_code: true, action_date: true, action_date_s: true, hdoor_time: true,
          ensraf_time: true, late_min: true, mobaker_min: true, dwam_id_fk: true, sheft_type: true,
          branch_id_fk: true, tasgel_type: true,
        },
        orderBy: { hodoor_id: 'asc' },
      }) as Promise<AttendanceRow[]>,
      this.prisma.holiday_setting.findMany({
        where: { active: 'yes', agaza_ttype: 1, date_from: { lte: to }, date_to: { gte: from } },
        select: { date_from: true, date_to: true },
      }),
      this.prisma.hr_all_agzat_orders.findMany({
        where: {
          emp_code_fk: { in: codes.map((code) => BigInt(code)) },
          suspend: { in: [SuspendStatus.APPROVED_L1, ...finalApprovalSuspendFilter().in] },
          agaza_from_date_m: { lte: to },
          agaza_to_date_m: { gte: from },
        },
        select: { emp_code_fk: true, suspend: true, agaza_from_date_m: true, agaza_to_date_m: true },
      }),
      this.prisma.hr_all_ozonat_orders.findMany({
        where: {
          emp_code_fk: { in: codes },
          suspend: finalApprovalSuspendFilter(),
          OR: [
            { ezn_date: { gte: from, lte: to } },
            { ezn_date_ar: { gte: from, lte: to } },
            { ezn_date: { in: dates.map((d) => d.split('-').reverse().join('/')) } },
          ],
        },
        select: { emp_code_fk: true, ezn_date: true, ezn_date_ar: true },
      }),
      loadResolutions(this.prisma, codes, from, to),
    ]);

    const holidayDates = new Set<string>();
    for (const holiday of holidays) {
      if (!holiday.date_from || !holiday.date_to) continue;
      for (const day of eachIsoDay(holiday.date_from.slice(0, 10), holiday.date_to.slice(0, 10))) holidayDates.add(day);
    }
    const finalLeave = new Set<string>();
    const pendingLeave = new Set<string>();
    for (const leave of leaves) {
      if (leave.emp_code_fk == null || !leave.agaza_from_date_m || !leave.agaza_to_date_m) continue;
      const target = isFinallyApproved(leave.suspend) ? finalLeave : pendingLeave;
      for (const day of eachIsoDay(leave.agaza_from_date_m.slice(0, 10), leave.agaza_to_date_m.slice(0, 10))) {
        if (day >= from && day <= to) target.add(`${Number(leave.emp_code_fk)}|${day}`);
      }
    }
    const permissionDays = new Set<string>();
    for (const permission of permissions) {
      const day = permissionDate(permission.ezn_date_ar) ?? permissionDate(permission.ezn_date);
      if (day && permission.emp_code_fk != null) permissionDays.add(`${permission.emp_code_fk}|${day}`);
    }
    const rowsByKey = new Map<string, AttendanceRow[]>();
    for (const row of rows) {
      const day = rowDate(row);
      if (!day || row.member_code == null) continue;
      const key = `${row.member_code}|${day}`;
      const list = rowsByKey.get(key) ?? [];
      list.push(row);
      rowsByKey.set(key, list);
    }
    const resolutionsByEmp = new Map<number, ResolutionRecord[]>();
    for (const record of resolutionList) {
      const list = resolutionsByEmp.get(record.empCode) ?? [];
      list.push(record);
      resolutionsByEmp.set(record.empCode, list);
    }
    const branchRows = await this.prisma.tbl_branches.findMany({ select: { branch_id: true, branch_name: true } });
    const branchName = new Map(branchRows.map((branch) => [branch.branch_id, branch.branch_name]));

    // Minutes elapsed since the start of `date` (business clock); used to wait for windows to close.
    const elapsedSince = (date: string) => daysBetween(date, today) * 1440 + nowMinutes;
    const windowClosed = (date: string, shift: ShiftTimes | null, field: 'hdoor_to_time' | 'ensraf_to_time') => {
      if (date < today && daysBetween(date, today) > 1) return true;
      if (!shift) return date < today;
      const start = timeToMinutes(shift.hdoor_from_time);
      const end = timeToMinutes(shift[field]);
      if (start == null || end == null) return date < today;
      const absoluteEnd = end < start ? end + 1440 : end;
      return elapsedSince(date) > absoluteEnd;
    };

    const items: AttendanceExceptionItem[] = [];
    for (const employee of employees) {
      const resolutions = new ResolutionIndex(resolutionsByEmp.get(employee.emp_code) ?? []);
      for (const date of dates) {
        const empDay = `${employee.emp_code}|${date}`;
        if (holidayDates.has(date) || finalLeave.has(empDay)) continue;
        const day = schedule.day(employee.emp_code, date);
        const dayRows = rowsByKey.get(empDay) ?? [];
        if (day.offDay && !dayRows.length) continue;
        const { matches, unmatched } = matchRowsToSlots(day.slots, dayRows);
        const entries: Array<{ slot: ScheduledSlot; rows: AttendanceRow[] }> = [
          ...matches,
          // Rows recorded under a shift that is not scheduled today (extra / changed schedule).
          ...unmatched.map((row) => ({
            slot: { shiftId: row.dwam_id_fk, branchId: row.branch_id_fk || employee.branch_id_fk, source: 'extra' as const, shift: schedule.shift(row.dwam_id_fk), share: 0 },
            rows: [row],
          })),
        ];
        const singleSlot = day.slots.length <= 1;
        for (const { slot, rows: slotRows } of entries) {
          const shift = slot.shift ?? schedule.shift(slot.shiftId);
          const hasIn = slotRows.some((row) => Boolean(row.hdoor_time?.trim()));
          const hasOut = slotRows.some((row) => Boolean(row.ensraf_time?.trim()));
          const lateMin = Math.max(0, ...slotRows.map((row) => Math.round(row.late_min ?? 0)));
          const earlyLeaveMin = Math.max(0, ...slotRows.map((row) => Math.round(row.mobaker_min ?? 0)));
          const permitted = permissionDays.has(empDay);
          const caseTypes: CaseType[] = [];
          if (!hasIn && !hasOut) {
            if (windowClosed(date, shift, 'hdoor_to_time')) caseTypes.push('no_punch');
          } else if (hasIn && !hasOut) {
            if (windowClosed(date, shift, 'ensraf_to_time')) caseTypes.push('missing_checkout');
          } else if (!hasIn && hasOut) {
            caseTypes.push('missing_checkin');
          }
          if (lateMin > 0 && !permitted) caseTypes.push('late');
          if (earlyLeaveMin > 0 && !permitted) caseTypes.push('early_leave');

          const resolution = (singleSlot ? resolutions.forDay(date, slot.shiftId) : resolutions.forSlot(date, slot.shiftId)) ?? null;
          if (!caseTypes.length && !resolution) continue;
          const inScope = !branches
            || (employee.branch_id_fk != null && branches.includes(employee.branch_id_fk))
            || (slot.branchId != null && branches.includes(slot.branchId));
          if (!inScope) continue;
          const primary = CASE_PRIORITY.find((type) => caseTypes.includes(type));
          const branchId = slot.branchId ?? employee.branch_id_fk;
          const shiftMinutes = shiftNominalMinutes(shift) ?? 0;
          items.push({
            key: `${employee.emp_code}|${date}|${slot.shiftId ?? 0}`,
            empCode: employee.emp_code,
            empId: employee.id,
            employeeName: employee.employee ?? '—',
            jobTitle: employee.mosma_wazefy_n,
            branchId,
            branchName: branchId != null ? branchName.get(branchId) ?? null : null,
            homeBranchId: employee.branch_id_fk,
            section: staffSection(employee.emp_type),
            date,
            weekday: ARABIC_WEEKDAYS[utcWeekday(date)],
            shiftId: slot.shiftId ?? null,
            shiftTitle: shift?.title ?? null,
            source: slot.source,
            expectedIn: shift?.hdoor_from_time ?? null,
            expectedOut: shift?.ensraf_khasm_from ?? null,
            checkIn: slotRows.find((row) => row.hdoor_time)?.hdoor_time ?? null,
            checkOut: slotRows.find((row) => row.ensraf_time)?.ensraf_time ?? null,
            lateMin,
            earlyLeaveMin,
            minutes: primary === 'late' ? lateMin : primary === 'early_leave' ? earlyLeaveMin : primary === 'no_punch' ? shiftMinutes : 0,
            caseType: primary ?? resolution?.caseType ?? 'no_punch',
            caseTypes,
            attendanceId: slotRows[0]?.hodoor_id ?? null,
            pendingLeave: pendingLeave.has(empDay),
            resolution,
          });
        }
      }
    }
    return items.sort((a, b) =>
      a.date === b.date
        ? (a.resolution ? 1 : 0) - (b.resolution ? 1 : 0) || a.employeeName.localeCompare(b.employeeName, 'ar')
        : a.date < b.date ? 1 : -1,
    );
  }

  // ---------------------------------------------------------------------------
  // RESOLVE
  // ---------------------------------------------------------------------------

  async resolve(dto: ResolveAttendanceExceptionDto, user: JwtUser, now = new Date()) {
    const today = todayIso(now);
    if (dto.date > today) throw new BadRequestException('لا يمكن اتخاذ قرار لتاريخ لم يأتِ بعد');
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('السبب مطلوب');
    if (dto.decision === 'leave' && !dto.leaveTypeId) throw new BadRequestException('اختر نوع الإجازة');

    const employee = await this.prisma.employees.findFirst({
      where: { emp_code: dto.empCode },
      select: { id: true, emp_code: true, employee: true, mosma_wazefy_n: true, branch_id_fk: true, emp_type: true },
    });
    if (!employee) throw new NotFoundException('الموظف غير موجود');

    const cases = await this.computeCases([employee], dto.date, dto.date, null, now);
    let target: AttendanceExceptionItem | undefined;
    if (dto.shiftId) target = cases.find((item) => item.shiftId === dto.shiftId);
    else if (cases.length === 1) target = cases[0];
    else if (cases.length > 1) throw new BadRequestException('للموظف أكثر من وردية في هذا اليوم، حدد الوردية');
    if (!target) throw new NotFoundException('لا توجد حالة لهذا الموظف في هذا التاريخ');

    const allowed = this.scope.allowedBranchIds(user);
    if (
      allowed !== null
      && !(employee.branch_id_fk != null && allowed.includes(employee.branch_id_fk))
      && !(target.branchId != null && allowed.includes(target.branchId))
    ) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }

    // present: the missing side(s) need the manager's approximate times.
    let checkInMin: number | null = null;
    let checkOutMin: number | null = null;
    if (dto.decision === 'present') {
      const needsIn = target.caseTypes.includes('no_punch') || target.caseTypes.includes('missing_checkin');
      const needsOut = target.caseTypes.includes('no_punch') || target.caseTypes.includes('missing_checkout');
      checkInMin = timeToMinutes(dto.checkIn);
      checkOutMin = timeToMinutes(dto.checkOut);
      if (needsIn && checkInMin == null) throw new BadRequestException('أدخل وقت الحضور التقريبي');
      if (needsOut && checkOutMin == null) throw new BadRequestException('أدخل وقت الانصراف التقريبي');
      if (!needsIn) checkInMin = null;
      if (!needsOut) checkOutMin = null;
    }

    const shiftKey = target.shiftId ?? 0;
    const caseType = target.caseTypes.length ? target.caseType : target.resolution?.caseType ?? target.caseType;
    const result = await this.prisma.$transaction(async (tx) => {
      const previous = (await loadResolutions(tx, [employee.emp_code as number], dto.date, dto.date))
        .find((record) => (record.shiftId ?? 0) === shiftKey);

      let attendanceId: number | null = previous?.attendanceId ?? null;
      let createdRow = previous?.createdRow ?? false;
      if (dto.decision === 'present' && (checkInMin != null || checkOutMin != null)) {
        const written = await this.writeAttendance(tx, target!, employee, checkInMin, checkOutMin, user.sub);
        attendanceId = written.id;
        createdRow = createdRow || written.created;
      } else if (dto.decision !== 'present' && previous?.createdRow && previous.attendanceId) {
        // The manager changed a "present" decision: drop the row that decision back-filled.
        await tx.tbl_hdoor_emps.deleteMany({ where: { hodoor_id: previous.attendanceId, tasgel_type: 'manual' } });
        attendanceId = null;
        createdRow = false;
      }

      const checkIn = checkInMin != null ? minutesToLegacyTime(checkInMin) : null;
      const checkOut = checkOutMin != null ? minutesToLegacyTime(checkOutMin) : null;
      const leaveTypeId = dto.decision === 'leave' ? dto.leaveTypeId ?? null : null;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO hr_attendance_exception_resolutions
          (emp_code, work_date, shift_id, branch_id, case_type, decision, check_in, check_out, leave_type_id,
           reason, attendance_id, created_row, resolved_by, resolved_by_name, resolved_at)
        VALUES
          (${employee.emp_code}, ${dto.date}, ${shiftKey}, ${target!.branchId}, ${caseType}, ${dto.decision},
           ${checkIn}, ${checkOut}, ${leaveTypeId}, ${reason}, ${attendanceId}, ${createdRow ? 1 : 0},
           ${user.sub}, ${user.name ?? null}, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          branch_id = VALUES(branch_id), case_type = VALUES(case_type), decision = VALUES(decision),
          check_in = VALUES(check_in), check_out = VALUES(check_out), leave_type_id = VALUES(leave_type_id),
          reason = VALUES(reason), attendance_id = VALUES(attendance_id), created_row = VALUES(created_row),
          resolved_by = VALUES(resolved_by), resolved_by_name = VALUES(resolved_by_name), resolved_at = CURRENT_TIMESTAMP
      `);
      const saved = await loadResolutions(tx, [employee.emp_code as number], dto.date, dto.date);
      return saved.find((record) => (record.shiftId ?? 0) === shiftKey) ?? null;
    });
    // Banners of everyone who sees this case refresh on their next poll.
    this.summaryCache.clear();
    return { ok: true, resolution: result };
  }

  /**
   * Back-dated fix for `present`: complete the slot's attendance row, or create one, with the
   * manager's approximate times. Recorded as a manual entry (tasgel_type = 'manual', the manager as
   * recorder) with no late / early / overtime minutes — the times are estimates the manager vouches for.
   */
  private async writeAttendance(
    tx: Prisma.TransactionClient,
    target: AttendanceExceptionItem,
    employee: { id: number; emp_code: number | null; branch_id_fk: number | null },
    checkInMin: number | null,
    checkOutMin: number | null,
    userId: number,
  ): Promise<{ id: number; created: boolean }> {
    const expectedIn = timeToMinutes(target.expectedIn);
    const expectedOut = timeToMinutes(target.expectedOut);
    const checkIn = checkInMin != null ? minutesToLegacyTime(checkInMin) : null;
    const checkOut = checkOutMin != null ? minutesToLegacyTime(checkOutMin) : null;
    const existing = target.attendanceId
      ? await tx.tbl_hdoor_emps.findUnique({ where: { hodoor_id: target.attendanceId } })
      : null;
    if (existing) {
      const data: Prisma.tbl_hdoor_empsUpdateInput = { tasgel_type: 'manual' };
      if (checkIn && !existing.hdoor_time) {
        Object.assign(data, {
          hdoor_time: checkIn,
          dwam_hdoor_time: expectedIn != null ? minutesToLegacyTime(expectedIn) : existing.dwam_hdoor_time,
          late_min: 0,
          hdoor_user_id: userId,
        });
      }
      if (checkOut && !existing.ensraf_time) {
        Object.assign(data, {
          ensraf_time: checkOut,
          dwam_ensraf_time: expectedOut != null ? minutesToLegacyTime(expectedOut) : existing.dwam_ensraf_time,
          mobaker_min: 0,
          num_min: 0,
          ensraf_user_id: userId,
          ttype: 'ensraf',
        });
      }
      await tx.tbl_hdoor_emps.update({ where: { hodoor_id: existing.hodoor_id }, data });
      return { id: existing.hodoor_id, created: false };
    }
    const created = await tx.tbl_hdoor_emps.create({
      data: {
        member_code: employee.emp_code,
        member_id: employee.id,
        action_date_s: String(businessMidnightEpoch(target.date)),
        action_date: target.date,
        for_month: Number(target.date.slice(5, 7)),
        for_year: Number(target.date.slice(0, 4)),
        sheft_type: target.source === 'replacement' ? 1 : target.source === 'extra' ? 2 : 0,
        branch_id_fk: target.branchId ?? employee.branch_id_fk ?? 0,
        dwam_id_fk: target.shiftId ?? 0,
        tasgel_type: 'manual',
        hdoor_time: checkIn,
        dwam_hdoor_time: expectedIn != null ? minutesToLegacyTime(expectedIn) : null,
        late_min: 0,
        hdoor_user_id: checkIn ? userId : null,
        ensraf_time: checkOut,
        dwam_ensraf_time: expectedOut != null ? minutesToLegacyTime(expectedOut) : null,
        mobaker_min: 0,
        num_min: 0,
        ensraf_user_id: checkOut ? userId : null,
        ttype: checkOut ? 'ensraf' : 'hdoor',
      },
    });
    return { id: created.hodoor_id, created: true };
  }
}

/** Banner / reminder counts from a list of open cases. */
export function summarize(items: AttendanceExceptionItem[], since: string, today: string): PendingSummary {
  const byBranch = new Map<number | null, PendingSummary['branches'][number]>();
  let stale = 0;
  let oldest: string | null = null;
  for (const item of items) {
    const old = isStaleDate(item.date, today);
    if (old) stale += 1;
    if (!oldest || item.date < oldest) oldest = item.date;
    const row = byBranch.get(item.branchId) ?? { branchId: item.branchId, branchName: item.branchName, open: 0, stale: 0 };
    row.open += 1;
    if (old) row.stale += 1;
    byBranch.set(item.branchId, row);
  }
  return {
    open: items.length,
    stale,
    oldestOpenDate: oldest,
    since,
    staleAfterDays: STALE_AFTER_DAYS,
    branches: [...byBranch.values()].sort((a, b) => b.open - a.open),
  };
}
