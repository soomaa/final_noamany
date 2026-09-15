import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertNoOverlap } from '../../common/validators/validation.util';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SUSPEND_APPROVED, SUSPEND_REJECTED, SuspendStatus, suspendToListStatus } from '../../common/utils/suspend-status.util';
import { todayIso } from '../../common/utils/legacy-date.util';
import { insertLegacyNotification } from '../../common/utils/legacy-notification.util';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { ActionLeaveDto } from './dto/action-leave.dto';
import { ListLeavesDto } from './dto/list-leaves.dto';
import { JwtUser } from '../../common/types/jwt-user';
import {
  ACCEPT_SUSPEND,
  LeaveStage,
  NEXT_STAGE_BY_CURRENT,
  PROCESS_CODE,
  REJECT_SUSPEND,
  STAGE_DATE_FIELD,
  nextRecipientMosama,
} from './approval-chain.util';

/** legacy day-name array indexed by PHP date('N') (1=Mon .. 7=Sun). */
const AR_DAYS = ['', 'الأثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

@Injectable()
export class LeavesService {
  constructor(private readonly prisma: PrismaService) {}

  private arDayName(dateStr?: string | null): string | null {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return null;
    // JS getDay(): 0=Sun..6=Sat → PHP N: Mon=1..Sun=7
    const jsDay = d.getDay();
    const phpN = jsDay === 0 ? 7 : jsDay;
    return AR_DAYS[phpN] ?? null;
  }

  async list(q: ListLeavesDto, actor?: number | Pick<JwtUser, 'sub' | 'level'>) {
    const userId = typeof actor === 'number' ? actor : actor?.sub;
    const isAdmin = typeof actor !== 'number' && actor?.level === 1;
    const and: Prisma.hr_all_agzat_ordersWhereInput[] = [];

    // legacy tabs (get_datatables_agazat)
    switch (q.mode) {
      case 'wared':
        and.push({ current_to_user_id: userId ?? -1 });
        and.push({ actions_sends: { not: 'close_talab' } });
        break;
      case 'accept':
        and.push({ suspend: { in: SUSPEND_APPROVED } });
        if (userId) and.push({ publisher: userId });
        break;
      case 'reject':
        and.push({ suspend: { in: SUSPEND_REJECTED } });
        if (userId) and.push({ publisher: userId });
        break;
      case 'sader':
      default:
        if (q.mode === 'sader' && userId) and.push({ publisher: userId });
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
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_all_agzat_orders.count({ where }),
    ]);

    const empIds = [...new Set(rows.map((r) => r.emp_id_fk).filter(Boolean))] as number[];
    const typeIds = [...new Set(rows.map((r) => r.no3_agaza).filter(Boolean))] as number[];
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
      requestNumber: r.agaza_rkm ?? undefined,
      submittedAt: r.agaza_date ?? undefined,
      employeeName: empMap.get(r.emp_id_fk ?? 0) ?? r.manager_name ?? undefined,
      leaveType: r.no3_agaza != null ? (typeMap.get(r.no3_agaza) ?? String(r.no3_agaza)) : undefined,
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
        r.actions_sends !== 'close_talab' &&
        NEXT_STAGE_BY_CURRENT[r.actions_sends ?? ''] != null,
      canManage:
        r.suspend === SuspendStatus.INCOMING &&
        (isAdmin || (userId != null && r.publisher === userId)),
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  /** Faithful port of add_agaza / get_data_new — full request fields. */
  async create(
    body: CreateLeaveDto,
    currentUserId?: number,
    currentUserName?: string,
    options?: { enforceLegacyMobileBalance?: boolean },
  ) {
    if (!body.leaveTypeId || !body.startDate || !body.endDate) {
      throw new BadRequestException('نوع الإجازة والتواريخ مطلوبة');
    }

    const start = new Date(body.startDate + 'T12:00:00');
    const end = new Date(body.endDate + 'T12:00:00');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('تواريخ غير صحيحة');
    }
    if (end < start) throw new BadRequestException('تاريخ النهاية يجب أن يكون بعد البداية');

    const days =
      body.numDays ?? Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    const leaveType = await this.prisma.holiday_setting.findUnique({ where: { id: body.leaveTypeId } });
    if (!leaveType) throw new BadRequestException('نوع الإجازة غير موجود');
    if (leaveType.agaza_ttype === 1) {
      throw new BadRequestException('الإجازات الرسمية تُحدد من إعدادات الإجازات الرسمية ولا تُقدم كطلب موظف');
    }
    if (leaveType.min_days != null && leaveType.min_days > 0 && days < leaveType.min_days) {
      throw new BadRequestException(`الحد الأدنى لهذا النوع ${leaveType.min_days} يوم`);
    }
    if (leaveType.max_days != null && leaveType.max_days > 0 && days > leaveType.max_days) {
      throw new BadRequestException(`الحد الأقصى لهذا النوع ${leaveType.max_days} يوم`);
    }

    let empId = body.empId;
    let emp = null as Awaited<ReturnType<typeof this.prisma.employees.findUnique>> | null;
    if (!empId && currentUserId) {
      const account = await this.prisma.users.findUnique({ where: { user_id: currentUserId } });
      if (account?.emp_code != null) {
        // New-system invariant: users.emp_code stores employees.id. Keep the
        // business-code fallback for older imports, but prefer the primary key
        // so a coincidentally equal emp_code cannot route a request to another employee.
        emp = await this.prisma.employees.findUnique({ where: { id: account.emp_code } });
        emp ??= await this.prisma.employees.findFirst({ where: { emp_code: account.emp_code } });
        empId = emp?.id;
      }
    }
    if (empId) {
      emp ??= await this.prisma.employees.findUnique({ where: { id: empId } });
      if (!emp) throw new NotFoundException('الموظف غير موجود');

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
        { start: body.startDate, end: body.endDate, label: 'الإجازة الجديدة' },
        overlapping.map((o) => ({
          start: o.agaza_from_date_m ?? body.startDate,
          end: o.agaza_to_date_m ?? body.endDate,
          id: o.id,
          label: o.agaza_from_date_m ?? undefined,
        })),
        'يوجد تداخل مع إجازة معتمدة',
      );
    }

    // The legacy endpoint opts into its historical balance ladder. Employee requests
    // from the new mobile API deliberately do not use a leave-balance restriction.
    if (emp && options?.enforceLegacyMobileBalance) {
      await this.assertLegacyMobileBalance(emp.id, emp.start_work_date_m, body.leaveTypeId, days);
    }

    if (emp && [3, 4].includes(body.leaveTypeId)) {
      await this.assertSickLeaveMonthlyLimit(emp.id, body.startDate);
    }

    const maxRkm = await this.prisma.hr_all_agzat_orders.aggregate({ _max: { agaza_rkm: true } });
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
    let managerUser = managerEmp != null
      ? await this.prisma.users.findFirst({ where: { emp_code: managerEmp.id, approved: 1 } })
      : null;
    if (!managerUser && managerEmp?.emp_code != null) {
      managerUser = await this.prisma.users.findFirst({ where: { emp_code: managerEmp.emp_code, approved: 1 } });
    }
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
      });
    }
    // legacy: level=1 when a substitute is set (route to substitute first), else level=2
    const level = body.substituteEmpId ? 1 : 2;

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
        qsm_n: '',
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
        emp_badel_code_fk: substituteEmp?.emp_code != null ? BigInt(substituteEmp.emp_code) : null,
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
        current_to_user_name: managerEmp?.employee ?? null,
        current_to_user_id: managerUser?.user_id ?? null,
        current_to_emp_id: managerEmp?.id != null ? String(managerEmp.id) : null,
        send_to_direct_manager: 'yes',
        actions_sends: 'send_to_direct_manager',
      },
    });

    await this.insertHistory({
      agazaRkm,
      agazaId: row.id,
      fromUser: currentUserId,
      fromUserName: currentUserName,
      toUser: managerUser?.user_id,
      toUserName: managerEmp?.employee ?? undefined,
      msg: 'تحويل للمدير المباشر',
      reason: 'send_to_direct_manager',
      processCode: PROCESS_CODE.ACCEPT,
    });
    await insertLegacyNotification(this.prisma, row.id, 101, currentUserId, managerUser?.user_id);

    return { id: row.id, agaza_rkm: row.agaza_rkm };
  }

  /** Multi-stage chain action (faithful process_ta7welat_procedures for agazat). */
  async action(id: number, body: ActionLeaveDto, userId?: number, userName?: string) {
    const row = await this.prisma.hr_all_agzat_orders.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('طلب الإجازة غير موجود');

    if (row.current_to_user_id != null && userId != null && row.current_to_user_id !== userId) {
      throw new BadRequestException('هذا الطلب غير محول إليك');
    }

    const stage = NEXT_STAGE_BY_CURRENT[row.actions_sends ?? ''];
    if (!stage) throw new BadRequestException('لا يوجد إجراء متاح على هذا الطلب');

    const emp = row.emp_id_fk
      ? await this.prisma.employees.findUnique({ where: { id: row.emp_id_fk } })
      : null;

    const reason = body.reason ?? null;
    let toUserId: number | null;
    let toUserName: string | null = null;
    let suspend: number;
    let stageFlag: 'yes' | 'no';
    let processCode: number;

    if (body.action === 'accept') {
      stageFlag = 'yes';
      suspend = ACCEPT_SUSPEND[stage];
      if (stage === 'approve_moder_3am') {
        toUserId = row.publisher ?? null;
        processCode = PROCESS_CODE.ACCEPT_LATER;
      } else {
        const mosama = nextRecipientMosama(stage, {
          empType: emp?.emp_type ?? null,
          edaraId: emp?.edara_id ?? null,
        });
        const recipient = mosama != null ? await this.resolveByMosama(mosama) : null;
        toUserId = recipient?.userId ?? row.publisher ?? null;
        toUserName = recipient?.name ?? null;
        processCode =
          stage === 'approve_direct_manager' ? PROCESS_CODE.ACCEPT : PROCESS_CODE.ACCEPT_LATER;
      }
    } else {
      stageFlag = 'no';
      suspend = REJECT_SUSPEND[stage];
      toUserId = row.publisher ?? null;
      processCode =
        stage === 'approve_direct_manager' ? PROCESS_CODE.REJECT_DIRECT : PROCESS_CODE.REJECT_LATER;
    }

    const toUser = toUserId
      ? await this.prisma.users.findUnique({ where: { user_id: toUserId } })
      : null;
    if (!toUserName && toUser?.emp_code != null) {
      let recEmp = await this.prisma.employees.findUnique({ where: { id: toUser.emp_code } });
      recEmp ??= await this.prisma.employees.findFirst({ where: { emp_code: toUser.emp_code } });
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
    if (stage === 'approve_moder_3am' && body.action === 'accept') {
      data.close_talab = 'yes';
    }

    await this.prisma.hr_all_agzat_orders.update({
      where: { id },
      data: data as Prisma.hr_all_agzat_ordersUpdateInput,
    });

    await this.insertHistory({
      agazaRkm: row.agaza_rkm,
      agazaId: id,
      fromUser: userId,
      fromUserName: userName,
      toUser: toUserId ?? undefined,
      toUserName: toUserName ?? undefined,
      msg: body.action === 'accept' ? 'اعتماد' : 'رفض',
      reason: stage,
      processCode,
    });

    if (stage === 'approve_moder_3am' && body.action === 'accept') {
      await this.insertHistory({
        agazaRkm: row.agaza_rkm,
        agazaId: id,
        fromUser: userId,
        fromUserName: userName,
        toUser: toUserId ?? undefined,
        toUserName: toUserName ?? undefined,
        msg: 'إغلاق الطلب',
        reason: 'close_talab',
        processCode: PROCESS_CODE.CLOSE,
      });
    }

    const notificationCode =
      stage === 'approve_direct_manager'
        ? 105
        : stage === 'approve_moder_edara'
          ? 106
          : stage === 'approve_hr'
            ? 107
            : body.action === 'accept'
              ? 110
              : 111;
    await insertLegacyNotification(this.prisma, id, notificationCode, userId, toUserId);
    // The next approver is notified above. Also notify the request owner about
    // every decision, including intermediate approvals in a multi-step chain.
    if (row.publisher != null && row.publisher !== toUserId && row.publisher !== userId) {
      await insertLegacyNotification(this.prisma, id, notificationCode, userId, row.publisher);
    }

    // `status` describes the action just completed by the current approver.
    // The request can still continue through later workflow recipients, so the
    // persisted workflow state is returned separately rather than reporting a
    // direct-manager approval as a rejection/pending action.
    return {
      id,
      stage,
      suspend,
      status: body.action === 'accept' ? 'accepted' : 'rejected',
      workflowStatus: suspendToListStatus(suspend),
    };
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
      throw new BadRequestException('لقد استنفذت الرصيد بالكامل');
    }
  }

  /** A sick-leave request is allowed at most three times per employee per month. */
  private async assertSickLeaveMonthlyLimit(empId: number, startDate: string) {
    const monthStart = new Date(`${startDate}T12:00:00`);
    const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    const monthStartIso = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-01`;
    const nextMonthStartIso = `${nextMonthStart.getFullYear()}-${String(nextMonthStart.getMonth() + 1).padStart(2, '0')}-01`;
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
      throw new BadRequestException('الحد الأقصى للإجازات المرضية هو 3 طلبات في الشهر');
    }
  }

  /** Balance card used by the legacy add-agaza form (get_vacation_balance). */
  async available(empId: number, leaveTypeId: number) {
    const emp = await this.prisma.employees.findUnique({
      where: { id: empId },
      select: { id: true, start_work_date_m: true },
    });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

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
    return this.action(id, { action: 'accept' }, userId, userName);
  }

  async reject(id: number, userId?: number, userName?: string) {
    return this.action(id, { action: 'reject' }, userId, userName);
  }

  async cancel(id: number, userId?: number, userName?: string) {
    const row = await this.prisma.hr_all_agzat_orders.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('طلب الإجازة غير موجود');

    await this.prisma.hr_all_agzat_orders.update({
      where: { id },
      data: { suspend: SuspendStatus.CANCELLED, suspend_date: todayIso(), reason_action: 'cancel' },
    });

    await this.insertHistory({
      agazaRkm: row.agaza_rkm,
      agazaId: id,
      fromUser: userId,
      fromUserName: userName,
      toUser: row.publisher ?? undefined,
      msg: 'إلغاء',
      reason: 'cancel',
    });

    return { id, status: 'rejected' };
  }

  async remove(id: number, actor: Pick<JwtUser, 'sub' | 'level'>) {
    await this.findManageableLeave(id, actor);
    await this.prisma.$transaction([
      this.prisma.hr_all_agzat_attaches.deleteMany({ where: { talab_id_fk: id } }),
      this.prisma.hr_all_agzat_history.deleteMany({ where: { agaza_id_fk: id } }),
      this.prisma.hr_all_agzat_orders.delete({ where: { id } }),
    ]);
    return { id };
  }

  async update(
    id: number,
    body: { startDate?: string; endDate?: string; returnToWorkDate?: string; reason?: string; addressSinceAgaza?: string },
    actor: Pick<JwtUser, 'sub' | 'level'>,
  ) {
    const row = await this.findManageableLeave(id, actor);
    const startDate = body.startDate ?? row.agaza_from_date_m;
    const endDate = body.endDate ?? row.agaza_to_date_m;
    if (!startDate || !endDate) throw new BadRequestException('تواريخ الإجازة مطلوبة');

    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new BadRequestException('تاريخ النهاية يجب أن يكون بعد البداية');
    }
    const returnToWorkDate = body.returnToWorkDate ?? row.mobashret_amal_date_m;
    const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

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

  private async findManageableLeave(id: number, actor: Pick<JwtUser, 'sub' | 'level'>) {
    const row = await this.prisma.hr_all_agzat_orders.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('طلب الإجازة غير موجود');
    if (row.suspend !== SuspendStatus.INCOMING) {
      throw new BadRequestException('لا يمكن تعديل أو حذف طلب تمت مراجعته');
    }
    if (actor.level !== 1 && row.publisher !== actor.sub) {
      throw new ForbiddenException('يمكن لصاحب الطلب أو المدير فقط تعديل أو حذف الطلب');
    }
    return row;
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
        from_user_n: opts.fromUserName ?? 'النظام',
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
        orderBy: { id: 'desc' },
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
      isActive: r.active === 'yes',
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
    if (!body.title?.trim()) throw new BadRequestException('اسم نوع الإجازة مطلوب');
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
        active: body.isActive !== false ? 'yes' : 'no',
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
    const existing = await this.prisma.holiday_setting.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('نوع الإجازة غير موجود');

    // Annual balances are contract-based (contract_employe.year_vacation_num) — changing
    // type max does not retroactively rebalance contracts; keep num_days synced to max_days.
    if (body.maxDays != null && body.maxDays !== existing.max_days && body.maxDays > 0) {
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
          body.hasSubstitute != null ? (body.hasSubstitute ? 1 : 0) : existing.mowazf_badel,
        active: body.isActive != null ? (body.isActive ? 'yes' : 'no') : existing.active,
      },
    });
    return { id };
  }

  async removeType(id: number) {
    const existing = await this.prisma.holiday_setting.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('نوع الإجازة غير موجود');
    await this.prisma.holiday_setting.delete({ where: { id } });
    return { id };
  }

  // ----- Balances / accrual (faithful get_days_vacation_year_2 + tenure ladder) -----

  /** months elapsed between a date-string and today (legacy DateTime::diff y*12+m). */
  private monthsSince(dateStr?: string | null): number {
    if (!dateStr) return 0;
    const d = new Date(dateStr + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return 0;
    const now = new Date();
    let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
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

  async balances(q: PaginationDto) {
    const year = new Date().getFullYear();
    const [contracts, emps, setting, types] = await Promise.all([
      this.prisma.contract_employe.findMany(),
      this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
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
        by: ['emp_code_fk'],
        where: { suspend: SuspendStatus.APPROVED, year },
        _sum: { num_days: true },
      }),
      this.prisma.hr_all_agzat_orders.groupBy({
        by: ['emp_code_fk'],
        where: { suspend: SuspendStatus.APPROVED, year, f2a_agaza: 1 },
        _sum: { num_days: true },
      }),
    ]);
    const usedMap = new Map(usedRows.map((u) => [String(u.emp_code_fk), u._sum.num_days ?? 0]));
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

      const usedKey = emp.emp_code != null ? String(emp.emp_code) : '';
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
          leaveType: defaultType?.name ?? 'إجازة سنوية',
          // annual (سنوية)
          total: Math.round(accrued + prevBalance),
          used: Math.round(used),
          remaining: Math.max(0, Math.round(annualRemaining)),
          // tenure ladder reference balance
          tenureBalance: this.tenureLadder(tenureMonths),
          // emergency (طارئة) quota
          emergencyType: emergencyType?.name ?? 'طارئة',
          emergencyTotal: emergencyQuota,
          emergencyUsed: Math.round(emergencyUsed),
          emergencyRemaining: Math.max(0, Math.round(emergencyQuota - emergencyUsed)),
          // casual (عارضة) quota
          casualTotal: Math.round(casualQuota),
          monthlyAccrual: Math.round(monthVacation * 100) / 100,
        },
      ];
    });

    if (q.search?.trim()) {
      const s = q.search.trim().toLowerCase();
      rows = rows.filter(
        (r) => r.employeeName?.toLowerCase().includes(s) || r.empCode?.includes(s),
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
      by: ['emp_code_fk'],
      where: { suspend: SuspendStatus.APPROVED, year: prevYear },
      _sum: { num_days: true },
    });
    const usedMap = new Map(usedRows.map((u) => [String(u.emp_code_fk), u._sum.num_days ?? 0]));

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
