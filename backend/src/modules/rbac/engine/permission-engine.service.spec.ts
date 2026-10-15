import { PermissionCacheService } from './permission-cache.service';
import { PermissionEngineService } from './permission-engine.service';

describe('PermissionEngineService fresh resolution', () => {
  it('bypasses a stale cached deny for permission-delegation checks', async () => {
    let granted = false;
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({ level: 2 }),
      },
      rbac_user_roles: {
        findMany: jest.fn().mockResolvedValue([
          { role_id: 10, expires_at: null, role: { is_super_admin: false } },
        ]),
      },
      rbac_role_permissions: {
        findMany: jest.fn().mockImplementation(async () =>
          granted
            ? [{ role_id: 10, resource_id: 20, action_id: 30, effect: 'allow' }]
            : [],
        ),
      },
      rbac_user_exceptions: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      rbac_role_scopes: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      rbac_resources: {
        findMany: jest.fn().mockResolvedValue([{ id: 20, key: 'admin.roles' }]),
      },
      rbac_actions: {
        findMany: jest.fn().mockResolvedValue([{ id: 30, key: 'manage' }]),
      },
    };
    const catalog = {
      resources: () => [
        {
          key: 'admin.roles',
          parentKey: null,
          actions: ['manage'],
        },
      ],
    };
    const engine = new PermissionEngineService(
      prisma as never,
      new PermissionCacheService(),
      catalog as never,
    );

    expect((await engine.getEffective(7)).keys).not.toContain('admin.roles:manage');

    granted = true;
    expect((await engine.getEffective(7)).keys).not.toContain('admin.roles:manage');
    expect((await engine.getEffectiveFresh(7)).keys).toContain('admin.roles:manage');
  });
});
