import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { isSystemAdmin } from '../../common/utils/system-admin.util';
import { legacyDateMatchValues, normalizeLegacyInputDate, todayIso } from '../../common/utils/legacy-date.util';
import {
  ChainEmployee,
  HR_JOB_TITLE_CODE,
  Recipient,
  authorizeApprover,
  isHrOfficer,
  requesterUserIds,
  resolveAdmin,
  resolveByJobTitleCode,
  resolveDirectManager,
} from '../../common/hr-approval/approval-chain';
import {
  FLOW_STATUS_LABEL_AR,
  FlowStatus,
  TimelineEntry,
  requireReturnComment,
  timelineEntry,
} from '../../common/hr-approval/request-flow';
import { AttendanceService } from '../attendance/attendance.service';
import { CreateExtraHoursDto, CreateShiftSwapDto } from '../attendance/dto/edafi.dto';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { PushService } from '../push/push.service';
import {
  CreateOvertimeRequestDto,
  ListOvertimeRequestsDto,
  ManagerOvertimeDto,
  OvertimeActionDto,
  ResubmitOvertimeDto,
} from './dto/overtime-request.dto';

/**
 * Overtime requests (طلبات الساعات الإضافية / الشيفتات الإضافية) — hr_overtime_requests.
 *
 * Two sources:
 *   - source 'employee': the employee asks → direct manager → HR (job-title code 44, else admin);
 *   - source 'manager' : a direct manager enters overtime / an extra shift for his team → HR.
 *     It is never recorded nor paid until HR approves. HR / admin entering it themselves is
 *     recorded at once (auto-approved, logged as a request row).
 *
 * Every pending step can accept, reject or RETURN with a comment (status 'returned', back to the
 * person who filed it, who edits and resubmits; it resumes at the step that returned it).
 *
 * On FINAL approval (status 'approved') hours are recorded through
 * AttendanceService.createExtraHours (fingerprint confirmation decides what is paid) and an extra
 * shift through AttendanceService.createShiftSwap (ttype 2).
 *
 * The table is new, so it is read and written with plain SQL (production runs a hand-patched
 * Prisma Client and never regenerates it).
 */

export type OvertimeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'returned';
export type OvertimeStage = 'approve_direct_manager' | 'approve_hr';
export type OvertimeKind = 'hours' | 'shift';
export type OvertimeSource = 'employee' | 'manager';

/** FINAL APPROVAL value for overtime requests (hr_overtime_requests.status). */
export const OVERTIME_FINAL_STATUS: OvertimeStatus = 'approved';

/** Returned by the manager-entry routes when the entry waits for HR. */
export const QUEUED_FOR_HR_MESSAGE = 'اتبعت للـ HR للموافقة';

const STAGE_LABEL: Record<OvertimeStage, string> = {
  approve_direct_manager: 'المدير المباشر',
  approve_hr: 'الموارد البشرية',
};

const STATUS_LABEL: Record<OvertimeStatus, string> = {
  pending: 'قيد الاعتماد',
  approved: 'معتمد',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
  returned: 'مرتجع للتعديل',
};

export interface HistoryEntry {
  at: string;
  by: number | null;
  byName: string | null;
  action: 'submit' | 'accept' | 'reject' | 'skip' | 'cancel' | 'recorded' | 'return' | 'resubmit';
  stage?: OvertimeStage | null;
  note?: string | null;
}

export interface OvertimeRow {
  id: number;
  emp_id_fk: number;
  emp_code_fk: number | null;
  emp_name: string | null;
  branch_id_fk: number | null;
  request_date: string;
  hours: number;
  reason: string | null;
  status: OvertimeStatus;
  stage: OvertimeStage | null;
  approve_direct_manager: string | null;
  approve_hr: string | null;
  direct_manager_user_id: number | null;
  current_to_user_id: number | null;
  current_to_user_name: string | null;
  publisher: number | null;
  publisher_name: string | null;
  decided_by: number | null;
  decision_reason: string | null;
  extra_hours_id: number | null;
  extra_hours_message: string | null;
  history: string | null;
  created_at: Date | string | null;
  /** Columns of migration 20261125110000_hr_request_flow (absent before it is applied). */
  source?: OvertimeSource | null;
  kind?: OvertimeKind | null;
  shift_id?: number | null;
  returned_stage?: OvertimeStage | null;
  return_comment?: string | null;
}

const EMP_SELECT = {
  id: true,
  emp_code: true,
  employee: true,
  manger: true,
  emp_type: true,
  edara_id: true,
  branch_id_fk: true,
} as const;

type EmpRow = {
  id: number;
  emp_code: number | null;
  employee: string | null;
  manger: string | null;
  emp_type: number | null;
  edara_id: number | null;
  branch_id_fk: number | null;
};

function nowIso() {
  return new Date().toISOString();
}

function errorText(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'string') return body;
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join('، ');
    if (typeof message === 'string') return message;
  }
  return error instanceof Error ? error.message : 'خطأ غير معروف';
}

function hoursText(hours: number): string {
  if (hours === 1) return 'ساعة واحدة';
  if (hours === 2) return 'ساعتين';
  if (hours <= 10) return `${hours} ساعات`;
  return `${hours} ساعة`;
}

@Injectable()
export class OvertimeRequestsService {
  private readonly logger = new Logger(OvertimeRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly scope: BranchScopeService = new BranchScopeService(),
    @Optional() private readonly push?: PushService,
    @Optional() private readonly engine?: PermissionEngineService,
  ) {}

  // ---- reads -----------------------------------------------------------------------------

