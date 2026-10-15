import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { assertNoOverlap } from "../../common/validators/validation.util";
import { PaginationDto } from "../../common/dto/pagination.dto";
import { paginated } from "../../common/dto/list-result";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  SUSPEND_APPROVED,
  SUSPEND_REJECTED,
  SuspendStatus,
  suspendToListStatus,
} from "../../common/utils/suspend-status.util";
import { todayIso } from "../../common/utils/legacy-date.util";
import { CreateLeaveDto } from "./dto/create-leave.dto";
import { ActionLeaveDto } from "./dto/action-leave.dto";
import { ListLeavesDto } from "./dto/list-leaves.dto";
import {
  ACCEPT_SUSPEND,
  LeaveStage,
  NEXT_STAGE_BY_CURRENT,
  PROCESS_CODE,
  REJECT_SUSPEND,
  STAGE_DATE_FIELD,
  nextRecipientMosama,
} from "./approval-chain.util";
import { accruedAnnualLeave, inclusiveLeaveDays } from "./leave-balance.policy";
import { allocateDocumentNumber } from "../../common/number-series/document-number-series";
import {
  cairoDateParts,
  cairoDateString,
  dateOnlyEpochSeconds,
  dateOnlyParts,
} from "../../common/utils/cairo-date";

type LeaveDb = PrismaService | Prisma.TransactionClient;

interface BalanceContractRow {
  contractId: number;
  empCode: number;
  employeeId: number;
  employeeName: string | null;
  startWorkDate: string | null;
  yearVacationNum: string;
  casualVacationNum: string;
  previousBalance: number;
  vacationStart: string | null;
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
  constructor(private readonly prisma: PrismaService) {}

  private arDayName(dateStr?: string | null): string | null {
    if (!dateStr) return null;
    const { year, month, day } = dateOnlyParts(dateStr);
    // JS getDay(): 0=Sun..6=Sat → PHP N: Mon=1..Sun=7
    const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const phpN = jsDay === 0 ? 7 : jsDay;
    return AR_DAYS[phpN] ?? null;
  }

