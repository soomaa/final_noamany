import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { todayIso } from '../../common/utils/legacy-date.util';
import {
  buildSuspendWhere,
  canApprove,
  nextApproveSuspend,
  rejectSuspend,
  suspendToListStatus,
  SuspendStatus,
} from '../../common/utils/suspend-status.util';
import { CreateMissionDto } from './dto/create-mission.dto';
import { ListMissionsDto } from './dto/list-missions.dto';
import { computeBdalTotal, missionNumDays, BDAL_METHOD_PER_DAY } from './mission-bdal.util';

@Injectable()
export class MissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListMissionsDto) {
    const and: Prisma.hr_mandate_ordersWhereInput[] = [];
    const statusWhere = buildSuspendWhere(q.status);
    if (statusWhere) and.push(statusWhere as Prisma.hr_mandate_ordersWhereInput);
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { mandate_direction: { contains: s } },
          { geha_mandate_name: { contains: s } },
          { mandate_purpose: { contains: s } },
        ],
      });
    }

    const where: Prisma.hr_mandate_ordersWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_mandate_orders.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_mandate_orders.count({ where }),
    ]);

    const empIds = [...new Set(rows.map((r) => r.emp_id_fk))];
    const employees = empIds.length
      ? await this.prisma.employees.findMany({
          where: { id: { in: empIds } },
          select: { id: true, employee: true },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e.employee]));

    const data = rows.map((row) => ({
      id: row.id,
      employeeName: empMap.get(row.emp_id_fk) ?? null,
      destination: row.geha_mandate_name || row.mandate_direction || null,
      startDate: row.from_date !== '0' ? row.from_date : row.date_ar,
      endDate: row.to_date !== '0' ? row.to_date : null,
      allowanceTotal: Number(row.bdal_total) || 0,
      status: suspendToListStatus(row.suspend),
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  async create(dto: CreateMissionDto, publisherId?: number, publisherName?: string | null) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const maxRkm = await this.prisma.hr_mandate_orders.aggregate({ _max: { rkm_talab: true } });
    const today = todayIso();

    const derived = await this.deriveAllowanceFromMandateType(dto.mandateTypeId);
    const numDays = missionNumDays(dto.startDate, dto.endDate);
    const allowanceMethod = dto.allowanceMethod ?? derived?.method ?? '0';
    const allowanceValue =
      dto.allowanceValue != null && dto.allowanceValue !== ''
        ? Number(dto.allowanceValue) || 0
        : (derived?.value ?? 0);
    const allowanceTotal = computeBdalTotal(allowanceMethod, allowanceValue, numDays);

    const mission = await this.prisma.hr_mandate_orders.create({
      data: {
        rkm_talab: (maxRkm._max.rkm_talab ?? 0) + 1,
        emp_id_fk: emp.id,
        edara_id_fk: emp.edara_id ?? 0,
        qsm_id_fk: emp.qsm_id ?? 0,
        direct_manager_id_fk: Number(emp.manger) || 0,
        job_title_id_fk: Number(emp.degree_id) || 0,
        mandate_type_fk: dto.mandateTypeId ?? 0,
        mandate_direction: dto.direction ?? dto.destination,
        mandate_distance: dto.distance ?? '0',
        geha_mandate_id_fk: dto.destinationId ?? 0,
        geha_mandate_name: dto.destination,
        mandate_purpose: dto.purpose ?? '',
        from_date: dto.startDate,
        to_date: dto.endDate,
        num_days: String(numDays),
        bdal_count_method: allowanceMethod,
        bdal_value: String(allowanceValue),
        bdal_total: String(allowanceTotal),
        date: today,
        date_ar: today,
        approved_direct_manager: 0,
        specific_emp_id: 0,
        approved_specific_emp: 0,
        suspend: SuspendStatus.INCOMING,
        level: 0,
        publisher: publisherId ?? 0,
        publisher_name: publisherName,
        emp_user_id: publisherId ?? 0,
        current_from_user_id: publisherId ?? 0,
        current_from_user_name: publisherName,
      },
    });

    return { id: mission.id, rkmTalab: mission.rkm_talab, allowanceTotal };
  }

  async approve(id: number, userId?: number, userName?: string | null) {
    const row = await this.findOrThrow(id);
    if (!canApprove(row.suspend)) throw new BadRequestException('لا يمكن اعتماد هذه المأمورية');

    const next = nextApproveSuspend(row.suspend);
    await this.prisma.hr_mandate_orders.update({
      where: { id },
      data: {
        suspend: next,
        action_moder_final: next === 4 ? 1 : row.action_moder_final,
      },
    });

    await this.writeHistory(row, next, userId, userName, next === 4 ? 'اعتماد نهائي' : 'اعتماد', 'approve');

    return { id, suspend: next, status: suspendToListStatus(next) };
  }

  async reject(id: number, userId?: number, userName?: string | null) {
    const row = await this.findOrThrow(id);
    if (!canApprove(row.suspend)) throw new BadRequestException('لا يمكن رفض هذه المأمورية');

    const suspend = rejectSuspend();
    await this.prisma.hr_mandate_orders.update({
      where: { id },
      data: { suspend, reason_action: 'reject' },
    });

    await this.writeHistory(row, suspend, userId, userName, 'رفض', 'reject');

    return { id, suspend, status: 'rejected' };
  }

  /** hr_mandate_orders_history row (mirrors agazat history convention). */
  private async writeHistory(
    row: Prisma.hr_mandate_ordersGetPayload<object>,
    suspend: number,
    userId: number | undefined,
    userName: string | null | undefined,
    msg: string,
    action: string,
  ) {
    await this.prisma.hr_mandate_orders_history.create({
      data: {
        mandate_rkm_fk: row.rkm_talab,
        mandate_rkm_id: row.id,
        from_user_id: userId ?? 0,
        from_user_name: userName ?? 'النظام',
        to_user_id: row.emp_id_fk,
        level: row.level,
        talab_in_fk: row.talab_in_fk ?? 0,
        talab_in_title: row.talab_in_title ?? '',
        talab_msg: msg,
        reason_action: action,
        date: todayIso(),
        date_ar: todayIso(),
        suspend: String(suspend),
      },
    });
  }

  /** Recompute and return the mission's expenses (بدل المأمورية) breakdown. */
  async expenses(id: number) {
    const mission = await this.findOrThrow(id);
    const numDays =
      Number(mission.num_days) ||
      missionNumDays(
        mission.from_date !== '0' ? mission.from_date : undefined,
        mission.to_date !== '0' ? mission.to_date : undefined,
      );
    const value = Number(mission.bdal_value) || 0;
    const total = Number(mission.bdal_total) || computeBdalTotal(mission.bdal_count_method, value, numDays);

    return {
      missionId: id,
      allowanceMethod: mission.bdal_count_method,
      allowanceValue: value,
      allowanceTotal: total,
      numDays,
      items: [
        {
          label: 'بدل المأمورية',
          method: mission.bdal_count_method === '1' ? 'يومي' : 'مقطوع',
          unit: value,
          days: numDays,
          amount: total,
        },
      ],
    };
  }

  async remove(id: number) {
    const row = await this.findOrThrow(id);
    await this.prisma.hr_mandate_orders_history.deleteMany({
      where: { OR: [{ mandate_rkm_fk: row.rkm_talab }, { mandate_rkm_id: id }] },
    });
    await this.prisma.hr_mandate_orders.delete({ where: { id } });
    return { id };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_mandate_orders.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('المأمورية غير موجودة');
    return row;
  }

  /** Pull default allowance from hr_entdab_sysat_setting (ttype ↔ mandate_type_fk). */
  private async deriveAllowanceFromMandateType(
    mandateTypeId?: number,
  ): Promise<{ method: string; value: number } | null> {
    if (!mandateTypeId) return null;
    const policy = await this.prisma.hr_entdab_sysat_setting.findFirst({
      where: { ttype: mandateTypeId },
    });
    if (!policy?.badal_value_full_day) return null;
    return { method: BDAL_METHOD_PER_DAY, value: policy.badal_value_full_day };
  }
}
