import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { paginated } from "../../common/dto/list-result";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EMPLOYEE_WORKFLOW_SELECT } from "../../common/prisma/employee-workflow.select";
import {
  SUSPEND_APPROVED,
  SUSPEND_REJECTED,
  SuspendStatus,
  suspendToListStatus,
} from "../../common/utils/suspend-status.util";
import { todayIso } from "../../common/utils/legacy-date.util";
import { insertLegacyNotification } from "../../common/utils/legacy-notification.util";
import { retryOnUniqueViolation } from "../../common/retry-unique";
import { CreatePermissionDto } from "./dto/create-permission.dto";
import { ActionPermissionDto } from "./dto/action-permission.dto";
import { ListPermissionsDto } from "./dto/list-permissions.dto";
import { UpdatePermissionDto } from "./dto/update-permission.dto";
import { PROCESS_CODE } from "./approval-chain.util";
import {
  ChainStageKey,
  FINAL_APPROVAL_SUSPEND,
  INTERMEDIATE_APPROVAL_SUSPEND,
  STAGE_DATE_COLUMN,
  STAGE_LABEL_AR,
  authorizeApprover,
  pendingStage,
  requesterUserIds,
  routeNext,
} from "../../common/hr-approval/approval-chain";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { isSystemAdmin } from "../../common/utils/system-admin.util";
import { PushService } from "../push/push.service";
import { ownOnlyEmployeeIds } from "../../common/hr-scope/own-hr-records";
import { PermissionEngineService } from "../rbac/engine/permission-engine.service";
import type { JwtUser } from "../../common/types/jwt-user";

/**
 * Legacy ezn caps. The legacy `ezn_setting()` reads hr_egraat_sysat (title='ozonat')
 * for nums_in_month / nums_in_one_time, and `get_available()` hard-codes a 120-minute /
 * 30-permit monthly ceiling. That settings row/table is not present in the new schema,
 * so we mirror the hard-coded legacy ceiling here. See RETURN note for the column add.
 */
