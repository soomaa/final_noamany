import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { EvaluationManagementService } from './evaluation-management.service';

const admin = { sub: 1, level: 1, emp_code: null, branch: 0 } as unknown as JwtUser;
const allowAll = { canAny: jest.fn().mockResolvedValue(true) };
const build = (prisma: unknown, engine: unknown = allowAll) =>
  new EvaluationManagementService(prisma as never, new BranchScopeService(), engine as never);

describe('EvaluationManagementService', () => {
  const prisma = {
    department_jobs: { findUnique: jest.fn() },
    evaluation_categories: { create: jest.fn(), findUnique: jest.fn(), count: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    evaluation_items: { create: jest.fn(), count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    employee_evaluation_details: { count: jest.fn() },
  } as any;
  const service = build(prisma);

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
    const service = build(prisma);

    await service.createEvaluation({
      categoryId: 4,
      employeeId: 161,
      branchId: 1,
      evaluationDate: '2026-09-20',
      evaluationMonth: '2026-09',
      details: [{ itemId: 9, awardedScore: '5' }],
    }, 1, admin);

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

    const result = await build(prisma).listEvaluations({ page: 1, pageSize: 100, order: 'desc', skip: 0, take: 100 } as never, admin);

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
    const service = build(prisma);

    await service.updateEvaluation(7, { evaluationDate: '2026-09-21', evaluationMonth: '2026-09', details: [{ itemId: 9, awardedScore: '8' }] }, 23, admin);

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

    await build(prisma).removeEvaluation(7, admin);

    expect(calls).toEqual(['details', 'evaluation']);
  });
});

describe('EvaluationManagementService branch scope and self-only report', () => {
  const branchManager = { sub: 50, level: 3, emp_code: 500, branch: 2, man_women_type: 3 } as unknown as JwtUser;
  const plainEmployee = { sub: 60, level: 2, emp_code: 600, branch: 2, man_women_type: 3 } as unknown as JwtUser;
  const denyAll = { canAny: jest.fn().mockResolvedValue(false) };

  function reportPrisma() {
    return {
      employee_evaluations: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
      },
      employees: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      tbl_branches: { findMany: jest.fn().mockResolvedValue([]) },
      users: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    } as any;
  }

  it('limits a manager report to the Tanta branch family by default', async () => {
    const prisma = reportPrisma();
    await build(prisma).listEvaluations({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, branchManager);
    expect(prisma.employee_evaluations.findMany.mock.calls[0][0].where).toEqual({ branch_id: { in: [2, 5, 6] } });
  });

  it('shows a plain employee only their own evaluations', async () => {
    const prisma = reportPrisma();
    await build(prisma, denyAll).listEvaluations({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, plainEmployee);
    expect(denyAll.canAny).toHaveBeenCalledWith(60, expect.arrayContaining(['evaluation-management.add_evaluation:create']));
    expect(prisma.employee_evaluations.findMany.mock.calls[0][0].where).toEqual({ branch_id: { in: [2, 5, 6] }, employee_id: 600 });
  });

  it("returns nothing when a plain employee asks for a colleague's evaluations", async () => {
    const prisma = reportPrisma();
    const result = await build(prisma, denyAll).listEvaluations({ page: 1, pageSize: 20, skip: 0, take: 20, employeeId: 601 } as never, plainEmployee);
    expect(result.data).toEqual([]);
    expect(prisma.employee_evaluations.findMany).not.toHaveBeenCalled();
  });

  it("forbids a plain employee from opening a colleague's evaluation", async () => {
    const prisma = reportPrisma();
    prisma.employee_evaluations.findUnique.mockResolvedValue({ id: 9, branch_id: 2, employee_id: 601 });
    await expect(build(prisma, denyAll).getEvaluation(9, plainEmployee)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids a manager from deleting an evaluation of another branch', async () => {
    const prisma = reportPrisma();
    prisma.employee_evaluations.findUnique.mockResolvedValue({ id: 9, branch_id: 3, employee_id: 700 });
    await expect(build(prisma).removeEvaluation(9, branchManager)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('defaults the category employee picker to the caller branches', async () => {
    const prisma = {
      evaluation_categories: { findUnique: jest.fn().mockResolvedValue({ id: 4, job_title_id: 7 }) },
      department_jobs: { findUnique: jest.fn().mockResolvedValue({ id: 7, dep_code: 70 }) },
      tbl_branches: { findUnique: jest.fn() },
      employees: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    await build(prisma).employees(4, branchManager);
    expect(prisma.employees.findMany.mock.calls[0][0].where).toEqual({ mosma_wazefy_code: 70, branch_id_fk: { in: [2, 5, 6] } });
  });
});
