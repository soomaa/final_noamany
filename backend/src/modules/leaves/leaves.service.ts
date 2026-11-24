import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { assertNoOverlap } from "../../common/validators/validation.util";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { isSystemAdmin } from "../../common/utils/system-admin.util";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { paginated } from "../../common/dto/list-result";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  EMPLOYEE_WORKFLOW_SELECT,
  WorkflowEmployee,
} from "../../common/prisma/employee-workflow.select";
import {
  SUSPEND_APPROVED,
  SUSPEND_REJECTED,
  SuspendStatus,
  suspendToListStatus,
} from "../../common/utils/suspend-status.util";
import { legacyBusinessIsoDate, todayIso } from "../../common/utils/legacy-date.util";
import { insertLegacyNotification } from "../../common/utils/legacy-notification.util";
import { CreateLeaveDto } from "./dto/create-leave.dto";
import { ActionLeaveDto, ResubmitLeaveDto } from "./dto/action-leave.dto";
import { ListLeavesDto } from "./dto/list-leaves.dto";
import { JwtUser } from "../../common/types/jwt-user";
import { PROCESS_CODE } from "./approval-chain.util";
import {
  ChainStageKey,
  FINAL_APPROVAL_SUSPEND,
  INTERMEDIATE_APPROVAL_SUSPEND,
  STAGE_DATE_COLUMN,
  STAGE_LABEL_AR,
  authorizeApprover,
  isHrOfficer,
  pendingStage,
  requesterUserIds,
  resolveStageRecipient,
  routeNext,
} from "../../common/hr-approval/approval-chain";
import {
  FLOW_STATUS_LABEL_AR,
  ReturnInfo,
  chainFlowStatus,
  createReturn,
  legacyHistoryEntry,
  loadTimeline,
  mergeTimeline,
  openReturn,
  openReturnsFor,
  recordTimeline,
  requireReturnComment,
  resolveReturn,
} from "../../common/hr-approval/request-flow";
import { PushService } from "../push/push.service";
import { ownOnlyEmployeeIds } from "../../common/hr-scope/own-hr-records";
import { PermissionEngineService } from "../rbac/engine/permission-engine.service";

/** Requested range kept when an approver narrows a leave (partial approval). */
export interface OriginalRange {
  from: string;
  to: string;
  days: number;
}

/** legacy day-name array indexed by PHP date('N') (1=Mon .. 7=Sun). */
const AR_DAYS = [
  "",
  "الأثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
  "الأحد",
];

