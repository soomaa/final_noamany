import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';

export const EVALUATION_ROLE_KEYS = ['trainer', 'reception', 'branch_manager'] as const;
export type EvaluationRoleKey = typeof EVALUATION_ROLE_KEYS[number];
export type EvaluationQuestion = { id: number; title: string; maxScore: number };
type TemplateInput = {
  roleKey: string;
  title: string;
  questions: Array<string | { id?: number; title: string; maxScore?: number }>;
  branchId?: number | null;
};
type MonthlyAnswer = { questionId: number; score?: number; answer?: string; note?: string };
type MonthlyInput = {
  employeeId: number;
  templateId: number;
  templateVersion: number;
  monthKey: string;
  branchId?: number | null;
  answers?: MonthlyAnswer[];
};
export type MonthlyEvaluationQuery = {
  employeeId?: number;
  templateId?: number;
  branchId?: number;
  monthKey?: string;
  roleKey?: string;
  status?: string;
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function normalizeQuestions(input: TemplateInput['questions']): EvaluationQuestion[] {
  const questions = input.map((question, index) => {
    const title = (typeof question === 'string' ? question : question.title).trim();
    const maxScore = typeof question === 'string' ? 5 : Number(question.maxScore ?? 5);
    if (!title) throw new BadRequestException('نص بند التقييم مطلوب');
    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 100) {
      throw new BadRequestException('الدرجة القصوى لبند التقييم غير صحيحة');
    }
    return { id: index + 1, title, maxScore };
  });
  if (!questions.length) throw new BadRequestException('أضف بند تقييم واحدًا على الأقل');
  if (new Set(questions.map((question) => question.title.toLocaleLowerCase('ar'))).size !== questions.length) {
    throw new BadRequestException('لا يمكن تكرار بند التقييم داخل النموذج');
  }
  return questions;
}

/** Same diacritic/alef/ta-marbuta normalization as job-title-defaults.ts, so a title like
 * "ريسبشن" or "مدربة" is recognized here exactly as it already is for RBAC defaults. */
function normalizeJobTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The historic personnel file stores the role as a job-title record, while
 * evaluation templates deliberately use three stable operational roles. Patterns
 * mirror job-title-defaults.ts's proven set (that module already had to add
 * "ريسبشن" alongside "استقبال" for this same client's real job titles). */
function evaluationRoleForJobTitle(title: string | null | undefined): EvaluationRoleKey | null {
  const value = normalizeJobTitle(title ?? '');
  if (!value) return null;
  if (/(مدير عام|مدير فرع|مدير النادي|مشرف عام|مشرف الفرع)/.test(value)) return 'branch_manager';
  if (/(استقبال|ريسبشن|كاشير)/.test(value)) return 'reception';
  if (/(مدرب|مدربه|كوتش)/.test(value)) return 'trainer';
  return null;
}

/** Additive role-template workflow; legacy trial evaluations remain intact. */
@Injectable()
export class EvaluationWorkflowService {
  constructor(private readonly prisma: PrismaService, private readonly branchScope?: BranchScopeService) {}
  private db() { return this.prisma as unknown as Record<string, any>; }
  private actorId(actor: number | JwtUser) { return typeof actor === 'number' ? actor : actor.sub; }
  private assertBranch(actor: number | JwtUser, branchId?: number | null) {
    if (typeof actor !== 'number' && branchId != null && this.branchScope && !this.branchScope.isBranchAllowed(actor, branchId)) {
      throw new ForbiddenException('لا يمكنك الوصول لهذا الفرع');
    }
  }
  private assertGlobalTemplateWrite(actor: number | JwtUser, branchId?: number | null) {
    if (typeof actor === 'number' || branchId != null || !this.branchScope) return;
    if (this.branchScope.resolveListFilter(actor) !== null) {
      throw new ForbiddenException('اختر فرعًا مسموحًا؛ إنشاء نموذج عام متاح للإدارة فقط');
    }
  }

