import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';

function buildSalarySteps(salaryStart: number, yearBonusValue: number) {
  const steps: Record<string, number> = {};
  let current = salaryStart;
  for (let i = 1; i <= 15; i++) {
    steps[`x_${i}`] = current;
    current += yearBonusValue;
  }
  return steps;
}

@Injectable()
export class SalaryScaleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: PaginationDto) {
    const where: Prisma.hr_salary_doorsWhereInput = {};
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ mo2hel: { contains: s } }, { martba: { contains: s } }, { dawam_type: { contains: s } }];
    }
    const [rows, total] = await Promise.all([
      this.prisma.hr_salary_doors.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_salary_doors.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      title: `${r.mo2hel ?? ''} - ${r.martba ?? ''}`,
      employeeName: r.dawam_type ?? '',
      createdAt: r.salary_start != null ? String(r.salary_start) : '',
      mo2hel: r.mo2hel,
      martba: r.martba,
      dawamType: r.dawam_type,
      salaryStart: r.salary_start,
      yearBonusValue: r.year_bonus_value,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async create(body: { mo2hel: string; martba: string; dawamType: string; salaryStart: number; yearBonusValue: number }) {
    const steps = buildSalarySteps(body.salaryStart, body.yearBonusValue);
    const row = await this.prisma.hr_salary_doors.create({
      data: {
        mo2hel: body.mo2hel,
        martba: body.martba,
        dawam_type: body.dawamType,
        salary_start: body.salaryStart,
        year_bonus_value: body.yearBonusValue,
        ...steps,
      },
    });
    return { id: row.id };
  }

  async update(
    id: number,
    body: { mo2hel?: string; martba?: string; dawamType?: string; salaryStart?: number; yearBonusValue?: number },
  ) {
    const existing = await this.findOrThrow(id);
    const salaryStart = body.salaryStart ?? existing.salary_start ?? 0;
    const yearBonusValue = body.yearBonusValue ?? existing.year_bonus_value ?? 0;
    const steps =
      body.salaryStart != null || body.yearBonusValue != null
        ? buildSalarySteps(salaryStart, yearBonusValue)
        : {};
    await this.prisma.hr_salary_doors.update({
      where: { id },
      data: {
        ...(body.mo2hel != null ? { mo2hel: body.mo2hel } : {}),
        ...(body.martba != null ? { martba: body.martba } : {}),
        ...(body.dawamType != null ? { dawam_type: body.dawamType } : {}),
        ...(body.salaryStart != null ? { salary_start: body.salaryStart } : {}),
        ...(body.yearBonusValue != null ? { year_bonus_value: body.yearBonusValue } : {}),
        ...steps,
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.hr_salary_doors.delete({ where: { id } });
    return { id };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_salary_doors.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('بند سلم الرواتب غير موجود');
    return row;
  }
}
