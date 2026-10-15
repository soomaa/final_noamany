import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SUSPEND_APPROVED, SUSPEND_REJECTED, SuspendStatus, suspendToListStatus } from '../../common/utils/suspend-status.util';
import { todayIso } from '../../common/utils/legacy-date.util';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { ActionPermissionDto } from './dto/action-permission.dto';
import { ListPermissionsDto } from './dto/list-permissions.dto';
import {
  ACCEPT_SUSPEND,
  ChainStage,
  NEXT_STAGE_BY_CURRENT,
  PROCESS_CODE,
  REJECT_SUSPEND,
  STAGE_DATE_FIELD,
  nextRecipientMosama,
} from './approval-chain.util';

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
  constructor(private readonly prisma: PrismaService) {}

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
    const diff = Math.abs(this.timeToMinutes(toHour) - this.timeToMinutes(fromHour));
    return Math.round(diff * 100) / 100;
  }

  async list(q: ListPermissionsDto, userId?: number) {
    const and: Prisma.hr_all_ozonat_ordersWhereInput[] = [];

    // legacy tabs (get_datatables_ozonat)
    switch (q.mode) {
      case 'wared':
        // inbox: rows addressed to me (current_to_user_id == me)
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
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_all_ozonat_orders.count({ where }),
    ]);

    const empIds = [...new Set(rows.map((r) => r.emp_id_fk).filter(Boolean))] as number[];
    const emps = await this.prisma.employees.findMany({
      where: { id: { in: empIds } },
      select: { id: true, employee: true },
    });
    const empMap = new Map(emps.map((e) => [e.id, e.employee]));

    const data = rows.map((r) => ({
      id: r.id,
      eznRkm: r.ezn_rkm,
      no3Ezn: r.no3_ezn,
      no3EznTitle: r.no3_ezn === 1 ? 'استئذان شخصي' : r.no3_ezn === 2 ? 'استئذان للعمل' : 'اخرى',
      employeeName: r.emp_name ?? empMap.get(r.emp_id_fk ?? 0) ?? undefined,
      date: r.ezn_date_ar ?? r.date_ar ?? undefined,
      fromTime: r.from_hour ?? undefined,
      toTime: r.to_hour ?? undefined,
      minutes: r.total_hours ?? undefined,
      currentTo: r.current_to_user_name ?? undefined,
      actionsSends: r.actions_sends ?? undefined,
      status: suspendToListStatus(r.suspend),
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  /** Remaining monthly minutes + permit-count for a personal permit (no3_ezn=1). */
  async available(empId: number, eznDate: string) {
    const { month, year } = this.monthYearOf(eznDate);
    const agg = await this.prisma.hr_all_ozonat_orders.aggregate({
      where: {
        emp_id_fk: empId,
        no3_ezn: 1,
        ezn_month: month,
        ezn_year: year,
        suspend: { notIn: [2, 5] },
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

  private monthYearOf(eznDate: string): { month: number; year: number } {
    const d = new Date(eznDate + 'T12:00:00');
    if (Number.isNaN(d.getTime())) {
      const now = new Date();
      return { month: now.getMonth() + 1, year: now.getFullYear() };
    }
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }

  /** Faithful port of Add_Ezn (Ezn_order_model::add_ezn) + check_setting/check_setting_time guards. */
  async create(body: CreatePermissionDto, currentUserId?: number, currentUserName?: string) {
    const empId = body.empId;
    if (!empId) throw new BadRequestException('إسم الموظف مطلوب');

    const emp = await this.prisma.employees.findUnique({ where: { id: empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const minutes = this.permitMinutes(body.fromHour, body.toHour);
    if (minutes <= 0) throw new BadRequestException('مدة الإذن غير صحيحة');

    // per-request cap (nums_in_one_time) — legacy check_setting_time
    if (minutes > DEFAULT_NUMS_IN_ONE_TIME) {
      throw new BadRequestException('مدة الإذن تتجاوز الحد المسموح للمرة الواحدة');
    }

    // monthly caps + remaining balance — legacy check_setting / get_available (personal only)
    if (body.no3Ezn === 1) {
      const avail = await this.available(empId, body.eznDate);
      if (avail.usedCount >= DEFAULT_NUMS_IN_MONTH || avail.remainNum <= 0) {
        throw new BadRequestException('تم استنفاد عدد الأذونات المسموح بها هذا الشهر');
      }
      if (minutes > avail.remainMinutes) {
        throw new BadRequestException('مدة الإذن تتجاوز الرصيد المتبقي لهذا الشهر');
      }
    }

    const { month, year } = this.monthYearOf(body.eznDate);
    const maxRkm = await this.prisma.hr_all_ozonat_orders.aggregate({ _max: { ezn_rkm: true } });
    const eznRkm = (maxRkm._max.ezn_rkm ?? 0) + 1;

    // direct-manager routing (legacy: employees.manger holds an emp_code → users.user_id)
    const managerEmpCode = emp.manger ? parseInt(emp.manger, 10) : null;
    const managerEmp = managerEmpCode
      ? await this.prisma.employees.findFirst({ where: { emp_code: managerEmpCode } })
      : null;
    const managerUser =
      managerEmpCode != null
        ? await this.prisma.users.findFirst({ where: { emp_code: managerEmpCode } })
        : null;
    const empUser = emp.emp_code != null
      ? await this.prisma.users.findFirst({ where: { emp_code: emp.emp_code } })
      : null;

    const fatraN = body.fatraFk === 1 ? 'فترة صباحية' : body.fatraFk === 2 ? 'فترة مسائية' : null;

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
        qsm_n: '',
        qsm_id_fk: 0,
        direct_manager_id_fk: managerEmp?.id ?? managerEmpCode ?? null,
        direct_manager_code_fk: managerEmpCode ?? null,
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
        current_to_user_name: managerEmp?.employee ?? null,
        current_to_emp_id: managerEmp?.id ?? null,
        current_to_user_id: managerUser?.user_id ?? null,
        send_to_direct_manager: 'yes',
        actions_sends: 'send_to_direct_manager',
      },
    });

    await this.insertHistory({
      eznRkm,
      eznId: row.id,
      fromUserId: currentUserId,
      fromUserName: currentUserName,
      toUserId: managerUser?.user_id,
      toUserName: managerEmp?.employee ?? undefined,
      msg: 'تحويل للمدير المباشر',
      reason: 'send_to_direct_manager',
      suspend: '0',
      processCode: PROCESS_CODE.ACCEPT,
    });

    return { id: row.id, eznRkm, minutes };
  }

  /**
   * Multi-stage approval action by a `wared` recipient (faithful process_ta7welat_procedures).
   * The stage acted on is derived from the order's current `actions_sends`.
   */
  async action(id: number, body: ActionPermissionDto, userId?: number, userName?: string) {
    const row = await this.prisma.hr_all_ozonat_orders.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('طلب الإذن غير موجود');

    // only the addressed recipient may act
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
        // final: route back to publisher
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
      const recEmp = await this.prisma.employees.findFirst({ where: { emp_code: toUser.emp_code } });
      toUserName = recEmp?.employee ?? null;
    }

    const data: Prisma.hr_all_ozonat_ordersUpdateInput = {
      [stage]: stageFlag,
      suspend,
      actions_sends: stage,
      reason_action: reason,
      [STAGE_DATE_FIELD[stage]]: todayIso(),
      current_from_user_id: userId ?? null,
      current_from_user_name: userName ?? null,
      current_to_user_id: toUserId,
      current_to_user_name: toUserName,
    } as Prisma.hr_all_ozonat_ordersUpdateInput;

    if (stage === 'approve_moder_3am' && body.action === 'accept') {
      (data as Record<string, unknown>).close_talab = 'yes';
    }

    await this.prisma.hr_all_ozonat_orders.update({ where: { id }, data });

    await this.insertHistory({
      eznRkm: row.ezn_rkm,
      eznId: id,
      fromUserId: userId,
      fromUserName: userName,
      toUserId: toUserId ?? undefined,
      toUserName: toUserName ?? undefined,
      msg: body.action === 'accept' ? 'اعتماد' : 'رفض',
      reason: stage,
      suspend: String(suspend),
      processCode,
    });

    if (stage === 'approve_moder_3am' && body.action === 'accept') {
      await this.insertHistory({
        eznRkm: row.ezn_rkm,
        eznId: id,
        fromUserId: userId,
        fromUserName: userName,
        toUserId: toUserId ?? undefined,
        toUserName: toUserName ?? undefined,
        msg: 'إغلاق الطلب',
        reason: 'close_talab',
        suspend: String(suspend),
        processCode: PROCESS_CODE.CLOSE,
      });
    }

    return { id, stage, suspend, status: suspendToListStatus(suspend) };
  }

  /** Legacy get_emps_by_mosama: resolve the active recipient by job-title code. */
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

  /** Kept for backward-compatible single-step approve route (delegates to chain action). */
  async approve(id: number, userId?: number, userName?: string) {
    return this.action(id, { action: 'accept' }, userId, userName);
  }

  async reject(id: number, userId?: number, userName?: string) {
    return this.action(id, { action: 'reject' }, userId, userName);
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
      const max = await this.prisma.hr_all_ozonat_history.aggregate({ _max: { id: true } });
      const nextId = (max._max.id ?? 0) + 1;
      return this.prisma.hr_all_ozonat_history.create({
        data: {
          id: nextId,
        ezn_rkm_fk: opts.eznRkm ?? 0,
        ezn_rkm_id: opts.eznId,
        from_user_id: opts.fromUserId ?? 0,
        from_user_name: opts.fromUserName ?? 'النظام',
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
