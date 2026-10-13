import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCategoryDto, CreateEvaluationDto, CreateItemDto, ListEvaluationQueryDto, UpdateCategoryDto, UpdateEvaluationDto, UpdateItemDto } from './dto/evaluation-management.dto';

@Injectable()
export class EvaluationManagementService {
  constructor(private readonly prisma: PrismaService) {}

  private score(value: string, label: string) {
    try {
      const score = new Prisma.Decimal(value);
      if (!score.isFinite() || score.isNegative()) throw new Error();
      return score;
    } catch {
      throw new BadRequestException(`${label} يجب أن تكون صفراً أو أكبر`);
    }
  }

  private async category(id: number) {
    const row = await this.prisma.evaluation_categories.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('فئة التقييم غير موجودة');
    return row;
  }

  private async item(id: number) {
    const row = await this.prisma.evaluation_items.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('بند التقييم غير موجود');
    return row;
  }

  async jobTitles() {
    const rows = await this.prisma.department_jobs.findMany({ orderBy: { id: 'asc' } });
    return rows.map((row) => ({ id: row.id, name: row.name, code: row.dep_code }));
  }

  async branches() {
    const rows = await this.prisma.tbl_branches.findMany({ orderBy: { branch_id: 'asc' } });
    return rows.map((row) => ({ id: row.branch_id, name: row.branch_name }));
  }

  async listCategories() {
    const [rows, jobs] = await Promise.all([
      this.prisma.evaluation_categories.findMany({ orderBy: { id: 'desc' } }),
      this.prisma.department_jobs.findMany(),
    ]);
    const names = new Map(jobs.map((job) => [job.id, job.name]));
    return rows.map((row) => ({ id: row.id, name: row.name, jobTitleId: row.job_title_id, jobTitleName: names.get(row.job_title_id) ?? '—' }));
  }

