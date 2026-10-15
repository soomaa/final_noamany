import {
  jobTitleRoleKey,
  resolveRoleIdForJobTitleId,
  syncAdditionalSalesRole,
  syncEmployeeUserRole,
} from './job-title-role.util';

describe('job-title RBAC role mapping', () => {
  it('maps trainer employees to their visible job-title role, not a hidden shared role', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 91 });
    const prisma = {
      department_jobs: {
        findUnique: jest.fn().mockResolvedValue({ id: 15, name: 'مدرب', is_trainer: true }),
      },
      rbac_roles: { upsert },
    } as never;

    await expect(resolveRoleIdForJobTitleId(prisma, 15)).resolves.toBe(91);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: jobTitleRoleKey(15) },
    }));
    expect(upsert).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'trainer' },
    }));
  });

  it('replaces only stale job-title assignments and preserves additional roles', async () => {
    const deleteMany = jest.fn();
    const upsertLink = jest.fn();
    const updateUser = jest.fn();
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue({ mosma_wazefy_code: 15 }) },
      users: { findFirst: jest.fn().mockResolvedValue({ user_id: 7 }), update: updateUser },
      department_jobs: { findUnique: jest.fn().mockResolvedValue({ id: 15, name: 'مدرب' }) },
      rbac_roles: {
        upsert: jest.fn().mockResolvedValue({ id: 91 }),
        findMany: jest.fn().mockResolvedValue([{ id: 90 }, { id: 91 }]),
      },
      rbac_user_roles: { deleteMany, upsert: upsertLink },
      $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
    } as never;

    await syncEmployeeUserRole(prisma, 22);

    expect(deleteMany).toHaveBeenCalledWith({ where: { user_id: 7, role_id: { in: [90] } } });
    expect(deleteMany).not.toHaveBeenCalledWith({ where: { user_id: 7 } });
    expect(upsertLink).toHaveBeenCalledWith(expect.objectContaining({
      where: { user_id_role_id: { user_id: 7, role_id: 91 } },
    }));
  });

  it('adds or removes only the additional sales role while preserving every other role', async () => {
    const assignments = new Set([3, 8]);
    const employee = { is_sales: true };
    const prisma = {
      employees: { findUnique: jest.fn(async () => employee) },
      users: { findFirst: jest.fn(async () => ({ user_id: 7 })) },
      rbac_roles: { findUnique: jest.fn(async () => ({ id: 21 })) },
      rbac_user_roles: {
        upsert: jest.fn(async () => { assignments.add(21); }),
        deleteMany: jest.fn(async () => { assignments.delete(21); }),
      },
    };

    await syncAdditionalSalesRole(prisma as never, 22);
    expect([...assignments].sort((a, b) => a - b)).toEqual([3, 8, 21]);

    employee.is_sales = false;
    await syncAdditionalSalesRole(prisma as never, 22);
    expect([...assignments].sort((a, b) => a - b)).toEqual([3, 8]);
  });
});
