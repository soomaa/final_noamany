import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { todayIso } from '../../common/utils/legacy-date.util';
import {
  CreateAdministrativeDecisionDto,
  ListAdministrativeDecisionsDto,
  UpdateAdministrativeDecisionDto,
} from './dto/administrative-decision.dto';

@Injectable()
export class AdministrativeDecisionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListAdministrativeDecisionsDto) {
    const where: Prisma.hr_ta3en_moaqtWhereInput = q.search?.trim()
      ? {
          OR: [
            { emp_name: { contains: q.search.trim() } },
            { edara_n: { contains: q.search.trim() } },
            { qsm_n: { contains: q.search.trim() } },
            { job_title_n: { contains: q.search.trim() } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_ta3en_moaqt.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_ta3en_moaqt.count({ where }),
    ]);
    return paginated(rows.map((row) => this.toResponse(row)), total, q.page, q.pageSize);
  }

  async getOne(id: number) {
    return this.toResponse(await this.findOrThrow(id));
  }

  async create(dto: CreateAdministrativeDecisionDto, publisherId: number, publisherName?: string | null) {
    this.assertPeriod(dto.periodFrom, dto.periodTo);
    const refs = await this.resolveReferences(dto.edaraId, dto.qsmId, dto.directManagerId, dto.jobTitleId);
    const row = await this.prisma.hr_ta3en_moaqt.create({
      data: {
        emp_name: dto.empName.trim(),
        edara_id_fk: dto.edaraId,
        edara_n: refs.edaraName,
        qsm_id_fk: dto.qsmId ?? 0,
        qsm_n: refs.qsmName,
        direct_manager_id_fk: dto.directManagerId ?? 0,
        direct_manager_n: refs.directManagerName,
        job_title_id_fk: dto.jobTitleId,
        job_title_n: refs.jobTitleName,
        salary: dto.salary,
        bdal_skan: dto.housingAllowance,
        bdal_mowaslat: dto.transportAllowance,
        bdal_other: dto.otherAllowance,
        total_salary: this.totalSalary(dto),
        work_date_m: dto.workDate,
        date_from_m: dto.periodFrom,
        date_to_m: dto.periodTo,
        // The legacy implementation stores zero here; preserve that contract.
        num_days: 0,
        date: Math.floor(Date.now() / 1000),
        date_ar: todayIso(),
        publisher: publisherId,
        publisher_name: publisherName?.slice(0, 15) ?? null,
      },
    });
    return this.toResponse(row);
  }

  async update(
    id: number,
    dto: UpdateAdministrativeDecisionDto,
    publisherId: number,
    publisherName?: string | null,
  ) {
    const existing = await this.findOrThrow(id);
    const periodFrom = dto.periodFrom ?? existing.date_from_m ?? '';
    const periodTo = dto.periodTo ?? existing.date_to_m ?? '';
    this.assertPeriod(periodFrom, periodTo);

    const edaraId = dto.edaraId ?? existing.edara_id_fk;
    const qsmId = dto.qsmId ?? existing.qsm_id_fk;
    const directManagerId = dto.directManagerId ?? existing.direct_manager_id_fk;
    const jobTitleId = dto.jobTitleId ?? existing.job_title_id_fk;
    const refs = await this.resolveReferences(edaraId, qsmId || undefined, directManagerId || undefined, jobTitleId);
    const salary = dto.salary ?? Number(existing.salary);
    const housingAllowance = dto.housingAllowance ?? Number(existing.bdal_skan);
    const transportAllowance = dto.transportAllowance ?? Number(existing.bdal_mowaslat);
    const otherAllowance = dto.otherAllowance ?? Number(existing.bdal_other);

    const row = await this.prisma.hr_ta3en_moaqt.update({
      where: { id },
      data: {
        emp_name: dto.empName?.trim() ?? existing.emp_name,
        edara_id_fk: edaraId,
        edara_n: refs.edaraName,
        qsm_id_fk: qsmId,
        qsm_n: refs.qsmName,
        direct_manager_id_fk: directManagerId,
        direct_manager_n: refs.directManagerName,
        job_title_id_fk: jobTitleId,
        job_title_n: refs.jobTitleName,
        salary,
        bdal_skan: housingAllowance,
        bdal_mowaslat: transportAllowance,
        bdal_other: otherAllowance,
        total_salary: salary + housingAllowance + transportAllowance + otherAllowance,
        work_date_m: dto.workDate ?? existing.work_date_m,
        date_from_m: periodFrom,
        date_to_m: periodTo,
        date: Math.floor(Date.now() / 1000),
        date_ar: todayIso(),
        publisher: publisherId,
        publisher_name: publisherName?.slice(0, 15) ?? null,
      },
    });
    return this.toResponse(row);
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.hr_ta3en_moaqt.delete({ where: { id } });
    return { id };
  }

