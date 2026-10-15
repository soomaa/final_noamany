import { jobTitleRoleKey, resolveRoleIdForJobTitleId } from './job-title-role.util';

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
});
