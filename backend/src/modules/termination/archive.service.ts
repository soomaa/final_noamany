import { Injectable, NotFoundException } from '@nestjs/common';
import { assertDateOrder } from '../../common/validators/validation.util';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { todayIso } from '../../common/utils/legacy-date.util';
import { CreateArchiveDto, ListArchiveDto, UpdateArchiveDto } from './dto/archive.dto';
import { assertEmployeeInScope, scopedEmployeeIds } from '../reports/employee-branch-scope.util';

@Injectable()
export class ArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async list(q: ListArchiveDto, user: JwtUser) {
    const and: Prisma.hr_tayi_qyedWhereInput[] = [];
    // Branch isolation (hr_tayi_qyed.emp_id is a varchar holding employees.id).
    const empIds = await scopedEmployeeIds(this.prisma, this.branchScope, user);
    if (empIds !== null) and.push({ emp_id: { in: empIds.map(String) } });
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

  async getOne(id: number, user: JwtUser) {
    const row = await this.prisma.hr_tayi_qyed.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('طي القيد غير موجود');
    const empId = row.emp_id ? parseInt(row.emp_id, 10) : null;
    await assertEmployeeInScope(this.prisma, this.branchScope, user, empId);
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

  async create(dto: CreateArchiveDto, user: JwtUser) {
    const publisherId = user.sub;
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    await assertEmployeeInScope(this.prisma, this.branchScope, user, emp.id);
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

  async update(id: number, dto: UpdateArchiveDto, user: JwtUser) {
    const publisherId = user.sub;
    const existing = await this.getOne(id, user);
    if (dto.empId != null) await assertEmployeeInScope(this.prisma, this.branchScope, user, dto.empId);
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

  async remove(id: number, user: JwtUser) {
    await this.getOne(id, user);
    await this.prisma.hr_tayi_qyed.delete({ where: { id } });
    return { id };
  }
}