  async assertLeaveAvailable(
    db: LeaveDb,
    employee: Prisma.employeesGetPayload<Record<string, never>>,
    leaveTypeId: number,
    startDate: string,
    endDate: string,
    days: number,
    excludeId?: number,
  ): Promise<void> {
    if (startDate.slice(0, 4) !== endDate.slice(0, 4)) {
      throw new BadRequestException(
        "الإجازة الممتدة بين سنتين يجب تقسيمها إلى طلبين",
      );
    }
    const overlapping = await db.hr_all_agzat_orders.findMany({
      where: {
        emp_id_fk: employee.id,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        suspend: {
          in: [
            SuspendStatus.INCOMING,
            SuspendStatus.APPROVED_L1,
            SuspendStatus.INVESTIGATING,
            SuspendStatus.APPROVED,
          ],
        },
        agaza_from_date_m: { lte: endDate },
        agaza_to_date_m: { gte: startDate },
      },
      select: { id: true, agaza_from_date_m: true, agaza_to_date_m: true },
    });
    assertNoOverlap(
      { start: startDate, end: endDate, label: "الإجازة الجديدة" },
      overlapping.map((row) => ({
        id: row.id,
        start: row.agaza_from_date_m ?? startDate,
        end: row.agaza_to_date_m ?? endDate,
        label: row.agaza_from_date_m ?? undefined,
      })),
      "يوجد تداخل مع طلب إجازة قائم",
    );

    if (leaveTypeId !== 1 || employee.emp_code == null) return;
    const contract = await db.contract_employe.findFirst({
      where: { emp_code: String(employee.emp_code) },
    });
    const annualQuota = contract
      ? parseFloat(contract.year_vacation_num) || 0
      : 0;
    const available = accruedAnnualLeave({
      annualQuota,
      previousBalance: contract?.vacation_previous_balance ?? 0,
      accrualStartDate: contract?.vacation_start_m,
      employmentStartDate: employee.start_work_date_m,
      asOfDate: startDate,
    });
    const year = Number(startDate.slice(0, 4));
    const usedRows = await db.hr_all_agzat_orders.aggregate({
      where: {
        emp_code_fk: BigInt(employee.emp_code),
        suspend: SuspendStatus.APPROVED,
        year,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      _sum: { num_days: true },
    });
    const remaining = Math.max(0, available - (usedRows._sum.num_days ?? 0));
    if (days > remaining + 0.0001) {
      throw new BadRequestException(
        `رصيد الإجازة المستحق غير كافٍ (المتبقي ${remaining.toFixed(2)} يوم، المطلوب ${days})`,
      );
    }
  }

  async list(q: ListLeavesDto, userId?: number) {
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

    const data = rows.map((r) => ({
      id: r.id,
      agaza_rkm: r.agaza_rkm,
      employeeName: empMap.get(r.emp_id_fk ?? 0) ?? r.manager_name ?? undefined,
      leaveType:
        r.no3_agaza != null
          ? (typeMap.get(r.no3_agaza) ?? String(r.no3_agaza))
          : undefined,
      f2aAgaza: r.f2a_agaza ?? undefined,
      startDate: r.agaza_from_date_m ?? undefined,
      endDate: r.agaza_to_date_m ?? undefined,
      days: r.num_days != null ? Math.round(r.num_days) : undefined,
      currentTo: r.current_to_user_name ?? undefined,
      actionsSends: r.actions_sends ?? undefined,
      status: suspendToListStatus(r.suspend),
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  /** Faithful port of add_agaza / get_data_new — full request fields. */
  async create(
    body: CreateLeaveDto,
    currentUserId?: number,
    currentUserName?: string,
  ) {
    if (!body.leaveTypeId || !body.startDate || !body.endDate) {
      throw new BadRequestException("نوع الإجازة والتواريخ مطلوبة");
    }

    const days = inclusiveLeaveDays(body.startDate, body.endDate);
    if (body.numDays != null && body.numDays !== days) {
      throw new BadRequestException(
        `عدد الأيام يجب أن يطابق التواريخ (${days} يوم)`,
      );
    }
    const startParts = dateOnlyParts(body.startDate);

    const leaveType = await this.prisma.holiday_setting.findUnique({
      where: { id: body.leaveTypeId },
    });
    if (!leaveType) throw new BadRequestException("نوع الإجازة غير موجود");
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

    const empId = body.empId;
    let emp = null as Awaited<
      ReturnType<typeof this.prisma.employees.findUnique>
    > | null;
    if (empId) {
      emp = await this.prisma.employees.findUnique({ where: { id: empId } });
      if (!emp) throw new NotFoundException("الموظف غير موجود");

      await this.assertLeaveAvailable(
        this.prisma,
        emp,
        body.leaveTypeId,
        body.startDate,
        body.endDate,
        days,
      );
    }

    // sick leave (3/4) requires medical fields
    if ([3, 4].includes(body.leaveTypeId) && !body.maradName?.trim()) {
      throw new BadRequestException(
        "بيانات التقرير الطبي مطلوبة لهذا النوع من الإجازات",
      );
    }

    const empCode = emp?.emp_code ?? null;
    const empCodeBig = empCode != null ? BigInt(empCode) : null;

    // direct-manager routing (employees.manger holds an emp_code)
    const managerEmpCode = emp?.manger ? parseInt(emp.manger, 10) : null;
    const managerEmp = managerEmpCode
      ? await this.prisma.employees.findFirst({
          where: { emp_code: managerEmpCode },
        })
      : null;
    const managerUser =
      managerEmp?.id != null
        ? await this.prisma.users.findFirst({
            where: { emp_code: managerEmp.id },
          })
        : null;
    const empUser =
      emp?.id != null
        ? await this.prisma.users.findFirst({ where: { emp_code: emp.id } })
        : null;

    // substitute employee
    let substituteEmp = null as typeof emp;
    if (body.substituteEmpId) {
      substituteEmp = await this.prisma.employees.findUnique({
        where: { id: body.substituteEmpId },
      });
    }
    // legacy: level=1 when a substitute is set (route to substitute first), else level=2
    const level = body.substituteEmpId ? 1 : 2;

    const row = await this.prisma.$transaction(async (tx) => {
      if (emp) {
        await allocateDocumentNumber(tx, `hr.leave.employee.${emp.id}`);
        await this.assertLeaveAvailable(
          tx,
          emp,
          body.leaveTypeId,
          body.startDate,
          body.endDate,
          days,
        );
      }
      const maxRkm = await tx.hr_all_agzat_orders.aggregate({
        _max: { agaza_rkm: true },
      });
      const agazaRkm = await allocateDocumentNumber(
        tx,
        "hr.leave",
        (maxRkm._max.agaza_rkm ?? 0) + 1,
      );
      const created = await tx.hr_all_agzat_orders.create({
        data: {
          agaza_rkm: agazaRkm,
          no3_agaza: body.leaveTypeId,
          f2a_agaza: body.f2aAgaza ?? 0,
          emp_id_fk: empId ?? null,
          emp_code_fk: empCodeBig,
          edara_id_fk: emp?.edara_id ?? null,
          edara_n: emp?.edara_n ?? null,
          qsm_id_fk: emp?.qsm_id ?? null,
          qsm_n: emp?.qsm_n ?? null,
          direct_manager_id_fk: managerEmp?.id ?? managerEmpCode ?? null,
          direct_manager_code_fk:
            managerEmpCode != null ? BigInt(managerEmpCode) : null,
          direct_manager_n: managerEmp?.employee ?? null,
          agaza_from_date_m: body.startDate,
          agaza_to_date_m: body.endDate,
          agaza_from_date_h: body.startDateHijri ?? null,
          agaza_to_date_h: body.endDateHijri ?? null,
          agaza_from_date: dateOnlyEpochSeconds(body.startDate),
          agaza_to_date: dateOnlyEpochSeconds(body.endDate),
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
          agaza_date: cairoDateString(),
          agaza_date_ar: cairoDateString(),
          suspend: SuspendStatus.INCOMING,
          level,
          month: startParts.month,
          year: startParts.year,
          publisher: currentUserId ?? null,
          publisher_name: currentUserName ?? null,
          current_from_user_name: emp?.employee ?? null,
          current_from_user_id: empUser?.user_id ?? null,
          current_from_emp_id: empId != null ? String(empId) : null,
          current_to_user_name: managerEmp?.employee ?? null,
          current_to_user_id: managerUser?.user_id ?? null,
          current_to_emp_id:
            managerEmp?.id != null ? String(managerEmp.id) : null,
          send_to_direct_manager: "yes",
          actions_sends: "send_to_direct_manager",
        },
      });
      await this.insertHistory(
        {
          agazaRkm: created.agaza_rkm,
          agazaId: created.id,
          fromUser: currentUserId,
          fromUserName: currentUserName,
          toUser: managerUser?.user_id,
          toUserName: managerEmp?.employee ?? undefined,
          msg: "تحويل للمدير المباشر",
          reason: "send_to_direct_manager",
          processCode: PROCESS_CODE.ACCEPT,
        },
        tx,
      );
      return created;
    });

    return { id: row.id, agaza_rkm: row.agaza_rkm };
  }

  /** Multi-stage chain action (faithful process_ta7welat_procedures for agazat). */
  async action(
    id: number,
    body: ActionLeaveDto,
    userId?: number,
    userName?: string,
  ) {
    const row = await this.prisma.hr_all_agzat_orders.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("طلب الإجازة غير موجود");

    if (
      row.current_to_user_id != null &&
      userId != null &&
      row.current_to_user_id !== userId
    ) {
      throw new BadRequestException("هذا الطلب غير محول إليك");
    }

    const stage = NEXT_STAGE_BY_CURRENT[row.actions_sends ?? ""];
    if (!stage)
      throw new BadRequestException("لا يوجد إجراء متاح على هذا الطلب");

    const emp = row.emp_id_fk
      ? await this.prisma.employees.findUnique({ where: { id: row.emp_id_fk } })
      : null;

    const reason = body.reason ?? null;
    let toUserId: number | null;
    let toUserName: string | null = null;
    let suspend: number;
    let stageFlag: "yes" | "no";
    let processCode: number;

    if (body.action === "accept") {
      stageFlag = "yes";
      suspend = ACCEPT_SUSPEND[stage];
      if (stage === "approve_moder_3am") {
        toUserId = row.publisher ?? null;
        processCode = PROCESS_CODE.ACCEPT_LATER;
      } else {
        const mosama = nextRecipientMosama(stage, {
          empType: emp?.emp_type ?? null,
          edaraId: emp?.edara_id ?? null,
        });
        const recipient =
          mosama != null ? await this.resolveByMosama(mosama) : null;
        toUserId = recipient?.userId ?? row.publisher ?? null;
        toUserName = recipient?.name ?? null;
        processCode =
          stage === "approve_direct_manager"
            ? PROCESS_CODE.ACCEPT
            : PROCESS_CODE.ACCEPT_LATER;
      }
    } else {
      stageFlag = "no";
      suspend = REJECT_SUSPEND[stage];
      toUserId = row.publisher ?? null;
      processCode =
        stage === "approve_direct_manager"
          ? PROCESS_CODE.REJECT_DIRECT
          : PROCESS_CODE.REJECT_LATER;
    }

    const toUser = toUserId
      ? await this.prisma.users.findUnique({ where: { user_id: toUserId } })
      : null;
    if (!toUserName && toUser?.emp_code != null) {
      const recEmp = await this.prisma.employees.findUnique({
        where: { id: toUser.emp_code },
      });
      toUserName = recEmp?.employee ?? null;
    }

    const data: Record<string, unknown> = {
      [stage]: stageFlag,
      suspend,
      actions_sends: stage,
      reason_action: reason,
      [STAGE_DATE_FIELD[stage]]: todayIso(),
      current_from_user_id: userId ?? null,
      current_from_user_name: userName ?? null,
      current_to_user_id: toUserId,
      current_to_user_name: toUserName,
    };
    if (stage === "approve_moder_3am" && body.action === "accept") {
      data.close_talab = "yes";
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM hr_all_agzat_orders WHERE id = ${id} FOR UPDATE`,
      );
      const locked = await tx.hr_all_agzat_orders.findUnique({ where: { id } });
      if (
        !locked ||
        locked.actions_sends !== row.actions_sends ||
        locked.suspend !== row.suspend
      ) {
        throw new BadRequestException(
          "تم اتخاذ إجراء على الطلب بواسطة مستخدم آخر",
        );
      }
      if (stage === "approve_moder_3am" && body.action === "accept" && emp) {
        await allocateDocumentNumber(tx, `hr.leave.employee.${emp.id}`);
        const days = inclusiveLeaveDays(
          locked.agaza_from_date_m ?? "",
          locked.agaza_to_date_m ?? "",
        );
        await this.assertLeaveAvailable(
          tx,
          emp,
          locked.no3_agaza ?? 0,
          locked.agaza_from_date_m ?? "",
          locked.agaza_to_date_m ?? "",
          days,
          id,
        );
      }
      await tx.hr_all_agzat_orders.update({
        where: { id },
        data: data as Prisma.hr_all_agzat_ordersUpdateInput,
      });
      await this.insertHistory(
        {
          agazaRkm: row.agaza_rkm,
          agazaId: id,
          fromUser: userId,
          fromUserName: userName,
          toUser: toUserId ?? undefined,
          toUserName: toUserName ?? undefined,
          msg: body.action === "accept" ? "اعتماد" : "رفض",
          reason: stage,
          processCode,
        },
        tx,
      );

      if (stage === "approve_moder_3am" && body.action === "accept") {
        await this.insertHistory(
          {
            agazaRkm: row.agaza_rkm,
            agazaId: id,
            fromUser: userId,
            fromUserName: userName,
            toUser: toUserId ?? undefined,
            toUserName: toUserName ?? undefined,
            msg: "إغلاق الطلب",
            reason: "close_talab",
            processCode: PROCESS_CODE.CLOSE,
          },
          tx,
        );
      }
    });

    return { id, stage, suspend, status: suspendToListStatus(suspend) };
  }

  private async resolveByMosama(
    code: number,
  ): Promise<{ userId: number; name: string | null } | null> {
    const setting = await this.prisma.hr_egraat_emp_setting.findFirst({
      where: { job_title_code_fk: code, person_suspend: 1 },
    });
    if (!setting?.person_id) return null;
    const user = await this.prisma.users.findFirst({
      where: { emp_code: setting.person_id, role_id_fk: 3 },
    });
    if (!user) return null;
    return { userId: user.user_id, name: setting.person_name ?? null };
  }

  /** Backward-compatible single-step routes (delegate to chain). */
  async approve(id: number, userId?: number, userName?: string) {
    return this.action(id, { action: "accept" }, userId, userName);
  }

  async reject(id: number, userId?: number, userName?: string) {
    return this.action(id, { action: "reject" }, userId, userName);
  }

  async cancel(id: number, userId?: number, userName?: string) {
    const row = await this.prisma.hr_all_agzat_orders.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("طلب الإجازة غير موجود");

    await this.prisma.$transaction(async (tx) => {
      await tx.hr_all_agzat_orders.update({
        where: { id },
        data: {
          suspend: SuspendStatus.CANCELLED,
          suspend_date: cairoDateString(),
          reason_action: "cancel",
        },
      });
      await this.insertHistory(
        {
          agazaRkm: row.agaza_rkm,
          agazaId: id,
          fromUser: userId,
          fromUserName: userName,
          toUser: row.publisher ?? undefined,
          msg: "إلغاء",
          reason: "cancel",
        },
        tx,
      );
    });

    return { id, status: "rejected" };
  }

  private async insertHistory(
    opts: {
      agazaRkm: number | null | undefined;
      agazaId: number;
      fromUser?: number;
      fromUserName?: string;
      toUser?: number | null;
      toUserName?: string;
      msg: string;
      reason: string;
      processCode?: number;
    },
    db: LeaveDb = this.prisma,
  ) {
    await db.hr_all_agzat_history.create({
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
        date: cairoDateString(),
        date_ar: cairoDateString(),
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
      hasSubstitute: r.mowazf_badel === 1,
      isPaid: r.is_paid,
      isActive: r.active === "yes",
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async createType(body: {
    title?: string;
    minDays?: number;
    maxDays?: number;
    agazaTtype?: number;
    hasSubstitute?: boolean;
    isPaid?: boolean;
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
        mowazf_badel: body.hasSubstitute ? 1 : 0,
        is_paid: body.isPaid !== false,
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
      hasSubstitute?: boolean;
      isPaid?: boolean;
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
        mowazf_badel:
          body.hasSubstitute != null
            ? body.hasSubstitute
              ? 1
              : 0
            : existing.mowazf_badel,
        is_paid: body.isPaid ?? existing.is_paid,
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
    let started: { year: number; month: number; day: number };
    try {
      started = dateOnlyParts(dateStr.slice(0, 10));
    } catch {
      return 0;
    }
    const now = cairoDateParts();
    let months = (now.year - started.year) * 12 + (now.month - started.month);
    if (now.day < started.day) months -= 1;
    return Math.max(0, months);
  }

  /** Tenure ladder (get_employee_balance): <6m=0, <12=7.5, <24=15, else 21. */
  private tenureLadder(months: number): number {
    if (months < 6) return 0;
    if (months < 12) return 7.5;
    if (months < 24) return 15;
    return 21;
  }

  async balances(q: PaginationDto) {
    const year = cairoDateParts().year;
    const search = q.search?.trim();
    const searchClause = search
      ? Prisma.sql`AND (e.employee LIKE ${`%${search}%`} OR CAST(e.emp_code AS CHAR) LIKE ${`%${search}%`})`
      : Prisma.empty;
    const activeContractJoin = Prisma.sql`
      FROM employees e
      INNER JOIN contract_employe c
        ON c.emp_code = CAST(e.emp_code AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci
      WHERE (e.leave_emp IS NULL OR e.leave_emp = 0)
        AND e.emp_code IS NOT NULL
        ${searchClause}
    `;

    const [contracts, countRows, setting, types] = await Promise.all([
      this.prisma.$queryRaw<BalanceContractRow[]>(Prisma.sql`
        SELECT
          c.id AS contractId,
          e.emp_code AS empCode,
          e.id AS employeeId,
          e.employee AS employeeName,
          e.start_work_date_m AS startWorkDate,
          c.year_vacation_num AS yearVacationNum,
          c.casual_vacation_num AS casualVacationNum,
          c.vacation_previous_balance AS previousBalance,
          c.vacation_start_m AS vacationStart
        ${activeContractJoin}
        ORDER BY c.id ASC
        LIMIT ${q.take} OFFSET ${q.skip}
      `),
      this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        ${activeContractJoin}
      `),
      this.prisma.hr_agazat_sysat.findFirst(),
      this.prisma.holiday_setting.findMany(),
    ]);
    const total = Number(countRows[0]?.total ?? 0n);
    const defaultType = types[0];
    const emergencyType = types.find((t) => t.agaza_ttype === 1);
    const emergencyQuota = setting?.emergency_nums_in_year ?? 0;
    const employeeCodes = contracts.map((contract) => BigInt(contract.empCode));

    // Only aggregate leave usage for the employees on this page. This keeps the
    // endpoint bounded even when the installation has tens of thousands of staff.
    const [usedRows, emergencyRows] = await Promise.all([
      this.prisma.hr_all_agzat_orders.groupBy({
        by: ["emp_code_fk"],
        where: {
          emp_code_fk: { in: employeeCodes },
          suspend: SuspendStatus.APPROVED,
          year,
        },
        _sum: { num_days: true },
      }),
      this.prisma.hr_all_agzat_orders.groupBy({
        by: ["emp_code_fk"],
        where: {
          emp_code_fk: { in: employeeCodes },
          suspend: SuspendStatus.APPROVED,
          year,
          f2a_agaza: 1,
        },
        _sum: { num_days: true },
      }),
    ]);
    const usedMap = new Map(
      usedRows.map((u) => [String(u.emp_code_fk), u._sum.num_days ?? 0]),
    );
    const emergencyUsedMap = new Map(
      emergencyRows.map((u) => [String(u.emp_code_fk), u._sum.num_days ?? 0]),
    );

    const rows = contracts.map((contract) => {
      const yearVacation = parseFloat(contract.yearVacationNum) || 0;
      const monthVacation = yearVacation / 12;
      const casualQuota = parseFloat(contract.casualVacationNum) || 0;
      const prevBalance = contract.previousBalance || 0;

      // monthly pro-rata accrual from vacation_start_m (fallback: start_work_date_m)
      const startM = contract.vacationStart || contract.startWorkDate || null;
      const availableBeforeUsage = accruedAnnualLeave({
        annualQuota: yearVacation,
        previousBalance: prevBalance,
        accrualStartDate: startM,
        employmentStartDate: contract.startWorkDate,
        asOfDate: cairoDateString(),
      });
      const accrued = Math.max(0, availableBeforeUsage - prevBalance);

      const usedKey = String(contract.empCode);
      const used = usedMap.get(usedKey) ?? 0;
      const emergencyUsed = emergencyUsedMap.get(usedKey) ?? 0;

      // annual available = accrued − used + previous balance (legacy ava_days f2a!=1)
      const annualRemaining = availableBeforeUsage - used;
      const tenureMonths = this.monthsSince(contract.startWorkDate);

      return {
        id: contract.employeeId,
        employeeName: contract.employeeName ?? undefined,
        empCode: String(contract.empCode),
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
      };
    });
    return paginated(rows, total, q.page, q.pageSize);
  }

  /**
   * Year-end carry-over (ترحيل الرصيد): fold each employee's remaining annual balance into
   * contract_employe.vacation_previous_balance and reset the accrual anchor (vacation_start_m)
   * to the start of the target year. Mirrors how the legacy app reads
   * vacation_previous_balance as carried-over days.
   */
  async carryOver(targetYear?: number, initiatedBy?: number) {
    const year = targetYear ?? cairoDateParts().year;
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      throw new BadRequestException("سنة ترحيل الرصيد غير صالحة");
    }
    const prevYear = year - 1;
    const newAnchor = `${year}-01-01`;
    return this.prisma.$transaction(async (tx) => {
      await tx.leave_carryover_runs.upsert({
        where: { target_year: year },
        create: {
          target_year: year,
          status: "running",
          initiated_by: initiatedBy ?? null,
        },
        update: {},
      });
      const existing = await tx.leave_carryover_runs.findUnique({
        where: { target_year: year },
      });
      if (existing?.status === "completed") {
        return { year, processed: existing.processed, idempotent: true };
      }

      const contracts = await tx.contract_employe.findMany();
      const emps = await tx.employees.findMany({
        select: { id: true, emp_code: true, start_work_date_m: true },
      });
      const byCode = new Map(
        emps.map((employee) => [String(employee.emp_code), employee]),
      );
      const usedRows = await tx.hr_all_agzat_orders.groupBy({
        by: ["emp_code_fk"],
        where: { suspend: SuspendStatus.APPROVED, year: prevYear },
        _sum: { num_days: true },
      });
      const usedMap = new Map(
        usedRows.map((used) => [
          String(used.emp_code_fk),
          used._sum.num_days ?? 0,
        ]),
      );

      let processed = 0;
      for (const contract of contracts) {
        if (contract.vacation_start_m === newAnchor) continue;
        const employee = byCode.get(contract.emp_code);
        const availableAtYearEnd = accruedAnnualLeave({
          annualQuota: parseFloat(contract.year_vacation_num) || 0,
          previousBalance: contract.vacation_previous_balance || 0,
          accrualStartDate: contract.vacation_start_m,
          employmentStartDate: employee?.start_work_date_m,
          asOfDate: `${prevYear}-12-31`,
        });
        const carried = Math.max(
          0,
          availableAtYearEnd - (usedMap.get(contract.emp_code) ?? 0),
        );
        await tx.contract_employe.update({
          where: { id: contract.id },
          data: {
            vacation_previous_balance: Math.round(carried * 100) / 100,
            vacation_start_m: newAnchor,
          },
        });
        processed += 1;
      }
      await tx.leave_carryover_runs.update({
        where: { target_year: year },
        data: { status: "completed", processed, completed_at: new Date() },
      });
      return { year, processed, idempotent: false };
    });
  }
}
