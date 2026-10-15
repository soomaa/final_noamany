import { Injectable, NotFoundException } from '@nestjs/common';
import { assertDateOrder } from '../../common/validators/validation.util';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { todayIso } from '../../common/utils/legacy-date.util';
import { CreateArchiveDto, ListArchiveDto, UpdateArchiveDto } from './dto/archive.dto';

@Injectable()
export class ArchiveService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListArchiveDto) {
    const and: Prisma.hr_tayi_qyedWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ from_date_ar: { contains: s } }, { to_date_ar: { contains: s } }, { emp_id: { contains: s } }],
      });
    }

    const where: Prisma.hr_tayi_qyedWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_tayi_qyed.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_tayi_qyed.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => {
        const empId = row.emp_id ? parseInt(row.emp_id, 10) : null;
        const emp = empId ? await this.prisma.employees.findUnique({ where: { id: empId } }) : null;
        return {
          id: row.id,
          title: row.from_date_ar,
          employeeName: emp?.employee ?? '',
          createdAt: row.to_date_ar,
        };
      }),
    );

    return paginated(data, total, q.page, q.pageSize);
  }

  async getOne(id: number) {
    const row = await this.prisma.hr_tayi_qyed.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('طي القيد غير موجود');
    const empId = row.emp_id ? parseInt(row.emp_id, 10) : null;
    const emp = empId ? await this.prisma.employees.findUnique({ where: { id: empId } }) : null;
    return {
      id: row.id,
      empId,
      employeeName: emp?.employee,
      edaraId: row.edara_id_fk,
      qsmId: row.qsm_id_fk,
      directManagerId: row.direct_manger_id_fk,
      fromDate: row.from_date_ar,
      toDate: row.to_date_ar,
    };
  }

  async create(dto: CreateArchiveDto, publisherId?: number) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    assertDateOrder(dto.fromDate, dto.toDate);

    const dateStr = todayIso();
    const row = await this.prisma.hr_tayi_qyed.create({
      data: {
        emp_id: String(dto.empId),
        edara_id_fk: dto.edaraId ?? String(emp.edara_id ?? ''),
        qsm_id_fk: dto.qsmId ?? String(emp.qsm_id ?? ''),
        direct_manger_id_fk: dto.directManagerId ?? emp.manger ?? '',
        from_date: String(Math.floor(new Date(dto.fromDate).getTime() / 1000)),
        from_date_ar: dto.fromDate,
        to_date: String(Math.floor(new Date(dto.toDate).getTime() / 1000)),
        to_date_ar: dto.toDate,
        date: String(Math.floor(new Date(dateStr).getTime() / 1000)),
        date_s: String(Math.floor(Date.now() / 1000)),
        publisher: publisherId != null ? String(publisherId) : null,
      },
    });
    return { id: row.id };
  }

  async update(id: number, dto: UpdateArchiveDto, publisherId?: number) {
    const existing = await this.getOne(id);
    const fromDate = dto.fromDate ?? existing.fromDate;
    const toDate = dto.toDate ?? existing.toDate;
    if (fromDate && toDate) assertDateOrder(fromDate, toDate);

    const data: Prisma.hr_tayi_qyedUpdateInput = {};
    if (dto.empId != null) data.emp_id = String(dto.empId);
    if (dto.edaraId != null) data.edara_id_fk = dto.edaraId;
    if (dto.qsmId != null) data.qsm_id_fk = dto.qsmId;
    if (dto.directManagerId != null) data.direct_manger_id_fk = dto.directManagerId;
    if (dto.fromDate != null) {
      data.from_date_ar = dto.fromDate;
      data.from_date = String(Math.floor(new Date(dto.fromDate).getTime() / 1000));
    }
    if (dto.toDate != null) {
      data.to_date_ar = dto.toDate;
      data.to_date = String(Math.floor(new Date(dto.toDate).getTime() / 1000));
    }
    if (publisherId != null) data.publisher = String(publisherId);

    await this.prisma.hr_tayi_qyed.update({ where: { id }, data });
    return { id };
  }

  async remove(id: number) {
    await this.getOne(id);
    await this.prisma.hr_tayi_qyed.delete({ where: { id } });
    return { id };
  }
}
