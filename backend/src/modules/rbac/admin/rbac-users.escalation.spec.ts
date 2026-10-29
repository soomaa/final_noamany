import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { JwtUser } from '../../../common/types/jwt-user';
import { ACTIONS, buildAncestry, flattenCatalog } from '../catalog/rbac.catalog';
import { PermissionEngineService } from '../engine/permission-engine.service';
import { RbacUsersService } from './rbac-users.service';

const FLAT = flattenCatalog();
const RESOURCE_ROWS = FLAT.map((r, i) => ({ id: i + 1, key: r.key }));
const ACTION_ROWS = ACTIONS.map((a, i) => ({ id: i + 1, key: a.key as string }));
const RES_ID = new Map(RESOURCE_ROWS.map((r) => [r.key, r.id]));
const ACT_ID = new Map(ACTION_ROWS.map((a) => [a.key, a.id]));

const engineStub = (editorKeys: string[], superAdmin = false) =>
  ({
    getResolveInput: () => ({
      resourceActions: new Map(FLAT.map((r) => [r.key, r.actions as string[]])),
      ancestry: buildAncestry(FLAT),
    }),
    getEffective: jest.fn().mockResolvedValue({ superAdmin, keys: new Set(editorKeys), scope: new Map() }),
    getCatalogMaps: jest.fn().mockResolvedValue({
      resourceIdToKey: new Map(RESOURCE_ROWS.map((r) => [r.id, r.key])),
      actionIdToKey: new Map(ACTION_ROWS.map((a) => [a.id, a.key])),
      resourceKeyToId: RES_ID,
      actionKeyToId: ACT_ID,
    }),
    invalidateUser: jest.fn(),
  }) as unknown as PermissionEngineService;

const audit = { log: jest.fn().mockResolvedValue(undefined) } as never;

/** Branch-2 manager holding admin.roles:manage + club.members:view. */
const actor = { sub: 99, level: 3, branch: 2, emp_code: 990 } as unknown as JwtUser;
const EDITOR_KEYS = ['admin.roles:manage', 'club.members:view'];

const prismaFor = (opts: {
  roles: { id: number; is_super_admin: boolean }[];
  rolePerms?: { role_id: number; resource_id: number; action_id: number; effect: string }[];
  target?: { level: number | null; emp_code: number | null; branch_id_fk: number | null };
  targetEmpBranch?: number;
  targetIsSuper?: boolean;
}) =>
  ({
    users: {
      findUnique: jest.fn().mockResolvedValue({
        user_id: 5, username: 'u', name: 'n', ...(opts.target ?? { level: 2, emp_code: 50, branch_id_fk: 2 }),
      }),
    },
    employees: { findUnique: jest.fn().mockResolvedValue({ branch_id_fk: opts.targetEmpBranch ?? 2 }) },
    rbac_roles: { findMany: jest.fn().mockResolvedValue(opts.roles) },
    rbac_role_permissions: { findMany: jest.fn().mockResolvedValue(opts.rolePerms ?? []) },
    rbac_user_roles: {
      findFirst: jest.fn().mockResolvedValue(opts.targetIsSuper ? { id: 1 } : null),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    rbac_user_section_exceptions: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    rbac_user_operational_scopes: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockResolvedValue([]),
  }) as unknown as PrismaService;

const svc = (prisma: PrismaService, engine = engineStub(EDITOR_KEYS)) =>
  new RbacUsersService(prisma, engine, audit, new BranchScopeService());

describe('RbacUsersService.setUserRoles anti-escalation', () => {
  it('rejects assigning a super-admin role', async () => {
    const prisma = prismaFor({ roles: [{ id: 1, is_super_admin: true }] });
    await expect(svc(prisma).setUserRoles(5, { roleIds: [1] }, 99, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects editing your own roles', async () => {
    const prisma = prismaFor({ roles: [{ id: 2, is_super_admin: false }] });
    await expect(svc(prisma).setUserRoles(99, { roleIds: [2] }, 99, actor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects adding a role that grants a permission the editor lacks', async () => {
    const prisma = prismaFor({
      roles: [{ id: 2, is_super_admin: false }],
      rolePerms: [{ role_id: 2, resource_id: RES_ID.get('admin.users')!, action_id: ACT_ID.get('delete')!, effect: 'allow' }],
    });
    await expect(svc(prisma).setUserRoles(5, { roleIds: [2] }, 99, actor)).rejects.toThrow(/لا تملكها/);
  });

  it('allows adding a role whose permissions the editor already holds', async () => {
    const prisma = prismaFor({
      roles: [{ id: 2, is_super_admin: false }],
      rolePerms: [{ role_id: 2, resource_id: RES_ID.get('club.members')!, action_id: ACT_ID.get('view')!, effect: 'allow' }],
    });
    await expect(svc(prisma).setUserRoles(5, { roleIds: [2] }, 99, actor)).resolves.toEqual({ userId: 5, roleIds: [2] });
  });

  it('rejects a target outside the editor branch scope', async () => {
    const prisma = prismaFor({ roles: [{ id: 2, is_super_admin: false }], targetEmpBranch: 4 });
    await expect(svc(prisma).setUserRoles(5, { roleIds: [2] }, 99, actor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects touching a super-admin target', async () => {
    const prisma = prismaFor({ roles: [], targetIsSuper: true });
    await expect(svc(prisma).setUserRoles(5, { roleIds: [] }, 99, actor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps super-admin editors unrestricted', async () => {
    const prisma = prismaFor({ roles: [{ id: 1, is_super_admin: true }], targetEmpBranch: 4 });
    const admin = { sub: 1, level: 1, branch: 0, emp_code: null } as unknown as JwtUser;
    await expect(svc(prisma, engineStub([], true)).setUserRoles(1, { roleIds: [1] }, 1, admin)).resolves.toEqual({
      userId: 1,
      roleIds: [1],
    });
  });
});

describe('RbacUsersService.clearSectionException', () => {
  it('rejects a target user outside the editor branch scope', async () => {
    const prisma = prismaFor({ roles: [], targetEmpBranch: 4 });
    await expect(svc(prisma).clearSectionException(5, 2, 'male', 99, actor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an in-scope target', async () => {
    const prisma = prismaFor({ roles: [] });
    await expect(svc(prisma).clearSectionException(5, 2, 'male', 99, actor)).resolves.toBeDefined();
  });
});
