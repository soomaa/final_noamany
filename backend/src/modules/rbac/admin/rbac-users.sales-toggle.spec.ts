import { ForbiddenException } from '@nestjs/common';
import { JwtUser } from '../../../common/types/jwt-user';
import { RbacUsersService } from './rbac-users.service';

/** «يعمل كأخصائي مبيعات» from user exceptions: any role can also sell (Fatma, 19 Nov). */
function build(opts: { editorSuper?: boolean; editorKeys?: string[]; jobTitle?: string | null; empCode?: number | null } = {}) {
  const prisma = {
    users: {
      findUnique: jest.fn().mockResolvedValue({ user_id: 9, emp_code: opts.empCode === undefined ? 44 : opts.empCode, level: 2, branch_id_fk: 0 }),
    },
    employees: {
      findUnique: jest.fn().mockResolvedValue({ is_sales: false, mosma_wazefy_n: opts.jobTitle ?? 'مدير ريسيبشن', mosma_wazefy_code: null, branch_id_fk: 0 }),
      updateMany: jest.fn().mockReturnValue('employee-flag'),
    },
    department_jobs: { findUnique: jest.fn().mockResolvedValue(null) },
    rbac_roles: { findUnique: jest.fn().mockResolvedValue({ id: 73 }) },
    rbac_user_roles: {
      upsert: jest.fn().mockReturnValue('add-role'),
      deleteMany: jest.fn().mockReturnValue('remove-role'),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const engine = {
    getEffective: jest.fn().mockResolvedValue({ superAdmin: opts.editorSuper ?? true, keys: new Set(opts.editorKeys ?? []) }),
    invalidateUser: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const admin = { sub: 1, level: 1, branch: 0, is_super_admin: true } as unknown as JwtUser;
  const service = new RbacUsersService(prisma as never, engine as never, audit as never);
  // What the additional_sales role grants (resolved by the engine in production).
  jest.spyOn(service as never as { roleAllowSets: () => Promise<unknown> }, 'roleAllowSets')
    .mockResolvedValue(new Map([[73, new Set(['sales.portal:view', 'club.members:create'])]]));
  return { prisma, engine, audit, admin, service };
}

describe('sales toggle (يعمل كأخصائي مبيعات)', () => {
  it('ON adds the additional_sales role on top of the user role and flags the employee', async () => {
    const { service, prisma, engine } = build();
    await service.setSalesToggle(9, true, 1);
    expect(prisma.rbac_user_roles.upsert).toHaveBeenCalledWith({
      where: { user_id_role_id: { user_id: 9, role_id: 73 } },
      update: {},
      create: { user_id: 9, role_id: 73, created_by: 1 },
    });
    expect(prisma.employees.updateMany).toHaveBeenCalledWith({ where: { id: 44 }, data: { is_sales: true } });
    expect(prisma.$transaction).toHaveBeenCalledWith(['add-role', 'employee-flag']);
    // Only the sales role is touched; the user's own role stays.
    expect(prisma.rbac_user_roles.deleteMany).not.toHaveBeenCalled();
    expect(engine.invalidateUser).toHaveBeenCalledWith(9);
  });

  it('OFF removes only the sales role', async () => {
    const { service, prisma } = build();
    await service.setSalesToggle(9, false, 1);
    expect(prisma.rbac_user_roles.deleteMany).toHaveBeenCalledWith({ where: { user_id: 9, role_id: 73 } });
    expect(prisma.employees.updateMany).toHaveBeenCalledWith({ where: { id: 44 }, data: { is_sales: false } });
  });

  it('works for an account with no employee file (only the role)', async () => {
    const { service, prisma } = build({ empCode: null });
    await service.setSalesToggle(9, true, 1);
    expect(prisma.$transaction).toHaveBeenCalledWith(['add-role']);
  });

  it('a non-admin cannot hand out sales permissions they do not hold', async () => {
    const { service, prisma } = build({ editorSuper: false, editorKeys: [] });
    await expect(service.setSalesToggle(9, true, 5)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a sales job title always sells (the toggle shows locked on)', async () => {
    const { service } = build({ jobTitle: 'أخصائي مبيعات' });
    await expect(service.getSalesToggle(9)).resolves.toMatchObject({ enabled: true, byJobTitle: true });
  });

  it('a head receptionist is not a seller until switched on', async () => {
    const { service } = build();
    await expect(service.getSalesToggle(9)).resolves.toMatchObject({ enabled: false, byJobTitle: false, hasEmployee: true });
  });
});
