import { RbacRolesService } from './roles.service';
import { RbacUsersService } from './rbac-users.service';

describe('RBAC matrix delegation authority', () => {
  const maps = {
    resourceIdToKey: new Map([[20, 'admin.users']]),
    actionIdToKey: new Map([[30, 'delete']]),
    resourceKeyToId: new Map([['admin.users', 20]]),
    actionKeyToId: new Map([['delete', 30]]),
  };

  it('lets a roles-matrix manager grant a permission outside their own operational role', async () => {
    const tx = {
      rbac_role_permissions: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      rbac_roles: {
        findUnique: jest.fn().mockResolvedValue({
          id: 5,
          key: 'job_title:5',
          name_ar: 'مشرف',
          name_en: null,
          description: null,
          is_system: false,
          is_super_admin: false,
        }),
      },
      rbac_role_permissions: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const engine = {
      getResolveInput: jest.fn().mockReturnValue({
        resourceActions: new Map([['admin.users', ['delete']]]),
        ancestry: new Map([['admin.users', null]]),
      }),
      getCatalogMaps: jest.fn().mockResolvedValue(maps),
      invalidateRole: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new RbacRolesService(prisma as never, engine as never, audit as never);
    jest.spyOn(service, 'getMatrix').mockResolvedValue({ saved: true } as never);

    await expect(service.saveMatrix(5, {
      changes: [{ resourceKey: 'admin.users', actionKey: 'delete', state: 'allow' }],
    }, 7)).resolves.toEqual({ saved: true });

    expect(tx.rbac_role_permissions.upsert).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 7 }), tx);
  });

  it('lets an exceptions-matrix manager grant any catalog permission to another user', async () => {
    const tx = {
      rbac_user_exceptions: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({
          user_id: 9,
          username: 'target',
          name: 'Target',
          level: 2,
        }),
      },
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const engine = {
      getCatalogMaps: jest.fn().mockResolvedValue(maps),
      invalidateUser: jest.fn(),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new RbacUsersService(prisma as never, engine as never, audit as never);
    jest.spyOn(service, 'getExceptions').mockResolvedValue({ saved: true } as never);

    await expect(service.setExceptions(9, {
      changes: [{ resourceKey: 'admin.users', actionKey: 'delete', state: 'allow' }],
    }, 7)).resolves.toEqual({ saved: true });

    expect(tx.rbac_user_exceptions.upsert).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 7 }), tx);
  });

  it('lets a roles manager assign any ordinary role while keeping super-admin protected', async () => {
    const tx = {
      rbac_user_roles: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({
          user_id: 9,
          username: 'target',
          name: 'Target',
          level: 2,
        }),
      },
      rbac_roles: {
        findMany: jest.fn().mockResolvedValue([{ id: 5, is_super_admin: false }]),
      },
      rbac_user_roles: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const engine = {
      getEffectiveFresh: jest.fn().mockResolvedValue({ superAdmin: false, keys: new Set() }),
      invalidateUser: jest.fn(),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new RbacUsersService(prisma as never, engine as never, audit as never);

    await expect(service.setUserRoles(9, { roleIds: [5] }, 7)).resolves.toEqual({
      userId: 9,
      roleIds: [5],
    });
    expect(tx.rbac_user_roles.upsert).toHaveBeenCalled();
  });
});
