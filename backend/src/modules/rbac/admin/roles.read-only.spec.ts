import { RbacRolesService } from './roles.service';

describe('RBAC roles list is read-only', () => {
  it('does not provision job roles or replace employee role assignments', async () => {
    const prisma = {
      rbac_roles: { findMany: jest.fn().mockResolvedValue([{ id: 5, key: 'job_title_7', name_ar: 'Reception' }]) },
      rbac_user_roles: { groupBy: jest.fn().mockResolvedValue([{ role_id: 5, _count: { _all: 2 } }]), deleteMany: jest.fn(), create: jest.fn() },
      department_jobs: { findMany: jest.fn() },
      employees: { findMany: jest.fn() },
      users: { update: jest.fn() },
    };
    const engine = { getAllKeys: () => new Set(['club:view']) };
    const service = new RbacRolesService(prisma as any, engine as any, {} as any);
    await expect(service.list()).resolves.toHaveProperty('roles');
    expect(prisma.employees.findMany).not.toHaveBeenCalled();
    expect(prisma.department_jobs.findMany).not.toHaveBeenCalled();
    expect(prisma.rbac_user_roles.deleteMany).not.toHaveBeenCalled();
    expect(prisma.rbac_user_roles.create).not.toHaveBeenCalled();
    expect(prisma.users.update).not.toHaveBeenCalled();
  });
});
