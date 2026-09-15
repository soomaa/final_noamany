import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateClearanceDto, ListClearanceDto, UpdateClearanceDto } from './dto/clearance.dto';

@Injectable()
export class ClearanceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListClearanceDto) {
    const groups = await this.prisma.hr_disclaimers.groupBy({
      by: ['disclaimer_id'],
      _count: { id: true },
      orderBy: { disclaimer_id: 'desc' },
    });

    let filtered = groups;
    if (q.search?.trim()) {
      const s = q.search.trim().toLowerCase();
      const withNames = await Promise.all(
        groups.map(async (g) => {
          const first = await this.prisma.hr_disclaimers.findFirst({
            where: { disclaimer_id: g.disclaimer_id },
          });
          const emp = first?.emp_id_fk
            ? await this.prisma.employees.findUnique({ where: { id: parseInt(first.emp_id_fk, 10) } })
            : null;
          return { ...g, empName: emp?.employee ?? '' };
        }),
      );
      filtered = withNames.filter((g) => g.empName?.toLowerCase().includes(s));
    }

    const total = filtered.length;
    const page = filtered.slice(q.skip, q.skip + q.take);
    const data = await Promise.all(
      page.map(async (g) => {
        const first = await this.prisma.hr_disclaimers.findFirst({
          where: { disclaimer_id: g.disclaimer_id },
        });
        const emp = first?.emp_id_fk
          ? await this.prisma.employees.findUnique({ where: { id: parseInt(first.emp_id_fk, 10) } })
          : null;
        return {
          id: g.disclaimer_id,
          title: emp?.employee ?? '',
          employeeName: String(g._count.id),
          createdAt: '',
        };
      }),
    );

    return paginated(data, total, q.page, q.pageSize);
  }

  async getGroup(groupId: number) {
    const rows = await this.prisma.hr_disclaimers.findMany({
      where: { disclaimer_id: groupId },
      orderBy: { id: 'asc' },
    });
    if (!rows.length) throw new NotFoundException('إخلاء الطرف غير موجود');

    const empId = rows[0].emp_id_fk ? parseInt(rows[0].emp_id_fk, 10) : null;
    const emp = empId ? await this.prisma.employees.findUnique({ where: { id: empId } }) : null;

    return {
      id: groupId,
      empId,
      employeeName: emp?.employee,
      lines: rows.map((r) => ({
        id: r.id,
        adminstrationId: r.adminstration_id,
        responsibleEmpId: r.responsible_emp_id,
        notes: r.notes,
        resignation: r.resignation,
        employeeCard: r.employee_card,
        medicalCard: r.medical_card,
        socialInsurance: r.social_insurance,
      })),
    };
  }

  async create(dto: CreateClearanceDto) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');

    const last = await this.prisma.hr_disclaimers.findFirst({
      orderBy: { disclaimer_id: 'desc' },
    });
    const groupId = (last?.disclaimer_id ?? 0) + 1;

    await this.insertLines(groupId, dto);
    return { id: groupId };
  }

  async update(groupId: number, dto: UpdateClearanceDto) {
    await this.getGroup(groupId);
    await this.prisma.hr_disclaimers.deleteMany({ where: { disclaimer_id: groupId } });
    await this.insertLines(groupId, dto);
    return { id: groupId };
  }

  async remove(groupId: number) {
    await this.getGroup(groupId);
    await this.prisma.hr_disclaimers.deleteMany({ where: { disclaimer_id: groupId } });
    return { id: groupId };
  }

  private async insertLines(groupId: number, dto: CreateClearanceDto) {
    for (const line of dto.lines) {
      await this.prisma.hr_disclaimers.create({
        data: {
          disclaimer_id: groupId,
          emp_id_fk: String(dto.empId),
          adminstration_id: line.adminstrationId,
          responsible_emp_id: line.responsibleEmpId ?? '0',
          notes: line.notes,
        },
      });
    }
  }
}
