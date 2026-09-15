import { ensureRoleForJobTitle, jobTitleRoleKey, resolveRoleIdForJobTitleId } from './job-title-role.util';

function setupRolePrisma(existingRoleId: number | null = null, permissionCount = 0) {
  const resources = [
    { id: 1, key: 'sales.portal' },
    { id: 2, key: 'club.reception' },
    { id: 3, key: 'club.members.attendance' },
  ];
  const actions = [{ id: 10, key: 'view' }, { id: 11, key: 'update' }];
  return {
    department_jobs: { findUnique: jest.fn() },
    rbac_roles: {
      findUnique: jest.fn().mockResolvedValue(existingRoleId == null ? null : { id: existingRoleId }),
      upsert: jest.fn().mockResolvedValue({ id: existingRoleId ?? 91 }),
    },
    rbac_user_roles: {},
    rbac_role_permissions: {
      count: jest.fn().mockResolvedValue(permissionCount),
      createMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
    rbac_resources: { findMany: jest.fn().mockResolvedValue(resources) },
    rbac_actions: { findMany: jest.fn().mockResolvedValue(actions) },
  };
}

describe('job-title RBAC role mapping', () => {
  it('maps trainer employees to their visible job-title role, not a hidden shared role', async () => {
    const prisma = setupRolePrisma();
    prisma.department_jobs.findUnique.mockResolvedValue({ id: 15, name: 'مدرب', is_trainer: true });

    await expect(resolveRoleIdForJobTitleId(prisma as never, 15)).resolves.toBe(91);
    expect(prisma.rbac_roles.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: jobTitleRoleKey(15) },
    }));
    expect(prisma.rbac_roles.upsert).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { key: 'trainer' },
    }));
  });

  it('seeds a new sales job-title role so it can reach the portal immediately', async () => {
    const prisma = setupRolePrisma();

    await ensureRoleForJobTitle(prisma as never, { id: 18, name: 'أخصائي مبيعات' });

    expect(prisma.rbac_role_permissions.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        { role_id: 91, resource_id: 1, action_id: 10, effect: 'allow' },
        { role_id: 91, resource_id: 1, action_id: 11, effect: 'allow' },
        { role_id: 91, resource_id: 2, action_id: 10, effect: 'allow' },
        { role_id: 91, resource_id: 3, action_id: 10, effect: 'allow' },
      ]),
      skipDuplicates: true,
    });
  });

  it('does not overwrite a customized existing job-title matrix', async () => {
    const prisma = setupRolePrisma(91, 1);

    await ensureRoleForJobTitle(prisma as never, { id: 18, name: 'أخصائي مبيعات' });

    expect(prisma.rbac_role_permissions.createMany).not.toHaveBeenCalled();
  });
});
