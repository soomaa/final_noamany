import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  SUSPEND_APPROVED,
  SUSPEND_INVESTIGATING,
  buildSuspendWhere,
  suspendToListStatus,
  SuspendStatus,
} from '../../common/utils/suspend-status.util';
import { CreateBylawDto, CreatePenaltyDto, UpdateBylawDto, UpdatePenaltyDto } from './dto/penalty.dto';
import { ListPenaltiesDto } from './dto/list-penalties.dto';
import { cairoDateString, dateOnlyEpochSeconds, dateOnlyParts } from '../../common/utils/cairo-date';
import { HrDataScopeService } from '../../common/hr-scope/hr-data-scope.service';
import { JwtUser } from '../../common/types/jwt-user';

@Injectable()
export class PenaltiesService {
  constructor(private readonly prisma: PrismaService, private readonly scope: HrDataScopeService) {}

  async list(q: ListPenaltiesDto, user: JwtUser) {
    const and: Prisma.hr_gezaatWhereInput[] = [];
    const identities = await this.scope.employeeIdentities(user, 'finance.penalties');
    if (identities) and.push(identities.ids.length ? { emp_id: { in: identities.ids } } : { id: -1 });
    const statusWhere = buildSuspendWhere(q.status);
    if (statusWhere?.suspend) and.push({ suspend: statusWhere.suspend });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ emp_name: { contains: s } }, { details: { contains: s } }] });
    }

    const where: Prisma.hr_gezaatWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_gezaat.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_gezaat.count({ where }),
    ]);

    const data = rows.map((row) => ({
      id: row.id,
      employeeName: row.emp_name,
      title: row.details,
      amount: row.geza_value ? Number(row.geza_value) : null,
      date: row.geza_date_ar,
      status: suspendToListStatus(row.suspend),
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  async create(dto: CreatePenaltyDto, user: JwtUser, publisherId?: number, publisherName?: string | null) {
    await this.scope.assertEmployeeInScope(user, dto.empId, 'finance.penalties');
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    const dateStr = dto.date ?? cairoDateString();
    const { month, year } = dateOnlyParts(dateStr);
    const ts = dateOnlyEpochSeconds(dateStr);

    let gezaType = dto.gezaType ?? 0;
    let amount = dto.amount ?? '0';
    if (dto.bylawId != null) {
      const bylaw = await this.findBylawOrThrow(dto.bylawId);
      if (bylaw.is_active !== 1) throw new BadRequestException('بند اللائحة غير نشط');
      gezaType = dto.bylawId;
      if (bylaw.deduction_amount != null) amount = String(bylaw.deduction_amount);
    }

    const row = await this.prisma.hr_gezaat.create({
      data: {
        emp_id: emp.id,
        emp_code: emp.emp_code,
        emp_name: emp.employee,
        mosma_wazefy_n: emp.mosma_wazefy_n,
        edara_id_fk: emp.edara_id,
        edara_n: emp.edara_n,
        qsm_id_fk: emp.qsm_id,
        qsm_n: emp.qsm_n,
        details: dto.title,
        geza_value: amount,
        geza_type: gezaType,
        geza_date: String(ts),
        geza_date_ar: dateStr,
        month,
        year,
        publisher: publisherId,
        publisher_name: publisherName,
        suspend: SuspendStatus.INCOMING,
      },
    });
    return { id: row.id };
  }

  async update(id: number, dto: UpdatePenaltyDto, user: JwtUser) {
    const existing = await this.findScopedPenaltyOrThrow(id, user);
    // Once approved (suspend ∈ {1,4}) the amount / month / year are locked: mutating them after
    // approval would change what a payroll run deducts (or re-map the penalty into another run),
    // re-opening the negative-penalty / double-collection window. Title/type edits stay allowed.
    const approved = SUSPEND_APPROVED.includes(existing.suspend);
    const changesLockedFields =
      dto.amount != null || dto.date != null;
    if (approved && changesLockedFields) {
      throw new BadRequestException('لا يمكن تعديل قيمة أو تاريخ جزاء معتمد');
    }

    const data: Prisma.hr_gezaatUpdateInput = {};
    if (dto.title != null) data.details = dto.title;
    if (dto.amount != null) data.geza_value = dto.amount;
    if (dto.gezaType != null) data.geza_type = dto.gezaType;
    if (dto.date != null) {
      data.geza_date_ar = dto.date;
      data.geza_date = String(dateOnlyEpochSeconds(dto.date));
      const parts = dateOnlyParts(dto.date);
      data.month = parts.month;
      data.year = parts.year;
    }
    await this.prisma.hr_gezaat.update({ where: { id }, data });
    return { id };
  }

  async investigate(id: number, user: JwtUser) {
    await this.findScopedPenaltyOrThrow(id, user);
    await this.prisma.hr_gezaat.update({ where: { id }, data: { suspend: SUSPEND_INVESTIGATING } });
    return { id, status: 'investigating' };
  }

  async approve(id: number, user: JwtUser) {
    await this.findScopedPenaltyOrThrow(id, user);
    await this.prisma.hr_gezaat.update({ where: { id }, data: { suspend: SuspendStatus.APPROVED } });
    return { id, status: 'approved' };
  }

  async reject(id: number, user: JwtUser) {
    await this.findScopedPenaltyOrThrow(id, user);
    await this.prisma.hr_gezaat.update({ where: { id }, data: { suspend: SuspendStatus.REJECTED } });
    return { id, status: 'rejected' };
  }

  async remove(id: number, user: JwtUser) {
    await this.findScopedPenaltyOrThrow(id, user);
    await this.prisma.hr_gezaat.delete({ where: { id } });
    return { id };
  }

  async listBylaws(q: ListPenaltiesDto) {
    const where: Prisma.penalty_bylawsWhereInput = { is_active: 1 };
    if (q.search?.trim()) {
      where.OR = [
        { title: { contains: q.search.trim() } },
        { description: { contains: q.search.trim() } },
        { code: { contains: q.search.trim() } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.penalty_bylaws.findMany({
        where,
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.penalty_bylaws.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      penaltyDays: r.deduction_days,
      penaltyAmount: r.deduction_amount,
      actionType: r.action_type,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async createBylaw(dto: CreateBylawDto, publisherId?: number) {
    const row = await this.prisma.penalty_bylaws.create({
      data: {
        code: dto.code,
        title: dto.title,
        description: dto.description,
        action_type: dto.actionType ?? 'deduction',
        deduction_days: dto.deductionDays,
        deduction_amount: dto.deductionAmount,
        publisher: publisherId,
        created_at: cairoDateString(),
        is_active: 1,
      },
    });
    return { id: row.id };
  }

  async updateBylaw(id: number, dto: UpdateBylawDto) {
    await this.findBylawOrThrow(id);
    await this.prisma.penalty_bylaws.update({
      where: { id },
      data: {
        code: dto.code,
        title: dto.title,
        description: dto.description,
        action_type: dto.actionType,
        deduction_days: dto.deductionDays,
        deduction_amount: dto.deductionAmount,
        is_active: dto.isActive,
      },
    });
    return { id };
  }

  async removeBylaw(id: number) {
    await this.findBylawOrThrow(id);
    await this.prisma.penalty_bylaws.delete({ where: { id } });
    return { id };
  }

  private async findPenaltyOrThrow(id: number) {
    const row = await this.prisma.hr_gezaat.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الجزاء غير موجود');
    return row;
  }

  private async findScopedPenaltyOrThrow(id: number, user: JwtUser) {
    const row = await this.findPenaltyOrThrow(id);
    if (row.emp_id == null) throw new NotFoundException('الجزاء غير موجود');
    await this.scope.assertEmployeeInScope(user, row.emp_id, 'finance.penalties');
    return row;
  }

  private async findBylawOrThrow(id: number) {
    const row = await this.prisma.penalty_bylaws.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('بند اللائحة غير موجود');
    return row;
  }
}
