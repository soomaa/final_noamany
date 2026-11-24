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
import {
  ChainEmployee,
  HR_JOB_TITLE_CODE,
  Recipient,
  authorizeApprover,
  requesterUserIds,
  resolveAdmin,
  resolveByJobTitleCode,
  resolveDirectManager,
} from '../../common/hr-approval/approval-chain';
import { AttendanceService } from '../attendance/attendance.service';
import { CreateExtraHoursDto } from '../attendance/dto/edafi.dto';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { PushService } from '../push/push.service';
import { CreateOvertimeRequestDto, ListOvertimeRequestsDto, OvertimeActionDto } from './dto/overtime-request.dto';

/**
 * Employee overtime requests (طلبات الساعات الإضافية) — hr_overtime_requests.
 *
 * Chain: direct manager → HR (job-title code 44, else an admin). Never routed to the requester;
 * a missing direct manager is skipped. On FINAL approval (status 'approved') the request is
 * recorded through AttendanceService.createExtraHours — the same path a manager uses — so the
 * fingerprint validation there decides what is actually counted.
 *
 * The table is new, so it is read and written with plain SQL (production runs a hand-patched
 * Prisma Client and never regenerates it).
 */

export type OvertimeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type OvertimeStage = 'approve_direct_manager' | 'approve_hr';

/** FINAL APPROVAL value for overtime requests (hr_overtime_requests.status). */
export const OVERTIME_FINAL_STATUS: OvertimeStatus = 'approved';

const STAGE_LABEL: Record<OvertimeStage, string> = {
  approve_direct_manager: 'المدير المباشر',
  approve_hr: 'الموارد البشرية',
};

const STATUS_LABEL: Record<OvertimeStatus, string> = {
  pending: 'قيد الاعتماد',
  approved: 'معتمد',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
};

export interface HistoryEntry {
  at: string;
  by: number | null;
  byName: string | null;
  action: 'submit' | 'accept' | 'reject' | 'skip' | 'cancel' | 'recorded';
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

