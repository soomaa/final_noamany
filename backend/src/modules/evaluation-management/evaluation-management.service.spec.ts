import { Prisma } from '@prisma/client';
import { EvaluationManagementService } from './evaluation-management.service';

describe('EvaluationManagementService', () => {
  const prisma = {
    department_jobs: { findUnique: jest.fn() },
    evaluation_categories: { create: jest.fn(), findUnique: jest.fn(), count: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    evaluation_items: { create: jest.fn(), count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    employee_evaluation_details: { count: jest.fn() },
  } as any;
  const service = new EvaluationManagementService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('records the actor in category audit fields', async () => {
    prisma.department_jobs.findUnique.mockResolvedValue({ id: 7 });
    prisma.evaluation_categories.create.mockResolvedValue({ id: 1, name: 'الأداء', job_title_id: 7 });
    await service.createCategory({ name: ' الأداء ', jobTitleId: 7 }, 23);
    expect(prisma.evaluation_categories.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'الأداء', job_title_id: 7, created_by_id: 23, updated_by_id: 23 }),
    });
  });

  it('rejects a negative item maximum', async () => {
    prisma.evaluation_categories.findUnique.mockResolvedValue({ id: 2 });
    await expect(service.createItem({ categoryId: 2, name: 'الالتزام', maxScore: '-1' }, 23))
      .rejects.toThrow('الدرجة العظمى');
  });
});

describe('EvaluationManagementService legacy employee resilience', () => {
  it('reads only the employee fields required to save an evaluation', async () => {
    const tx = {
      employee_evaluations: { create: jest.fn().mockResolvedValue({ id: 31 }) },
      employee_evaluation_details: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      evaluation_categories: { findUnique: jest.fn().mockResolvedValue({ id: 4, job_title_id: 7 }) },
      employees: { findUnique: jest.fn().mockResolvedValue({ mosma_wazefy_code: 70, branch_id_fk: 1 }) },
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_id: 1 }) },
      evaluation_items: { findMany: jest.fn().mockResolvedValue([{ id: 9, name: 'الالتزام', max_score: new Prisma.Decimal('10') }]) },
      department_jobs: { findUnique: jest.fn().mockResolvedValue({ id: 7, dep_code: 70 }) },
      $transaction: jest.fn((work) => work(tx)),
    } as any;
    const service = new EvaluationManagementService(prisma);

    await service.createEvaluation({
      categoryId: 4,
      employeeId: 161,
      branchId: 1,
      evaluationDate: '2026-09-20',
      evaluationMonth: '2026-09',
      details: [{ itemId: 9, awardedScore: '5' }],
    }, 1);

    expect(prisma.employees.findUnique).toHaveBeenCalledWith({
      where: { id: 161 },
      select: { mosma_wazefy_code: true, branch_id_fk: true },
    });
  });
});

describe('EvaluationManagementService report actions', () => {
  it('returns the employee who added each evaluation', async () => {
    const prisma = {
      employee_evaluations: {
        findMany: jest.fn().mockResolvedValue([{ id: 7, category_id: 4, employee_id: 161, branch_id: 1, created_by_id: 23, evaluation_date: new Date('2026-09-20'), evaluation_month: '2026-09', created_at: new Date('2026-09-20T13:34:00Z'), category: { name: 'الاستقبال' } }]),
        count: jest.fn().mockResolvedValue(1),
      },
      employees: { findMany: jest.fn().mockResolvedValue([{ id: 161, employee: 'نور عادل' }]) },
      tbl_branches: { findMany: jest.fn().mockResolvedValue([{ branch_id: 1, branch_name: 'الجيزة' }]) },
      users: { findMany: jest.fn().mockResolvedValue([{ user_id: 23, name: 'مدير النظام', username: 'admin' }]) },
    } as any;

    const result = await new EvaluationManagementService(prisma).listEvaluations({ page: 1, pageSize: 100, order: 'desc', skip: 0, take: 100 });

    expect(result.data[0]).toEqual(expect.objectContaining({ createdByName: 'مدير النظام' }));
  });

  it('updates only the evaluation date, month and saved score snapshots', async () => {
    const tx = {
      employee_evaluations: { update: jest.fn().mockResolvedValue({ id: 7 }) },
      employee_evaluation_details: { update: jest.fn().mockResolvedValue({ id: 41 }) },
    };
    const prisma = {
      employee_evaluations: { findUnique: jest.fn().mockResolvedValue({ id: 7, details: [{ id: 41, item_id: 9, max_score_snapshot: new Prisma.Decimal('10') }] }) },
      $transaction: jest.fn((work) => work(tx)),
    } as any;
    const service = new EvaluationManagementService(prisma);

    await service.updateEvaluation(7, { evaluationDate: '2026-09-21', evaluationMonth: '2026-09', details: [{ itemId: 9, awardedScore: '8' }] }, 23);

    expect(tx.employee_evaluations.update).toHaveBeenCalledWith({ where: { id: 7 }, data: expect.objectContaining({ evaluation_date: new Date('2026-09-21'), evaluation_month: '2026-09', updated_by_id: 23 }) });
    expect(tx.employee_evaluation_details.update).toHaveBeenCalledWith({ where: { id: 41 }, data: expect.objectContaining({ awarded_score: new Prisma.Decimal('8'), updated_by_id: 23 }) });
  });

  it('deletes score details before deleting the evaluation', async () => {
    const calls: string[] = [];
    const tx = {
      employee_evaluation_details: { deleteMany: jest.fn(async () => { calls.push('details'); }) },
      employee_evaluations: { delete: jest.fn(async () => { calls.push('evaluation'); }) },
    };
    const prisma = {
      employee_evaluations: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
      $transaction: jest.fn((work) => work(tx)),
    } as any;

    await new EvaluationManagementService(prisma).removeEvaluation(7);

    expect(calls).toEqual(['details', 'evaluation']);
  });
});