@Injectable()
export class LeavesService {
  constructor(
    private readonly prisma: PrismaService,
    // Stateless; defaulted so the existing unit specs can still construct the service.
    private readonly scope: BranchScopeService = new BranchScopeService(),
    // Optional so the unit specs can still construct the service without the RBAC engine.
    @Optional() private readonly engine?: PermissionEngineService,
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

  /** Throw 403 unless the employee is the user's own record or belongs to an allowed branch. */
  private async assertEmployeeInScope(user: JwtUser, empId: number | null | undefined) {
    if (isSystemAdmin(user)) return;
    if (empId != null && user.emp_code != null && empId === user.emp_code) return;
    const emp = empId
      ? await this.prisma.employees.findUnique({ where: { id: empId }, select: { branch_id_fk: true } })
      : null;
    this.scope.assertBranchAllowed(user, emp?.branch_id_fk, "لا تملك صلاحية الوصول لإجازات هذا الموظف");
  }

  /** A leave row is in scope for its publisher, its current recipient, or same-branch staff. */
  private async assertLeaveInScope(
    user: JwtUser,
    row: { emp_id_fk: number | null; publisher: number | null; current_to_user_id: number | null },
  ) {
    if (isSystemAdmin(user)) return;
    if (row.publisher === user.sub || row.current_to_user_id === user.sub) return;
    await this.assertEmployeeInScope(user, row.emp_id_fk);
  }

  private arDayName(dateStr?: string | null): string | null {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T12:00:00");
    if (Number.isNaN(d.getTime())) return null;
    // JS getDay(): 0=Sun..6=Sat → PHP N: Mon=1..Sun=7
    const jsDay = d.getDay();
    const phpN = jsDay === 0 ? 7 : jsDay;
    return AR_DAYS[phpN] ?? null;
  }

  async list(
    q: ListLeavesDto,
    actor?: number | JwtUser,
  ) {
    const userId = typeof actor === "number" ? actor : actor?.sub;
    const isAdmin = typeof actor === "object" && isSystemAdmin(actor);
    const and: Prisma.hr_all_agzat_ordersWhereInput[] = [];

    // legacy tabs (get_datatables_agazat)
    switch (q.mode) {
      case "wared":
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

    // The unfiltered board (no personal tab) defaults a web user to their branch scope.
    // Personal tabs (wared/sader/accept/reject) are already limited to the caller.
    const personal =
      q.mode === "wared" ||
      (userId != null && (q.mode === "sader" || q.mode === "accept" || q.mode === "reject"));
    if (!personal && typeof actor === "object") {
      const empIds = await this.scopedEmployeeIds(actor);
      if (empIds) and.push({ emp_id_fk: { in: empIds } });
    }
    // Captain / reception accounts: only their own leave requests (the inbox tab is already personal).
    if (typeof actor === "object" && q.mode !== "wared") {
      const own = await ownOnlyEmployeeIds(this.prisma, this.engine, actor, "leaves.requests");
      if (own) and.push({ emp_id_fk: { in: own } });
    }

    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { edara_n: { contains: s } },
          { reason: { contains: s } },
          { agaza_from_date_m: { contains: s } },
        ],
      });
    }

    const where = and.length ? { AND: and } : undefined;
    const [rows, total] = await Promise.all([
      this.prisma.hr_all_agzat_orders.findMany({
        where,
        orderBy: { id: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_all_agzat_orders.count({ where }),
    ]);

    const empIds = [
      ...new Set(rows.map((r) => r.emp_id_fk).filter(Boolean)),
    ] as number[];
    const typeIds = [
      ...new Set(rows.map((r) => r.no3_agaza).filter(Boolean)),
    ] as number[];
    const [emps, types] = await Promise.all([
      this.prisma.employees.findMany({
        where: { id: { in: empIds } },
        select: { id: true, employee: true },
      }),
      this.prisma.holiday_setting.findMany({ where: { id: { in: typeIds } } }),
    ]);
    const empMap = new Map(emps.map((e) => [e.id, e.employee]));
    const typeMap = new Map(types.map((t) => [t.id, t.name]));
    const returns = await openReturnsFor(this.prisma, "leave", rows.map((r) => r.id));

    const data = rows.map((r) => ({
      id: r.id,
      agaza_rkm: r.agaza_rkm,
      requestNumber: r.agaza_rkm ?? undefined,
      submittedAt: legacyBusinessIsoDate(r.agaza_date),
      employeeName: empMap.get(r.emp_id_fk ?? 0) ?? r.manager_name ?? undefined,
      leaveType:
        r.no3_agaza != null
          ? (typeMap.get(r.no3_agaza) ?? String(r.no3_agaza))
          : undefined,
      f2aAgaza: r.f2a_agaza ?? undefined,
      startDate: r.agaza_from_date_m ?? undefined,
      endDate: r.agaza_to_date_m ?? undefined,
      returnToWorkDate: r.mobashret_amal_date_m ?? undefined,
      days: r.num_days != null ? Math.round(r.num_days) : undefined,
      currentTo: r.current_to_user_name ?? undefined,
      reason: r.reason ?? undefined,
      addressSinceAgaza: r.address_since_agaza ?? undefined,
      actionsSends: r.actions_sends ?? undefined,
      status: suspendToListStatus(r.suspend),
      canAction:
        userId != null &&
        r.current_to_user_id === userId &&
        pendingStage(r) != null &&
        !returns.has(r.id),
      pendingStage: pendingStage(r) ?? undefined,
      canManage:
        r.suspend === SuspendStatus.INCOMING &&
        !returns.has(r.id) &&
        (isAdmin || (userId != null && r.publisher === userId)),
      ...this.flowFields(r, returns.get(r.id) ?? null, userId),
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  /** Faithful port of add_agaza / get_data_new — full request fields. */
  async create(
    body: CreateLeaveDto,
    currentUserId?: number,
    currentUserName?: string,
    options?: { enforceLegacyMobileBalance?: boolean },
    actor?: JwtUser,
  ) {
    if (!body.leaveTypeId || !body.startDate || !body.endDate) {
      throw new BadRequestException("نوع الإجازة والتواريخ مطلوبة");
    }

    const start = new Date(body.startDate + "T12:00:00");
    const end = new Date(body.endDate + "T12:00:00");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException("تواريخ غير صحيحة");
    }
    if (end < start)
      throw new BadRequestException("تاريخ النهاية يجب أن يكون بعد البداية");

    const days =
      body.numDays ??
      Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    const leaveType = await this.prisma.holiday_setting.findUnique({
      where: { id: body.leaveTypeId },
    });
    if (!leaveType) throw new BadRequestException("نوع الإجازة غير موجود");
    if (leaveType.agaza_ttype === 1) {
      throw new BadRequestException(
        "الإجازات الرسمية تُحدد من إعدادات الإجازات الرسمية ولا تُقدم كطلب موظف",
      );
    }
    if (
      leaveType.min_days != null &&
      leaveType.min_days > 0 &&
      days < leaveType.min_days
    ) {
      throw new BadRequestException(
        `الحد الأدنى لهذا النوع ${leaveType.min_days} يوم`,
      );
    }
    if (
      leaveType.max_days != null &&
      leaveType.max_days > 0 &&
      days > leaveType.max_days
    ) {
      throw new BadRequestException(
        `الحد الأقصى لهذا النوع ${leaveType.max_days} يوم`,
      );
    }

    let empId = body.empId;
    let emp: WorkflowEmployee | null = null;
    // Filing for someone else: web callers must have that employee in branch scope;
    // callers without a JWT scope (mobile) may only name their own employee row.
    if (empId) await this.assertCanFileFor(empId, currentUserId, actor);
    if (!empId && currentUserId) {
      const account = await this.prisma.users.findUnique({
        where: { user_id: currentUserId },
      });
      if (account?.emp_code != null) {
        // New-system invariant: users.emp_code stores employees.id. Keep the
        // business-code fallback for older imports, but prefer the primary key
        // so a coincidentally equal emp_code cannot route a request to another employee.
        emp = await this.prisma.employees.findUnique({
          where: { id: account.emp_code },
          select: EMPLOYEE_WORKFLOW_SELECT,
        });
        emp ??= await this.prisma.employees.findFirst({
          where: { emp_code: account.emp_code },
          select: EMPLOYEE_WORKFLOW_SELECT,
        });
        empId = emp?.id;
      }
    }
    if (empId) {
      emp ??= await this.prisma.employees.findUnique({
        where: { id: empId },
        select: EMPLOYEE_WORKFLOW_SELECT,
      });
      if (!emp) throw new NotFoundException("الموظف غير موجود");

      // Overlap check
      const overlapping = await this.prisma.hr_all_agzat_orders.findMany({
        where: {
          emp_id_fk: empId,
          suspend: SuspendStatus.APPROVED,
          agaza_from_date_m: { lte: body.endDate },
          agaza_to_date_m: { gte: body.startDate },
        },
      });
      assertNoOverlap(
        { start: body.startDate, end: body.endDate, label: "الإجازة الجديدة" },
        overlapping.map((o) => ({
          start: o.agaza_from_date_m ?? body.startDate,
          end: o.agaza_to_date_m ?? body.endDate,
          id: o.id,
          label: o.agaza_from_date_m ?? undefined,
        })),
        "يوجد تداخل مع إجازة معتمدة",
      );
    }

    // The legacy endpoint opts into its historical balance ladder. Employee requests
    // from the new mobile API deliberately do not use a leave-balance restriction.
    if (emp && options?.enforceLegacyMobileBalance) {
      await this.assertLegacyMobileBalance(
        emp.id,
        emp.start_work_date_m,
        body.leaveTypeId,
        days,
      );
    }

    if (emp && [3, 4].includes(body.leaveTypeId)) {
      await this.assertSickLeaveMonthlyLimit(emp.id, body.startDate);
    }

    const maxRkm = await this.prisma.hr_all_agzat_orders.aggregate({
      _max: { agaza_rkm: true },
    });
    const agazaRkm = (maxRkm._max.agaza_rkm ?? 0) + 1;

    const empCode = emp?.emp_code ?? null;
    const empCodeBig = empCode != null ? BigInt(empCode) : null;

    // Legacy employees.manger stores employees.id; retain emp_code fallback for later imports.
    const managerRef = emp?.manger ? parseInt(emp.manger, 10) : null;
    const managerEmp = managerRef
      ? await this.prisma.employees.findFirst({
          where: { OR: [{ id: managerRef }, { emp_code: managerRef }] },
          select: { id: true, emp_code: true, employee: true },
        })
      : null;
    const empUser =
      emp != null
        ? await this.prisma.users.findFirst({
            where: { OR: [{ emp_code: emp.id }, { emp_code: empCode ?? -1 }] },
          })
        : null;

    // substitute employee
    let substituteEmp = null as typeof emp;
    if (body.substituteEmpId) {
      substituteEmp = await this.prisma.employees.findUnique({
        where: { id: body.substituteEmpId },
        select: EMPLOYEE_WORKFLOW_SELECT,
      });
    }
    // legacy: level=1 when a substitute is set (route to substitute first), else level=2
    const level = body.substituteEmpId ? 1 : 2;

    // Chain: direct manager → HR → department manager. Never routed to the requester.
    const requester = await requesterUserIds(this.prisma, emp, currentUserId ?? null);
    const route = await routeNext(this.prisma, null, emp, requester);
    const firstStage = route.final ? null : route;
    const skippedFlags = Object.fromEntries(route.skipped.map((stage) => [stage, "yes"]));

    const row = await this.prisma.hr_all_agzat_orders.create({
      data: {
        agaza_rkm: agazaRkm,
        no3_agaza: body.leaveTypeId,
        f2a_agaza: body.f2aAgaza ?? 0,
        emp_id_fk: empId ?? null,
        emp_code_fk: empCodeBig,
        edara_id_fk: emp?.edara_id ?? null,
        edara_n: emp?.edara_n ?? null,
        qsm_id_fk: 0,
        qsm_n: "",
        direct_manager_id_fk: managerEmp?.id ?? managerRef ?? null,
        direct_manager_code_fk:
          managerEmp?.emp_code != null
            ? BigInt(managerEmp.emp_code)
            : managerRef != null
              ? BigInt(managerRef)
              : null,
        direct_manager_n: managerEmp?.employee ?? null,
        agaza_from_date_m: body.startDate,
        agaza_to_date_m: body.endDate,
        agaza_from_date_h: body.startDateHijri ?? null,
        agaza_to_date_h: body.endDateHijri ?? null,
        agaza_from_date: Math.floor(start.getTime() / 1000),
        agaza_to_date: Math.floor(end.getTime() / 1000),
        num_days: days,
        mobashret_amal_date_m: body.returnToWorkDate ?? null,
        mobashret_amal_date_h: body.returnToWorkDateHijri ?? null,
        address_since_agaza: body.addressSinceAgaza ?? null,
        emp_jwal: body.empPhone ?? null,
        agaza_from_day_n: this.arDayName(body.startDate),
        agaza_to_day_n: this.arDayName(body.endDate),
        mobashret_amal_day_n: this.arDayName(body.returnToWorkDate),
        emp_badel_id_fk: body.substituteEmpId ?? null,
        emp_badel_code_fk:
          substituteEmp?.emp_code != null
            ? BigInt(substituteEmp.emp_code)
            : null,
        emp_badel_n: substituteEmp?.employee ?? null,
        daraget_waffa: body.daragetWaffa ?? null,
        marad_name: body.maradName ?? null,
        hospital_name: body.hospitalName ?? null,
        hospital_report: body.hospitalReport ?? null,
        taqrer_form_date_m: body.taqrerFromDate ?? null,
        taqrer_to_date_m: body.taqrerToDate ?? null,
        reason: body.reason ?? body.pledge ?? null,
        agaza_date: todayIso(),
        agaza_date_ar: todayIso(),
        suspend: SuspendStatus.INCOMING,
        level,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        publisher: currentUserId ?? null,
        publisher_name: currentUserName ?? null,
        current_from_user_name: emp?.employee ?? null,
        current_from_user_id: empUser?.user_id ?? null,
        current_from_emp_id: empId != null ? String(empId) : null,
        current_to_user_name: firstStage?.recipient?.name ?? null,
        current_to_user_id: firstStage?.recipient?.userId ?? null,
        current_to_emp_id:
          firstStage?.recipient?.empId != null ? String(firstStage.recipient.empId) : null,
        send_to_direct_manager: "yes",
        actions_sends: "send_to_direct_manager",
        ...skippedFlags,
      },
    });

    for (const stage of route.skipped) {
      await this.insertHistory({
        agazaRkm,
        agazaId: row.id,
        fromUser: currentUserId,
        fromUserName: currentUserName,
        msg: `تخطي ${STAGE_LABEL_AR[stage]}`.slice(0, 30),
        reason: `skip_${stage}`.slice(0, 30),
        processCode: PROCESS_CODE.ACCEPT,
      });
    }
    await this.insertHistory({
      agazaRkm,
      agazaId: row.id,
      fromUser: currentUserId,
      fromUserName: currentUserName,
      toUser: firstStage?.recipient?.userId,
      toUserName: firstStage?.recipient?.name ?? undefined,
      msg: `تحويل إلى ${STAGE_LABEL_AR[firstStage?.stage ?? "approve_hr"]}`.slice(0, 30),
      reason: "send_to_direct_manager",
      processCode: PROCESS_CODE.ACCEPT,
    });
    await this.notify(row.id, 101, currentUserId, firstStage?.recipient?.userId, {
      title: "لديك طلب إجازة جديد",
      body: `${emp?.employee ?? currentUserName ?? ""} — من ${body.startDate} إلى ${body.endDate}`,
    });
    await recordTimeline(this.prisma, "leave", row.id, {
      action: "submit",
      by: currentUserId ?? null,
      byName: currentUserName ?? null,
      to: firstStage?.recipient?.userId ?? null,
      toName: firstStage?.recipient?.name ?? null,
      comment: body.reason ?? null,
    });
    for (const stage of route.skipped) {
      await recordTimeline(this.prisma, "leave", row.id, { action: "skip", stage, byName: "النظام" });
    }

    return { id: row.id, agaza_rkm: row.agaza_rkm };
  }

  /**
   * One decision on the pending step (direct manager → HR → department manager).
   * Only the routed recipient, or HR / an admin (override, recorded in the history), may act.
   * On accept the approver may narrow the dates (partial approval) inside the requested range.
   * Final approval = suspend 4 + close_talab 'yes' (see FINAL_APPROVAL_SUSPEND).
   */
  async action(
    id: number,
    body: ActionLeaveDto,
    userId?: number,
    userName?: string,
    actor?: JwtUser,
  ) {
    const row = await this.prisma.hr_all_agzat_orders.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("طلب الإجازة غير موجود");

    const stage = pendingStage(row);
    if (!stage)
      throw new BadRequestException("لا يوجد إجراء متاح على هذا الطلب");
    if (await openReturn(this.prisma, "leave", id)) {
      throw new BadRequestException("الطلب مرتجع لمقدمه للتعديل؛ استنى إعادة الإرسال");
    }

    const emp = row.emp_id_fk
      ? await this.prisma.employees.findUnique({
          where: { id: row.emp_id_fk },
          select: EMPLOYEE_WORKFLOW_SELECT,
        })
      : null;
    const requester = await requesterUserIds(this.prisma, emp, row.publisher);
    const auth = await authorizeApprover(
      this.prisma,
      { userId: userId ?? actor?.sub, isSuperAdmin: actor?.is_super_admin === true },
      row,
      requester,
      (uid) => this.hasHrApproveGrant(uid),
    );
    // Never route the next step back to the person deciding now, nor to the requester.
    const exclude = new Set(requester);

    if (body.action === "return") {
      return this.returnForChanges(row, stage, body.comment ?? body.reason, requester, auth.override, userId ?? actor?.sub, userName);
    }

    const reason = body.reason ?? body.comment ?? null;
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
    let original: OriginalRange | null = null;
    const data: Record<string, unknown> = {};

    if (body.action === "accept") {
      stageFlag = "yes";
      const partial = await this.partialApprovalData(row, body);
      original = partial.original;
      Object.assign(data, partial.data);
      const done = {
        approve_direct_manager: row.approve_direct_manager,
        approve_hr: row.approve_hr,
        approve_moder_edara: row.approve_moder_edara,
      } as Record<ChainStageKey, string | null>;
      let route = await routeNext(this.prisma, stage, emp, exclude, done);
      skipped = [...route.skipped];
      // The next step belongs to the person deciding now (e.g. the direct manager is also the
      // HR officer): their decision covers it, no second click.
      const actingId = userId ?? actor?.sub;
      while (!route.final && route.recipient?.userId != null && route.recipient.userId === actingId) {
        autoApproved.push(route.stage);
        data[route.stage] = "yes";
        data[STAGE_DATE_COLUMN[route.stage]] = todayIso();
        done[route.stage] = "yes";
        route = await routeNext(this.prisma, route.stage, emp, exclude, done);
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
        let recEmp = await this.prisma.employees.findUnique({
          where: { id: toUser.emp_code },
          select: { employee: true },
        });
        recEmp ??= await this.prisma.employees.findFirst({
          where: { emp_code: toUser.emp_code },
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
      current_to_emp_id: toEmpId != null ? String(toEmpId) : null,
    });
    if (final) data.close_talab = "yes";

    await this.prisma.hr_all_agzat_orders.update({
      where: { id },
      data: data as Prisma.hr_all_agzat_ordersUpdateInput,
    });
    if (original) await this.recordOriginalRange(id, original);

    const decision = body.action === "accept"
      ? original ? "اعتماد جزئي" : "اعتماد"
      : "رفض";
    await recordTimeline(this.prisma, "leave", id, {
      action: body.action === "accept" ? "accept" : "reject",
      stage,
      by: userId ?? actor?.sub ?? null,
      byName: userName ?? null,
      to: toUserId,
      toName: toUserName,
      comment: [original ? `اعتماد جزئي ${data.agaza_from_date_m} → ${data.agaza_to_date_m}` : null, reason].filter(Boolean).join(" — ") || null,
      override: auth.override,
    });
    for (const s of autoApproved) {
      await recordTimeline(this.prisma, "leave", id, { action: "accept", stage: s, by: userId ?? null, byName: userName ?? null, comment: "نفس المعتمد" });
    }
    for (const s of skipped) {
      await recordTimeline(this.prisma, "leave", id, { action: "skip", stage: s, byName: "النظام" });
    }
    await this.insertHistory({
      agazaRkm: row.agaza_rkm,
      agazaId: id,
      fromUser: userId,
      fromUserName: userName,
      toUser: toUserId ?? undefined,
      toUserName: toUserName ?? undefined,
      msg: (auth.override ? `${decision} (تجاوز ${auth.role === "hr" ? "HR" : "مدير"})` : decision).slice(0, 30),
      reason: stage,
      processCode,
    });
    if (original) {
      await this.insertHistory({
        agazaRkm: row.agaza_rkm,
        agazaId: id,
        fromUser: userId,
        fromUserName: userName,
        msg: `الأصل ${original.days} يوم→${data.num_days} يوم`.slice(0, 30),
        reason: `${original.from}~${original.to}`.slice(0, 30),
        processCode,
      });
    }
    for (const s of autoApproved) {
      await this.insertHistory({
        agazaRkm: row.agaza_rkm,
        agazaId: id,
        fromUser: userId,
        fromUserName: userName,
        msg: `اعتماد ${STAGE_LABEL_AR[s]} (نفس المعتمد)`.slice(0, 30),
        reason: s,
        processCode,
      });
    }
    for (const s of skipped) {
      await this.insertHistory({
        agazaRkm: row.agaza_rkm,
        agazaId: id,
        fromUser: userId,
        fromUserName: userName,
        msg: `تخطي ${STAGE_LABEL_AR[s]}`.slice(0, 30),
        reason: `skip_${s}`.slice(0, 30),
        processCode,
      });
    }
    if (final) {
      await this.insertHistory({
        agazaRkm: row.agaza_rkm,
        agazaId: id,
        fromUser: userId,
        fromUserName: userName,
        toUser: toUserId ?? undefined,
        toUserName: toUserName ?? undefined,
        msg: "إغلاق الطلب",
        reason: "close_talab",
        processCode: PROCESS_CODE.CLOSE,
      });
    }

    const rangeText = `${(data.agaza_from_date_m as string) ?? row.agaza_from_date_m ?? ""} → ${(data.agaza_to_date_m as string) ?? row.agaza_to_date_m ?? ""}`;
    if (body.action === "accept" && !final) {
      // next approver
      await this.notify(id, nextStage === "approve_hr" ? 106 : 105, userId, toUserId, {
        title: "لديك طلب إجازة بانتظار اعتمادك",
        body: `${emp?.employee ?? ""} — ${rangeText}`,
      });
      // the employee follows each intermediate step (in-app only, like before)
      if (row.publisher != null && row.publisher !== toUserId && row.publisher !== userId) {
        await insertLegacyNotification(this.prisma, id, nextStage === "approve_hr" ? 106 : 105, userId, row.publisher);
      }
    } else {
      const code = body.action === "accept" ? 110 : 111;
      await this.notify(id, code, userId, row.publisher, {
        title: body.action === "accept" ? "تم اعتماد طلب الإجازة" : "تم رفض طلب الإجازة",
        body: body.action === "accept"
          ? `${original ? "اعتماد جزئي: " : ""}${rangeText}`
          : reason ?? rangeText,
      });
    }

    // `status` describes the action just completed by the current approver; the persisted
    // workflow state is returned separately (shape kept for the mobile app).
    return {
      id,
      stage,
      suspend,
      status: body.action === "accept" ? "accepted" : "rejected",
      workflowStatus: suspendToListStatus(suspend),
      final,
      nextStage,
      override: auth.override,
      ...(original
        ? {
            approvedFrom: data.agaza_from_date_m as string,
            approvedTo: data.agaza_to_date_m as string,
            approvedDays: data.num_days as number,
          }
        : {}),
    };
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

  /**
   * Partial approval: the approver narrows from/to inside the requested range. Returns the
   * columns to update (plus `__original`, stripped before the update) or {} when unchanged.
   */
  private async partialApprovalData(
    row: { agaza_from_date_m: string | null; agaza_to_date_m: string | null; num_days: number | null },
    body: ActionLeaveDto,
  ): Promise<{ data: Record<string, unknown>; original: OriginalRange | null }> {
    if (!body.startDate && !body.endDate) return { data: {}, original: null };
    const origFrom = row.agaza_from_date_m;
    const origTo = row.agaza_to_date_m;
    if (!origFrom || !origTo) throw new BadRequestException("تواريخ الطلب الأصلية غير متوفرة");
    const from = body.startDate ?? origFrom;
    const to = body.endDate ?? origTo;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException("صيغة التاريخ غير صحيحة");
    }
    if (from > to) throw new BadRequestException("تاريخ النهاية يجب أن يكون بعد البداية");
    if (from < origFrom || to > origTo) {
      throw new BadRequestException("الاعتماد الجزئي يجب أن يكون داخل الفترة المطلوبة");
    }
    if (from === origFrom && to === origTo) return { data: {}, original: null };
    const start = new Date(`${from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const original: OriginalRange = {
      from: origFrom,
      to: origTo,
      days: row.num_days != null ? Math.round(row.num_days) : Math.round((new Date(`${origTo}T12:00:00`).getTime() - new Date(`${origFrom}T12:00:00`).getTime()) / 86_400_000) + 1,
    };
    const resume = new Date(end.getTime() + 86_400_000).toISOString().slice(0, 10);
    const out: Record<string, unknown> = {
      agaza_from_date_m: from,
      agaza_to_date_m: to,
      agaza_from_date: Math.floor(start.getTime() / 1000),
      agaza_to_date: Math.floor(end.getTime() / 1000),
      agaza_from_day_n: this.arDayName(from),
      agaza_to_day_n: this.arDayName(to),
      num_days: days,
    };
    if (to !== origTo) {
      out.mobashret_amal_date_m = resume;
      out.mobashret_amal_day_n = this.arDayName(resume);
    }
    return { data: out, original };
  }

  /**
   * Original requested range of a partially approved leave. New columns (migration
   * 20261124140000_hr_approvals) → raw SQL; best-effort: the history row keeps the same facts.
   * Only the first narrowing is stored as the original.
   */
  private async recordOriginalRange(id: number, original: OriginalRange) {
    try {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE hr_all_agzat_orders
           SET requested_from_date_m = COALESCE(requested_from_date_m, ${original.from}),
               requested_to_date_m = COALESCE(requested_to_date_m, ${original.to}),
               requested_num_days = COALESCE(requested_num_days, ${original.days})
         WHERE id = ${id}`);
    } catch {
      // column missing (migration not applied yet): the history row still records it
    }
  }

  /** Original vs approved range for the details screens (null when never narrowed). */
  async requestedRange(id: number, actor?: JwtUser): Promise<OriginalRange | null> {
    if (actor) await this.assertLeaveIdInScope(actor, id);
    try {
      const rows = await this.prisma.$queryRaw<Array<{ f: string | null; t: string | null; d: number | null }>>(Prisma.sql`
        SELECT requested_from_date_m AS f, requested_to_date_m AS t, requested_num_days AS d
          FROM hr_all_agzat_orders WHERE id = ${id}`);
      const r = rows[0];
      return r?.f && r?.t ? { from: r.f, to: r.t, days: Number(r.d ?? 0) } : null;
    } catch {
      return null;
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

  /** Exact balance ladder used by the active legacy Api.php Add_Agaza endpoint. */
  private async assertLegacyMobileBalance(
    empId: number,
    startWorkDate: string | null,
    leaveTypeId: number,
    requestedDays: number,
  ) {
    const controlledTypes = [20, 21, 4];
    if (!controlledTypes.includes(leaveTypeId)) return;

    const months = this.monthsSince(startWorkDate);
    let totalAllowed = 0;
    if (months >= 12) totalAllowed = 7;
    else if (months >= 6) totalAllowed = leaveTypeId === 20 ? 4 : 3;

    const used = await this.prisma.hr_all_agzat_orders.aggregate({
      where: {
        emp_id_fk: empId,
        no3_agaza: leaveTypeId,
        suspend: SuspendStatus.APPROVED,
        year: new Date().getFullYear(),
      },
      _sum: { num_days: true },
    });
    const balance = Math.max(0, totalAllowed - (used._sum.num_days ?? 0));
    if (requestedDays > balance) {
      throw new BadRequestException("لقد استنفذت الرصيد بالكامل");
    }
  }

  /** A sick-leave request is allowed at most three times per employee per month. */
  private async assertSickLeaveMonthlyLimit(empId: number, startDate: string) {
    const monthStart = new Date(`${startDate}T12:00:00`);
    const nextMonthStart = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      1,
    );
    const monthStartIso = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;
    const nextMonthStartIso = `${nextMonthStart.getFullYear()}-${String(nextMonthStart.getMonth() + 1).padStart(2, "0")}-01`;
    const existing = await this.prisma.hr_all_agzat_orders.aggregate({
      where: {
        emp_id_fk: empId,
        no3_agaza: { in: [3, 4] },
        suspend: { notIn: [SuspendStatus.REJECTED, SuspendStatus.CANCELLED] },
        agaza_from_date_m: { gte: monthStartIso, lt: nextMonthStartIso },
      },
      _count: { id: true },
    });
    if (existing._count.id >= 3) {
      throw new BadRequestException(
        "الحد الأقصى للإجازات المرضية هو 3 طلبات في الشهر",
      );
    }
  }

  private async assertCanFileFor(empId: number, currentUserId?: number, actor?: JwtUser) {
    if (actor) return this.assertEmployeeInScope(actor, empId);
    // No caller identity at all = an internal/system call, not an HTTP request.
    if (currentUserId == null) return;
    const account = await this.prisma.users.findUnique({
      where: { user_id: currentUserId },
      select: { emp_code: true, level: true },
    });
    if (account?.level === 1 || (account?.emp_code != null && account.emp_code === empId)) return;
    throw new ForbiddenException("لا يمكنك تقديم إجازة لموظف آخر");
  }

  /** Balance card used by the legacy add-agaza form (get_vacation_balance). */
  async available(empId: number, leaveTypeId: number, actor?: JwtUser) {
    if (actor) await this.assertEmployeeInScope(actor, empId);
    const emp = await this.prisma.employees.findUnique({
      where: { id: empId },
      select: { id: true, start_work_date_m: true },
    });
    if (!emp) throw new NotFoundException("الموظف غير موجود");

    const months = this.monthsSince(emp.start_work_date_m);
    let totalAllowed = 0;
    if ([20, 21, 4].includes(leaveTypeId)) {
      if (months >= 12) totalAllowed = 7;
      else if (months >= 6) totalAllowed = leaveTypeId === 20 ? 4 : 3;
    }
    const used = await this.prisma.hr_all_agzat_orders.aggregate({
      where: {
        emp_id_fk: empId,
        no3_agaza: leaveTypeId,
        suspend: SuspendStatus.APPROVED,
        year: new Date().getFullYear(),
      },
      _sum: { num_days: true },
    });
    const usedDays = used._sum.num_days ?? 0;
    return {
      balance: Math.max(0, totalAllowed - usedDays),
      totalAllowed,
      usedDays,
      monthsOfService: months,
      controlled: [20, 21, 4].includes(leaveTypeId),
    };
  }

  /** Backward-compatible single-step routes (delegate to chain). */
  async approve(
    id: number,
    userId?: number,
    userName?: string,
    actor?: JwtUser,
    partial?: { startDate?: string; endDate?: string; reason?: string },
  ) {
    if (actor) await this.assertLeaveIdInScope(actor, id);
    return this.action(
      id,
      { action: "accept", startDate: partial?.startDate, endDate: partial?.endDate, reason: partial?.reason },
      userId,
      userName,
      actor,
    );
  }

  async reject(id: number, userId?: number, userName?: string, actor?: JwtUser, reason?: string) {
    if (actor) await this.assertLeaveIdInScope(actor, id);
    return this.action(id, { action: "reject", reason }, userId, userName, actor);
  }

  private async assertLeaveIdInScope(actor: JwtUser, id: number) {
    const row = await this.prisma.hr_all_agzat_orders.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("طلب الإجازة غير موجود");
    await this.assertLeaveInScope(actor, row);
  }

  /**
   * `actor` is passed by the web route, which checks branch scope here. The legacy mobile
   * route checks ownership itself (MobileService.leave) before calling cancel.
   */
  async cancel(id: number, userId?: number, userName?: string, actor?: JwtUser) {
    const row = await this.prisma.hr_all_agzat_orders.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("طلب الإجازة غير موجود");
    if (actor) await this.assertLeaveInScope(actor, row);

    await this.prisma.hr_all_agzat_orders.update({
      where: { id },
      data: {
        suspend: SuspendStatus.CANCELLED,
        suspend_date: todayIso(),
        reason_action: "cancel",
      },
    });

    await this.insertHistory({
      agazaRkm: row.agaza_rkm,
      agazaId: id,
      fromUser: userId,
      fromUserName: userName,
      toUser: row.publisher ?? undefined,
      msg: "إلغاء",
      reason: "cancel",
    });

    return { id, status: "rejected" };
  }

  async remove(id: number, actor: Pick<JwtUser, "sub" | "level" | "is_super_admin">) {
    await this.findManageableLeave(id, actor);
    await this.prisma.$transaction([
      this.prisma.hr_all_agzat_attaches.deleteMany({
        where: { talab_id_fk: id },
      }),
      this.prisma.hr_all_agzat_history.deleteMany({
        where: { agaza_id_fk: id },
      }),
      this.prisma.hr_all_agzat_orders.delete({ where: { id } }),
    ]);
    return { id };
  }

  async update(
    id: number,
    body: {
      startDate?: string;
      endDate?: string;
      returnToWorkDate?: string;
      reason?: string;
      addressSinceAgaza?: string;
    },
    actor: Pick<JwtUser, "sub" | "level" | "is_super_admin">,
  ) {
    const row = await this.findManageableLeave(id, actor, true);
    const startDate = body.startDate ?? row.agaza_from_date_m;
    const endDate = body.endDate ?? row.agaza_to_date_m;
    if (!startDate || !endDate)
      throw new BadRequestException("تواريخ الإجازة مطلوبة");

    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      throw new BadRequestException("تاريخ النهاية يجب أن يكون بعد البداية");
    }
    const returnToWorkDate = body.returnToWorkDate ?? row.mobashret_amal_date_m;
    const days =
      Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    await this.prisma.hr_all_agzat_orders.update({
      where: { id },
      data: {
        agaza_from_date_m: startDate,
        agaza_to_date_m: endDate,
        agaza_from_date: Math.floor(start.getTime() / 1000),
        agaza_to_date: Math.floor(end.getTime() / 1000),
        agaza_from_day_n: this.arDayName(startDate),
        agaza_to_day_n: this.arDayName(endDate),
        mobashret_amal_date_m: returnToWorkDate,
        mobashret_amal_day_n: this.arDayName(returnToWorkDate),
        num_days: days,
        reason: body.reason?.trim() || null,
        address_since_agaza: body.addressSinceAgaza?.trim() || null,
      },
    });
    return { id };
  }

  private async findManageableLeave(
    id: number,
    actor: Pick<JwtUser, "sub" | "level" | "is_super_admin">,
    allowReturned = false,
  ) {
    const row = await this.prisma.hr_all_agzat_orders.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("طلب الإجازة غير موجود");
    // A request returned for changes is editable by the person it was returned to.
    const ret = allowReturned ? await openReturn(this.prisma, "leave", id) : null;
    if (ret && (ret.returnedTo === actor.sub || row.publisher === actor.sub || isSystemAdmin(actor as JwtUser))) {
      return row;
    }
    if (row.suspend !== SuspendStatus.INCOMING) {
      throw new BadRequestException("لا يمكن تعديل أو حذف طلب تمت مراجعته");
    }
    if (!isSystemAdmin(actor as JwtUser) && row.publisher !== actor.sub) {
      throw new ForbiddenException(
        "يمكن لصاحب الطلب أو المدير فقط تعديل أو حذف الطلب",
      );
    }
    return row;
  }

  // ---- return with comment / resubmit / flow detail ---------------------------------------

  /** Unified card fields for list rows and the detail (additive for the mobile app). */
  private flowFields(
    row: Parameters<typeof chainFlowStatus>[0] & { id: number; publisher: number | null },
    ret: ReturnInfo | null,
    userId?: number | null,
  ) {
    const flowStatus = chainFlowStatus(row, ret != null);
    return {
      flowStatus,
      flowStatusLabel: FLOW_STATUS_LABEL_AR[flowStatus],
      returned: ret != null,
      returnComment: ret?.comment ?? null,
      returnedBy: ret?.returnedByName ?? null,
      returnedStage: ret?.stage ?? null,
      canResubmit: ret != null && userId != null && (ret.returnedTo === userId || row.publisher === userId),
    };
  }

  /**
   * «إرجاع للتعديل»: back to the requester with a comment. The stage flags and suspend stay as
   * they are (the step that returned it is still 'wait'); an open hr_request_returns row marks it.
   */
  private async returnForChanges(
    row: Prisma.hr_all_agzat_ordersGetPayload<object>,
    stage: string,
    rawComment: string | null | undefined,
    requester: Set<number>,
    override: boolean,
    userId: number | undefined,
    userName: string | undefined,
  ) {
    const comment = requireReturnComment(rawComment);
    const target = row.publisher ?? row.current_from_user_id ?? [...requester][0] ?? null;
    const targetName = row.publisher_name ?? row.current_from_user_name ?? null;
    await createReturn(this.prisma, {
      type: "leave",
      requestId: row.id,
      stage,
      by: userId ?? null,
      byName: userName ?? null,
      to: target,
      comment,
    });
    await this.prisma.hr_all_agzat_orders.update({
      where: { id: row.id },
      data: {
        current_from_user_id: userId ?? null,
        current_from_user_name: userName ?? null,
        current_to_user_id: target,
        current_to_user_name: targetName,
        reason_action: comment.slice(0, 50),
      },
    });
    await this.insertHistory({
      agazaRkm: row.agaza_rkm,
      agazaId: row.id,
      fromUser: userId,
      fromUserName: userName,
      toUser: target,
      toUserName: targetName ?? undefined,
      msg: "إرجاع للتعديل",
      reason: stage,
      processCode: PROCESS_CODE.ACCEPT,
    });
    await recordTimeline(this.prisma, "leave", row.id, {
      action: "return",
      stage,
      by: userId ?? null,
      byName: userName ?? null,
      to: target,
      toName: targetName,
      comment,
      override,
    });
    await this.pushInApp(target, userId, "طلب الإجازة رجعلك للتعديل", comment);
    return {
      id: row.id,
      stage,
      suspend: row.suspend,
      status: "returned",
      workflowStatus: "returned",
      final: false,
      nextStage: null,
      override,
      returnedTo: target,
    };
  }

  /** Edit (optional) + resubmit a returned leave; it resumes at the step that returned it. */
  async resubmit(id: number, body: ResubmitLeaveDto, actor: JwtUser) {
    const row = await this.prisma.hr_all_agzat_orders.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("طلب الإجازة غير موجود");
    const ret = await openReturn(this.prisma, "leave", id);
    if (!ret) throw new BadRequestException("الطلب مش مرتجع للتعديل");
    if (ret.returnedTo !== actor.sub && row.publisher !== actor.sub && !isSystemAdmin(actor)) {
      throw new ForbiddenException("يمكن لمقدم الطلب فقط تعديله وإعادة إرساله");
    }
    const edits = ["startDate", "endDate", "returnToWorkDate", "reason", "addressSinceAgaza"] as const;
    if (edits.some((k) => body[k] !== undefined)) {
      await this.update(
        id,
        {
          startDate: body.startDate,
          endDate: body.endDate,
          returnToWorkDate: body.returnToWorkDate,
          reason: body.reason ?? row.reason ?? undefined,
          addressSinceAgaza: body.addressSinceAgaza ?? row.address_since_agaza ?? undefined,
        },
        actor,
      );
    }
    const emp = row.emp_id_fk
      ? await this.prisma.employees.findUnique({ where: { id: row.emp_id_fk }, select: EMPLOYEE_WORKFLOW_SELECT })
      : null;
    const requester = await requesterUserIds(this.prisma, emp, row.publisher);
    const stage = ret.stage as ChainStageKey;
    let recipient = (["approve_direct_manager", "approve_hr", "approve_moder_edara"] as string[]).includes(stage)
      ? await resolveStageRecipient(this.prisma, stage, emp, requester)
      : null;
    let toStage: string = stage;
    if (!recipient && stage !== "approve_hr") {
      // Nobody holds that step any more: continue with the next one.
      const next = await routeNext(this.prisma, stage, emp, requester, {
        approve_direct_manager: row.approve_direct_manager,
        approve_hr: row.approve_hr,
        approve_moder_edara: row.approve_moder_edara,
      });
      if (!next.final) {
        recipient = next.recipient;
        toStage = next.stage;
      }
    }
    await this.prisma.hr_all_agzat_orders.update({
      where: { id },
      data: {
        current_from_user_id: actor.sub,
        current_from_user_name: actor.name ?? null,
        current_to_user_id: recipient?.userId ?? null,
        current_to_user_name: recipient?.name ?? null,
        current_to_emp_id: recipient?.empId != null ? String(recipient.empId) : null,
        reason_action: "resubmit",
      },
    });
    await resolveReturn(this.prisma, "leave", id, "resubmitted");
    await this.insertHistory({
      agazaRkm: row.agaza_rkm,
      agazaId: id,
      fromUser: actor.sub,
      fromUserName: actor.name ?? undefined,
      toUser: recipient?.userId,
      toUserName: recipient?.name ?? undefined,
      msg: "إعادة إرسال بعد التعديل",
      reason: toStage.slice(0, 30),
      processCode: PROCESS_CODE.ACCEPT,
    });
    await recordTimeline(this.prisma, "leave", id, {
      action: "resubmit",
      stage: toStage,
      by: actor.sub,
      byName: actor.name ?? null,
      to: recipient?.userId ?? null,
      toName: recipient?.name ?? null,
      comment: body.comment ?? null,
    });
    await this.notify(id, toStage === "approve_hr" ? 106 : 105, actor.sub, recipient?.userId, {
      title: "طلب إجازة اتعدل ورجعلك",
      body: `${emp?.employee ?? ""}${body.comment ? ` — ${body.comment}` : ""}`,
    });
    return { id, status: "pending", stage: toStage, currentTo: recipient?.name ?? null };
  }

  /** Unified request card: fields, status chip, timeline (who / action / comment / when). */
  async flow(id: number, actor: JwtUser) {
    const row = await this.prisma.hr_all_agzat_orders.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("طلب الإجازة غير موجود");
    const hr = await this.isHrOrAdmin(actor);
    if (!hr) await this.assertLeaveInScope(actor, row);
    const ret = await openReturn(this.prisma, "leave", id);
    const [emp, type, legacy, timeline, original] = await Promise.all([
      row.emp_id_fk
        ? this.prisma.employees.findUnique({ where: { id: row.emp_id_fk }, select: { employee: true, branch_id_fk: true } })
        : null,
      row.no3_agaza ? this.prisma.holiday_setting.findUnique({ where: { id: row.no3_agaza } }) : null,
      this.prisma.hr_all_agzat_history.findMany({ where: { agaza_id_fk: id }, orderBy: { id: "asc" } }),
      loadTimeline(this.prisma, "leave", id),
      this.requestedRange(id).catch(() => null),
    ]);
    const stage = pendingStage(row);
    const routedToMe = row.current_to_user_id === actor.sub;
    const canAction = stage != null && !ret && (routedToMe || hr) && row.publisher !== actor.sub;
    return {
      kind: "leave" as const,
      id,
      employeeName: emp?.employee ?? row.current_from_user_name ?? null,
      branchId: emp?.branch_id_fk ?? null,
      title: type?.name ?? "إجازة",
      createdAt: legacyBusinessIsoDate(row.agaza_date),
      stage,
      currentTo: row.current_to_user_name,
      ...this.flowFields(row, ret, actor.sub),
      canAction,
      canReturn: canAction,
      canPartial: canAction,
      override: canAction && !routedToMe,
      fields: [
        { key: "leaveType", label: "نوع الإجازة", value: type?.name ?? null },
        { key: "startDate", label: "من", value: row.agaza_from_date_m },
        { key: "endDate", label: "إلى", value: row.agaza_to_date_m },
        { key: "days", label: "عدد الأيام", value: row.num_days != null ? String(Math.round(row.num_days)) : null },
        { key: "returnToWorkDate", label: "تاريخ المباشرة", value: row.mobashret_amal_date_m },
        { key: "reason", label: "السبب", value: row.reason },
        ...(original ? [{ key: "requested", label: "المطلوب أصلًا", value: `${original.from} → ${original.to} (${original.days} يوم)` }] : []),
      ],
      editable: {
        startDate: row.agaza_from_date_m,
        endDate: row.agaza_to_date_m,
        returnToWorkDate: row.mobashret_amal_date_m,
        reason: row.reason,
      },
      timeline: mergeTimeline(
        legacy.map((h) =>
          legacyHistoryEntry({
            date: h.date ?? h.date_ar,
            fromUser: h.from_user,
            fromName: h.from_user_n,
            toUser: h.to_user,
            toName: h.to_user_n,
            msg: h.talab_msg,
            reasonAction: h.reason_action,
          }),
        ),
        timeline,
      ),
    };
  }

  /** Extra fields the mobile leave detail adds (additive): status chip, return, timeline. */
  async mobileFlowExtras(id: number, actor: JwtUser) {
    try {
      const f = await this.flow(id, actor);
      return {
        flowStatus: f.flowStatus,
        flowStatusLabel: f.flowStatusLabel,
        returned: f.returned,
        returnComment: f.returnComment,
        canResubmit: f.canResubmit,
        canReturn: f.canReturn,
        history: f.timeline,
        comments: f.timeline.filter((t) => t.comment).map((t) => ({ at: t.at, byName: t.byName, action: t.action, actionLabel: t.actionLabel, comment: t.comment })),
      };
    } catch {
      return {};
    }
  }

  /** Open leave requests for the HR inbox (pending in the chain or returned). */
  async openRows() {
    const rows = await this.prisma.hr_all_agzat_orders.findMany({
      where: {
        suspend: { in: [SuspendStatus.INCOMING, SuspendStatus.APPROVED_L1] },
        OR: [{ close_talab: null }, { close_talab: { not: "yes" } }],
      },
      orderBy: { id: "desc" },
      take: 2000,
    });
    const open = rows.filter((r) => pendingStage(r) != null);
    const returns = await openReturnsFor(this.prisma, "leave", open.map((r) => r.id));
    return open.map((r) => ({ row: r, stage: pendingStage(r)!, ret: returns.get(r.id) ?? null }));
  }

  async isHrOrAdmin(actor: Pick<JwtUser, "sub" | "level" | "is_super_admin">): Promise<boolean> {
    if (isSystemAdmin(actor as JwtUser)) return true;
    if (await isHrOfficer(this.prisma, actor.sub)) return true;
    return this.hasHrApproveGrant(actor.sub);
  }

  /** In-app row + push for events without a legacy notification code (best-effort). */
  private async pushInApp(toUser: number | null | undefined, fromUser: number | null | undefined, title: string, body: string) {
    if (!toUser || toUser === fromUser || !this.push) return;
    try {
      await this.push.sendToUsers([toUser], title, body, fromUser ?? undefined);
    } catch {
      // best-effort
    }
  }

  private async insertHistory(opts: {
    agazaRkm: number | null | undefined;
    agazaId: number;
    fromUser?: number;
    fromUserName?: string;
    toUser?: number | null;
    toUserName?: string;
    msg: string;
    reason: string;
    processCode?: number;
  }) {
    await this.prisma.hr_all_agzat_history.create({
      data: {
        agaza_rkm_fk: opts.agazaRkm ?? 0,
        agaza_id_fk: opts.agazaId,
        from_user: opts.fromUser ?? 0,
        from_user_n: opts.fromUserName ?? "النظام",
        to_user: opts.toUser ?? 0,
        to_user_n: opts.toUserName ?? null,
        talab_in_fk: opts.processCode ?? 0,
        talab_msg: opts.msg,
        reason_action: opts.reason,
        date: todayIso(),
        date_ar: todayIso(),
      },
    });
  }

  // ----- Leave types CRUD (unchanged shape) -----

  async listTypes(q: PaginationDto) {
    const where: Prisma.holiday_settingWhereInput = {};
    if (q.search?.trim()) {
      where.name = { contains: q.search.trim() };
    }
    const [rows, total] = await Promise.all([
      this.prisma.holiday_setting.findMany({
        where,
        orderBy: { id: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.holiday_setting.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      title: r.name,
      minDays: r.min_days,
      maxDays: r.max_days,
      agazaTtype: r.agaza_ttype,
      dateFrom: r.date_from,
      dateTo: r.date_to,
      hasSubstitute: r.mowazf_badel === 1,
      isActive: r.active === "yes",
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async createType(body: {
    title?: string;
    minDays?: number;
    maxDays?: number;
    agazaTtype?: number;
    dateFrom?: string;
    dateTo?: string;
    hasSubstitute?: boolean;
    isActive?: boolean;
  }) {
    if (!body.title?.trim())
      throw new BadRequestException("اسم نوع الإجازة مطلوب");
    const row = await this.prisma.holiday_setting.create({
      data: {
        name: body.title.trim(),
        min_days: body.minDays ?? 0,
        max_days: body.maxDays ?? 0,
        num_days: body.maxDays ?? 0,
        agaza_ttype: body.agazaTtype ?? 0,
        date_from: body.dateFrom ?? null,
        date_to: body.dateTo ?? null,
        mowazf_badel: body.hasSubstitute ? 1 : 0,
        active: body.isActive !== false ? "yes" : "no",
      },
    });
    return { id: row.id };
  }

  async updateType(
    id: number,
    body: {
      title?: string;
      minDays?: number;
      maxDays?: number;
      agazaTtype?: number;
      dateFrom?: string;
      dateTo?: string;
      hasSubstitute?: boolean;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.holiday_setting.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("نوع الإجازة غير موجود");

    // Annual balances are contract-based (contract_employe.year_vacation_num) — changing
    // type max does not retroactively rebalance contracts; keep num_days synced to max_days.
    if (
      body.maxDays != null &&
      body.maxDays !== existing.max_days &&
      body.maxDays > 0
    ) {
      const overMax = await this.prisma.hr_all_agzat_orders.count({
        where: {
          no3_agaza: id,
          suspend: { in: [SuspendStatus.INCOMING, SuspendStatus.APPROVED] },
          num_days: { gt: body.maxDays },
        },
      });
      if (overMax > 0) {
        throw new BadRequestException(
          `يوجد ${overMax} طلب(ات) تتجاوز الحد الأقصى الجديد (${body.maxDays} يوم)`,
        );
      }
    }

    await this.prisma.holiday_setting.update({
      where: { id },
      data: {
        name: body.title ?? existing.name,
        min_days: body.minDays ?? existing.min_days,
        max_days: body.maxDays ?? existing.max_days,
        num_days: body.maxDays ?? existing.num_days,
        agaza_ttype: body.agazaTtype ?? existing.agaza_ttype,
        date_from: body.dateFrom ?? existing.date_from,
        date_to: body.dateTo ?? existing.date_to,
        mowazf_badel:
          body.hasSubstitute != null
            ? body.hasSubstitute
              ? 1
              : 0
            : existing.mowazf_badel,
        active:
          body.isActive != null
            ? body.isActive
              ? "yes"
              : "no"
            : existing.active,
      },
    });
    return { id };
  }

  async removeType(id: number) {
    const existing = await this.prisma.holiday_setting.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("نوع الإجازة غير موجود");
    await this.prisma.holiday_setting.delete({ where: { id } });
    return { id };
  }

  // ----- Balances / accrual (faithful get_days_vacation_year_2 + tenure ladder) -----

  /** months elapsed between a date-string and today (legacy DateTime::diff y*12+m). */
  private monthsSince(dateStr?: string | null): number {
    if (!dateStr) return 0;
    const d = new Date(dateStr + "T12:00:00");
    if (Number.isNaN(d.getTime())) return 0;
    const now = new Date();
    let months =
      (now.getFullYear() - d.getFullYear()) * 12 +
      (now.getMonth() - d.getMonth());
    if (now.getDate() < d.getDate()) months -= 1;
    return Math.max(0, months);
  }

  /** Tenure ladder (get_employee_balance): <6m=0, <12=7.5, <24=15, else 21. */
  private tenureLadder(months: number): number {
    if (months < 6) return 0;
    if (months < 12) return 7.5;
    if (months < 24) return 15;
    return 21;
  }

  async balances(q: PaginationDto, actor?: JwtUser) {
    const year = new Date().getFullYear();
    const branches = actor ? this.scope.allowedBranchIds(actor) : null;
    const [contracts, emps, setting, types] = await Promise.all([
      this.prisma.contract_employe.findMany(),
      this.prisma.employees.findMany({
        where: {
          OR: [{ leave_emp: null }, { leave_emp: 0 }],
          ...(branches ? { branch_id_fk: { in: branches } } : {}),
        },
        select: {
          id: true,
          emp_code: true,
          employee: true,
          start_work_date_m: true,
        },
      }),
      this.prisma.hr_agazat_sysat.findFirst(),
      this.prisma.holiday_setting.findMany(),
    ]);
    const byCode = new Map(emps.map((e) => [String(e.emp_code), e]));
    const defaultType = types[0];
    const emergencyType = types.find((t) => t.agaza_ttype === 1);
    const emergencyQuota = setting?.emergency_nums_in_year ?? 0;

    // used days per employee (suspend=4) for current year, and emergency subset (f2a=1)
    const [usedRows, emergencyRows] = await Promise.all([
      this.prisma.hr_all_agzat_orders.groupBy({
        by: ["emp_code_fk"],
        where: { suspend: SuspendStatus.APPROVED, year },
        _sum: { num_days: true },
      }),
      this.prisma.hr_all_agzat_orders.groupBy({
        by: ["emp_code_fk"],
        where: { suspend: SuspendStatus.APPROVED, year, f2a_agaza: 1 },
        _sum: { num_days: true },
      }),
    ]);
    const usedMap = new Map(
      usedRows.map((u) => [String(u.emp_code_fk), u._sum.num_days ?? 0]),
    );
    const emergencyUsedMap = new Map(
      emergencyRows.map((u) => [String(u.emp_code_fk), u._sum.num_days ?? 0]),
    );

    let rows = contracts.flatMap((c) => {
      const emp = byCode.get(c.emp_code);
      if (!emp) return [];

      const yearVacation = parseFloat(c.year_vacation_num) || 0;
      const monthVacation = yearVacation / 12;
      const casualQuota = parseFloat(c.casual_vacation_num) || 0;
      const prevBalance = c.vacation_previous_balance || 0;

      // monthly pro-rata accrual from vacation_start_m (fallback: start_work_date_m)
      const startM = c.vacation_start_m || emp.start_work_date_m || null;
      const monthsAccrued = this.monthsSince(startM);
      const accrued = monthVacation * monthsAccrued;

      const usedKey = emp.emp_code != null ? String(emp.emp_code) : "";
      const used = usedMap.get(usedKey) ?? 0;
      const emergencyUsed = emergencyUsedMap.get(usedKey) ?? 0;

      // annual available = accrued − used + previous balance (legacy ava_days f2a!=1)
      const annualRemaining = accrued - used + prevBalance;
      const tenureMonths = this.monthsSince(emp.start_work_date_m);

      return [
        {
          id: emp.id,
          employeeName: emp.employee ?? undefined,
          empCode: emp.emp_code != null ? String(emp.emp_code) : undefined,
          leaveType: defaultType?.name ?? "إجازة سنوية",
          // annual (سنوية)
          total: Math.round(accrued + prevBalance),
          used: Math.round(used),
          remaining: Math.max(0, Math.round(annualRemaining)),
          // tenure ladder reference balance
          tenureBalance: this.tenureLadder(tenureMonths),
          // emergency (طارئة) quota
          emergencyType: emergencyType?.name ?? "طارئة",
          emergencyTotal: emergencyQuota,
          emergencyUsed: Math.round(emergencyUsed),
          emergencyRemaining: Math.max(
            0,
            Math.round(emergencyQuota - emergencyUsed),
          ),
          // casual (عارضة) quota
          casualTotal: Math.round(casualQuota),
          monthlyAccrual: Math.round(monthVacation * 100) / 100,
        },
      ];
    });

    if (q.search?.trim()) {
      const s = q.search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.employeeName?.toLowerCase().includes(s) || r.empCode?.includes(s),
      );
    }

    const total = rows.length;
    const data = rows.slice(q.skip, q.skip + q.take);
    return paginated(data, total, q.page, q.pageSize);
  }

  /**
   * Year-end carry-over (ترحيل الرصيد): fold each employee's remaining annual balance into
   * contract_employe.vacation_previous_balance and reset the accrual anchor (vacation_start_m)
   * to the start of the target year. Mirrors how the legacy app reads
   * vacation_previous_balance as carried-over days.
   */
  async carryOver(targetYear?: number) {
    const year = targetYear ?? new Date().getFullYear();
    const prevYear = year - 1;
    const newAnchor = `${year}-01-01`;

    const contracts = await this.prisma.contract_employe.findMany();
    const emps = await this.prisma.employees.findMany({
      select: { id: true, emp_code: true, start_work_date_m: true },
    });
    const byCode = new Map(emps.map((e) => [String(e.emp_code), e]));

    // used days in the previous year per employee
    const usedRows = await this.prisma.hr_all_agzat_orders.groupBy({
      by: ["emp_code_fk"],
      where: { suspend: SuspendStatus.APPROVED, year: prevYear },
      _sum: { num_days: true },
    });
    const usedMap = new Map(
      usedRows.map((u) => [String(u.emp_code_fk), u._sum.num_days ?? 0]),
    );

    let processed = 0;
    for (const c of contracts) {
      const emp = byCode.get(c.emp_code);
      const yearVacation = parseFloat(c.year_vacation_num) || 0;
      const monthVacation = yearVacation / 12;
      const startM = c.vacation_start_m || emp?.start_work_date_m || null;
      const monthsAccrued = this.monthsSince(startM);
      const accrued = monthVacation * monthsAccrued;
      const used = usedMap.get(c.emp_code) ?? 0;
      const prevBalance = c.vacation_previous_balance || 0;

      const carried = Math.max(0, accrued - used + prevBalance);

      await this.prisma.contract_employe.update({
        where: { id: c.id },
        data: {
          vacation_previous_balance: Math.round(carried * 100) / 100,
          vacation_start_m: newAnchor,
        },
      });
      processed += 1;
    }

    return { year, processed };
  }
}