  private normalize(row: OvertimeRow): OvertimeRow {
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

  private map(row: OvertimeRow, userId?: number) {
    return {
      id: row.id,
      empId: row.emp_id_fk,
      employeeName: row.emp_name,
      date: row.request_date,
      hours: row.hours,
      reason: row.reason,
      status: row.status,
      statusLabel: STATUS_LABEL[row.status] ?? row.status,
      stage: row.stage,
      stageLabel: row.stage ? STAGE_LABEL[row.stage] : null,
      currentTo: row.current_to_user_name,
      currentToUserId: row.current_to_user_id,
      canAction: userId != null && row.status === 'pending' && row.current_to_user_id === userId,
      decisionReason: row.decision_reason,
      extraHoursId: row.extra_hours_id,
      resultMessage: row.extra_hours_message,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      history: this.history(row),
    };
  }

  /** The caller's own employee row (users.emp_code = employees.id; emp_code fallback). */
  private async ownEmployee(user: JwtUser) {
    const account = await this.prisma.users.findUnique({ where: { user_id: user.sub }, select: { emp_code: true } });
    const ref = account?.emp_code ?? user.emp_code;
    if (ref == null) throw new BadRequestException('الحساب غير مرتبط بموظف');
    const emp =
      (await this.prisma.employees.findUnique({ where: { id: ref }, select: EMP_SELECT })) ??
      (await this.prisma.employees.findFirst({ where: { emp_code: ref }, select: EMP_SELECT }));
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    return emp;
  }

  private async ownEmployeeId(user: JwtUser): Promise<number | null> {
    try {
      return (await this.ownEmployee(user)).id;
    } catch {
      return null;
    }
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
    const data = rows.map((r) => this.map(this.normalize(r), user.sub));
    return paginated(data, Number(count[0]?.c ?? 0), q.page, q.pageSize);
  }

  async findOne(id: number, user: JwtUser) {
    const row = await this.findRow(id);
    await this.assertCanSee(user, row);
    return this.map(row, user.sub);
  }

  private async assertCanSee(user: JwtUser, row: OvertimeRow) {
    if (isSystemAdmin(user)) return;
    if (row.publisher === user.sub || row.current_to_user_id === user.sub || row.direct_manager_user_id === user.sub) return;
    const own = await this.ownEmployeeId(user);
    if (own != null && own === row.emp_id_fk) return;
    this.scope.assertBranchAllowed(user, row.branch_id_fk, 'لا تملك صلاحية الوصول لهذا الطلب');
  }

  // ---- create ----------------------------------------------------------------------------

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

    let emp: Awaited<ReturnType<OvertimeRequestsService['ownEmployee']>>;
    if (allowOtherEmployee && dto.empId) {
      const target = await this.prisma.employees.findUnique({ where: { id: dto.empId }, select: EMP_SELECT });
      if (!target) throw new NotFoundException('الموظف غير موجود');
      const own = await this.ownEmployeeId(user);
      if (own !== target.id && !isSystemAdmin(user)) {
        this.scope.assertBranchAllowed(user, target.branch_id_fk, 'لا يمكنك تقديم طلب لموظف خارج فرعك');
      }
      emp = target;
    } else {
      emp = await this.ownEmployee(user);
    }

    const dup = await this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM hr_overtime_requests
       WHERE emp_id_fk = ${emp.id} AND request_date = ${dto.date} AND status IN ('pending', 'approved')
       LIMIT 1`);
    if (dup.length) throw new BadRequestException('يوجد طلب ساعات إضافية لنفس اليوم بالفعل');

    const requester = await requesterUserIds(this.prisma, emp, user.sub);
    const route = await this.route(null, emp as ChainEmployee, requester);
    const history: HistoryEntry[] = [{ at: nowIso(), by: user.sub, byName: user.name, action: 'submit', note: `${hours} ساعة` }];
    if (route.skippedDirectManager) {
      history.push({ at: nowIso(), by: null, byName: 'النظام', action: 'skip', stage: 'approve_direct_manager', note: 'لا يوجد مدير مباشر غير مقدم الطلب' });
    }

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
    const note = dto.reason?.trim() || null;
    const overrideNote = auth.override
      ? `تجاوز من ${auth.role === 'hr' ? 'الموارد البشرية' : 'مدير النظام'} بدلًا من ${STAGE_LABEL[stage]}`
      : null;

    if (dto.action === 'reject') {
      history.push({ at: nowIso(), by: user.sub, byName: user.name, action: 'reject', stage, note: [overrideNote, note].filter(Boolean).join(' — ') || null });
      const changed = await this.prisma.$executeRaw(Prisma.sql`
        UPDATE hr_overtime_requests
           SET status = 'rejected', ${Prisma.raw(stage)} = 'no', decided_by = ${user.sub},
               decision_reason = ${note}, current_to_user_id = ${row.publisher}, current_to_user_name = ${row.publisher_name},
               history = ${JSON.stringify(history)}, updated_at = NOW()
         WHERE id = ${id} AND status = 'pending' AND stage = ${stage}`);
      if (!changed) throw new BadRequestException('تم اتخاذ إجراء على هذا الطلب بالفعل');
      await this.pushTo(row.publisher, user.sub, 'تم رفض طلب الساعات الإضافية', `${row.request_date} — ${note ?? ''}`.trim());
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

    // FINAL approval: record through the attendance extra-hours path (punch validation applies).
    const recorded = await this.recordExtraHours(row, user.sub);
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
      this.logger.warn(`overtime request ${id} changed while recording extra hours ${recorded.id}`);
    }
    await this.pushTo(row.publisher, user.sub, 'تم اعتماد طلب الساعات الإضافية', `${row.request_date} — ${recorded.message ?? ''}`.trim());
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

  /**
   * AttendanceService.createExtraHours checks that the caller is the employee's direct manager or
   * HR. The final approver normally is HR; when an admin overrides, the record is made under the
   * direct manager who approved, then the HR officer.
   */
  private async recordExtraHours(row: OvertimeRow, actorUserId: number) {
    const dto = Object.assign(new CreateExtraHoursDto(), {
      empId: row.emp_id_fk,
      numHours: row.hours,
      edafaDate: row.request_date,
    });
    const candidates = [actorUserId, row.direct_manager_user_id];
    const hr = await resolveByJobTitleCode(this.prisma, HR_JOB_TITLE_CODE, new Set());
    candidates.push(hr?.userId ?? null);
    const tried = new Set<number>();
    let lastForbidden: unknown = null;
    for (const candidate of candidates) {
      if (candidate == null || tried.has(candidate)) continue;
      tried.add(candidate);
      try {
        const result = (await this.attendance.createExtraHours(dto, candidate)) as {
          id?: number;
          message?: string;
          warning?: string;
          warnings?: string[];
        };
        const warning = result?.warning ?? (Array.isArray(result?.warnings) ? result.warnings.join('، ') : undefined);
        return {
          id: result?.id ?? null,
          message: [result?.message, warning].filter(Boolean).join(' — ') || null,
          warning,
          recordedAs: candidate,
        };
      } catch (error) {
        if (error instanceof ForbiddenException) {
          lastForbidden = error;
          continue;
        }
        // Validation (duplicate day, no fingerprint, …): keep the request pending at this step.
        throw new BadRequestException(`تعذر تسجيل الساعات الإضافية: ${errorText(error)}`);
      }
    }
    throw new ForbiddenException(
      `تعذر تسجيل الساعات الإضافية: ${lastForbidden ? errorText(lastForbidden) : 'لا يوجد مدير مباشر أو موارد بشرية'}`,
    );
  }

  /** The requester (or the publisher) may cancel while nothing was decided yet. */
  async cancel(id: number, user: JwtUser) {
    const row = await this.findRow(id);
    const own = await this.ownEmployeeId(user);
    if (row.publisher !== user.sub && own !== row.emp_id_fk && !isSystemAdmin(user)) {
      throw new ForbiddenException('يمكن لصاحب الطلب فقط إلغاؤه');
    }
    const history = this.history(row);
    if (row.status !== 'pending' || history.some((h) => h.action === 'accept')) {
      throw new BadRequestException('لا يمكن إلغاء طلب تمت مراجعته');
    }
    history.push({ at: nowIso(), by: user.sub, byName: user.name, action: 'cancel' });
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE hr_overtime_requests SET status = 'cancelled', stage = NULL, history = ${JSON.stringify(history)}, updated_at = NOW()
       WHERE id = ${id} AND status = 'pending'`);
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
