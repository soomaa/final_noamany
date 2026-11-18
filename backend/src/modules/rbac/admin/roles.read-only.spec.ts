import { RbacRolesService } from './roles.service';

describe('RBAC roles list is read-only', () => {
  it('does not provision job roles or replace employee role assignments', async () => {
    const prisma = {
      rbac_roles: { findMany: jest.fn().mockResolvedValue([{ id: 5, key: 'job_title_7', name_ar: 'Reception' }]) },
      rbac_user_roles: { groupBy: jest.fn().mockResolvedValue([{ role_id: 5, _count: { _all: 2 } }]), deleteMany: jest.fn(), create: jest.fn() },
      department_jobs: { findMany: jest.fn().mockResolvedValue([{ id: 7 }]), upsert: jest.fn(), create: jest.fn() },
      employees: { findMany: jest.fn(), groupBy: jest.fn().mockResolvedValue([{ mosma_wazefy_code: 7, _count: { _all: 3 } }]) },
      users: { update: jest.fn() },
    };
    const engine = { getAllKeys: () => new Set(['club:view']) };
    const service = new RbacRolesService(prisma as any, engine as any, {} as any);
    const result = await service.list();
    expect(result.roles[0]).toMatchObject({ id: 5, users: 2, jobTitleId: 7, jobTitleExists: true, employees: 3 });
    // Reading counts is fine; provisioning (writing job titles or roles) is not.
    expect(prisma.employees.findMany).not.toHaveBeenCalled();
    expect(prisma.department_jobs.upsert).not.toHaveBeenCalled();
    expect(prisma.department_jobs.create).not.toHaveBeenCalled();
    expect(prisma.rbac_user_roles.deleteMany).not.toHaveBeenCalled();
    expect(prisma.rbac_user_roles.create).not.toHaveBeenCalled();
    expect(prisma.users.update).not.toHaveBeenCalled();
  });
});
