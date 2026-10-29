import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { todayIso } from '../../common/utils/legacy-date.util';
import { CreateEvaluationDto, ListEvaluationsDto } from './dto/evaluation.dto';
import { assertEmployeeInScope, scopedEmployeeIds } from '../reports/employee-branch-scope.util';

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async list(q: ListEvaluationsDto, user: JwtUser) {
    const and: Prisma.hr_ta3en_moaqt_evaluationWhereInput[] = [];
    // Branch isolation (emp_id_fk is a varchar holding employees.id).
    const empIds = await scopedEmployeeIds(this.prisma, this.branchScope, user);
    if (empIds !== null) and.push({ emp_id_fk: { in: empIds.map(String) } });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ emp_id_fk: { contains: s } }, { taqdeer: { contains: s } }, { total_degree: { contains: s } }],
      });
    }

    const where: Prisma.hr_ta3en_moaqt_evaluationWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_ta3en_moaqt_evaluation.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_ta3en_moaqt_evaluation.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => {
        const empId = row.emp_id_fk ? parseInt(row.emp_id_fk, 10) : null;
        const emp = empId ? await this.prisma.employees.findUnique({ where: { id: empId } }) : null;
        return {
          id: row.id,
          title: row.taqdeer ?? row.total_degree,
          employeeName: emp?.employee ?? '',
          createdAt: row.date_ar,
        };
      }),
    );

    return paginated(data, total, q.page, q.pageSize);
  }

  async getOne(id: number, user: JwtUser) {
    const row = await this.prisma.hr_ta3en_moaqt_evaluation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('التقييم غير موجود');

    const empId = row.emp_id_fk ? parseInt(row.emp_id_fk, 10) : null;
    await assertEmployeeInScope(this.prisma, this.branchScope, user, empId);
    const emp = empId ? await this.prisma.employees.findUnique({ where: { id: empId } }) : null;

    const details = await this.prisma.hr_ta3en_moaqt_evaluation_details.findMany({
      where: { evaluation_order_id: String(id) },
    });

    const points = empId ? await this.pointsFor(id, empId, row.emp_id_fk) : [];

    const criteriaSettings = await this.getCriteriaTree();
    const criteriaTitles = new Map(
      criteriaSettings.flatMap((parent) => [
        [parent.id, parent.title] as const,
        ...parent.children.map((child) => [child.id, child.title] as const),
      ]),
    );

    return {
      id: row.id,
      empId,
      employeeName: emp?.employee,
      edaraId: row.edara_id_fk,
      qsmId: row.qsm_id_fk,
      totalDegree: row.total_degree,
      resultTagraba: row.result_tagraba,
      taqdeer: row.taqdeer,
      date: row.date_ar,
      details: details.map((d) => ({
        id: d.id,
        settingId: d.evaluate_id_fk ? parseInt(d.evaluate_id_fk, 10) : null,
        title:
          d.title ??
          (d.evaluate_id_fk ? criteriaTitles.get(parseInt(d.evaluate_id_fk, 10)) : undefined),
        maxDegree: d.max_degree,
        empDegree: d.emp_degree,
      })),
      positives: points.filter((p) => p.type === 1),
      negatives: points.filter((p) => p.type === 2),
      criteriaSettings,
    };
  }

  /**
   * Evaluation criteria grid: parent criteria (from_id=0) each with their
   * sub-criteria (bnod) children. Mirrors Evaluation_employee_model::
   * get_all_setting + get_from.
   */
  async getCriteriaTree() {
    const all = await this.prisma.hr_evaluation_setting.findMany({ orderBy: { id: 'asc' } });
    const parents = all.filter((c) => c.from_id === 0 || c.from_id == null);
    return parents.map((p) => ({
      id: p.id,
      title: p.title,
      degree: p.degree,
      children: all
        .filter((c) => c.from_id === p.id)
        .map((c) => ({ id: c.id, title: c.title, degree: c.degree })),
    }));
  }

  async create(
    dto: CreateEvaluationDto,
    publisherId: number | undefined,
    publisherName: string | null | undefined,
    user: JwtUser,
  ) {
    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    await assertEmployeeInScope(this.prisma, this.branchScope, user, emp.id);

    // Legacy stores total_degree as posted from the grid; when the client
    // does not supply it, compute it as the sum of the per-criterion emp scores
    // (sum of emp_degree across the criteria grid).
    const computedTotal = dto.criteria.reduce((sum, c) => {
      const v = parseFloat(c.empDegree);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);
    const totalDegree =
      dto.totalDegree != null && dto.totalDegree !== '' ? dto.totalDegree : String(computedTotal);

    const dateStr = todayIso();
    const row = await this.prisma.hr_ta3en_moaqt_evaluation.create({
      data: {
        emp_id_fk: String(dto.empId),
        edara_id_fk: dto.edaraId ?? String(emp.edara_id ?? ''),
        qsm_id_fk: dto.qsmId ?? String(emp.qsm_id ?? ''),
        total_degree: totalDegree,
        result_tagraba: dto.resultTagraba,
        taqdeer: dto.taqdeer,
        date: Math.floor(new Date(dateStr).getTime() / 1000),
        date_ar: dateStr,
        publisher: publisherId,
        publisher_name: publisherName,
      },
    });

    // Preserve the legacy three-key layout: evaluation order, employee and criterion.
    // and uses evaluate_id_fk for the criterion-setting id — see RETURN.
    for (const c of dto.criteria) {
      const setting = await this.prisma.hr_evaluation_setting.findUnique({ where: { id: c.settingId } });
      await this.prisma.hr_ta3en_moaqt_evaluation_details.create({
        data: {
          evaluation_order_id: String(row.id),
          emp_id_fk: String(dto.empId),
          evaluate_id_fk: String(c.settingId),
          title: c.title ?? setting?.title,
          max_degree: c.maxDegree,
          emp_degree: c.empDegree,
        },
      });
    }

    // Strength/weakness points are now linked to THIS evaluation (evaluate_id_fk = evaluation id),
    // so other evaluations of the same employee keep their own points. Legacy-layout rows
    // (evaluate_id_fk = emp id) were "replaced by the next evaluation" — keep that contract.
    await this.prisma.hr_ta3en_moaqt_evaluation_points.deleteMany({
      where: { emp_id_fk: dto.empId, evaluate_id_fk: dto.empId },
    });

    for (const title of dto.positive ?? []) {
      if (!title.trim()) continue;
      await this.prisma.hr_ta3en_moaqt_evaluation_points.create({
        data: { emp_id_fk: dto.empId, evaluate_id_fk: row.id, title, type: 1, type_n: 'قوه' },
      });
    }
    for (const title of dto.negative ?? []) {
      if (!title.trim()) continue;
      await this.prisma.hr_ta3en_moaqt_evaluation_points.create({
        data: { emp_id_fk: dto.empId, evaluate_id_fk: row.id, title, type: 2, type_n: 'ضعف' },
      });
    }

    return { id: row.id };
  }

  async remove(id: number, user: JwtUser) {
    const row = await this.prisma.hr_ta3en_moaqt_evaluation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('التقييم غير موجود');
    const empId = row.emp_id_fk ? parseInt(row.emp_id_fk, 10) : null;
    await assertEmployeeInScope(this.prisma, this.branchScope, user, empId);

    await this.prisma.hr_ta3en_moaqt_evaluation_details.deleteMany({
      where: { evaluation_order_id: String(id) },
    });
    if (empId) {
      // Only this evaluation's points — never the employee's other evaluations.
      const evaluateIds = (await this.isLatestEvaluation(id, row.emp_id_fk!)) ? [id, empId] : [id];
      await this.prisma.hr_ta3en_moaqt_evaluation_points.deleteMany({
        where: { emp_id_fk: empId, evaluate_id_fk: { in: evaluateIds } },
      });
    }
    await this.prisma.hr_ta3en_moaqt_evaluation.delete({ where: { id } });
    return { id };
  }

  /**
   * Points of one evaluation. New rows carry evaluate_id_fk = evaluation id; legacy rows
   * carry evaluate_id_fk = emp id and always belonged to the employee's latest evaluation.
   */
  private async pointsFor(evaluationId: number, empId: number, empIdRaw: string | null) {
    const own = await this.prisma.hr_ta3en_moaqt_evaluation_points.findMany({
      where: { emp_id_fk: empId, evaluate_id_fk: evaluationId },
    });
    if (own.length || !empIdRaw || !(await this.isLatestEvaluation(evaluationId, empIdRaw))) return own;
    return this.prisma.hr_ta3en_moaqt_evaluation_points.findMany({
      where: { emp_id_fk: empId, evaluate_id_fk: empId },
    });
  }

  private async isLatestEvaluation(evaluationId: number, empIdRaw: string) {
    const newer = await this.prisma.hr_ta3en_moaqt_evaluation.count({
      where: { emp_id_fk: empIdRaw, id: { gt: evaluationId } },
    });
    return newer === 0;
  }
}