const MONTHLY_MINUTES_CEILING = 120;
const MONTHLY_COUNT_CEILING = 30;
const DEFAULT_NUMS_IN_MONTH = 30;
const DEFAULT_NUMS_IN_ONE_TIME = 120;

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    // Optional so the unit specs can still construct the service with Prisma only.
    @Optional() private readonly engine?: PermissionEngineService,
    // Stateless; defaulted so the unit specs can construct the service with Prisma only.
    private readonly scope: BranchScopeService = new BranchScopeService(),
    @Optional() private readonly push?: PushService,
  ) {}

  // ---- branch scope ---------------------------------------------------------------------

  /** Employee ids inside the user's branch scope; `null` = unrestricted (system admin). */
  private async scopedEmployeeIds(user: JwtUser): Promise<number[] | null> {
    const branches = this.scope.allowedBranchIds(user);
    if (branches === null) return null;
    if (!branches.length) return [];
    const rows = await this.prisma.employees.findMany({
      where: { branch_id_fk: { in: branches } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** 403 unless the employee is the caller's own record or belongs to an allowed branch. */
  async assertEmployeeInScope(user: JwtUser, empId: number | null | undefined) {
    if (isSystemAdmin(user)) return;
    if (empId != null && user.emp_code != null && empId === user.emp_code) return;
    const emp = empId
      ? await this.prisma.employees.findUnique({ where: { id: empId }, select: { branch_id_fk: true } })
      : null;
    this.scope.assertBranchAllowed(user, emp?.branch_id_fk, "لا تملك صلاحية الوصول لأذونات هذا الموظف");
  }

  /** A permit is in scope for its publisher, its current recipient, or same-branch staff. */
  private async assertRowInScope(
    user: JwtUser | undefined,
    row: { emp_id_fk: number | null; publisher: number | null; current_to_user_id: number | null },
  ) {
    if (!user || isSystemAdmin(user)) return;
    if (row.publisher === user.sub || row.current_to_user_id === user.sub) return;
    await this.assertEmployeeInScope(user, row.emp_id_fk);
  }

  private async findInScope(id: number, user?: JwtUser) {
    const row = await this.prisma.hr_all_ozonat_orders.findUnique({ where: { id } });
    if (!row || row.cancel === "yes") throw new NotFoundException("طلب الإذن غير موجود");
    await this.assertRowInScope(user, row);
    return row;
  }

  /** Parse a HH:mm / h:i A time string into minutes-since-midnight (mirrors strtotime/60). */
  private timeToMinutes(raw: string): number {
    const s = raw.trim();
    const ampm = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
    if (ampm) {
      let h = parseInt(ampm[1], 10) % 12;
      if (/[Pp]/.test(ampm[3])) h += 12;
      return h * 60 + parseInt(ampm[2], 10);
    }
    const hm = s.match(/^(\d{1,2}):(\d{2})/);
    if (hm) return parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
    return 0;
  }

  /** round(|to-from|/60, 2) in legacy seconds → here we already have minutes; keep 2-decimals. */
  private permitMinutes(fromHour: string, toHour: string): number {
    const diff = Math.abs(
      this.timeToMinutes(toHour) - this.timeToMinutes(fromHour),
    );
    return Math.round(diff * 100) / 100;
  }

  async list(q: ListPermissionsDto, actor?: number | JwtUser) {
    const userId = typeof actor === "number" ? actor : actor?.sub;
    const and: Prisma.hr_all_ozonat_ordersWhereInput[] = [
      { OR: [{ cancel: { not: "yes" } }, { cancel: null }] },
    ];
    // Captain / reception accounts: only their own permits (the inbox tab is already personal).
    if (typeof actor === "object" && q.mode !== "wared") {
      const own = await ownOnlyEmployeeIds(this.prisma, this.engine, actor, "leaves.permissions");
      if (own) and.push({ emp_id_fk: { in: own } });
    }

    // The unfiltered board (no personal tab) defaults a web user to their branch scope.
    const personal =
      q.mode === "wared" ||
      (userId != null && (q.mode === "sader" || q.mode === "accept" || q.mode === "reject"));
    if (!personal && typeof actor === "object") {
      const empIds = await this.scopedEmployeeIds(actor);
      if (empIds) and.push({ emp_id_fk: { in: empIds } });
    }

    // legacy tabs (get_datatables_ozonat)
    switch (q.mode) {
      case "wared":
        // inbox: rows addressed to me (current_to_user_id == me)
        and.push({ current_to_user_id: userId ?? -1 });
        and.push({ actions_sends: { not: "close_talab" } });
        break;
      case "accept":
        and.push({ suspend: { in: SUSPEND_APPROVED } });
        if (userId) and.push({ publisher: userId });
        break;
      case "reject":
        and.push({ suspend: { in: SUSPEND_REJECTED } });
        if (userId) and.push({ publisher: userId });
        break;
      case "sader":
      default:
        if (q.mode === "sader" && userId) and.push({ publisher: userId });
        break;
    }

    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { emp_name: { contains: s } },
          { reason: { contains: s } },
          { date_ar: { contains: s } },
          { ezn_date_ar: { contains: s } },
        ],
      });
    }

    const where = and.length ? { AND: and } : undefined;
    const [rows, total] = await Promise.all([
      this.prisma.hr_all_ozonat_orders.findMany({
        where,
        orderBy: { id: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_all_ozonat_orders.count({ where }),
    ]);

    const empIds = [
      ...new Set(rows.map((r) => r.emp_id_fk).filter(Boolean)),
    ] as number[];
    const emps = await this.prisma.employees.findMany({
      where: { id: { in: empIds } },
      select: { id: true, employee: true },
    });
    const empMap = new Map(emps.map((e) => [e.id, e.employee]));

    const data = rows.map((r) => ({
      id: r.id,
      eznRkm: r.ezn_rkm,
      no3Ezn: r.no3_ezn,
      no3EznTitle:
        r.no3_ezn === 1
          ? "استئذان شخصي"
          : r.no3_ezn === 2
            ? "استئذان للعمل"
            : "اخرى",
      employeeName: r.emp_name ?? empMap.get(r.emp_id_fk ?? 0) ?? undefined,
      employeeId: r.emp_id_fk ?? undefined,
      date: r.ezn_date_ar ?? r.date_ar ?? undefined,
      fromTime: r.from_hour ?? undefined,
      toTime: r.to_hour ?? undefined,
      minutes: r.total_hours ?? undefined,
      reason: r.reason ?? undefined,
      fatraFk: r.fatra_fk ?? undefined,
      currentTo: r.current_to_user_name ?? undefined,
      actionsSends: r.actions_sends ?? undefined,
      status: suspendToListStatus(r.suspend),
      canAction:
        userId != null &&
        r.current_to_user_id === userId &&
        pendingStage(r) != null,
      pendingStage: pendingStage(r) ?? undefined,
      canModify: r.suspend === SuspendStatus.INCOMING && r.cancel !== "yes",
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  /** Remaining monthly minutes + permit-count for a personal permit (no3_ezn=1). */
  async available(empId: number, eznDate: string, excludeId?: number, actor?: JwtUser) {
    if (actor) await this.assertEmployeeInScope(actor, empId);
    const { month, year } = this.monthYearOf(eznDate);
    const agg = await this.prisma.hr_all_ozonat_orders.aggregate({
      where: {
        emp_id_fk: empId,
        no3_ezn: 1,
        ezn_month: month,
        ezn_year: year,
        suspend: { notIn: [2, 5] },
        ...(excludeId != null ? { id: { not: excludeId } } : {}),
      },
      _sum: { total_hours: true },
      _count: { id: true },
    });
    const usedMinutes = agg._sum.total_hours ?? 0;
    const usedCount = agg._count.id ?? 0;
    return {
      remainMinutes: MONTHLY_MINUTES_CEILING - usedMinutes,
      remainNum: MONTHLY_COUNT_CEILING - usedCount,
      usedMinutes,
      usedCount,
    };
  }

  /** Full data for the read-only details dialog. */
  async details(id: number, actor?: JwtUser) {
    const row = await this.findInScope(id, actor);
    return {
      id: row.id,
      eznRkm: row.ezn_rkm,
      employeeName: row.emp_name ?? undefined,
      employeeId: row.emp_id_fk ?? undefined,
      no3Ezn: row.no3_ezn ?? undefined,
      no3EznTitle: row.no3_ezn === 1 ? "استئذان شخصي" : row.no3_ezn === 2 ? "استئذان للعمل" : "اخرى",
      date: row.ezn_date_ar ?? row.date_ar ?? undefined,
      fromTime: row.from_hour ?? undefined,
      toTime: row.to_hour ?? undefined,
      minutes: row.total_hours ?? undefined,
      reason: row.reason ?? undefined,
      fatraFk: row.fatra_fk ?? undefined,
      currentTo: row.current_to_user_name ?? undefined,
      workflowStage: row.actions_sends ?? undefined,
      status: suspendToListStatus(row.suspend),
      canModify: row.suspend === SuspendStatus.INCOMING,
    };
  }

  /** Update an unreviewed request while preserving its employee and workflow owner. */
  async update(id: number, body: UpdatePermissionDto, actor?: JwtUser) {
    if (actor) await this.findInScope(id, actor);
    const row = await this.prisma.hr_all_ozonat_orders.findUnique({ where: { id } });
    const employeeId = row?.emp_id_fk;
    this.assertEditable(row, "تعديل");
    const minutes = this.permitMinutes(body.fromHour, body.toHour);
    if (minutes <= 0) throw new BadRequestException("مدة الإذن غير صحيحة");
    if (minutes > DEFAULT_NUMS_IN_ONE_TIME) {
      throw new BadRequestException("مدة الإذن تتجاوز الحد المسموح للمرة الواحدة");
    }
    if (body.no3Ezn === 1 && employeeId != null) {
      const avail = await this.available(employeeId, body.eznDate, id);
      if (avail.usedCount >= DEFAULT_NUMS_IN_MONTH || avail.remainNum <= 0) {
        throw new BadRequestException("تم استنفاد عدد الأذونات المسموح بها هذا الشهر");
      }
      if (minutes > avail.remainMinutes) {
        throw new BadRequestException("مدة الإذن تتجاوز الرصيد المتبقي لهذا الشهر");
      }
    }
    const { month, year } = this.monthYearOf(body.eznDate);
    const fatraN = body.fatraFk === 1 ? "فترة صباحية" : body.fatraFk === 2 ? "فترة مسائية" : null;
    await this.prisma.hr_all_ozonat_orders.update({
      where: { id },
      data: {
        no3_ezn: body.no3Ezn,
        ezn_date: body.eznDate,
        ezn_date_ar: body.eznDate,
        ezn_month: month,
        ezn_year: year,
        from_hour: body.fromHour,
        to_hour: body.toHour,
        total_hours: minutes,
        reason: body.reason.trim(),
        fatra_fk: body.fatraFk ?? null,
        fatra_n: fatraN,
      },
    });
    return { id, minutes };
  }

  /** Preserve the workflow audit trail while removing a pending request from the list. */
  async remove(id: number, actor?: JwtUser) {
    if (actor) await this.findInScope(id, actor);
    const row = await this.prisma.hr_all_ozonat_orders.findUnique({ where: { id } });
    this.assertEditable(row, "حذف");
    await this.prisma.hr_all_ozonat_orders.update({
      where: { id },
      data: { cancel: "yes", suspend: SuspendStatus.CANCELLED, reason_action: "حذف الطلب" },
    });
    return { id };
  }

  private assertEditable(
    row: { id: number; suspend: number | null; cancel: string | null } | null,
    action: "تعديل" | "حذف",
  ): asserts row is { id: number; suspend: number | null; cancel: string | null } {
    if (!row || row.cancel === "yes") throw new NotFoundException("طلب الإذن غير موجود");
    if (row.suspend !== SuspendStatus.INCOMING) {
      throw new BadRequestException(`لا يمكن ${action} الإذن بعد بدء الاعتماد`);
    }
  }

  private monthYearOf(eznDate: string): { month: number; year: number } {
    const d = new Date(eznDate + "T12:00:00");
    if (Number.isNaN(d.getTime())) {
      const now = new Date();
      return { month: now.getMonth() + 1, year: now.getFullYear() };
    }
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }

  /** Faithful port of Add_Ezn (Ezn_order_model::add_ezn) + check_setting/check_setting_time guards. */
  async create(
    body: CreatePermissionDto,
    currentUserId?: number,
    currentUserName?: string,
    actor?: JwtUser,
  ) {
    // Filing for someone else from the web: that employee must be inside the caller's branch scope.
    if (body.empId && actor) await this.assertEmployeeInScope(actor, body.empId);
    const emp = await this.resolveEmployee(body.empId, currentUserId);
    if (!emp) throw new NotFoundException("الموظف غير موجود");
    const empId = emp.id;

    const minutes = this.permitMinutes(body.fromHour, body.toHour);
    if (minutes <= 0) throw new BadRequestException("مدة الإذن غير صحيحة");

    // per-request cap (nums_in_one_time) — legacy check_setting_time
    if (minutes > DEFAULT_NUMS_IN_ONE_TIME) {
      throw new BadRequestException(
        "مدة الإذن تتجاوز الحد المسموح للمرة الواحدة",
      );
    }

    // monthly caps + remaining balance — legacy check_setting / get_available (personal only)
    if (body.no3Ezn === 1) {
      const avail = await this.available(empId, body.eznDate);
      if (avail.usedCount >= DEFAULT_NUMS_IN_MONTH || avail.remainNum <= 0) {
        throw new BadRequestException(
          "تم استنفاد عدد الأذونات المسموح بها هذا الشهر",
        );
      }
      if (minutes > avail.remainMinutes) {
        throw new BadRequestException(
          "مدة الإذن تتجاوز الرصيد المتبقي لهذا الشهر",
        );
      }
    }

    const { month, year } = this.monthYearOf(body.eznDate);
    const maxRkm = await this.prisma.hr_all_ozonat_orders.aggregate({
      _max: { ezn_rkm: true },
    });
    const eznRkm = (maxRkm._max.ezn_rkm ?? 0) + 1;

    // Legacy employees.manger stores employees.id. Some later imports store emp_code,
    // therefore resolve the legacy id first and retain an emp_code fallback.
    const managerRef = emp.manger ? parseInt(emp.manger, 10) : null;
    const managerEmp = managerRef
      ? await this.prisma.employees.findFirst({
          where: { OR: [{ id: managerRef }, { emp_code: managerRef }] },
          select: { id: true, emp_code: true, employee: true },
        })
      : null;
    // Chain: direct manager → HR → department manager. Never routed to the requester.
    const requester = await requesterUserIds(this.prisma, emp, currentUserId ?? null);
    const route = await routeNext(this.prisma, null, emp, requester);
    const firstStage = route.final ? null : route;
    const skippedFlags = Object.fromEntries(route.skipped.map((stage) => [stage, "yes"]));
    const empUser = await this.prisma.users.findFirst({
      where: { OR: [{ emp_code: emp.id }, { emp_code: emp.emp_code ?? -1 }] },
    });

    const fatraN =
      body.fatraFk === 1
        ? "فترة صباحية"
        : body.fatraFk === 2
          ? "فترة مسائية"
          : null;

    const row = await this.prisma.hr_all_ozonat_orders.create({
      data: {
        ezn_rkm: eznRkm,
        ezn_date: body.eznDate,
        ezn_date_ar: body.eznDate,
        ezn_month: month,
        ezn_year: year,
        no3_ezn: body.no3Ezn,
        fatra_fk: body.fatraFk ?? null,
        fatra_n: fatraN,
        from_hour: body.fromHour,
        to_hour: body.toHour,
        total_hours: minutes,
        reason: body.reason,
        emp_id_fk: empId,
        emp_code_fk: emp.emp_code ?? null,
        emp_user_id: empUser?.user_id ?? null,
        emp_name: emp.employee,
        edara_n: emp.edara_n,
        edara_id_fk: emp.edara_id ?? null,
        qsm_n: emp.qsm_n,
        qsm_id_fk: emp.qsm_id,
        job_title: emp.mosma_wazefy_n,
        direct_manager_id_fk: managerEmp?.id ?? managerRef ?? null,
        direct_manager_code_fk: managerEmp?.emp_code ?? managerRef ?? null,
        direct_manager_n: managerEmp?.employee ?? null,
        date: todayIso(),
        date_ar: todayIso(),
        publisher: currentUserId ?? null,
        publisher_name: currentUserName ?? null,
        level: 1,
        suspend: SuspendStatus.INCOMING,
        current_from_user_name: emp.employee,
        current_from_emp_id: empId,
        current_from_user_id: empUser?.user_id ?? null,
        current_to_user_name: firstStage?.recipient?.name ?? null,
        current_to_emp_id: firstStage?.recipient?.empId ?? null,
        current_to_user_id: firstStage?.recipient?.userId ?? null,
        send_to_direct_manager: "yes",
        actions_sends: "send_to_direct_manager",
        ...skippedFlags,
      },
    });

    for (const stage of route.skipped) {
      await this.insertHistory({
        eznRkm,
        eznId: row.id,
        fromUserId: currentUserId,
        fromUserName: currentUserName,
        msg: `تخطي ${STAGE_LABEL_AR[stage]} (لا يوجد مستلم غير مقدم الطلب)`,
        reason: `skip_${stage}`,
        suspend: "0",
        processCode: PROCESS_CODE.ACCEPT,
      });
    }
    await this.insertHistory({
      eznRkm,
      eznId: row.id,
      fromUserId: currentUserId,
      fromUserName: currentUserName,
      toUserId: firstStage?.recipient?.userId,
      toUserName: firstStage?.recipient?.name ?? undefined,
      msg: `تحويل إلى ${STAGE_LABEL_AR[firstStage?.stage ?? "approve_hr"]}`,
      reason: "send_to_direct_manager",
      suspend: "0",
      processCode: PROCESS_CODE.ACCEPT,
    });
    await this.notify(row.id, 102, currentUserId, firstStage?.recipient?.userId, {
      title: "لديك طلب إذن جديد",
      body: `${emp.employee ?? ""} — ${body.eznDate} ${body.fromHour}–${body.toHour}`,
    });

    return { id: row.id, eznRkm, minutes };
  }

  /**
   * One decision on the pending step (direct manager → HR → department manager).
   * Only the routed recipient, or HR / an admin (override, recorded in the history), may act.
   * Final approval = suspend 4 + close_talab 'yes' (FINAL_APPROVAL_SUSPEND).
   */
  async action(
    id: number,
    body: ActionPermissionDto,
    userId?: number,
    userName?: string,
    actor?: JwtUser,
  ) {
    const row = await this.prisma.hr_all_ozonat_orders.findUnique({
      where: { id },
    });
    if (!row || row.cancel === "yes") throw new NotFoundException("طلب الإذن غير موجود");

    const workflowState = row.actions_sends ?? "";
    // Demo/legacy rows use start/progress and never entered the current approval chain.
    if (workflowState === "start" || workflowState === "progress") {
      throw new BadRequestException("هذا الإذن ليس ضمن مسار الاعتماد الجديد");
    }
    const stage = pendingStage(row);
    if (!stage)
      throw new BadRequestException("لا يوجد إجراء متاح على هذا الطلب");

    const emp = row.emp_id_fk
      ? await this.prisma.employees.findUnique({
          where: { id: row.emp_id_fk },
          select: EMPLOYEE_WORKFLOW_SELECT,
        })
      : null;
    const requester = await requesterUserIds(this.prisma, emp, row.publisher);
    if (row.emp_user_id) requester.add(row.emp_user_id);
    const auth = await authorizeApprover(
      this.prisma,
      { userId: userId ?? actor?.sub, isSuperAdmin: actor?.is_super_admin === true },
      row,
      requester,
      (uid) => this.hasHrApproveGrant(uid),
    );

    const reason = body.reason ?? null;
    let toUserId: number | null;
    let toUserName: string | null = null;
    let toEmpId: number | null = null;
    let suspend: number;
    let stageFlag: "yes" | "no";
    let processCode: number;
    let final = false;
    let nextStage: ChainStageKey | null = null;
    let skipped: ChainStageKey[] = [];
    const autoApproved: ChainStageKey[] = [];
    const data: Record<string, unknown> = {};

    if (body.action === "accept") {
      stageFlag = "yes";
      const done = {
        approve_direct_manager: row.approve_direct_manager,
        approve_hr: row.approve_hr,
        approve_moder_edara: row.approve_moder_edara,
      } as Record<ChainStageKey, string | null>;
      let route = await routeNext(this.prisma, stage, emp, requester, done);
      skipped = [...route.skipped];
      // The next step belongs to the person deciding now (e.g. the direct manager is also the
      // HR officer): their decision covers it, no second click.
      const actingId = userId ?? actor?.sub;
      while (!route.final && route.recipient?.userId != null && route.recipient.userId === actingId) {
        autoApproved.push(route.stage);
        data[route.stage] = "yes";
        data[STAGE_DATE_COLUMN[route.stage]] = todayIso();
        done[route.stage] = "yes";
        route = await routeNext(this.prisma, route.stage, emp, requester, done);
        skipped.push(...route.skipped);
      }
      for (const s of skipped) data[s] = "yes";
      if (route.final) {
        final = true;
        suspend = FINAL_APPROVAL_SUSPEND;
        toUserId = row.publisher ?? null;
        processCode = PROCESS_CODE.ACCEPT_LATER;
      } else {
        suspend = INTERMEDIATE_APPROVAL_SUSPEND;
        nextStage = route.stage;
        toUserId = route.recipient?.userId ?? null;
        toUserName = route.recipient?.name ?? null;
        toEmpId = route.recipient?.empId ?? null;
        processCode =
          stage === "approve_direct_manager"
            ? PROCESS_CODE.ACCEPT
            : PROCESS_CODE.ACCEPT_LATER;
      }
    } else {
      stageFlag = "no";
      suspend = SuspendStatus.REJECTED;
      toUserId = row.publisher ?? null;
      processCode =
        stage === "approve_direct_manager"
          ? PROCESS_CODE.REJECT_DIRECT
          : PROCESS_CODE.REJECT_LATER;
    }

    if (!toUserName && toUserId) {
      const toUser = await this.prisma.users.findUnique({ where: { user_id: toUserId } });
      if (toUser?.emp_code != null) {
        const recEmp = await this.prisma.employees.findFirst({
          where: { OR: [{ id: toUser.emp_code }, { emp_code: toUser.emp_code }] },
          select: { employee: true },
        });
        toUserName = recEmp?.employee ?? null;
      }
      toUserName ??= toUser?.name ?? null;
    }

    Object.assign(data, {
      [stage]: stageFlag,
      suspend,
      actions_sends: stage,
      reason_action: reason?.slice(0, 50) ?? null,
      [STAGE_DATE_COLUMN[stage]]: todayIso(),
      current_from_user_id: userId ?? null,
      current_from_user_name: userName ?? null,
      current_to_user_id: toUserId,
      current_to_user_name: toUserName,
      current_to_emp_id: toEmpId,
    });
    if (final) data.close_talab = "yes";

    await this.prisma.hr_all_ozonat_orders.update({
      where: { id },
      data: data as Prisma.hr_all_ozonat_ordersUpdateInput,
    });

    const decision = body.action === "accept" ? "اعتماد" : "رفض";
    await this.insertHistory({
      eznRkm: row.ezn_rkm,
      eznId: id,
      fromUserId: userId,
      fromUserName: userName,
      toUserId: toUserId ?? undefined,
      toUserName: toUserName ?? undefined,
      msg: auth.override
        ? `${decision} — تجاوز من ${auth.role === "hr" ? "الموارد البشرية" : "مدير النظام"} بدلًا من ${STAGE_LABEL_AR[stage]}`
        : decision,
      reason: stage,
      suspend: String(suspend),
      processCode,
    });
    for (const s of autoApproved) {
      await this.insertHistory({
        eznRkm: row.ezn_rkm,
        eznId: id,
        fromUserId: userId,
        fromUserName: userName,
        msg: `اعتماد ${STAGE_LABEL_AR[s]} (نفس المعتمد)`,
        reason: s,
        suspend: String(suspend),
        processCode,
      });
    }
    for (const s of skipped) {
      await this.insertHistory({
        eznRkm: row.ezn_rkm,
        eznId: id,
        fromUserId: userId,
        fromUserName: userName,
        msg: `تخطي ${STAGE_LABEL_AR[s]} (لا يوجد مستلم غير مقدم الطلب)`,
        reason: `skip_${s}`,
        suspend: String(suspend),
        processCode,
      });
    }
    if (final) {
      await this.insertHistory({
        eznRkm: row.ezn_rkm,
        eznId: id,
        fromUserId: userId,
        fromUserName: userName,
        toUserId: toUserId ?? undefined,
        toUserName: toUserName ?? undefined,
        msg: "إغلاق الطلب",
        reason: "close_talab",
        suspend: String(suspend),
        processCode: PROCESS_CODE.CLOSE,
      });
    }

    const when = `${row.ezn_date_ar ?? row.date_ar ?? ""} ${row.from_hour ?? ""}–${row.to_hour ?? ""}`;
    if (body.action === "accept" && !final) {
      await this.notify(id, nextStage === "approve_hr" ? 116 : 115, userId, toUserId, {
        title: "لديك طلب إذن بانتظار اعتمادك",
        body: `${row.emp_name ?? ""} — ${when}`,
      });
      if (row.publisher != null && row.publisher !== toUserId && row.publisher !== userId) {
        await insertLegacyNotification(this.prisma, id, nextStage === "approve_hr" ? 116 : 115, userId, row.publisher);
      }
    } else {
      await this.notify(id, body.action === "accept" ? 119 : 120, userId, row.publisher, {
        title: body.action === "accept" ? "تم اعتماد طلب الإذن" : "تم رفض طلب الإذن",
        body: body.action === "accept" ? when : reason ?? when,
      });
    }

    return { id, stage, suspend, status: suspendToListStatus(suspend), final, nextStage, override: auth.override };
  }

  /** HR authority through RBAC (the HR job-title role holds hr:approve). */
  private async hasHrApproveGrant(userId: number): Promise<boolean> {
    if (!this.engine) return false;
    try {
      return await this.engine.can(userId, "hr", "approve");
    } catch {
      return false;
    }
  }

  /** In-app notification row (legacy codes) + best-effort push. */
  private async notify(
    targetId: number,
    code: number,
    fromUser: number | null | undefined,
    toUser: number | null | undefined,
    push: { title: string; body: string },
  ) {
    await insertLegacyNotification(this.prisma, targetId, code, fromUser, toUser);
    if (toUser && toUser !== fromUser && this.push) {
      try {
        await this.push.pushToUsers([toUser], push.title, push.body);
      } catch {
        // best-effort
      }
    }
  }

  /** Kept for backward-compatible single-step approve route (delegates to chain action). */
  async approve(id: number, userId?: number, userName?: string, actor?: JwtUser) {
    if (actor) await this.findInScope(id, actor);
    return this.action(id, { action: "accept" }, userId, userName, actor);
  }

  async reject(id: number, userId?: number, userName?: string, actor?: JwtUser, reason?: string) {
    if (actor) await this.findInScope(id, actor);
    return this.action(id, { action: "reject", reason }, userId, userName, actor);
  }

  /** Resolve both legacy linkage conventions: users.emp_code may hold employees.id or employees.emp_code. */
  private async resolveEmployee(empId?: number, userId?: number) {
    if (empId) {
      return this.prisma.employees.findUnique({
        where: { id: empId },
        select: EMPLOYEE_WORKFLOW_SELECT,
      });
    }
    if (!userId) throw new BadRequestException("إسم الموظف مطلوب");

    const account = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { emp_code: true },
    });
    if (account?.emp_code == null) {
      throw new BadRequestException("الحساب غير مرتبط بموظف");
    }

    return this.prisma.employees.findFirst({
      where: {
        OR: [{ id: account.emp_code }, { emp_code: account.emp_code }],
      },
      select: EMPLOYEE_WORKFLOW_SELECT,
    });
  }

  private async insertHistory(opts: {
    eznRkm: number | null | undefined;
    eznId: number;
    fromUserId?: number;
    fromUserName?: string;
    toUserId?: number | null;
    toUserName?: string;
    msg: string;
    reason: string;
    suspend: string;
    processCode?: number;
  }) {
    // Legacy table with a hand-assigned PK — recompute+retry on collision so two concurrent
    // history writes can't crash on a duplicate id.
    await retryOnUniqueViolation(async () => {
      const max = await this.prisma.hr_all_ozonat_history.aggregate({
        _max: { id: true },
      });
      const nextId = (max._max.id ?? 0) + 1;
      return this.prisma.hr_all_ozonat_history.create({
        data: {
          id: nextId,
          ezn_rkm_fk: opts.eznRkm ?? 0,
          ezn_rkm_id: opts.eznId,
          from_user_id: opts.fromUserId ?? 0,
          from_user_name: opts.fromUserName ?? "النظام",
          to_user_id: opts.toUserId ?? 0,
          to_user_name: opts.toUserName ?? null,
          talab_in_fk: opts.processCode ?? null,
          talab_msg: opts.msg,
          reason_action: opts.reason,
          date: todayIso(),
          date_ar: todayIso(),
          suspend: opts.suspend,
        },
      });
    });
  }
}