  private async findRow(id: number): Promise<OvertimeRow> {
    const rows = await this.prisma.$queryRaw<OvertimeRow[]>(
      Prisma.sql`SELECT * FROM hr_overtime_requests WHERE id = ${id} LIMIT 1`,
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('طلب الساعات الإضافية غير موجود');
    return this.normalize(row);
  }

  normalize(row: OvertimeRow): OvertimeRow {
    return {
      ...row,
      id: Number(row.id),
      emp_id_fk: Number(row.emp_id_fk),
      hours: Number(row.hours),
      current_to_user_id: row.current_to_user_id != null ? Number(row.current_to_user_id) : null,
      publisher: row.publisher != null ? Number(row.publisher) : null,
      direct_manager_user_id: row.direct_manager_user_id != null ? Number(row.direct_manager_user_id) : null,
      extra_hours_id: row.extra_hours_id != null ? Number(row.extra_hours_id) : null,
      branch_id_fk: row.branch_id_fk != null ? Number(row.branch_id_fk) : null,
      source: row.source === 'manager' ? 'manager' : 'employee',
      kind: row.kind === 'shift' ? 'shift' : 'hours',
      shift_id: row.shift_id != null ? Number(row.shift_id) : null,
      returned_stage: row.returned_stage ?? null,
      return_comment: row.return_comment ?? null,
    };
  }

  private history(row: OvertimeRow): HistoryEntry[] {
    try {
      const parsed = row.history ? (JSON.parse(row.history) as HistoryEntry[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  flowStatus(row: OvertimeRow): FlowStatus {
    switch (row.status) {
      case 'approved':
        return 'approved';
      case 'rejected':
        return 'rejected';
      case 'cancelled':
        return 'cancelled';
      case 'returned':
        return 'returned';
      default:
        return row.stage === 'approve_direct_manager' ? 'pending_manager' : 'pending_hr';
    }
  }

  private timeline(row: OvertimeRow): TimelineEntry[] {
    return this.history(row).map((h) =>
      timelineEntry({ at: h.at, action: h.action, stage: h.stage ?? null, by: h.by, byName: h.byName, comment: h.note ?? null }),
    );
  }

  map(row: OvertimeRow, userId?: number, opts: { isHr?: boolean } = {}) {
    const flowStatus = this.flowStatus(row);
    const timeline = this.timeline(row);
    const pending = row.status === 'pending';
    const routedToMe = userId != null && row.current_to_user_id === userId;
    const canAction = userId != null && pending && (routedToMe || opts.isHr === true) && row.publisher !== userId;
    return {
      id: row.id,
      empId: row.emp_id_fk,
      employeeName: row.emp_name,
      branchId: row.branch_id_fk,
      date: row.request_date,
      kind: row.kind ?? 'hours',
      kindLabel: row.kind === 'shift' ? 'شيفت إضافي' : 'ساعات إضافية',
      shiftId: row.shift_id ?? null,
      source: row.source ?? 'employee',
      sourceLabel: row.source === 'manager' ? 'إدخال المدير المباشر' : 'طلب الموظف',
      hours: row.hours,
      reason: row.reason,
      status: row.status,
      statusLabel: STATUS_LABEL[row.status] ?? row.status,
      flowStatus,
      flowStatusLabel: FLOW_STATUS_LABEL_AR[flowStatus],
      stage: row.stage,
      stageLabel: row.stage ? STAGE_LABEL[row.stage] : null,
      currentTo: row.current_to_user_name,
      currentToUserId: row.current_to_user_id,
      publisherId: row.publisher,
      publisherName: row.publisher_name,
      canAction,
      canReturn: canAction,
      returned: row.status === 'returned',
      returnedStage: row.returned_stage ?? null,
      returnComment: row.status === 'returned' ? row.return_comment ?? null : null,
      canResubmit: row.status === 'returned' && userId != null && (row.publisher === userId || row.current_to_user_id === userId),
      decisionReason: row.decision_reason,
      extraHoursId: row.extra_hours_id,
      resultMessage: row.extra_hours_message,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      history: this.history(row),
      timeline,
      comments: timeline
        .filter((t) => t.comment)
        .map((t) => ({ at: t.at, byName: t.byName, action: t.action, actionLabel: t.actionLabel, comment: t.comment })),
    };
  }

  /** The caller's own employee row (users.emp_code = employees.id; emp_code fallback). */
  private async ownEmployee(user: JwtUser): Promise<EmpRow> {
    const account = await this.prisma.users.findUnique({ where: { user_id: user.sub }, select: { emp_code: true } });
    const ref = account?.emp_code ?? user.emp_code;
    if (ref == null) throw new BadRequestException('الحساب غير مرتبط بموظف');
    const emp =
      (await this.prisma.employees.findUnique({ where: { id: ref }, select: EMP_SELECT })) ??
      (await this.prisma.employees.findFirst({ where: { emp_code: ref }, select: EMP_SELECT }));
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    return emp as EmpRow;
  }

  private async ownEmployeeId(user: JwtUser): Promise<number | null> {
    try {
      return (await this.ownEmployee(user)).id;
    } catch {
      return null;
    }
  }

  /** HR officer (code 44), an hr:approve grant, or an admin: may record directly / act on anything. */
  async isHrOrAdmin(user: Pick<JwtUser, 'sub' | 'level' | 'is_super_admin'>): Promise<boolean> {
    if (isSystemAdmin(user as JwtUser)) return true;
    const account = await this.prisma.users.findUnique({ where: { user_id: user.sub }, select: { level: true } });
    if (account?.level === 1) return true;
    if (await isHrOfficer(this.prisma, user.sub)) return true;
    return this.hasHrApproveGrant(user.sub);
  }

  /** Is `userId` the direct manager of `emp` (employees.manger holds employees.id or emp_code)? */
  private async isDirectManagerOf(userId: number, emp: { manger: string | null }): Promise<boolean> {
    const ref = emp.manger?.trim();
    if (!ref) return false;
    const account = await this.prisma.users.findUnique({ where: { user_id: userId }, select: { emp_code: true } });
    if (account?.emp_code == null) return false;
    const actor = await this.prisma.employees.findFirst({
      where: { OR: [{ id: account.emp_code }, { emp_code: account.emp_code }] },
      select: { id: true, emp_code: true },
    });
    const refs = [actor?.id, actor?.emp_code].filter((v): v is number => v != null).map(String);
    return refs.includes(ref);
  }

  async list(q: ListOvertimeRequestsDto, user: JwtUser) {
    const where: Prisma.Sql[] = [];
    const mode = q.mode ?? 'sader';
    if (mode === 'wared') {
      where.push(Prisma.sql`current_to_user_id = ${user.sub} AND status = 'pending'`);
    } else if (mode === 'sader') {
      const empId = await this.ownEmployeeId(user);
      where.push(empId != null ? Prisma.sql`(emp_id_fk = ${empId} OR publisher = ${user.sub})` : Prisma.sql`publisher = ${user.sub}`);
    } else {
      const branches = this.scope.allowedBranchIds(user);
      if (branches !== null) {
        if (!branches.length) where.push(Prisma.sql`1 = 0`);
        else where.push(Prisma.sql`branch_id_fk IN (${Prisma.join(branches)})`);
      }
    }
    if (q.status) where.push(Prisma.sql`status = ${q.status}`);
    if (q.source) where.push(Prisma.sql`source = ${q.source}`);
    if (q.search?.trim()) {
      const s = `%${q.search.trim()}%`;
      where.push(Prisma.sql`(emp_name LIKE ${s} OR reason LIKE ${s} OR request_date LIKE ${s})`);
    }
    const clause = where.length ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty;
    const [rows, count] = await Promise.all([
      this.prisma.$queryRaw<OvertimeRow[]>(
        Prisma.sql`SELECT * FROM hr_overtime_requests ${clause} ORDER BY id DESC LIMIT ${q.take} OFFSET ${q.skip}`,
      ),
      this.prisma.$queryRaw<Array<{ c: bigint | number }>>(
        Prisma.sql`SELECT COUNT(*) AS c FROM hr_overtime_requests ${clause}`,
      ),
    ]);
    const isHr = mode === 'all' ? await this.isHrOrAdmin(user) : false;
    const data = rows.map((r) => this.map(this.normalize(r), user.sub, { isHr }));
    return paginated(data, Number(count[0]?.c ?? 0), q.page, q.pageSize);
  }

  /** Every open request (pending or returned) for the HR inbox; the caller filters and pages. */
  async openRows(): Promise<OvertimeRow[]> {
    const rows = await this.prisma.$queryRaw<OvertimeRow[]>(Prisma.sql`
      SELECT * FROM hr_overtime_requests WHERE status IN ('pending', 'returned') ORDER BY id DESC LIMIT 2000`);
    return rows.map((r) => this.normalize(r));
  }

  async findOne(id: number, user: JwtUser) {
    const row = await this.findRow(id);
    await this.assertCanSee(user, row);
    return this.map(row, user.sub, { isHr: await this.isHrOrAdmin(user) });
  }

  private async assertCanSee(user: JwtUser, row: OvertimeRow) {
    if (isSystemAdmin(user)) return;
    if (row.publisher === user.sub || row.current_to_user_id === user.sub || row.direct_manager_user_id === user.sub) return;
    const own = await this.ownEmployeeId(user);
    if (own != null && own === row.emp_id_fk) return;
    if (await this.isHrOrAdmin(user)) return;
    this.scope.assertBranchAllowed(user, row.branch_id_fk, 'لا تملك صلاحية الوصول لهذا الطلب');
  }

  // ---- create (employee) -------------------------------------------------------------------

  /**
   * `allowOtherEmployee` = web route: a manager / HR may file for an employee in branch scope.
   * The mobile route always files for the signed-in employee.
   */
  async create(dto: CreateOvertimeRequestDto, user: JwtUser, allowOtherEmployee = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.date ?? '')) throw new BadRequestException('تاريخ الإضافي مطلوب');
    const hours = Number(dto.hours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 12) throw new BadRequestException('عدد الساعات غير صالح');
    const reason = String(dto.reason ?? '').trim();
    if (!reason) throw new BadRequestException('السبب مطلوب');

    let emp: EmpRow;
    if (allowOtherEmployee && dto.empId) {
      const target = await this.prisma.employees.findUnique({ where: { id: dto.empId }, select: EMP_SELECT });
      if (!target) throw new NotFoundException('الموظف غير موجود');
      const own = await this.ownEmployeeId(user);
      if (own !== target.id && !isSystemAdmin(user)) {
        this.scope.assertBranchAllowed(user, target.branch_id_fk, 'لا يمكنك تقديم طلب لموظف خارج فرعك');
      }
      emp = target as EmpRow;
    } else {
      emp = await this.ownEmployee(user);
    }

    await this.assertNoDuplicate(emp.id, dto.date, 'hours');

    const requester = await requesterUserIds(this.prisma, emp, user.sub);
    const route = await this.route(null, emp as ChainEmployee, requester);
    const history: HistoryEntry[] = [{ at: nowIso(), by: user.sub, byName: user.name, action: 'submit', note: `${hours} ساعة — ${reason}` }];
    if (route.skippedDirectManager) {
      history.push({ at: nowIso(), by: null, byName: 'النظام', action: 'skip', stage: 'approve_direct_manager', note: 'لا يوجد مدير مباشر غير مقدم الطلب' });
    }

    // Columns of the 24 Nov table only: works before migration 20261125110000 is applied.
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO hr_overtime_requests
          (emp_id_fk, emp_code_fk, emp_name, branch_id_fk, request_date, hours, reason, status, stage,
           approve_direct_manager, approve_hr, current_to_user_id, current_to_user_name,
           publisher, publisher_name, history, created_at)
        VALUES
          (${emp.id}, ${emp.emp_code ?? null}, ${emp.employee ?? null}, ${emp.branch_id_fk ?? null}, ${dto.date},
           ${hours}, ${reason.slice(0, 500)}, 'pending', ${route.stage},
           ${route.skippedDirectManager ? 'yes' : 'wait'}, 'wait', ${route.recipient?.userId ?? null},
           ${route.recipient?.name ?? null}, ${user.sub}, ${user.name ?? null}, ${JSON.stringify(history)}, NOW())`);
      const rows = await tx.$queryRaw<Array<{ id: bigint | number }>>(Prisma.sql`SELECT LAST_INSERT_ID() AS id`);
      return Number(rows[0]?.id);
    });

    await this.pushTo(route.recipient?.userId, user.sub, 'لديك طلب ساعات إضافية بانتظار اعتمادك', `${emp.employee ?? ''} — ${dto.date} (${hours} ساعة)`);
    return { id, status: 'pending' as const, stage: route.stage, currentTo: route.recipient?.name ?? null };
  }

  private async assertNoDuplicate(empId: number, date: string, kind: OvertimeKind, exceptId?: number) {
    const dup = await this.prisma.$queryRaw<Array<{ id: number; kind?: string | null }>>(Prisma.sql`
      SELECT * FROM hr_overtime_requests
       WHERE emp_id_fk = ${empId} AND request_date = ${date} AND status IN ('pending', 'approved', 'returned')
         ${exceptId != null ? Prisma.sql`AND id <> ${exceptId}` : Prisma.empty}
       LIMIT 5`);
    if ((dup ?? []).some((d) => (d.kind === 'shift' ? 'shift' : 'hours') === kind)) {
      throw new BadRequestException(
        kind === 'shift' ? 'يوجد طلب شيفت إضافي لنفس الموظف في نفس اليوم بالفعل' : 'يوجد طلب ساعات إضافية لنفس اليوم بالفعل',
      );
    }
  }

  // ---- manager entry -------------------------------------------------------------------------

  /**
   * A direct manager enters overtime / an extra shift for one of his team: a request at the HR
   * step (nothing is written to tbl_emps_hours_edafi / tbl_emps_shef_edafi, nothing is paid).
   * HR / an admin entering it is recorded at once and logged as an auto-approved request.
   * Used by POST /overtime-requests/manager and the legacy POST /attendance/extra-hours and
   * /attendance/shift-swaps (ttype 2), plus their mobile equivalents.
   */
  async managerEntry(dto: ManagerOvertimeDto, user: JwtUser) {
    const kind: OvertimeKind = dto.kind === 'shift' ? 'shift' : 'hours';
    const date = normalizeLegacyInputDate(String(dto.date ?? '').trim()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('التاريخ مطلوب');
    const hours = kind === 'hours' ? Number(dto.hours) : 0;
    if (kind === 'hours' && (!Number.isInteger(hours) || hours < 1 || hours > 12)) {
      throw new BadRequestException('عدد الساعات غير صالح');
    }
    const shiftId = kind === 'shift' ? Number(dto.shiftId) : null;
    if (kind === 'shift') {
      if (!shiftId || !Number.isInteger(shiftId)) throw new BadRequestException('اختر الوردية الإضافية');
      const shift = await this.prisma.tbl_hdodr_setting.findUnique({ where: { id: shiftId } });
      if (!shift) throw new BadRequestException('الوردية المحددة غير موجودة');
    }
    if (kind === 'hours' && date > todayIso()) {
      throw new BadRequestException('مينفعش تسجل ساعات إضافية ليوم لسه مجاش؛ سجلها بعد بصمة انصراف الموظف');
    }
    const reason = String(dto.reason ?? '').trim() || (kind === 'shift' ? 'شيفت إضافي من المدير المباشر' : 'ساعات إضافية من المدير المباشر');

    const emp = (await this.prisma.employees.findUnique({ where: { id: dto.empId }, select: EMP_SELECT })) as EmpRow | null;
    if (!emp) throw new BadRequestException('الموظف غير موجود في النظام');

    const hr = await this.isHrOrAdmin(user);
    if (!hr && !(await this.isDirectManagerOf(user.sub, emp))) {
      throw new ForbiddenException('الموظف ده مش ضمن فريقك؛ المدير المباشر أو الموارد البشرية بس يقدروا يسجلوا له إضافي');
    }
    await this.assertNoDuplicate(emp.id, date, kind);
    const what = kind === 'shift' ? 'شيفت إضافي' : hoursText(hours);

    if (hr) {
      // HR / admin: recorded now (fingerprint confirmation still applies), logged as approved.
      const recorded = await this.record(
        { emp_id_fk: emp.id, hours, request_date: date, kind, shift_id: shiftId, direct_manager_user_id: null },
        user.sub,
      );
      const history: HistoryEntry[] = [
        { at: nowIso(), by: user.sub, byName: user.name, action: 'submit', note: `${what} — ${reason}` },
        { at: nowIso(), by: user.sub, byName: user.name, action: 'accept', stage: 'approve_hr', note: 'إدخال مباشر من الموارد البشرية' },
        { at: nowIso(), by: recorded.recordedAs, byName: null, action: 'recorded', note: recorded.message },
      ];
      let requestId: number | null = null;
      try {
        requestId = await this.insertManagerRow({
          emp, date, hours, reason, kind, shiftId, user, history,
          status: 'approved', stage: null, hrFlag: 'yes',
          to: null, extraId: recorded.id, extraMessage: recorded.message, decidedBy: user.sub,
        });
      } catch (error) {
        // The attendance record exists already; the log row is secondary.
        this.logger.warn(`direct overtime entry log not stored: ${errorText(error)}`);
      }
      return {
        ...(recorded.raw ?? {}),
        id: recorded.id,
        requestId,
        queued: false,
        autoApproved: true,
        status: OVERTIME_FINAL_STATUS,
        message: recorded.message ?? 'تم التسجيل',
        ...(recorded.warning ? { warning: recorded.warning } : {}),
      };
    }

    // Direct manager: the request starts at the HR step (his own approval is the entry itself).
    const requester = await requesterUserIds(this.prisma, emp, user.sub);
    const recipient = await this.hrRecipient(requester);
    const history: HistoryEntry[] = [
      { at: nowIso(), by: user.sub, byName: user.name, action: 'submit', stage: 'approve_direct_manager', note: `${what} — ${reason}` },
    ];
    const id = await this.insertManagerRow({
      emp, date, hours, reason, kind, shiftId, user, history,
      status: 'pending', stage: 'approve_hr', hrFlag: 'wait',
      to: recipient, extraId: null, extraMessage: null, decidedBy: null,
    });
    await this.pushTo(
      recipient?.userId,
      user.sub,
      kind === 'shift' ? 'شيفت إضافي بانتظار موافقتك' : 'ساعات إضافية بانتظار موافقتك',
      `${user.name ?? ''}: ${emp.employee ?? ''} — ${date} (${what})`,
    );
    const preview = kind === 'hours' ? await this.preview({ empId: emp.id, date }, user).catch(() => null) : null;
    return {
      // `id` is what the old clients read; for a queued entry it is the request id.
      id,
      requestId: id,
      queued: true,
      autoApproved: false,
      status: 'pending' as const,
      stage: 'approve_hr' as const,
      currentTo: recipient?.name ?? null,
      message: QUEUED_FOR_HR_MESSAGE,
      ...(kind === 'hours' ? { requestedHours: hours } : { shiftId }),
      ...(preview ? { confirmedMinutes: preview.confirmedMinutes, confirmedHours: Math.min(hours, preview.confirmedHours) } : {}),
    };
  }

  private async insertManagerRow(input: {
    emp: EmpRow;
    date: string;
    hours: number;
    reason: string;
    kind: OvertimeKind;
    shiftId: number | null;
    user: JwtUser;
    history: HistoryEntry[];
    status: OvertimeStatus;
    stage: OvertimeStage | null;
    hrFlag: string;
    to: Recipient | null;
    extraId: number | null;
    extraMessage: string | null;
    decidedBy: number | null;
  }): Promise<number> {
    const { emp, user } = input;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO hr_overtime_requests
          (emp_id_fk, emp_code_fk, emp_name, branch_id_fk, request_date, hours, reason, status, stage,
           approve_direct_manager, approve_hr, direct_manager_user_id, current_to_user_id, current_to_user_name,
           publisher, publisher_name, decided_by, extra_hours_id, extra_hours_message, history,
           source, kind, shift_id, created_at, updated_at)
        VALUES
          (${emp.id}, ${emp.emp_code ?? null}, ${emp.employee ?? null}, ${emp.branch_id_fk ?? null}, ${input.date},
           ${input.hours}, ${input.reason.slice(0, 500)}, ${input.status}, ${input.stage},
           'yes', ${input.hrFlag}, ${input.status === 'pending' ? user.sub : null},
           ${input.to?.userId ?? null}, ${input.to?.name ?? null},
           ${user.sub}, ${user.name ?? null}, ${input.decidedBy}, ${input.extraId},
           ${input.extraMessage?.slice(0, 500) ?? null}, ${JSON.stringify(input.history)},
           'manager', ${input.kind}, ${input.shiftId}, NOW(), NOW())`);
      const rows = await tx.$queryRaw<Array<{ id: bigint | number }>>(Prisma.sql`SELECT LAST_INSERT_ID() AS id`);
      return Number(rows[0]?.id);
    });
  }

