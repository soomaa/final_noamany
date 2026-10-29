import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeesService } from './employees.service';

const admin = { sub: 1, level: 1, branch: 0, emp_code: null } as unknown as JwtUser;
const tantaMain = { sub: 20, level: 3, branch: 2, emp_code: 200 } as unknown as JwtUser;
const tantaUp = { sub: 21, level: 3, branch: 5, emp_code: 210 } as unknown as JwtUser;

const build = () => {
  const prisma = {
    employees: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
    },
    department_jobs: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, service: new EmployeesService(prisma as never, new BranchScopeService()) };
};
const page = { page: 1, pageSize: 20, skip: 0, take: 20 } as never;

describe('EmployeesService branch scoping', () => {
  it('defaults a branch user list to their branch plus Tanta sub-branches', async () => {
    const { prisma, service } = build();
    await service.list(page, tantaMain);
    const where = prisma.employees.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ branch_id_fk: { in: [2, 5, 6] } });
  });

  it('keeps a sub-branch user to the sub-branch', async () => {
    const { prisma, service } = build();
    await service.posOptions(tantaUp);
    expect(prisma.employees.findMany.mock.calls[0][0].where.branch_id_fk).toEqual({ in: [5] });
  });

  it('leaves admins unrestricted, or on the branch they ask for', async () => {
    const { prisma, service } = build();
    await service.list(page, admin);
    expect(prisma.employees.findMany.mock.calls[0][0].where.AND).toEqual([{}]);
    await service.list({ ...(page as object), branch: '4' } as never, admin);
    expect(prisma.employees.findMany.mock.calls[1][0].where.AND).toContainEqual({ branch_id_fk: { in: [4] } });
  });

  it('scopes the subscription and sales-rep pickers', async () => {
    const { prisma, service } = build();
    await service.subscriptionOptions(tantaMain);
    expect(prisma.employees.findMany.mock.calls[0][0].where.branch_id_fk).toEqual({ in: [2, 5, 6] });
    await service.salesReps(tantaMain);
    expect(prisma.employees.findMany.mock.calls[1][0].where.AND).toContainEqual({ branch_id_fk: { in: [2, 5, 6] } });
  });

  it('rejects :id access to an employee of another branch', async () => {
    const { prisma, service } = build();
    prisma.employees.findUnique.mockResolvedValue({ branch_id_fk: 4 });
    await expect(service.assertEmployeeInScope(tantaMain, 9)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows :id access to a sub-branch employee for the Tanta main branch', async () => {
    const { prisma, service } = build();
    prisma.employees.findUnique.mockResolvedValue({ branch_id_fk: 6 });
    await expect(service.assertEmployeeInScope(tantaMain, 9)).resolves.toBeUndefined();
  });

  it('skips the lookup for system admins', async () => {
    const { prisma, service } = build();
    await expect(service.assertEmployeeInScope(admin, 9)).resolves.toBeUndefined();
    expect(prisma.employees.findUnique).not.toHaveBeenCalled();
  });

  it('validates body and weekly-schedule branches', () => {
    const { service } = build();
    expect(() => service.assertEmployeeBodyInScope(tantaMain, { branch_id_fk: '4' }, false)).toThrow(ForbiddenException);
    const body: Record<string, unknown> = {};
    service.assertEmployeeBodyInScope(tantaMain, body, true);
    expect(body.branch_id_fk).toBe(2);
    expect(() =>
      service.assertScheduleInScope(tantaMain, { effectiveFrom: '2026-10-01', slots: [{ weekday: 0, branchId: 4 }] }),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertScheduleInScope(tantaMain, { effectiveFrom: '2026-10-01', slots: [{ weekday: 0, branchId: 5 }] }),
    ).not.toThrow();
  });
});