  async listTemplates(query: { roleKey?: string; branchId?: number; active?: boolean } = {}, user?: JwtUser) {
    const where: Record<string, unknown> = {};
    if (query.roleKey) where.role_key = query.roleKey;
    if (query.active !== false) where.is_active = true;
    if (query.branchId != null) {
      this.assertBranch(user ?? 0, query.branchId);
      where.branch_id = query.branchId;
    } else if (user && this.branchScope) {
      const allowed = this.branchScope.resolveListFilter(user);
      if (allowed !== null) where.OR = [{ branch_id: null }, { branch_id: { in: allowed } }];
    }
    const rows = await this.db().hr_evaluation_templates.findMany({ where, orderBy: [{ role_key: 'asc' }, { version: 'desc' }] });
    return rows.map((row: any) => ({ ...row, questions: parseJson<EvaluationQuestion[]>(row.questions_json, []) }));
  }

  async versionTemplate(input: TemplateInput, actor: number | JwtUser) {
    if (!EVALUATION_ROLE_KEYS.includes(input.roleKey as EvaluationRoleKey)) throw new BadRequestException('دور نموذج التقييم غير صحيح');
    if (!input.title?.trim()) throw new BadRequestException('اسم نموذج التقييم مطلوب');
    this.assertGlobalTemplateWrite(actor, input.branchId);
    this.assertBranch(actor, input.branchId);
    const questions = normalizeQuestions(input.questions ?? []);
    const db = this.db();
    const execute = async (tx: Record<string, any>) => {
      const templates = tx.hr_evaluation_templates;
      const current = await templates.findFirst({
        where: { role_key: input.roleKey, is_active: true, branch_id: input.branchId ?? null },
        orderBy: { version: 'desc' },
      });
      const version = (current?.version ?? 0) + 1;
      if (current) await templates.update({ where: { id: current.id }, data: { is_active: false } });
      const row = await templates.create({ data: {
        role_key: input.roleKey,
        title: input.title.trim(),
        version,
        is_active: true,
        branch_id: input.branchId ?? null,
        supersedes_id: current?.id ?? null,
        questions_json: JSON.stringify(questions),
        created_by: this.actorId(actor),
      } });
      return { ...row, questions };
    };
    return typeof db.$transaction === 'function' ? db.$transaction(execute) : execute(db);
  }