  /** Employees a manager may enter overtime for: his team; HR / admin: every employee in scope. */
  async team(user: JwtUser) {
    const hr = await this.isHrOrAdmin(user);
    const select = { id: true, emp_code: true, employee: true, branch_id_fk: true, edara_n: true, qsm_n: true } as const;
    if (hr) {
      const branches = isSystemAdmin(user) ? null : this.scope.allowedBranchIds(user);
      const rows = await this.prisma.employees.findMany({
        where: branches === null ? {} : { branch_id_fk: { in: branches.length ? branches : [-1] } },
        select,
        orderBy: { employee: 'asc' },
        take: 3000,
      });
      return { scope: 'all' as const, recordsDirectly: true, employees: rows };
    }
    const account = await this.prisma.users.findUnique({ where: { user_id: user.sub }, select: { emp_code: true } });
    const actor = account?.emp_code != null
      ? await this.prisma.employees.findFirst({
          where: { OR: [{ id: account.emp_code }, { emp_code: account.emp_code }] },
          select: { id: true, emp_code: true },
        })
      : null;
    const refs = [actor?.id, actor?.emp_code].filter((v): v is number => v != null).map(String);
    const rows = refs.length
      ? await this.prisma.employees.findMany({ where: { manger: { in: refs } }, select, orderBy: { employee: 'asc' } })
      : [];
    return { scope: 'team' as const, recordsDirectly: false, employees: rows.filter((r) => r.id !== actor?.id) };
  }

