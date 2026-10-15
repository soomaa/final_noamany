import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { cairoDateString } from '../../common/utils/cairo-date';

type SalaryDoor = {
  salary_start: number | null;
  x_1: number | null;
  x_2: number | null;
  x_3: number | null;
  x_4: number | null;
  x_5: number | null;
  x_6: number | null;
  x_7: number | null;
  x_8: number | null;
  x_9: number | null;
  x_10: number | null;
  x_11: number | null;
  x_12: number | null;
  x_13: number | null;
  x_14: number | null;
  x_15: number | null;
};

export function yearsOfService(startWorkDate: string | null | undefined, today: string): number {
  if (!startWorkDate || startWorkDate.length < 10 || today.length < 10) return 0;
  const start = Date.parse(`${startWorkDate.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / (365.25 * 86_400_000));
}

export function scaleSalaryForYears(row: SalaryDoor, years: number): number {
  const step = Math.min(15, Math.max(1, years + 1));
  const fromStep = row[`x_${step}` as keyof SalaryDoor];
  return Number(fromStep ?? row.salary_start ?? 0);
}

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

  /**
   * Apply this grade to employees whose degree / rank / qualification matches
   * the scale row, when their basic salary is still empty. Years of service
   * pick the matching x_N step when present; otherwise salary_start.
   */
  async applyToEmployees(id: number) {
    const row = await this.findOrThrow(id);
    const salaryStart = row.salary_start ?? 0;
    if (salaryStart <= 0) throw new NotFoundException('قيمة بداية السلم غير صالحة');
    const martba = (row.martba ?? '').trim();
    const mo2hel = (row.mo2hel ?? '').trim();
    const matchOr: Prisma.employeesWhereInput[] = [{ degree_id: String(row.id) }];
    if (martba) {
      matchOr.push({ degree_id: martba }, { employee_degree: martba });
    }
    if (mo2hel) {
      matchOr.push({ employee_qualification: mo2hel });
    }
    const candidates = await this.prisma.employees.findMany({
      where: {
        AND: [
          { OR: matchOr },
          { OR: [{ basic_salary: null }, { basic_salary: { lte: 0 } }] },
        ],
      },
      select: { id: true, start_work_date_m: true },
    });
    const today = cairoDateString();
    let updated = 0;
    for (const emp of candidates) {
      const salary = scaleSalaryForYears(row, yearsOfService(emp.start_work_date_m, today));
      if (salary <= 0) continue;
      await this.prisma.employees.update({
        where: { id: emp.id },
        data: { basic_salary: salary },
      });
      updated += 1;
    }
    return { id, updated, salaryStart };
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