  async lookups() {
    const [departments, jobTitles] = await Promise.all([
      this.prisma.hr_edarat_aqsam.findMany({ orderBy: [{ from_id_fk: 'asc' }, { trteeb: 'asc' }, { id: 'asc' }] }),
      this.prisma.all_defined_setting.findMany({
        where: { defined_type: 4 },
        orderBy: { defined_title: 'asc' },
        select: { defined_id: true, defined_title: true },
      }),
    ]);
    return {
      departments: departments.map((row) => ({ id: row.id, title: row.title, parentId: row.from_id_fk ?? 0 })),
      jobTitles: jobTitles.map((row) => ({ id: row.defined_id, title: row.defined_title })),
    };
  }

  private async resolveReferences(edaraId: number, qsmId: number | undefined, managerId: number | undefined, jobTitleId: number) {
    const [edara, qsm, manager, jobTitle] = await Promise.all([
      this.prisma.hr_edarat_aqsam.findUnique({ where: { id: edaraId } }),
      qsmId ? this.prisma.hr_edarat_aqsam.findUnique({ where: { id: qsmId } }) : null,
      managerId ? this.prisma.employees.findUnique({ where: { id: managerId } }) : null,
      this.prisma.all_defined_setting.findUnique({ where: { defined_id: jobTitleId } }),
    ]);
    if (!edara) throw new NotFoundException('الإدارة غير موجودة');
    if (qsmId && !qsm) throw new NotFoundException('القسم غير موجود');
    if (managerId && !manager) throw new NotFoundException('الرئيس المباشر غير موجود');
    if (!jobTitle || jobTitle.defined_type !== 4) throw new NotFoundException('المسمى الوظيفي غير موجود');
    return {
      edaraName: edara.title,
      qsmName: qsm?.title ?? null,
      directManagerName: manager?.employee ?? null,
      jobTitleName: jobTitle.defined_title,
    };
  }

  private totalSalary(dto: CreateAdministrativeDecisionDto) {
    return dto.salary + dto.housingAllowance + dto.transportAllowance + dto.otherAllowance;
  }

  private assertPeriod(from: string, to: string) {
    if (!from || !to || Date.parse(to) < Date.parse(from)) {
      throw new BadRequestException('تاريخ نهاية الفترة التجريبية يجب ألا يسبق تاريخ بدايتها');
    }
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_ta3en_moaqt.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('قرار التعيين المؤقت غير موجود');
    return row;
  }

  private toResponse(row: Prisma.hr_ta3en_moaqtGetPayload<Record<string, never>>) {
    return {
      id: row.id,
      empName: row.emp_name,
      edaraId: row.edara_id_fk,
      edaraName: row.edara_n,
      qsmId: row.qsm_id_fk,
      qsmName: row.qsm_n,
      directManagerId: row.direct_manager_id_fk,
      directManagerName: row.direct_manager_n,
      jobTitleId: row.job_title_id_fk,
      jobTitleName: row.job_title_n,
      salary: Number(row.salary),
      housingAllowance: Number(row.bdal_skan),
      transportAllowance: Number(row.bdal_mowaslat),
      otherAllowance: Number(row.bdal_other),
      totalSalary: Number(row.total_salary),
      workDate: row.work_date_m,
      periodFrom: row.date_from_m,
      periodTo: row.date_to_m,
      createdAt: row.date_ar,
      publisherName: row.publisher_name,
    };
  }
}