  async createMonthly(input: MonthlyInput, actor: number | JwtUser) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.monthKey)) throw new BadRequestException('الشهر يجب أن يكون بصيغة YYYY-MM');
    const monthly = this.db().hr_monthly_evaluations;
    const template = await this.db().hr_evaluation_templates.findFirst({ where: { id: input.templateId, version: input.templateVersion } });
    if (!template) throw new NotFoundException('نسخة نموذج التقييم غير موجودة');
    const employee = await this.db().employees.findUnique({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundException('الموظف غير موجود');
    const branchId = employee.branch_id_fk == null ? null : Number(employee.branch_id_fk);
    if (branchId == null) {
      throw new BadRequestException('يجب ربط الموظف بفرع قبل إنشاء التقييم');
    }
    if (input.branchId != null && Number(input.branchId) !== branchId) {
      throw new BadRequestException('فرع التقييم يجب أن يطابق فرع الموظف');
    }
    // Authorize the authoritative employee branch before role lookups or duplicate
    // checks, otherwise a scoped evaluator could probe another branch's records.
    this.assertBranch(actor, branchId);
    if (template.branch_id != null && Number(template.branch_id) !== Number(branchId)) {
      throw new BadRequestException('نموذج التقييم غير متاح لفرع الموظف');
    }
    const jobTitle = employee.mosma_wazefy_code
      ? await this.db().department_jobs.findUnique({ where: { id: employee.mosma_wazefy_code }, select: { name: true } })
      : null;
    const employeeRole = evaluationRoleForJobTitle(jobTitle?.name);
    if (!employeeRole || employeeRole !== template.role_key) {
      throw new BadRequestException('نموذج التقييم لا يطابق المسمى الوظيفي للموظف');
    }
    const duplicate = await monthly.findFirst({ where: {
      employee_id: input.employeeId,
      template_id: input.templateId,
      template_version: input.templateVersion,
      month_key: input.monthKey,
    } });
    if (duplicate) throw new ConflictException('يوجد تقييم شهري بنفس النموذج لهذا الموظف');

    const questions = parseJson<EvaluationQuestion[]>(template.questions_json, []).map((question, index) => ({
      id: Number(question.id ?? index + 1),
      title: String(question.title ?? ''),
      maxScore: Number(question.maxScore ?? 5),
    }));
    const answers = input.answers ?? [];
    if (answers.length !== questions.length || new Set(answers.map((answer) => answer.questionId)).size !== questions.length) {
      throw new BadRequestException('يجب إدخال إجابة واحدة لكل بند تقييم');
    }
    const snapshots = questions.map((question) => {
      const answer = answers.find((item) => item.questionId === question.id);
      const score = Number(answer?.score ?? answer?.answer);
      if (!Number.isFinite(score) || score < 0 || score > question.maxScore) {
        throw new BadRequestException(`درجة بند «${question.title}» غير صحيحة`);
      }
      return { questionId: question.id, questionTitle: question.title, maxScore: question.maxScore, score, note: answer?.note?.trim() || null };
    });
    const totalScore = snapshots.reduce((sum, answer) => sum + answer.score, 0);
    const maxScore = snapshots.reduce((sum, answer) => sum + answer.maxScore, 0);
    return monthly.create({ data: {
      employee_id: input.employeeId,
      template_id: input.templateId,
      template_version: input.templateVersion,
      month_key: input.monthKey,
      branch_id: branchId,
      status: 'published',
      total_score: totalScore,
      max_score: maxScore,
      answers_json: JSON.stringify(snapshots),
      created_by: this.actorId(actor),
    } });
  }

  async listMonthly(query: MonthlyEvaluationQuery = {}, user?: JwtUser) {
    if (query.monthKey && !/^\d{4}-(0[1-9]|1[0-2])$/.test(query.monthKey)) throw new BadRequestException('الشهر غير صحيح');
    const where: Record<string, unknown> = {};
    if (query.employeeId != null) where.employee_id = Number(query.employeeId);
    if (query.templateId != null) where.template_id = Number(query.templateId);
    if (query.monthKey) where.month_key = query.monthKey;
    if (query.status) where.status = query.status;
    if (query.branchId != null) {
      this.assertBranch(user ?? 0, Number(query.branchId));
      where.branch_id = Number(query.branchId);
    } else if (user && this.branchScope) {
      const allowed = this.branchScope.resolveListFilter(user);
      if (allowed !== null) where.branch_id = { in: allowed };
    }
    if (query.roleKey) {
      const templates = await this.db().hr_evaluation_templates.findMany({ where: { role_key: query.roleKey }, select: { id: true } });
      where.template_id = { in: templates.map((template: any) => template.id) };
    }
    const rows = await this.db().hr_monthly_evaluations.findMany({ where, orderBy: [{ month_key: 'desc' }, { id: 'desc' }] });
    const employeeIds = [...new Set<number>(rows.map((row: any) => row.employee_id))];
    const templateIds = [...new Set<number>(rows.map((row: any) => row.template_id))];
    const [employees, templates] = await Promise.all([
      employeeIds.length ? this.db().employees.findMany({ where: { id: { in: employeeIds } }, select: { id: true, employee: true, emp_code: true } }) : [],
      templateIds.length ? this.db().hr_evaluation_templates.findMany({ where: { id: { in: templateIds } } }) : [],
    ]);
    const employeeById = new Map<number, any>(employees.map((row: any) => [row.id, row]));
    const templateById = new Map<number, any>(templates.map((row: any) => [row.id, row]));
    return rows.map((row: any) => ({
      ...row,
      answers: parseJson(row.answers_json, []),
      employeeName: employeeById.get(row.employee_id)?.employee ?? null,
      employeeCode: employeeById.get(row.employee_id)?.emp_code ?? null,
      templateTitle: templateById.get(row.template_id)?.title ?? null,
      roleKey: templateById.get(row.template_id)?.role_key ?? null,
    }));
  }

  myEvaluations(employeeId: number, query: { monthKey?: string; employeeId?: number }) {
    return this.db().hr_monthly_evaluations.findMany({
      where: { employee_id: employeeId, status: 'published', ...(query.monthKey ? { month_key: query.monthKey } : {}) },
      orderBy: [{ month_key: 'desc' }, { id: 'desc' }],
    });
  }

  async myEvaluation(employeeId: number, id: number) {
    const row = await this.db().hr_monthly_evaluations.findFirst({ where: { id, employee_id: employeeId, status: 'published' } });
    if (!row) throw new NotFoundException('التقييم غير موجود');
    return { ...row, answers: parseJson(row.answers_json, []) };
  }
}
