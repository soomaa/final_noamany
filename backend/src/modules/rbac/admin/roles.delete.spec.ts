import { BadRequestException } from '@nestjs/common';
import { RbacRolesService } from './roles.service';

function setup(opts: { role: Record<string, unknown>; users?: number; employees?: number; job?: { id: number; name: string } | null }) {
  const tx = { rbac_roles: { delete: jest.fn() }, department_jobs: { delete: jest.fn() } };
  const prisma = {
    rbac_roles: { findUnique: jest.fn().mockResolvedValue(opts.role) },
    rbac_user_roles: { count: jest.fn().mockResolvedValue(opts.users ?? 0) },
    department_jobs: { findUnique: jest.fn().mockResolvedValue(opts.job ?? null) },
    employees: { count: jest.fn().mockResolvedValue(opts.employees ?? 0) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  };
  const engine = { getAllKeys: () => new Set<string>(), invalidateRole: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new RbacRolesService(prisma as any, engine as any, audit as any);
  return { service, prisma, tx, audit };
}

const jobRole = { id: 9, key: 'job_title_12', name_ar: 'كاشير قديم', is_system: false, is_super_admin: false };

describe('RBAC role delete', () => {
  it('deletes an unused job-title role together with its job title', async () => {
    const { service, tx, audit } = setup({ role: jobRole, job: { id: 12, name: 'كاشير قديم' } });
    await expect(service.remove(9, 1)).resolves.toEqual({ id: 9, jobTitleId: 12 });
    expect(tx.rbac_roles.delete).toHaveBeenCalledWith({ where: { id: 9 } });
    expect(tx.department_jobs.delete).toHaveBeenCalledWith({ where: { id: 12 } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'role.delete', targetId: 9 }));
  });

  it('deletes a role whose job title is already gone', async () => {
    const { service, tx } = setup({ role: jobRole, job: null });
    await service.remove(9, 1);
    expect(tx.rbac_roles.delete).toHaveBeenCalled();
    expect(tx.department_jobs.delete).not.toHaveBeenCalled();
  });

  it('refuses while a user account has the role', async () => {
    const { service, tx } = setup({ role: jobRole, users: 2, job: { id: 12, name: 'x' } });
    await expect(service.remove(9, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.rbac_roles.delete).not.toHaveBeenCalled();
  });

  it('refuses while an employee holds the job title', async () => {
    const { service, tx } = setup({ role: jobRole, employees: 1, job: { id: 12, name: 'x' } });
    await expect(service.remove(9, 1)).rejects.toThrow('موظف');
    expect(tx.rbac_roles.delete).not.toHaveBeenCalled();
  });

  it('refuses system and super-admin roles', async () => {
    await expect(setup({ role: { ...jobRole, is_system: true } }).service.remove(9)).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ role: { ...jobRole, is_super_admin: true } }).service.remove(9)).rejects.toBeInstanceOf(BadRequestException);
  });
});