  /**
   * Fingerprint-confirmed overtime for one employee and date (live hint in the entry form).
   * Uses the same calculation createExtraHours records with.
   */
  async preview(q: { empId: number; date: string }, user: JwtUser) {
    const emp = (await this.prisma.employees.findUnique({ where: { id: q.empId }, select: EMP_SELECT })) as EmpRow | null;
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    const own = await this.ownEmployeeId(user);
    if (own !== emp.id && !(await this.isDirectManagerOf(user.sub, emp)) && !(await this.isHrOrAdmin(user))) {
      this.scope.assertBranchAllowed(user, emp.branch_id_fk, 'لا تملك صلاحية الاطلاع على بصمة هذا الموظف');
    }
    const date = q.date;
    const future = date > todayIso();
    const code = emp.emp_code ?? 0;
    const punches = await this.prisma.tbl_hdoor_emps.findMany({
      where: { member_code: code, OR: [{ action_date: date }, { action_date_s: { in: legacyDateMatchValues(date) } }] },
      select: { hdoor_time: true, ensraf_time: true, dwam_id_fk: true },
    });
    const shiftIds = [...new Set(punches.map((p) => p.dwam_id_fk).filter((v): v is number => v != null))];
    const shifts = shiftIds.length
      ? await this.prisma.tbl_hdodr_setting.findMany({ where: { id: { in: shiftIds } }, select: { id: true, title: true } })
      : [];
    const shiftTitle = new Map(shifts.map((s) => [s.id, s.title]));
    let proof = { minutes: 0, hasPunch: punches.some((p) => p.hdoor_time || p.ensraf_time), openPunch: false, isOffDay: false };
    // Same private calculation createExtraHours uses (read-only; attendance internals untouched).
    const calc = (this.attendance as unknown as Record<string, unknown>)['punchConfirmedOvertime'];
    if (typeof calc === 'function') {
      try {
        proof = await (calc as (e: { id: number; emp_code: number | null }, d: string) => Promise<typeof proof>).call(
          this.attendance,
          { id: emp.id, emp_code: emp.emp_code },
          date,
        );
      } catch (error) {
        this.logger.warn(`overtime preview ${emp.id} ${date}: ${errorText(error)}`);
      }
    }
    const h = Math.floor(proof.minutes / 60);
    const m = proof.minutes % 60;
    const message = future
      ? 'اليوم ده لسه مجاش — الإضافي بيتأكد بالبصمة بعد الانصراف'
      : !proof.hasPunch
        ? 'مفيش بصمة حضور وانصراف للموظف في اليوم ده؛ مش هيتحسب إضافي'
        : proof.openPunch
          ? 'الموظف بصم حضور ولسه ما بصمش انصراف'
          : proof.minutes > 0
            ? `البصمة بتأكد ${h ? `${h} ساعة` : ''}${h && m ? ' و' : ''}${m ? `${m} دقيقة` : ''} إضافي`
            : 'البصمة مش بتأكد أي وقت إضافي في اليوم ده';
    return {
      empId: emp.id,
      employeeName: emp.employee,
      date,
      future,
      punches: punches.map((p) => ({
        shiftId: p.dwam_id_fk,
        shiftTitle: p.dwam_id_fk != null ? shiftTitle.get(p.dwam_id_fk) ?? null : null,
        in: p.hdoor_time || null,
        out: p.ensraf_time || null,
      })),
      confirmedMinutes: proof.minutes,
      confirmedHours: h,
      hasPunch: proof.hasPunch,
      openPunch: proof.openPunch,
      isOffDay: proof.isOffDay,
      message,
    };
  }

