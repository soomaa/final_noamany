import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { todayIso } from '../../common/utils/legacy-date.util';
import { CreateMissionDto } from './dto/create-mission.dto';
import { ListMissionsDto } from './dto/list-missions.dto';
import { UpdateMissionDto } from './dto/update-mission.dto';

/**
 * Work missions shown by the legacy `sites/Mohmt_3mal` screen.
 * These rows belong to tbl_mohmat_3mal; hr_mandate_orders is the separate
 * allowances/delegation feature and must not be mixed into this screen.
 */
@Injectable()
export class MissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListMissionsDto) {
    const where: Prisma.tbl_mohmat_3malWhereInput = {};
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { mohma_name: { contains: s } },
        { emp_name: { contains: s } },
        { details: { contains: s } },
        { site_name: { contains: s } },
        { mohma_date: { contains: s } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.tbl_mohmat_3mal.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.tbl_mohmat_3mal.count({ where }),
    ]);

    return paginated(
      rows.map((row) => ({
        id: row.id,
        name: row.mohma_name,
        missionDate: row.mohma_date,
        employeeId: row.emp_id_fk,
        employeeName: row.emp_name,
        details: row.details ?? '',
        createdAt: row.date_ar,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async get(id: number) {
    const row = await this.findOrThrow(id);
    return {
      id: row.id,
      name: row.mohma_name,
      missionDate: row.mohma_date,
      employeeId: row.emp_id_fk,
      employeeName: row.emp_name,
      details: row.details ?? '',
      createdAt: row.date_ar,
    };
  }

  async create(dto: CreateMissionDto, publisherId?: number) {
    const employee = await this.resolveEmployee(dto.empId);
    this.assertRequired(dto.name, dto.missionDate, dto.details);
    const today = todayIso();
    const row = await this.prisma.tbl_mohmat_3mal.create({
      data: {
        mohma_name: dto.name.trim(),
        mohma_date: dto.missionDate,
        details: dto.details.trim(),
        emp_id_fk: employee.id,
        emp_name: employee.employee ?? '',
        site_id: null,
        site_name: null,
        date_ar: today,
        date_s: String(Math.floor(new Date(`${today}T12:00:00`).getTime() / 1000)),
        publisher: publisherId ?? 0,
      },
    });
    return { id: row.id };
  }

  async update(id: number, dto: UpdateMissionDto, publisherId?: number) {
    const old = await this.findOrThrow(id);
    const empId = dto.empId ?? old.emp_id_fk;
    const employee = await this.resolveEmployee(empId);
    const name = dto.name ?? old.mohma_name;
    const missionDate = dto.missionDate ?? old.mohma_date;
    const details = dto.details ?? old.details ?? '';
    this.assertRequired(name, missionDate, details);
    const today = todayIso();

    await this.prisma.tbl_mohmat_3mal.update({
      where: { id },
      data: {
        mohma_name: name.trim(),
        mohma_date: missionDate,
        details: details.trim(),
        emp_id_fk: employee.id,
        emp_name: employee.employee ?? '',
        site_id: null,
        site_name: null,
        date_ar: today,
        date_s: String(Math.floor(new Date(`${today}T12:00:00`).getTime() / 1000)),
        publisher: publisherId ?? old.publisher,
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.tbl_mohmat_3mal.delete({ where: { id } });
    return { id };
  }

  private assertRequired(name: string, missionDate: string, details: string) {
    if (!name?.trim()) throw new BadRequestException('اسم المهمة مطلوب');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(missionDate)) {
      throw new BadRequestException('تاريخ المهمة غير صحيح');
    }
    if (!details?.trim()) throw new BadRequestException('تفاصيل المهمة مطلوبة');
  }

  private async resolveEmployee(empId: number) {
    const employee = await this.prisma.employees.findUnique({ where: { id: empId } });
    if (!employee) throw new NotFoundException('الموظف غير موجود');
    return employee;
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.tbl_mohmat_3mal.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('المهمة غير موجودة');
    return row;
  }
}
