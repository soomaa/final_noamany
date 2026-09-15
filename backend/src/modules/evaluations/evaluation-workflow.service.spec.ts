import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EvaluationWorkflowService } from './evaluation-workflow.service';

describe('EvaluationWorkflowService', () => {
  const prisma = {
    $transaction: jest.fn(),
    hr_evaluation_templates: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    hr_monthly_evaluations: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    employees: { findUnique: jest.fn(), findMany: jest.fn() },
    department_jobs: { findUnique: jest.fn() },
  };
  let service: EvaluationWorkflowService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    service = new EvaluationWorkflowService(prisma as never);
  });

  it('versions a template instead of overwriting questions already used by a monthly evaluation', async () => {
    prisma.hr_evaluation_templates.findFirst.mockResolvedValue({ id: 6, version: 2 });
    prisma.hr_evaluation_templates.create.mockResolvedValue({ id: 7, version: 3 });

    await expect(service.versionTemplate({ roleKey: 'trainer', title: 'تقييم المدرب', questions: ['الالتزام'] }, 12))
      .resolves.toMatchObject({ id: 7, version: 3 });
    expect(prisma.hr_evaluation_templates.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ version: 3, supersedes_id: 6 }),
    }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('forbids a branch-scoped evaluator from creating a global template', async () => {
    const branchScope = {
      isBranchAllowed: jest.fn().mockReturnValue(true),
      resolveListFilter: jest.fn().mockReturnValue([3]),
    };
    service = new EvaluationWorkflowService(prisma as never, branchScope as never);

    await expect(service.versionTemplate({
      roleKey: 'trainer',
      title: 'تقييم المدرب',
      questions: ['الالتزام'],
    }, { sub: 12, branch: 3 } as never)).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.hr_evaluation_templates.create).not.toHaveBeenCalled();
  });

  it('enforces one employee evaluation per month and template version', async () => {
    prisma.hr_evaluation_templates.findFirst.mockResolvedValue({ id: 6, version: 2, role_key: 'trainer', branch_id: null });
    prisma.employees.findUnique.mockResolvedValue({ id: 8, branch_id_fk: 3, mosma_wazefy_code: 7 });
    prisma.department_jobs.findUnique.mockResolvedValue({ id: 7, name: 'مدرب' });
    prisma.hr_monthly_evaluations.findFirst.mockResolvedValue({ id: 55 });
    await expect(service.createMonthly({ employeeId: 8, templateId: 6, templateVersion: 2, monthKey: '2026-09' }, 12))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ['ريسبشن', 'reception'],
    ['موظفة ريسبشن', 'reception'],
    ['مدربة لياقة', 'trainer'],
    ['مدير عام الفرع', 'branch_manager'],
    ['مشرف عام', 'branch_manager'],
  ])('matches the real job title "%s" to the %s evaluation role, not just the formal spelling', async (jobTitleName, expectedRoleKey) => {
    prisma.hr_evaluation_templates.findFirst.mockResolvedValue({
      id: 6, version: 2, role_key: expectedRoleKey, branch_id: null,
      questions_json: JSON.stringify([{ id: 1, title: 'الالتزام', maxScore: 5 }]),
    });
    prisma.employees.findUnique.mockResolvedValue({ id: 8, branch_id_fk: 3, mosma_wazefy_code: 9 });
    prisma.department_jobs.findUnique.mockResolvedValue({ id: 9, name: jobTitleName });
    prisma.hr_monthly_evaluations.findFirst.mockResolvedValue(null);
    prisma.hr_monthly_evaluations.create.mockResolvedValue({ id: 1 });

    await expect(service.createMonthly({
      employeeId: 8, templateId: 6, templateVersion: 2, monthKey: '2026-09',
      answers: [{ questionId: 1, score: 4 }],
    }, 12)).resolves.toBeDefined();
    expect(prisma.hr_monthly_evaluations.create).toHaveBeenCalled();
  });

  it('returns self evaluations only for the signed-in employee, never an id supplied by the client', async () => {
    prisma.hr_monthly_evaluations.findMany.mockResolvedValue([]);
    await service.myEvaluations(81, { employeeId: 999, monthKey: '2026-09' });
    expect(prisma.hr_monthly_evaluations.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ employee_id: 81 }),
    }));
  });

  it('returns 404 when a signed-in employee opens another employee evaluation', async () => {
    prisma.hr_monthly_evaluations.findFirst.mockResolvedValue(null);

    await expect(service.myEvaluation(81, 55)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.hr_monthly_evaluations.findFirst).toHaveBeenCalledWith({
      where: { id: 55, employee_id: 81, status: 'published' },
    });
  });

  it('rejects an invalid month before creating a monthly evaluation', async () => {
    await expect(service.createMonthly({ employeeId: 8, templateId: 6, templateVersion: 2, monthKey: '09-2026' }, 12))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.hr_monthly_evaluations.create).not.toHaveBeenCalled();
  });

  it('calculates the monthly total from the immutable template question snapshot', async () => {
    prisma.hr_evaluation_templates.findFirst.mockResolvedValue({
      id: 6,
      version: 2,
      role_key: 'trainer',
      questions_json: JSON.stringify([
        { id: 1, title: 'الالتزام', maxScore: 5 },
        { id: 2, title: 'التواصل', maxScore: 10 },
      ]),
    });
    prisma.employees.findUnique.mockResolvedValue({ id: 8, branch_id_fk: 3, mosma_wazefy_code: 7 });
    prisma.department_jobs.findUnique.mockResolvedValue({ id: 7, name: 'مدرب' });
    prisma.hr_monthly_evaluations.findFirst.mockResolvedValue(null);
    prisma.hr_monthly_evaluations.create.mockResolvedValue({ id: 55 });

    await service.createMonthly({
      employeeId: 8,
      templateId: 6,
      templateVersion: 2,
      monthKey: '2026-09',
      answers: [
        { questionId: 1, score: 4 },
        { questionId: 2, score: 8 },
      ],
    }, 12);

    expect(prisma.hr_monthly_evaluations.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ total_score: 12, max_score: 15, branch_id: 3 }),
    }));
  });

  it('rejects a monthly evaluation when the selected template does not match the employee role or branch', async () => {
    prisma.hr_monthly_evaluations.findFirst.mockResolvedValue(null);
    prisma.hr_evaluation_templates.findFirst.mockResolvedValue({
      id: 6, version: 2, role_key: 'trainer', branch_id: 3,
      questions_json: JSON.stringify([{ id: 1, title: 'الالتزام', maxScore: 5 }]),
    });
    prisma.employees.findUnique.mockResolvedValue({ id: 8, branch_id_fk: 4, mosma_wazefy_code: 9 });
    prisma.department_jobs.findUnique.mockResolvedValue({ id: 9, name: 'موظف استقبال' });

    await expect(service.createMonthly({
      employeeId: 8, templateId: 6, templateVersion: 2, monthKey: '2026-09',
      answers: [{ questionId: 1, score: 4 }],
    }, 12)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.hr_monthly_evaluations.create).not.toHaveBeenCalled();
  });

  it('authorizes the employee branch before checking duplicates or role details', async () => {
    prisma.hr_evaluation_templates.findFirst.mockResolvedValue({
      id: 6, version: 2, role_key: 'trainer', branch_id: 4,
      questions_json: JSON.stringify([{ id: 1, title: 'الالتزام', maxScore: 5 }]),
    });
    prisma.employees.findUnique.mockResolvedValue({ id: 8, branch_id_fk: 4, mosma_wazefy_code: 9 });
    const branchScope = { isBranchAllowed: jest.fn((_actor, branchId) => branchId === 3) };
    service = new EvaluationWorkflowService(prisma as never, branchScope as never);

    await expect(service.createMonthly({
      employeeId: 8, templateId: 6, templateVersion: 2, monthKey: '2026-09',
      answers: [{ questionId: 1, score: 4 }],
    }, { sub: 12, branch: 3 } as never)).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.hr_monthly_evaluations.findFirst).not.toHaveBeenCalled();
    expect(prisma.department_jobs.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a branch-role evaluation for an employee without an authoritative branch', async () => {
    prisma.hr_evaluation_templates.findFirst.mockResolvedValue({
      id: 6, version: 2, role_key: 'trainer', branch_id: null,
      questions_json: JSON.stringify([{ id: 1, title: 'الالتزام', maxScore: 5 }]),
    });
    prisma.employees.findUnique.mockResolvedValue({ id: 8, branch_id_fk: null, mosma_wazefy_code: 9 });

    await expect(service.createMonthly({
      employeeId: 8, templateId: 6, templateVersion: 2, monthKey: '2026-09', branchId: 3,
      answers: [{ questionId: 1, score: 4 }],
    }, 12)).rejects.toThrow('ربط الموظف بفرع');

    expect(prisma.hr_monthly_evaluations.create).not.toHaveBeenCalled();
  });

  it('lists monthly reports with server-side employee, branch, month and role filters', async () => {
    prisma.hr_evaluation_templates.findMany.mockResolvedValue([{ id: 6 }]);
    prisma.hr_monthly_evaluations.findMany.mockResolvedValue([]);
    await service.listMonthly({ employeeId: 8, branchId: 3, monthKey: '2026-09', roleKey: 'trainer' });
    expect(prisma.hr_monthly_evaluations.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ employee_id: 8, branch_id: 3, month_key: '2026-09', template_id: { in: [6] } }),
    }));
  });
});