  // ---- routing ---------------------------------------------------------------------------

  /** direct manager (optional) → HR (mandatory; admin fallback). */
  private async route(
    after: OvertimeStage | null,
    emp: ChainEmployee | null,
    exclude: Set<number>,
  ): Promise<{ stage: OvertimeStage | null; recipient: Recipient | null; skippedDirectManager: boolean }> {
    if (after == null) {
      const dm = await resolveDirectManager(this.prisma, emp, exclude);
      if (dm) return { stage: 'approve_direct_manager', recipient: dm, skippedDirectManager: false };
      return { stage: 'approve_hr', recipient: await this.hrRecipient(exclude), skippedDirectManager: true };
    }
    if (after === 'approve_direct_manager') {
      return { stage: 'approve_hr', recipient: await this.hrRecipient(exclude), skippedDirectManager: false };
    }
    return { stage: null, recipient: null, skippedDirectManager: false };
  }

  private async hrRecipient(exclude: Set<number>) {
    return (await resolveByJobTitleCode(this.prisma, HR_JOB_TITLE_CODE, exclude)) ?? resolveAdmin(this.prisma, exclude);
  }

  // ---- decide ----------------------------------------------------------------------------

  async action(id: number, dto: OvertimeActionDto, user: JwtUser) {
    const row = await this.findRow(id);
    if (row.status === 'returned') throw new BadRequestException('الطلب مرتجع لمقدمه للتعديل؛ استنى إعادة الإرسال');
    if (row.status !== 'pending' || !row.stage) throw new BadRequestException('لا يوجد إجراء متاح على هذا الطلب');
    const stage = row.stage;
    // Column names below are interpolated raw: only the two known stage columns are accepted.
    if (stage !== 'approve_direct_manager' && stage !== 'approve_hr') {
      throw new BadRequestException('مرحلة اعتماد غير معروفة');
    }
    const emp = await this.prisma.employees.findUnique({ where: { id: row.emp_id_fk }, select: EMP_SELECT });
    const requester = await requesterUserIds(this.prisma, emp, row.publisher);
    const auth = await authorizeApprover(
      this.prisma,
      { userId: user.sub, isSuperAdmin: user.is_super_admin === true },
      row,
      requester,
      (uid) => this.hasHrApproveGrant(uid),
    );
    const history = this.history(row);
    const note = (dto.reason ?? dto.comment)?.trim() || null;
    const overrideNote = auth.override
      ? `تجاوز من ${auth.role === 'hr' ? 'الموارد البشرية' : 'مدير النظام'} بدلًا من ${STAGE_LABEL[stage]}`
      : null;
    const what = row.kind === 'shift' ? 'الشيفت الإضافي' : 'الساعات الإضافية';

    if (dto.action === 'return') {
      const comment = requireReturnComment(note);
      const target = row.publisher ?? [...requester][0] ?? null;
      history.push({ at: nowIso(), by: user.sub, byName: user.name, action: 'return', stage, note: [overrideNote, comment].filter(Boolean).join(' — ') });
      const changed = await this.prisma.$executeRaw(Prisma.sql`
        UPDATE hr_overtime_requests
           SET status = 'returned', returned_stage = ${stage}, return_comment = ${comment},
               current_to_user_id = ${target}, current_to_user_name = ${row.publisher_name},
               history = ${JSON.stringify(history)}, updated_at = NOW()
         WHERE id = ${id} AND status = 'pending' AND stage = ${stage}`);
      if (!changed) throw new BadRequestException('تم اتخاذ إجراء على هذا الطلب بالفعل');
      await this.pushTo(target, user.sub, `طلب ${what} رجعلك للتعديل`, `${row.emp_name ?? ''} — ${row.request_date}: ${comment}`);
      return { id, status: 'returned' as const, stage, final: false, override: auth.override, returnedTo: target };
    }

    if (dto.action === 'reject') {
      history.push({ at: nowIso(), by: user.sub, byName: user.name, action: 'reject', stage, note: [overrideNote, note].filter(Boolean).join(' — ') || null });
      const changed = await this.prisma.$executeRaw(Prisma.sql`
        UPDATE hr_overtime_requests
           SET status = 'rejected', ${Prisma.raw(stage)} = 'no', decided_by = ${user.sub},
               decision_reason = ${note}, current_to_user_id = ${row.publisher}, current_to_user_name = ${row.publisher_name},
               history = ${JSON.stringify(history)}, updated_at = NOW()
         WHERE id = ${id} AND status = 'pending' AND stage = ${stage}`);
      if (!changed) throw new BadRequestException('تم اتخاذ إجراء على هذا الطلب بالفعل');
      await this.pushTo(row.publisher, user.sub, `تم رفض طلب ${what}`, `${row.request_date} — ${note ?? ''}`.trim());
      return { id, status: 'rejected' as const, stage, final: true, override: auth.override };
    }

    history.push({ at: nowIso(), by: user.sub, byName: user.name, action: 'accept', stage, note: [overrideNote, note].filter(Boolean).join(' — ') || null });
    let next = await this.route(stage, emp as ChainEmployee | null, requester);
    let finalStage: OvertimeStage = stage;
    if (next.stage && next.recipient?.userId === user.sub) {
      // The direct manager is also the HR officer: one decision covers both steps.
      history.push({ at: nowIso(), by: user.sub, byName: user.name, action: 'accept', stage: next.stage, note: 'نفس المعتمد' });
      finalStage = next.stage;
      next = { stage: null, recipient: null, skippedDirectManager: false };
    }

    if (next.stage) {
      const changed = await this.prisma.$executeRaw(Prisma.sql`
        UPDATE hr_overtime_requests
           SET stage = ${next.stage}, ${Prisma.raw(stage)} = 'yes',
               direct_manager_user_id = ${stage === 'approve_direct_manager' ? user.sub : row.direct_manager_user_id},
               current_to_user_id = ${next.recipient?.userId ?? null}, current_to_user_name = ${next.recipient?.name ?? null},
               history = ${JSON.stringify(history)}, updated_at = NOW()
         WHERE id = ${id} AND status = 'pending' AND stage = ${stage}`);
      if (!changed) throw new BadRequestException('تم اتخاذ إجراء على هذا الطلب بالفعل');
      await this.pushTo(next.recipient?.userId, user.sub, 'لديك طلب ساعات إضافية بانتظار اعتمادك', `${row.emp_name ?? ''} — ${row.request_date} (${row.hours} ساعة)`);
      await this.pushTo(row.publisher, user.sub, 'تم اعتماد طلبك مبدئيًا', `بانتظار ${STAGE_LABEL[next.stage]}`);
      return { id, status: 'pending' as const, stage: next.stage, final: false, override: auth.override };
    }

    // FINAL approval: record through the attendance path (punch validation applies).
    const recorded = await this.record(row, user.sub);
    history.push({ at: nowIso(), by: recorded.recordedAs, byName: null, action: 'recorded', note: recorded.message });
    const changed = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE hr_overtime_requests
         SET status = ${OVERTIME_FINAL_STATUS}, stage = NULL, ${Prisma.raw(stage)} = 'yes', ${Prisma.raw(finalStage)} = 'yes',
             direct_manager_user_id = ${stage === 'approve_direct_manager' ? user.sub : row.direct_manager_user_id}, decided_by = ${user.sub},
             decision_reason = ${note}, extra_hours_id = ${recorded.id}, extra_hours_message = ${recorded.message?.slice(0, 500) ?? null},
             current_to_user_id = ${row.publisher}, current_to_user_name = ${row.publisher_name},
             history = ${JSON.stringify(history)}, updated_at = NOW()
       WHERE id = ${id} AND status = 'pending' AND stage = ${stage}`);
    if (!changed) {
      this.logger.warn(`overtime request ${id} changed while recording ${row.kind} ${recorded.id}`);
    }
    await this.pushTo(row.publisher, user.sub, `تم اعتماد طلب ${what}`, `${row.request_date} — ${recorded.message ?? ''}`.trim());
    return {
      id,
      status: OVERTIME_FINAL_STATUS,
      stage,
      final: true,
      override: auth.override,
      extraHoursId: recorded.id,
      message: recorded.message,
      ...(recorded.warning ? { warning: recorded.warning } : {}),
    };
  }

  /** Edit + resubmit a returned request; it resumes at the step that returned it. */
  async resubmit(id: number, dto: ResubmitOvertimeDto, user: JwtUser) {
    const row = await this.findRow(id);
    if (row.status !== 'returned') throw new BadRequestException('الطلب مش مرتجع للتعديل');
    const own = await this.ownEmployeeId(user);
    const mine =
      row.publisher === user.sub ||
      row.current_to_user_id === user.sub ||
      (row.source !== 'manager' && own != null && own === row.emp_id_fk);
    if (!mine && !isSystemAdmin(user)) throw new ForbiddenException('يمكن لمقدم الطلب فقط تعديله وإعادة إرساله');

    const kind: OvertimeKind = dto.kind ?? row.kind ?? 'hours';
    const date = dto.date ?? row.request_date;
    const hours = kind === 'shift' ? 0 : Number(dto.hours ?? (row.hours || 0));
    if (kind === 'hours' && (!Number.isInteger(hours) || hours < 1 || hours > 12)) throw new BadRequestException('عدد الساعات غير صالح');
    const shiftId = kind === 'shift' ? Number(dto.shiftId ?? row.shift_id) : null;
    if (kind === 'shift') {
      if (!shiftId) throw new BadRequestException('اختر الوردية الإضافية');
      const shift = await this.prisma.tbl_hdodr_setting.findUnique({ where: { id: shiftId } });
      if (!shift) throw new BadRequestException('الوردية المحددة غير موجودة');
    }
    if (kind === 'hours' && date > todayIso()) throw new BadRequestException('مينفعش تسجل ساعات إضافية ليوم لسه مجاش');
    const reason = (dto.reason ?? row.reason ?? '').trim();
    if (!reason) throw new BadRequestException('السبب مطلوب');
    await this.assertNoDuplicate(row.emp_id_fk, date, kind, id);

    const emp = await this.prisma.employees.findUnique({ where: { id: row.emp_id_fk }, select: EMP_SELECT });
    const requester = await requesterUserIds(this.prisma, emp, row.publisher);
    let stage: OvertimeStage = row.returned_stage === 'approve_direct_manager' ? 'approve_direct_manager' : 'approve_hr';
    let recipient: Recipient | null = null;
    if (stage === 'approve_direct_manager') {
      recipient = await resolveDirectManager(this.prisma, emp as ChainEmployee | null, requester);
      if (!recipient) stage = 'approve_hr';
    }
    if (stage === 'approve_hr') recipient = await this.hrRecipient(requester);

    const changes: string[] = [];
    if (date !== row.request_date) changes.push(`التاريخ ${row.request_date} ← ${date}`);
    if (kind === 'hours' && hours !== row.hours) changes.push(`الساعات ${row.hours} ← ${hours}`);
    if (kind !== (row.kind ?? 'hours')) changes.push(kind === 'shift' ? 'اتغير لشيفت إضافي' : 'اتغير لساعات إضافية');
    const history = this.history(row);
    history.push({
      at: nowIso(),
      by: user.sub,
      byName: user.name,
      action: 'resubmit',
      stage,
      note: [dto.comment?.trim(), changes.join('، ')].filter(Boolean).join(' — ') || null,
    });
    const changed = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE hr_overtime_requests
         SET status = 'pending', stage = ${stage}, request_date = ${date}, hours = ${hours}, reason = ${reason.slice(0, 500)},
             kind = ${kind}, shift_id = ${shiftId}, returned_stage = NULL,
             current_to_user_id = ${recipient?.userId ?? null}, current_to_user_name = ${recipient?.name ?? null},
             history = ${JSON.stringify(history)}, updated_at = NOW()
       WHERE id = ${id} AND status = 'returned'`);
    if (!changed) throw new BadRequestException('تم تعديل هذا الطلب بالفعل');
    await this.pushTo(recipient?.userId, user.sub, 'طلب إضافي اتعدل ورجعلك', `${row.emp_name ?? ''} — ${date}${dto.comment ? `: ${dto.comment}` : ''}`);
    return { id, status: 'pending' as const, stage, currentTo: recipient?.name ?? null };
  }

  /**
   * Records an approved request. createExtraHours / createShiftSwap check that the caller is the
   * employee's direct manager or HR; when an admin overrides, the record is made under the direct
   * manager who approved, then the HR officer.
   */
  private async record(
    row: Pick<OvertimeRow, 'emp_id_fk' | 'hours' | 'request_date' | 'kind' | 'shift_id' | 'direct_manager_user_id'>,
    actorUserId: number,
  ): Promise<{ id: number | null; message: string | null; warning?: string; recordedAs: number; raw?: Record<string, unknown> }> {
    const candidates = [actorUserId, row.direct_manager_user_id];
    const hr = await resolveByJobTitleCode(this.prisma, HR_JOB_TITLE_CODE, new Set());
    candidates.push(hr?.userId ?? null);
    const tried = new Set<number>();
    let lastForbidden: unknown = null;
    for (const candidate of candidates) {
      if (candidate == null || tried.has(candidate)) continue;
      tried.add(candidate);
      try {
        const result = (row.kind === 'shift'
          ? await this.attendance.createShiftSwap(
              Object.assign(new CreateShiftSwapDto(), {
                empId: row.emp_id_fk,
                ttype: 2,
                dwamIdFk: Number(row.shift_id),
                sheftDate: row.request_date,
              }),
              candidate,
            )
          : await this.attendance.createExtraHours(
              Object.assign(new CreateExtraHoursDto(), {
                empId: row.emp_id_fk,
                numHours: row.hours,
                edafaDate: row.request_date,
              }),
              candidate,
            )) as { id?: number; message?: string; warning?: string; warnings?: string[] } & Record<string, unknown>;
        const warning = result?.warning ?? (Array.isArray(result?.warnings) ? result.warnings.join('، ') : undefined);
        const message = result?.message ?? null;
        return {
          id: result?.id ?? null,
          message: [message, warning && !String(message ?? '').includes(warning) ? warning : null].filter(Boolean).join(' — ') || null,
          warning,
          recordedAs: candidate,
          raw: result,
        };
      } catch (error) {
        if (error instanceof ForbiddenException) {
          lastForbidden = error;
          continue;
        }
        // Validation (duplicate day, no fingerprint, …): keep the request pending at this step.
        throw new BadRequestException(`تعذر التسجيل في الحضور: ${errorText(error)}`);
      }
    }
    throw new ForbiddenException(
      `تعذر التسجيل في الحضور: ${lastForbidden ? errorText(lastForbidden) : 'لا يوجد مدير مباشر أو موارد بشرية'}`,
    );
  }

  /** The requester (or the publisher) may cancel while nothing was decided yet, or once returned. */
  async cancel(id: number, user: JwtUser) {
    const row = await this.findRow(id);
    const own = await this.ownEmployeeId(user);
    if (row.publisher !== user.sub && own !== row.emp_id_fk && !isSystemAdmin(user)) {
      throw new ForbiddenException('يمكن لصاحب الطلب فقط إلغاؤه');
    }
    const history = this.history(row);
    const returned = row.status === 'returned';
    if (!returned && (row.status !== 'pending' || history.some((h) => h.action === 'accept'))) {
      throw new BadRequestException('لا يمكن إلغاء طلب تمت مراجعته');
    }
    history.push({ at: nowIso(), by: user.sub, byName: user.name, action: 'cancel' });
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE hr_overtime_requests SET status = 'cancelled', stage = NULL, history = ${JSON.stringify(history)}, updated_at = NOW()
       WHERE id = ${id} AND status IN ('pending', 'returned')`);
    return { id, status: 'cancelled' as const };
  }

  private async hasHrApproveGrant(userId: number): Promise<boolean> {
    if (!this.engine) return false;
    try {
      return await this.engine.can(userId, 'hr', 'approve');
    } catch {
      return false;
    }
  }

  private async pushTo(toUser: number | null | undefined, fromUser: number, title: string, body: string) {
    if (!toUser || toUser === fromUser || !this.push) return;
    try {
      // No legacy notification code exists for overtime: store the in-app row + push.
      await this.push.sendToUsers([toUser], title, body, fromUser);
    } catch {
      // best-effort
    }
  }
}