  async createCategory(dto: CreateCategoryDto, actor: number) {
    const job = await this.prisma.department_jobs.findUnique({ where: { id: dto.jobTitleId } });
    if (!job) throw new NotFoundException('المسمى الوظيفي غير موجود');
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('اسم الفئة مطلوب');
    try {
      return await this.prisma.evaluation_categories.create({ data: { name, job_title_id: dto.jobTitleId, created_by_id: actor, updated_by_id: actor } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('الفئة موجودة لهذا المسمى');
      throw error;
    }
  }

  async updateCategory(id: number, dto: UpdateCategoryDto, actor: number) {
    const old = await this.category(id);
    const jobTitleId = dto.jobTitleId ?? old.job_title_id;
    if (!(await this.prisma.department_jobs.findUnique({ where: { id: jobTitleId } }))) throw new NotFoundException('المسمى الوظيفي غير موجود');
    return this.prisma.evaluation_categories.update({ where: { id }, data: { ...(dto.name != null ? { name: dto.name.trim() } : {}), job_title_id: jobTitleId, updated_by_id: actor } });
  }

  async removeCategory(id: number) {
    await this.category(id);
    const [items, evaluations] = await Promise.all([
      this.prisma.evaluation_items.count({ where: { category_id: id } }),
      this.prisma.employee_evaluations.count({ where: { category_id: id } }),
    ]);
    if (items || evaluations) throw new ConflictException('لا يمكن حذف الفئة لوجود بنود أو تقييمات مرتبطة');
    await this.prisma.evaluation_categories.delete({ where: { id } });
    return { id };
  }

  async listItems() {
    const [rows, categories] = await Promise.all([
      this.prisma.evaluation_items.findMany({ orderBy: { id: 'desc' } }),
      this.prisma.evaluation_categories.findMany(),
    ]);
    const names = new Map(categories.map((category) => [category.id, category.name]));
    return rows.map((row) => ({ id: row.id, categoryId: row.category_id, categoryName: names.get(row.category_id) ?? '—', name: row.name, maxScore: row.max_score.toString() }));
  }

  async categoryItems(categoryId: number) {
    await this.category(categoryId);
    const rows = await this.prisma.evaluation_items.findMany({ where: { category_id: categoryId }, orderBy: { id: 'asc' } });
    return rows.map((row) => ({ id: row.id, categoryId: row.category_id, name: row.name, maxScore: row.max_score.toString() }));
  }

  async createItem(dto: CreateItemDto, actor: number) {
    await this.category(dto.categoryId);
    const max = this.score(dto.maxScore, 'الدرجة العظمى');
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('اسم البند مطلوب');
    try {
      return await this.prisma.evaluation_items.create({ data: { category_id: dto.categoryId, name, max_score: max, created_by_id: actor, updated_by_id: actor } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('البند موجود في هذه الفئة');
      throw error;
    }
  }

  async updateItem(id: number, dto: UpdateItemDto, actor: number) {
    const old = await this.item(id);
    const categoryId = dto.categoryId ?? old.category_id;
    await this.category(categoryId);
    return this.prisma.evaluation_items.update({ where: { id }, data: { category_id: categoryId, ...(dto.name != null ? { name: dto.name.trim() } : {}), ...(dto.maxScore != null ? { max_score: this.score(dto.maxScore, 'الدرجة العظمى') } : {}), updated_by_id: actor } });
  }

  async removeItem(id: number) {
    await this.item(id);
    if (await this.prisma.employee_evaluation_details.count({ where: { item_id: id } })) throw new ConflictException('لا يمكن حذف البند لوجود تقييمات مرتبطة');
    await this.prisma.evaluation_items.delete({ where: { id } });
    return { id };
  }

  async employees(categoryId: number, branchId?: number) {
    const category = await this.category(categoryId);
    const job = await this.prisma.department_jobs.findUnique({ where: { id: category.job_title_id } });
    if (!job?.dep_code) return [];
    if (branchId && !(await this.prisma.tbl_branches.findUnique({ where: { branch_id: branchId } }))) throw new NotFoundException('الفرع غير موجود');
    const rows = await this.prisma.employees.findMany({ where: { mosma_wazefy_code: job.dep_code, ...(branchId ? { branch_id_fk: branchId } : {}) }, select: { id: true, employee: true, emp_code: true, branch_id_fk: true }, orderBy: { employee: 'asc' } });
    return rows.map((row) => ({ id: row.id, name: row.employee ?? '—', code: row.emp_code, branchId: row.branch_id_fk }));
  }

  async createEvaluation(dto: CreateEvaluationDto, actor: number) {
    const [category, employee, branch, items] = await Promise.all([
      this.category(dto.categoryId),
      this.prisma.employees.findUnique({ where: { id: dto.employeeId }, select: { mosma_wazefy_code: true, branch_id_fk: true } }),
      this.prisma.tbl_branches.findUnique({ where: { branch_id: dto.branchId } }),
      this.prisma.evaluation_items.findMany({ where: { category_id: dto.categoryId } }),
    ]);
    if (!employee || !branch) throw new NotFoundException(!employee ? 'الموظف غير موجود' : 'الفرع غير موجود');
    const job = await this.prisma.department_jobs.findUnique({ where: { id: category.job_title_id } });
    if (!job?.dep_code || employee.mosma_wazefy_code !== job.dep_code || employee.branch_id_fk !== dto.branchId) throw new BadRequestException('الموظف لا يتبع الفئة أو الفرع المحدد');
    const posted = new Map<number, Prisma.Decimal>();
    for (const detail of dto.details) {
      if (posted.has(detail.itemId)) throw new BadRequestException('لا يمكن تكرار بند التقييم');
      posted.set(detail.itemId, this.score(detail.awardedScore, 'الدرجة الممنوحة'));
    }
    if (posted.size !== items.length || items.some((item) => !posted.has(item.id))) throw new BadRequestException('بنود التقييم لا تطابق الفئة المحددة');
    for (const item of items) if (posted.get(item.id)!.gt(item.max_score)) throw new BadRequestException('لا يمكن أن تتجاوز الدرجة الممنوحة الدرجة العظمى');
    return this.prisma.$transaction(async (tx) => {
      const evaluation = await tx.employee_evaluations.create({ data: { category_id: dto.categoryId, employee_id: dto.employeeId, branch_id: dto.branchId, evaluation_date: new Date(dto.evaluationDate), evaluation_month: dto.evaluationMonth, created_by_id: actor, updated_by_id: actor } });
      await tx.employee_evaluation_details.createMany({ data: items.map((item) => ({ evaluation_id: evaluation.id, item_id: item.id, item_name_snapshot: item.name, max_score_snapshot: item.max_score, awarded_score: posted.get(item.id)!, created_by_id: actor, updated_by_id: actor })) });
      return { id: evaluation.id };
    });
  }

  async listEvaluations(query: ListEvaluationQueryDto) {
    const where: Prisma.employee_evaluationsWhereInput = {
      ...(query.categoryId ? { category_id: query.categoryId } : {}),
      ...(query.employeeId ? { employee_id: query.employeeId } : {}),
      ...(query.branchId ? { branch_id: query.branchId } : {}),
      ...(query.dateFrom || query.dateTo ? { evaluation_date: { ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}), ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.employee_evaluations.findMany({ where, include: { category: true }, orderBy: { id: 'desc' }, skip: query.skip, take: query.take }),
      this.prisma.employee_evaluations.count({ where }),
    ]);
    const creatorIds = [...new Set(rows.flatMap((row) => (row.created_by_id == null ? [] : [row.created_by_id])))];
    const [employees, branches, creators] = await Promise.all([
      this.prisma.employees.findMany({ where: { id: { in: rows.map((row) => row.employee_id) } }, select: { id: true, employee: true } }),
      this.prisma.tbl_branches.findMany({ where: { branch_id: { in: rows.map((row) => row.branch_id) } } }),
      creatorIds.length ? this.prisma.users.findMany({ where: { user_id: { in: creatorIds } }, select: { user_id: true, name: true, username: true } }) : Promise.resolve([]),
    ]);
    const employeeNames = new Map(employees.map((employee) => [employee.id, employee.employee]));
    const branchNames = new Map(branches.map((branch) => [branch.branch_id, branch.branch_name]));
    const creatorNames = new Map<number, string | null>();
    for (const creator of creators) creatorNames.set(creator.user_id, creator.name || creator.username);
    return paginated(rows.map((row) => ({
      id: row.id,
      evaluationDate: row.evaluation_date,
      evaluationMonth: row.evaluation_month,
      categoryName: row.category.name,
      employeeName: employeeNames.get(row.employee_id) ?? '—',
      branchName: branchNames.get(row.branch_id) ?? '—',
      createdByName: row.created_by_id == null ? '—' : creatorNames.get(row.created_by_id) ?? `#${row.created_by_id}`,
      createdAt: row.created_at,
    })), total, query.page, query.pageSize);
  }

  async getEvaluation(id: number) {
    const row = await this.prisma.employee_evaluations.findUnique({ where: { id }, include: { category: true, details: { orderBy: { id: 'asc' } } } });
    if (!row) throw new NotFoundException('التقييم غير موجود');
    const [employee, creator] = await Promise.all([
      this.prisma.employees.findUnique({ where: { id: row.employee_id }, select: { employee: true } }),
      row.created_by_id == null ? Promise.resolve(null) : this.prisma.users.findUnique({ where: { user_id: row.created_by_id }, select: { name: true, username: true } }),
    ]);
    return {
      id: row.id,
      evaluationDate: row.evaluation_date,
      evaluationMonth: row.evaluation_month,
      categoryName: row.category.name,
      employeeName: employee?.employee ?? '—',
      createdByName: row.created_by_id == null ? '—' : creator?.name || creator?.username || `#${row.created_by_id}`,
      details: row.details.map((detail) => ({ id: detail.id, itemId: detail.item_id, itemName: detail.item_name_snapshot, maxScore: detail.max_score_snapshot.toString(), awardedScore: detail.awarded_score.toString() })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateEvaluation(id: number, dto: UpdateEvaluationDto, actor: number) {
    const evaluation = await this.prisma.employee_evaluations.findUnique({ where: { id }, include: { details: true } });
    if (!evaluation) throw new NotFoundException('التقييم غير موجود');
    const posted = new Map<number, Prisma.Decimal>();
    for (const detail of dto.details) {
      if (posted.has(detail.itemId)) throw new BadRequestException('لا يمكن تكرار بند التقييم');
      posted.set(detail.itemId, this.score(detail.awardedScore, 'الدرجة الممنوحة'));
    }
    if (posted.size !== evaluation.details.length || evaluation.details.some((detail) => !posted.has(detail.item_id))) throw new BadRequestException('بنود التقييم لا تطابق التقييم المحفوظ');
    for (const detail of evaluation.details) if (posted.get(detail.item_id)!.gt(detail.max_score_snapshot)) throw new BadRequestException('لا يمكن أن تتجاوز الدرجة الممنوحة الدرجة العظمى');
    return this.prisma.$transaction(async (tx) => {
      await tx.employee_evaluations.update({ where: { id }, data: { evaluation_date: new Date(dto.evaluationDate), evaluation_month: dto.evaluationMonth, updated_by_id: actor } });
      await Promise.all(evaluation.details.map((detail) => tx.employee_evaluation_details.update({ where: { id: detail.id }, data: { awarded_score: posted.get(detail.item_id)!, updated_by_id: actor } })));
      return { id };
    });
  }

  async removeEvaluation(id: number) {
    const exists = await this.prisma.employee_evaluations.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('التقييم غير موجود');
    await this.prisma.$transaction(async (tx) => {
      await tx.employee_evaluation_details.deleteMany({ where: { evaluation_id: id } });
      await tx.employee_evaluations.delete({ where: { id } });
    });
    return { id };
  }
}
