import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  assertCodeRangeOrder,
  assertNoCodeRangeOverlap,
} from '../../common/validators/validation.util';
import { ensureRoleForJobTitle, removeRoleForJobTitle } from '../rbac/job-title-role.util';
import { syncAllEmployeeTrainers } from '../club-fitness/trainer-sync.util';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';
import { CreateJobTitleDto, UpdateJobTitleDto } from './dto/job-title.dto';

export interface JobTitleView {
  id: number;
  name: string;
  parentId: number;
  edaraId: number | null;
  code: number | null;
  order: number;
  status: number;
  isTrainer: boolean;
}

export interface DeptView {
  id: number;
  title: string | null;
  code: number | null;
  parentId: number;
  order: number | null;
  fromCode: number;
  toCode: number;
  children?: DeptView[];
}

@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

  private toView(d: {
    id: number;
    title: string | null;
    title_code: number | null;
    from_id_fk: number | null;
    trteeb: number | null;
    from_code: number;
    to_code: number;
  }): DeptView {
    return {
      id: d.id,
      title: d.title,
      code: d.title_code,
      parentId: d.from_id_fk ?? 0,
      order: d.trteeb,
      fromCode: d.from_code,
      toCode: d.to_code,
    };
  }

  async findAll(): Promise<DeptView[]> {
    const rows = await this.prisma.hr_edarat_aqsam.findMany({ orderBy: [{ trteeb: 'asc' }, { id: 'asc' }] });
    return rows.map((r) => this.toView(r));
  }

  async tree(): Promise<DeptView[]> {
    const flat = await this.findAll();
    const byParent = new Map<number, DeptView[]>();
    for (const d of flat) {
      const arr = byParent.get(d.parentId) ?? [];
      arr.push(d);
      byParent.set(d.parentId, arr);
    }
    const attach = (node: DeptView): DeptView => ({
      ...node,
      children: (byParent.get(node.id) ?? []).map(attach),
    });
    return (byParent.get(0) ?? []).map(attach);
  }

  async create(dto: CreateDepartmentDto): Promise<DeptView> {
    assertCodeRangeOrder(dto.fromCode, dto.toCode);
    const siblings = await this.prisma.hr_edarat_aqsam.findMany({
      where: { from_id_fk: dto.parentId ?? 0 },
    });
    assertNoCodeRangeOverlap(
      { from: dto.fromCode ?? 0, to: dto.toCode ?? 0, label: dto.title },
      siblings.map((s) => ({
        from: s.from_code ?? 0,
        to: s.to_code ?? 0,
        id: s.id,
        label: s.title ?? undefined,
      })),
    );

    const maxTitleId = await this.prisma.hr_edarat_aqsam.aggregate({ _max: { title_id: true } });
    const row = await this.prisma.hr_edarat_aqsam.create({
      data: {
        title_id: (maxTitleId._max.title_id ?? 0) + 1,
        title: dto.title,
        title_code: dto.code ?? null,
        from_id_fk: dto.parentId ?? 0,
        trteeb: dto.order ?? null,
        from_code: dto.fromCode ?? 0,
        to_code: dto.toCode ?? 0,
      },
    });
    return this.toView(row);
  }

  async update(id: number, dto: UpdateDepartmentDto): Promise<DeptView> {
    const existing = await this.prisma.hr_edarat_aqsam.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الإدارة/القسم غير موجود');

    const fromCode = dto.fromCode ?? existing.from_code ?? 0;
    const toCode = dto.toCode ?? existing.to_code ?? 0;
    assertCodeRangeOrder(fromCode, toCode);
    const parentId = dto.parentId ?? existing.from_id_fk ?? 0;
    const siblings = await this.prisma.hr_edarat_aqsam.findMany({
      where: { from_id_fk: parentId, NOT: { id } },
    });
    assertNoCodeRangeOverlap(
      { from: fromCode, to: toCode, id, label: dto.title ?? existing.title ?? undefined },
      siblings.map((s) => ({
        from: s.from_code ?? 0,
        to: s.to_code ?? 0,
        id: s.id,
        label: s.title ?? undefined,
      })),
    );

    const row = await this.prisma.hr_edarat_aqsam.update({
      where: { id },
      data: {
        title: dto.title,
        title_code: dto.code ?? existing.title_code,
        from_id_fk: dto.parentId ?? existing.from_id_fk,
        trteeb: dto.order ?? existing.trteeb,
        from_code: dto.fromCode ?? existing.from_code,
        to_code: dto.toCode ?? existing.to_code,
      },
    });
    return this.toView(row);
  }

  async remove(id: number): Promise<{ id: number }> {
    const hasChildren = await this.prisma.hr_edarat_aqsam.count({ where: { from_id_fk: id } });
    if (hasChildren > 0) throw new NotFoundException('لا يمكن حذف عنصر يحتوي على أقسام فرعية');

    const linkedEmps = await this.prisma.employees.count({
      where: { OR: [{ edara_id: id }, { qsm_id: id }] },
    });
    if (linkedEmps > 0) {
      throw new ConflictException(`لا يمكن حذف الإدارة — ${linkedEmps} موظف مرتبط`);
    }

    await this.prisma.hr_edarat_aqsam.delete({ where: { id } });
    return { id };
  }

  // ------------------------------------------------------------------
  //  Job titles (المسميات الوظيفية) — department_jobs full CRUD
  //  Legacy: Employee_settings::ajax_*_job (+ department_jobs table).
  //  in_order is a numeric-as-string column sorted ASC.
  // ------------------------------------------------------------------

  private toJobView(j: {
    id: number;
    name: string;
    from_id_fk: number;
    status: number;
    in_order: string;
    dep_code: number | null;
    edara_id: number | null;
    is_trainer: boolean;
  }): JobTitleView {
    const parsedOrder = parseInt(j.in_order ?? '0', 10);
    return {
      id: j.id,
      name: j.name,
      parentId: j.from_id_fk ?? 0,
      edaraId: j.edara_id ?? null,
      code: j.dep_code ?? null,
      order: Number.isNaN(parsedOrder) ? 0 : parsedOrder,
      status: j.status ?? 0,
      isTrainer: j.is_trainer ?? false,
    };
  }

  /** Job titles (المسميات الوظيفية) used by the employee form. */
  async jobTitles(): Promise<JobTitleView[]> {
    // department_jobs.in_order is a string; sort numerically in app to avoid lexical ordering.
    const rows = await this.prisma.department_jobs.findMany();
    return rows
      .map((j) => this.toJobView(j))
      .sort((a, b) => a.order - b.order || a.id - b.id);
  }

  private async nextJobOrder(): Promise<number> {
    const rows = await this.prisma.department_jobs.findMany({ select: { in_order: true } });
    let max = 0;
    for (const r of rows) {
      const n = parseInt(r.in_order ?? '0', 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
    return max + 1;
  }

  async createJobTitle(dto: CreateJobTitleDto): Promise<JobTitleView> {
    const order = dto.order ?? (await this.nextJobOrder());
    const row = await this.prisma.department_jobs.create({
      data: {
        name: dto.name,
        from_id_fk: dto.parentId ?? 0,
        status: 0,
        in_order: String(order),
        dep_code: dto.code ?? null,
        edara_id: dto.edaraId ?? null,
        is_trainer: dto.isTrainer ?? false,
      },
    });
    await ensureRoleForJobTitle(this.prisma, row);
    if (row.is_trainer) await syncAllEmployeeTrainers(this.prisma);
    return this.toJobView(row);
  }

  async updateJobTitle(id: number, dto: UpdateJobTitleDto): Promise<JobTitleView> {
    const existing = await this.prisma.department_jobs.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المسمى الوظيفي غير موجود');
    const row = await this.prisma.department_jobs.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        from_id_fk: dto.parentId ?? existing.from_id_fk,
        in_order: dto.order !== undefined ? String(dto.order) : existing.in_order,
        dep_code: dto.code ?? existing.dep_code,
        edara_id: dto.edaraId ?? existing.edara_id,
        is_trainer: dto.isTrainer ?? existing.is_trainer,
      },
    });
    await ensureRoleForJobTitle(this.prisma, row);
    // Re-sync the trainer roster whenever the flag might have flipped (on or off).
    if (row.is_trainer !== existing.is_trainer) await syncAllEmployeeTrainers(this.prisma);
    return this.toJobView(row);
  }

  async removeJobTitle(id: number): Promise<{ id: number }> {
    const existing = await this.prisma.department_jobs.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المسمى الوظيفي غير موجود');
    await removeRoleForJobTitle(this.prisma, id);
    await this.prisma.department_jobs.delete({ where: { id } });
    return { id };
  }
}
