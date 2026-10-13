/**
 * FULL AUDIT SUITE — permission management ("إدارة الصلاحيات").
 *
 * Exercises the whole authorization stack end to end at unit level:
 *   A. Catalog integrity          (rbac.catalog.ts — the source of truth)
 *   B. Pure inheritance resolver  (permission-resolver.ts)
 *   C. Permission cache           (permission-cache.service.ts)
 *   D. Runtime engine             (permission-engine.service.ts)
 *   E. PermissionsGuard           (common/guards/permissions.guard.ts)
 *   F. Route coverage audit       (every @RequiresPermission key must exist in the catalog)
 *   G. Anti-escalation            (roles.saveMatrix / users.setExceptions / users.setUserRoles)
 */
import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { REQUIRES_PAGE_KEY } from '../../common/decorators/requires-page.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../common/prisma/prisma.service';

import { ACTIONS, buildAncestry, flattenCatalog, permKey } from './catalog/rbac.catalog';
import { PermissionCacheService } from './engine/permission-cache.service';
import { PermissionEngineService } from './engine/permission-engine.service';
import {
  applyExceptions,
  effectiveForRole,
  effectiveForUser,
  resolveCell,
  resolveMatrix,
  unionRoles,
  indexCells,
  type ResolveInput,
  type StoredCell,
} from './engine/permission-resolver';
import { legacyRoleKeyForLevel } from './legacy-level-roles';
import { RbacRolesService } from './admin/roles.service';
import { RbacUsersService } from './admin/rbac-users.service';

// ---------------------------------------------------------------------------------------
//  Shared fixtures
// ---------------------------------------------------------------------------------------

const FLAT = flattenCatalog();
const ALL_KEYS = new Set(FLAT.flatMap((r) => r.actions.map((a) => permKey(r.key, a))));
const ACTION_KEYS = new Set(ACTIONS.map((a) => a.key));

/** A small synthetic tree used for the pure-resolver tests. */
const TREE: ResolveInput = {
  resourceActions: new Map<string, string[]>([
    ['root', ['view', 'update', 'delete']],
    ['root.mid', ['view', 'update', 'delete']],
    ['root.mid.leaf', ['view', 'update', 'delete']],
    ['other', ['view']],
  ]),
  ancestry: new Map<string, string | null>([
    ['root', null],
    ['root.mid', 'root'],
    ['root.mid.leaf', 'root.mid'],
    ['other', null],
  ]),
};

const cell = (r: string, a: string, effect: 'allow' | 'deny'): StoredCell => ({
  resourceKey: r,
  actionKey: a,
  effect,
});

/** Deterministic id maps over the real catalog, so the engine's DB lookups can be faked. */
const RESOURCE_ROWS = FLAT.map((r, i) => ({ id: i + 1, key: r.key }));
const ACTION_ROWS = ACTIONS.map((a, i) => ({ id: i + 1, key: a.key }));
const RES_ID = new Map(RESOURCE_ROWS.map((r) => [r.key, r.id]));
const ACT_ID = new Map<string, number>(ACTION_ROWS.map((a) => [a.key as string, a.id]));

interface FakeDb {
  level?: number | null;
  userRoles?: { role_id: number; role?: { is_super_admin: boolean } | null }[];
  roleByKey?: Record<string, { id: number; is_super_admin: boolean }>;
  rolePerms?: { role_id: number; resourceKey: string; actionKey: string; effect: 'allow' | 'deny' }[];
  exceptions?: { resourceKey: string; actionKey: string; effect: 'allow' | 'deny' }[];
  scopes?: { role_id: number; resourceKey: string; scope: string }[];
}

/** Minimal PrismaService stand-in driving PermissionEngineService. */
function fakePrisma(db: FakeDb) {
  return {
    users: { findUnique: jest.fn(async () => (db.level === undefined ? null : { level: db.level })) },
    rbac_user_roles: {
      findMany: jest.fn(async () => db.userRoles ?? []),
    },
    rbac_roles: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) => db.roleByKey?.[where.key] ?? null),
    },
    rbac_role_permissions: {
      findMany: jest.fn(async () =>
        (db.rolePerms ?? []).map((c) => ({
          role_id: c.role_id,
          resource_id: RES_ID.get(c.resourceKey)!,
          action_id: ACT_ID.get(c.actionKey)!,
          effect: c.effect,
        })),
      ),
    },
    rbac_user_exceptions: {
      findMany: jest.fn(async () =>
        (db.exceptions ?? []).map((c) => ({
          resource_id: RES_ID.get(c.resourceKey)!,
          action_id: ACT_ID.get(c.actionKey)!,
          effect: c.effect,
        })),
      ),
    },
    rbac_role_scopes: {
      findMany: jest.fn(async () =>
        (db.scopes ?? []).map((s) => ({ resource_id: RES_ID.get(s.resourceKey)!, scope: s.scope })),
      ),
    },
    rbac_resources: { findMany: jest.fn(async () => RESOURCE_ROWS) },
    rbac_actions: { findMany: jest.fn(async () => ACTION_ROWS) },
  } as unknown as PrismaService;
}

const makeEngine = (db: FakeDb) => {
  const cache = new PermissionCacheService();
  const engine = new PermissionEngineService(fakePrisma(db), cache);
  return { engine, cache };
};

// ---------------------------------------------------------------------------------------
//  A. CATALOG INTEGRITY
// ---------------------------------------------------------------------------------------

describe('A. RBAC catalog integrity', () => {
  it('has no duplicate resource keys', () => {
    const seen = new Map<string, number>();
    for (const r of FLAT) seen.set(r.key, (seen.get(r.key) ?? 0) + 1);
    expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });

  it('has no duplicate action keys', () => {
    expect(ACTION_KEYS.size).toBe(ACTIONS.length);
  });

  it('every parentKey resolves to a declared resource', () => {
    const keys = new Set(FLAT.map((r) => r.key));
    const orphans = FLAT.filter((r) => r.parentKey !== null && !keys.has(r.parentKey));
    expect(orphans.map((o) => `${o.key} -> ${o.parentKey}`)).toEqual([]);
  });

  it('every resource declares at least one action', () => {
    expect(FLAT.filter((r) => !r.actions?.length).map((r) => r.key)).toEqual([]);
  });

  it('every declared action exists in the ACTIONS table', () => {
    const bad: string[] = [];
    for (const r of FLAT) for (const a of r.actions) if (!ACTION_KEYS.has(a)) bad.push(`${r.key}:${a}`);
    expect(bad).toEqual([]);
  });

  it('the ancestry graph is acyclic (no resource is its own ancestor)', () => {
    const anc = buildAncestry(FLAT);
    const cyclic: string[] = [];
    for (const key of anc.keys()) {
      const seen = new Set<string>();
      let cur: string | null | undefined = key;
      while (cur) {
        if (seen.has(cur)) { cyclic.push(key); break; }
        seen.add(cur);
        cur = anc.get(cur) ?? null;
      }
    }
    expect(cyclic).toEqual([]);
  });

  it('no two resources claim the same route', () => {
    const byRoute = new Map<string, string[]>();
    for (const r of FLAT) if (r.route) (byRoute.get(r.route) ?? byRoute.set(r.route, []).get(r.route)!).push(r.key);
    expect([...byRoute.entries()].filter(([, v]) => v.length > 1)).toEqual([]);
  });

  it('every resource has an Arabic label (RTL UI requirement)', () => {
    expect(FLAT.filter((r) => !r.nameAr?.trim()).map((r) => r.key)).toEqual([]);
  });

  it('exposes a non-trivial permission surface', () => {
    expect(FLAT.length).toBeGreaterThan(50);
    expect(ALL_KEYS.size).toBeGreaterThan(300);
  });

  it('maps legacy users.level to the documented role keys', () => {
    expect(legacyRoleKeyForLevel(1)).toBe('super_admin');
    expect(legacyRoleKeyForLevel(2)).toBe('employee');
    expect(legacyRoleKeyForLevel(3)).toBe('branch_manager');
    expect(legacyRoleKeyForLevel(null)).toBe('employee');
    expect(legacyRoleKeyForLevel(undefined)).toBe('employee');
    expect(legacyRoleKeyForLevel(999)).toBe('employee');
  });
});

// ---------------------------------------------------------------------------------------
//  B. PURE INHERITANCE RESOLVER
// ---------------------------------------------------------------------------------------

describe('B. permission resolver (inheritance semantics)', () => {
  it('denies by default when nothing is explicit', () => {
    expect(effectiveForRole([], TREE).size).toBe(0);
    expect(resolveCell('root.mid.leaf', 'view', indexCells([]), TREE.ancestry)).toBeUndefined();
  });

  it('inherits an ancestor allow down the whole branch', () => {
    const keys = effectiveForRole([cell('root', 'view', 'allow')], TREE);
    expect(keys.has('root:view')).toBe(true);
    expect(keys.has('root.mid:view')).toBe(true);
    expect(keys.has('root.mid.leaf:view')).toBe(true);
    expect(keys.has('other:view')).toBe(false); // sibling tree untouched
  });

  it('nearest explicit ancestor wins over a farther one', () => {
    const keys = effectiveForRole(
      [cell('root', 'view', 'allow'), cell('root.mid', 'view', 'deny')],
      TREE,
    );
    expect(keys.has('root:view')).toBe(true);
    expect(keys.has('root.mid:view')).toBe(false);
    expect(keys.has('root.mid.leaf:view')).toBe(false); // deny propagates down
  });

  it('a deeper allow re-opens a branch denied higher up', () => {
    const keys = effectiveForRole(
      [
        cell('root', 'view', 'allow'),
        cell('root.mid', 'view', 'deny'),
        cell('root.mid.leaf', 'view', 'allow'),
      ],
      TREE,
    );
    expect(keys.has('root.mid:view')).toBe(false);
    expect(keys.has('root.mid.leaf:view')).toBe(true);
  });

  it('inheritance is per-action, not per-resource', () => {
    const keys = effectiveForRole([cell('root', 'view', 'allow')], TREE);
    expect(keys.has('root.mid:view')).toBe(true);
    expect(keys.has('root.mid:delete')).toBe(false);
  });

  it('reports the deciding ancestor for the matrix UI', () => {
    const leaf = resolveMatrix([cell('root', 'view', 'allow')], TREE).find(
      (c) => c.resourceKey === 'root.mid.leaf' && c.actionKey === 'view',
    );
    expect(leaf).toMatchObject({ explicit: null, effective: 'allow', inheritedFrom: 'root' });
  });

  it('marks a self-set cell as explicit with no inheritedFrom', () => {
    const self = resolveMatrix([cell('root.mid', 'update', 'deny')], TREE).find(
      (c) => c.resourceKey === 'root.mid' && c.actionKey === 'update',
    );
    expect(self).toMatchObject({ explicit: 'deny', effective: 'deny', inheritedFrom: null });
  });

  it('emits exactly one matrix cell per applicable (resource, action)', () => {
    const states = resolveMatrix([], TREE);
    const expected = [...TREE.resourceActions.values()].reduce((n, a) => n + a.length, 0);
    expect(states.length).toBe(expected);
    expect(new Set(states.map((s) => `${s.resourceKey}:${s.actionKey}`)).size).toBe(expected);
  });

  it('survives a cyclic ancestry without hanging (cycle guard)', () => {
    const cyclic: ResolveInput = {
      resourceActions: new Map([['a', ['view']], ['b', ['view']]]),
      ancestry: new Map([['a', 'b'], ['b', 'a']]),
    };
    expect(effectiveForRole([], cyclic).size).toBe(0);
    expect(effectiveForRole([cell('b', 'view', 'allow')], cyclic).has('a:view')).toBe(true);
  });

  it('unions roles with allow winning across them', () => {
    const a = effectiveForRole([cell('root.mid', 'view', 'allow')], TREE);
    const b = effectiveForRole([cell('root.mid', 'view', 'deny'), cell('other', 'view', 'allow')], TREE);
    const u = unionRoles([a, b]);
    expect(u.has('root.mid:view')).toBe(true); // allow from role A wins the union
    expect(u.has('other:view')).toBe(true);
  });

  it('applies exceptions: allow adds, deny removes, deny wins on the same cell', () => {
    const base = new Set(['root:view', 'root.mid:view']);
    const out = applyExceptions(base, [
      cell('other', 'view', 'allow'),
      cell('root.mid', 'view', 'deny'),
      cell('root', 'view', 'allow'),
      cell('root', 'view', 'deny'),
    ]);
    expect(out.has('other:view')).toBe(true);
    expect(out.has('root.mid:view')).toBe(false);
    expect(out.has('root:view')).toBe(false); // deny beats allow on the same cell
  });

  it('exceptions apply to the exact cell only — they do not cascade', () => {
    const keys = effectiveForUser(
      [[cell('root', 'view', 'allow')]],
      [cell('root.mid', 'view', 'deny')],
      TREE,
    );
    expect(keys.has('root.mid:view')).toBe(false);
    expect(keys.has('root.mid.leaf:view')).toBe(true); // child keeps the inherited allow
  });

  it('runs the full role+exception pipeline', () => {
    const keys = effectiveForUser(
      [[cell('root', 'view', 'allow')], [cell('other', 'view', 'allow')]],
      [cell('root.mid.leaf', 'delete', 'allow')],
      TREE,
    );
    expect([...keys].sort()).toEqual(
      ['other:view', 'root.mid.leaf:delete', 'root.mid.leaf:view', 'root.mid:view', 'root:view'].sort(),
    );
  });

  it('ignores cells for resources/actions outside the matrix', () => {
    const keys = effectiveForRole([cell('ghost', 'view', 'allow'), cell('root', 'nope', 'allow')], TREE);
    expect(keys.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
//  C. PERMISSION CACHE
// ---------------------------------------------------------------------------------------

describe('C. permission cache', () => {
  const result = () => ({ superAdmin: false, keys: new Set(['x:view']), scope: new Map() });

  it('returns a miss for an unknown user', () => {
    expect(new PermissionCacheService().get(1)).toBeUndefined();
  });

  it('stores and returns the same object', () => {
    const c = new PermissionCacheService();
    const r = result();
    c.set(7, r);
    expect(c.get(7)).toBe(r);
  });

  it('expires entries after the 2-minute TTL', () => {
    const c = new PermissionCacheService();
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(0);
    c.set(7, result());
    now.mockReturnValue(119_000);
    expect(c.get(7)).toBeDefined();
    now.mockReturnValue(121_000);
    expect(c.get(7)).toBeUndefined();
    now.mockRestore();
  });

  it('invalidates one user, many users, and all', () => {
    const c = new PermissionCacheService();
    c.set(1, result()); c.set(2, result()); c.set(3, result());
    c.invalidateUser(1);
    expect(c.get(1)).toBeUndefined();
    expect(c.get(2)).toBeDefined();
    c.invalidateUsers([2, 3]);
    expect(c.get(2)).toBeUndefined();
    expect(c.get(3)).toBeUndefined();
    c.set(4, result());
    c.invalidateAll();
    expect(c.get(4)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------
//  D. RUNTIME ENGINE
// ---------------------------------------------------------------------------------------

describe('D. permission engine', () => {
  it('grants legacy level-1 users full access without touching RBAC tables', async () => {
    const { engine } = makeEngine({ level: 1 });
    const eff = await engine.getEffective(10);
    expect(eff.superAdmin).toBe(true);
    expect(eff.keys.size).toBe(ALL_KEYS.size);
    expect(await engine.can(10, 'admin.roles', 'manage')).toBe(true);
    expect(await engine.scopeFor(10, 'club.members')).toBe('global');
  });

  it('short-circuits a user holding a super-admin role', async () => {
    const { engine } = makeEngine({
      level: 2,
      userRoles: [{ role_id: 9, role: { is_super_admin: true } }],
    });
    expect(await engine.isSuperAdmin(11)).toBe(true);
    expect(await engine.canAny(11, ['nonexistent:action'])).toBe(true);
  });

  it('falls back to the legacy-level role when the user has no RBAC role', async () => {
    const { engine } = makeEngine({
      level: 3,
      userRoles: [],
      roleByKey: { branch_manager: { id: 5, is_super_admin: false } },
      rolePerms: [{ role_id: 5, resourceKey: 'club.members', actionKey: 'view', effect: 'allow' }],
    });
    const eff = await engine.getEffective(12);
    expect(eff.superAdmin).toBe(false);
    expect(eff.keys.has('club.members:view')).toBe(true);
  });

  it('honours a super-admin fallback role', async () => {
    const { engine } = makeEngine({
      level: 3,
      userRoles: [],
      roleByKey: { branch_manager: { id: 5, is_super_admin: true } },
    });
    expect(await engine.isSuperAdmin(13)).toBe(true);
  });

  it('grants nothing when there is no role and no fallback row', async () => {
    const { engine } = makeEngine({ level: 2, userRoles: [], roleByKey: {} });
    const eff = await engine.getEffective(14);
    expect(eff.superAdmin).toBe(false);
    expect(eff.keys.size).toBe(0);
    expect(await engine.can(14, 'club.members', 'view')).toBe(false);
  });

  it('filters expired role assignments at the query level', async () => {
    const db: FakeDb = { level: 2, userRoles: [], roleByKey: {} };
    const prisma = fakePrisma(db);
    const engine = new PermissionEngineService(prisma, new PermissionCacheService());
    await engine.getEffective(15);
    const where = (prisma.rbac_user_roles.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.OR).toEqual([{ expires_at: null }, { expires_at: { gt: expect.any(Date) } }]);
  });

  it('filters expired user exceptions at the query level', async () => {
    const db: FakeDb = { level: 2, userRoles: [{ role_id: 5, role: { is_super_admin: false } }] };
    const prisma = fakePrisma(db);
    const engine = new PermissionEngineService(prisma, new PermissionCacheService());
    await engine.getEffective(16);
    const where = (prisma.rbac_user_exceptions.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.OR).toEqual([{ expires_at: null }, { expires_at: { gt: expect.any(Date) } }]);
  });

  it('unions multiple roles and then applies user exceptions', async () => {
    const { engine } = makeEngine({
      level: 2,
      userRoles: [
        { role_id: 1, role: { is_super_admin: false } },
        { role_id: 2, role: { is_super_admin: false } },
      ],
      rolePerms: [
        { role_id: 1, resourceKey: 'club.members', actionKey: 'view', effect: 'allow' },
        { role_id: 2, resourceKey: 'club.members', actionKey: 'delete', effect: 'allow' },
      ],
      exceptions: [{ resourceKey: 'club.members', actionKey: 'delete', effect: 'deny' }],
    });
    const eff = await engine.getEffective(17);
    expect(eff.keys.has('club.members:view')).toBe(true);
    expect(eff.keys.has('club.members:delete')).toBe(false); // exception deny wins
  });

  it('lets an exception grant a permission no role provides', async () => {
    const { engine } = makeEngine({
      level: 2,
      userRoles: [{ role_id: 1, role: { is_super_admin: false } }],
      rolePerms: [],
      exceptions: [{ resourceKey: 'admin.audit', actionKey: 'view', effect: 'allow' }],
    });
    expect(await engine.can(18, 'admin.audit', 'view')).toBe(true);
  });

  it('resolves canAny with OR logic', async () => {
    const { engine } = makeEngine({
      level: 2,
      userRoles: [{ role_id: 1, role: { is_super_admin: false } }],
      rolePerms: [{ role_id: 1, resourceKey: 'admin.audit', actionKey: 'view', effect: 'allow' }],
    });
    expect(await engine.canAny(19, ['nope:view', 'admin.audit:view'])).toBe(true);
    expect(await engine.canAny(19, ['nope:view', 'still-nope:view'])).toBe(false);
    expect(await engine.canAny(19, [])).toBe(false);
  });

  it('picks the broadest data scope across roles', async () => {
    const { engine } = makeEngine({
      level: 2,
      userRoles: [
        { role_id: 1, role: { is_super_admin: false } },
        { role_id: 2, role: { is_super_admin: false } },
      ],
      scopes: [
        { role_id: 1, resourceKey: 'club.members', scope: 'own' },
        { role_id: 2, resourceKey: 'club.members', scope: 'branch' },
      ],
    });
    expect(await engine.scopeFor(20, 'club.members')).toBe('branch');
    expect(await engine.scopeFor(20, 'admin.audit')).toBeUndefined();
  });

  it('caches the resolved set and re-queries after invalidation', async () => {
    const db: FakeDb = { level: 2, userRoles: [{ role_id: 1, role: { is_super_admin: false } }] };
    const prisma = fakePrisma(db);
    const engine = new PermissionEngineService(prisma, new PermissionCacheService());
    await engine.getEffective(21);
    await engine.getEffective(21);
    expect((prisma.rbac_user_roles.findMany as jest.Mock).mock.calls.length).toBe(1);
    engine.invalidateUser(21);
    await engine.getEffective(21);
    expect((prisma.rbac_user_roles.findMany as jest.Mock).mock.calls.length).toBe(2);
  });

  it('invalidateAll drops every cached user', async () => {
    const db: FakeDb = { level: 2, userRoles: [{ role_id: 1, role: { is_super_admin: false } }] };
    const prisma = fakePrisma(db);
    const engine = new PermissionEngineService(prisma, new PermissionCacheService());
    await engine.getEffective(22);
    engine.invalidateAll();
    await engine.getEffective(22);
    expect((prisma.rbac_user_roles.findMany as jest.Mock).mock.calls.length).toBe(2);
  });

  it('memoises the catalog id maps and rebuilds after invalidateCatalog', async () => {
    const prisma = fakePrisma({ level: 2, userRoles: [] });
    const engine = new PermissionEngineService(prisma, new PermissionCacheService());
    await engine.getCatalogMaps();
    await engine.getCatalogMaps();
    expect((prisma.rbac_resources.findMany as jest.Mock).mock.calls.length).toBe(1);
    engine.invalidateCatalog();
    await engine.getCatalogMaps();
    expect((prisma.rbac_resources.findMany as jest.Mock).mock.calls.length).toBe(2);
  });

  it('ignores stored cells whose resource/action ids are unknown', async () => {
    const prisma = fakePrisma({ level: 2, userRoles: [{ role_id: 1, role: { is_super_admin: false } }] });
    (prisma.rbac_role_permissions.findMany as jest.Mock).mockResolvedValue([
      { role_id: 1, resource_id: 999_999, action_id: 999_999, effect: 'allow' },
    ]);
    const engine = new PermissionEngineService(prisma, new PermissionCacheService());
    const eff = await engine.getEffective(23);
    expect(eff.keys.size).toBe(0);
  });

  it('treats a missing user row as an ordinary un-privileged account', async () => {
    const { engine } = makeEngine({ level: undefined, userRoles: [], roleByKey: {} });
    const eff = await engine.getEffective(24);
    expect(eff.superAdmin).toBe(false);
    expect(eff.keys.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
//  E. PERMISSIONS GUARD
// ---------------------------------------------------------------------------------------

describe('E. PermissionsGuard', () => {
  const ctx = (user: unknown): ExecutionContext =>
    ({
      getHandler: () => function handler() {},
      getClass: () => class Ctrl {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const build = (
    meta: Partial<Record<string, unknown>>,
    engine: Partial<PermissionEngineService> = {},
    prisma: unknown = {},
  ) => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => meta[key]),
    } as unknown as Reflector;
    return new PermissionsGuard(reflector, prisma as PrismaService, engine as PermissionEngineService);
  };

  it('lets a @Public route through without a user', async () => {
    const guard = build({ [IS_PUBLIC_KEY]: true });
    await expect(guard.canActivate(ctx(undefined))).resolves.toBe(true);
  });

  it('allows an un-decorated route for any authenticated user (documented legacy default)', async () => {
    const guard = build({});
    await expect(guard.canActivate(ctx({ sub: 1 }))).resolves.toBe(true);
  });

  it('allows when canAny passes', async () => {
    const canAny = jest.fn().mockResolvedValue(true);
    const guard = build({ [REQUIRES_PERMISSION_KEY]: ['club.members:view'] }, { canAny } as never);
    await expect(guard.canActivate(ctx({ sub: 42 }))).resolves.toBe(true);
    expect(canAny).toHaveBeenCalledWith(42, ['club.members:view']);
  });

  it('throws 403 when canAny fails', async () => {
    const guard = build(
      { [REQUIRES_PERMISSION_KEY]: ['club.members:delete'] },
      { canAny: jest.fn().mockResolvedValue(false) } as never,
    );
    await expect(guard.canActivate(ctx({ sub: 42 }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws 403 when the route needs a permission but no user is attached', async () => {
    const canAny = jest.fn();
    const guard = build({ [REQUIRES_PERMISSION_KEY]: ['club.members:view'] }, { canAny } as never);
    await expect(guard.canActivate(ctx(undefined))).rejects.toBeInstanceOf(ForbiddenException);
    expect(canAny).not.toHaveBeenCalled();
  });

  it('passes every declared key to canAny so OR logic is evaluated server-side', async () => {
    const canAny = jest.fn().mockResolvedValue(true);
    const keys = ['a:view', 'b:view', 'c:view'];
    const guard = build({ [REQUIRES_PERMISSION_KEY]: keys }, { canAny } as never);
    await guard.canActivate(ctx({ sub: 1 }));
    expect(canAny).toHaveBeenCalledWith(1, keys);
  });

  it('RBAC metadata takes precedence over a legacy @RequiresPage on the same route', async () => {
    const findFirst = jest.fn();
    const guard = build(
      { [REQUIRES_PERMISSION_KEY]: ['admin.roles:view'], [REQUIRES_PAGE_KEY]: 'Admin/Roles' },
      { canAny: jest.fn().mockResolvedValue(true) } as never,
      { pages: { findFirst } },
    );
    await expect(guard.canActivate(ctx({ sub: 1 }))).resolves.toBe(true);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('an empty @RequiresPermission([]) falls through to the legacy path, not an open allow', async () => {
    const guard = build({ [REQUIRES_PERMISSION_KEY]: [], [REQUIRES_PAGE_KEY]: 'Admin/Roles' }, {} as never, {
      pages: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(guard.canActivate(ctx({ sub: 1 }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('legacy @RequiresPage path', () => {
    const legacyGuard = (page: unknown, grant: unknown, user: unknown = { sub: 7 }) => {
      const prisma = {
        pages: { findFirst: jest.fn().mockResolvedValue(page) },
        permissions: { findUnique: jest.fn().mockResolvedValue(grant) },
      };
      const guard = build({ [REQUIRES_PAGE_KEY]: 'Club/Members' }, {} as never, prisma);
      return { guard, prisma, run: () => guard.canActivate(ctx(user)) };
    };

    it('allows when the user holds the page grant', async () => {
      const { run, prisma } = legacyGuard({ page_id: 3 }, { user_id: 7 });
      await expect(run()).resolves.toBe(true);
      expect(prisma.permissions.findUnique).toHaveBeenCalledWith({
        where: { user_id_page_id_fk: { user_id: 7, page_id_fk: 3 } },
        select: { user_id: true },
      });
    });

    it('denies when the page row does not exist (fail closed)', async () => {
      const { run } = legacyGuard(null, { user_id: 7 });
      await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('denies when the user has no grant for the page', async () => {
      const { run } = legacyGuard({ page_id: 3 }, null);
      await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('denies when no user is attached', async () => {
      const { run } = legacyGuard({ page_id: 3 }, { user_id: 7 }, null);
      await expect(run()).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

// ---------------------------------------------------------------------------------------
//  F. ROUTE COVERAGE AUDIT (static scan of every controller)
// ---------------------------------------------------------------------------------------

describe('F. route permission coverage', () => {
  const SRC = path.resolve(__dirname, '../..');
  const controllers: string[] = [];
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.controller.ts')) controllers.push(p);
    }
  })(SRC);

  const sources = controllers.map((f) => ({ file: path.relative(SRC, f), src: fs.readFileSync(f, 'utf8') }));

  it('finds the controller layer', () => {
    expect(controllers.length).toBeGreaterThan(50);
  });

  it('every @RequiresPermission key is `resource:action` shaped', () => {
    const bad: string[] = [];
    for (const { file, src } of sources) {
      for (const m of src.matchAll(/@RequiresPermission\(([^)]*)\)/gs)) {
        for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) {
          if (!/^[a-z0-9_.-]+:[a-z]+$/i.test(q[1])) bad.push(`${file}: ${q[1]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('every @RequiresPermission key names a resource that exists in the catalog', () => {
    const resources = new Set(FLAT.map((r) => r.key));
    const unknown = new Set<string>();
    for (const { file, src } of sources) {
      for (const m of src.matchAll(/@RequiresPermission\(([^)]*)\)/gs)) {
        for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) {
          const res = q[1].slice(0, q[1].lastIndexOf(':'));
          if (res && !resources.has(res)) unknown.add(`${file}: ${q[1]}`);
        }
      }
    }
    expect([...unknown]).toEqual([]);
  });

  it('every @RequiresPermission key names an action applicable to that resource', () => {
    const notApplicable = new Set<string>();
    for (const { file, src } of sources) {
      for (const m of src.matchAll(/@RequiresPermission\(([^)]*)\)/gs)) {
        for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) {
          if (!ALL_KEYS.has(q[1])) notApplicable.add(`${file}: ${q[1]}`);
        }
      }
    }
    expect([...notApplicable]).toEqual([]);
  });

  it('never guards a DELETE route with a read-only permission', () => {
    const offenders: string[] = [];
    for (const { file, src } of sources) {
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (!/^\s*@Delete\(/.test(line)) return;
        // Single-line route definitions carry their own decorator; multi-line ones
        // have it on an adjacent line. Never mix the two, or a neighbouring route's
        // `:view` decorator gets attributed to this DELETE.
        let scope = line;
        if (!/@RequiresPermission\(/.test(line)) {
          const around: string[] = [];
          for (let k = i - 1; k >= 0 && lines[k].trim().startsWith('@'); k--) around.push(lines[k]);
          for (let k = i + 1; k < lines.length && lines[k].trim().startsWith('@'); k++) around.push(lines[k]);
          scope = around.join(' ');
        }
        const m = scope.match(/@RequiresPermission\(([^)]*)\)/s);
        if (!m) return;
        const keys = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
        if (keys.length && keys.every((k) => k.endsWith(':view'))) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------
//  G. ANTI-ESCALATION IN THE ADMIN SERVICES
// ---------------------------------------------------------------------------------------

describe('G. privilege-escalation controls', () => {
  const audit = { log: jest.fn().mockResolvedValue(undefined) } as never;

  const engineStub = (editorKeys: string[], superAdmin = false) =>
    ({
      getResolveInput: () => ({
        resourceActions: new Map(FLAT.map((r) => [r.key, r.actions as string[]])),
        ancestry: buildAncestry(FLAT),
      }),
      getEffective: jest.fn().mockResolvedValue({
        superAdmin,
        keys: new Set(editorKeys),
        scope: new Map(),
      }),
      getCatalogMaps: jest.fn().mockResolvedValue({
        resourceIdToKey: new Map(RESOURCE_ROWS.map((r) => [r.id, r.key])),
        actionIdToKey: new Map(ACTION_ROWS.map((a) => [a.id, a.key])),
        resourceKeyToId: RES_ID,
        actionKeyToId: ACT_ID,
      }),
      getAllKeys: () => ALL_KEYS,
      resolveCellStates: () => [],
      invalidateRole: jest.fn().mockResolvedValue(undefined),
      invalidateUser: jest.fn(),
      isSuperAdmin: jest.fn().mockResolvedValue(false),
    }) as unknown as PermissionEngineService;

  const rolesPrisma = () =>
    ({
      rbac_roles: { findUnique: jest.fn().mockResolvedValue({ id: 3, key: 'ops', name_ar: 'ops', name_en: null, description: null, is_system: false, is_super_admin: false }) },
      rbac_role_permissions: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn(), deleteMany: jest.fn() },
      rbac_user_roles: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockResolvedValue([]),
    }) as unknown as PrismaService;

  describe('role matrix', () => {
    it('blocks granting a permission the editor does not hold', async () => {
      const svc = new RbacRolesService(rolesPrisma(), engineStub(['club.members:view']), audit);
      await expect(
        svc.saveMatrix(3, { changes: [{ resourceKey: 'admin.roles', actionKey: 'manage', state: 'allow' }] }, 99),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows granting a permission the editor does hold', async () => {
      const prisma = rolesPrisma();
      const svc = new RbacRolesService(prisma, engineStub(['club.members:view']), audit);
      await expect(
        svc.saveMatrix(3, { changes: [{ resourceKey: 'club.members', actionKey: 'view', state: 'allow' }] }, 99),
      ).resolves.toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('lets a super-admin editor grant anything', async () => {
      const svc = new RbacRolesService(rolesPrisma(), engineStub([], true), audit);
      await expect(
        svc.saveMatrix(3, { changes: [{ resourceKey: 'admin.roles', actionKey: 'manage', state: 'allow' }] }, 1),
      ).resolves.toBeDefined();
    });

    it('rejects a cell that does not exist in the catalog', async () => {
      const svc = new RbacRolesService(rolesPrisma(), engineStub([], true), audit);
      await expect(
        svc.saveMatrix(3, { changes: [{ resourceKey: 'made.up', actionKey: 'view', state: 'allow' }] }, 1),
      ).rejects.toThrow(/غير صالحة/);
    });

    it('rejects an action not applicable to an otherwise real resource', async () => {
      const svc = new RbacRolesService(rolesPrisma(), engineStub([], true), audit);
      await expect(
        svc.saveMatrix(3, { changes: [{ resourceKey: 'admin.audit', actionKey: 'delete', state: 'allow' }] }, 1),
      ).rejects.toThrow(/غير صالحة/);
    });

    it('never writes a matrix onto a super-admin role', async () => {
      const prisma = rolesPrisma();
      (prisma.rbac_roles.findUnique as jest.Mock).mockResolvedValue({
        id: 1, key: 'super_admin', name_ar: 'x', name_en: null, description: null, is_system: true, is_super_admin: true,
      });
      const svc = new RbacRolesService(prisma, engineStub([], true), audit);
      await expect(svc.saveMatrix(1, { changes: [] }, 1)).rejects.toThrow(/المدير العام/);
    });

    it('revoking is not an escalation and needs no editor privilege', async () => {
      const prisma = rolesPrisma();
      (prisma.rbac_role_permissions.findMany as jest.Mock).mockResolvedValue([
        { resource_id: RES_ID.get('admin.roles')!, action_id: ACT_ID.get('manage')!, effect: 'allow' },
      ]);
      const svc = new RbacRolesService(prisma, engineStub([]), audit);
      await expect(
        svc.saveMatrix(3, { changes: [{ resourceKey: 'admin.roles', actionKey: 'manage', state: 'inherit' }] }, 99),
      ).resolves.toBeDefined();
    });

    it('invalidates the cache of every user holding the edited role', async () => {
      const engine = engineStub([], true);
      const svc = new RbacRolesService(rolesPrisma(), engine, audit);
      await svc.saveMatrix(3, { changes: [] }, 1);
      expect(engine.invalidateRole).toHaveBeenCalledWith(3);
    });

    it('writes an audit entry for every matrix save', async () => {
      const log = jest.fn().mockResolvedValue(undefined);
      const svc = new RbacRolesService(rolesPrisma(), engineStub([], true), { log } as never);
      await svc.saveMatrix(3, { changes: [] }, 77);
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 77, action: 'role.matrix.update', targetId: 3 }));
    });
  });

  describe('user exceptions', () => {
    const usersPrisma = () =>
      ({
        users: { findUnique: jest.fn().mockResolvedValue({ user_id: 5, username: 'u', name: 'n' }) },
        rbac_user_exceptions: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn(), deleteMany: jest.fn() },
        rbac_user_roles: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn().mockResolvedValue([]),
      }) as unknown as PrismaService;

    it('blocks allowing a permission the editor does not hold', async () => {
      const svc = new RbacUsersService(usersPrisma(), engineStub(['club.members:view']), audit);
      await expect(
        svc.setExceptions(5, { changes: [{ resourceKey: 'admin.roles', actionKey: 'manage', state: 'allow' }] }, 99),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('permits a DENY exception for a permission the editor does not hold', async () => {
      const prisma = usersPrisma();
      const svc = new RbacUsersService(prisma, engineStub([]), audit);
      await expect(
        svc.setExceptions(5, { changes: [{ resourceKey: 'admin.roles', actionKey: 'manage', state: 'deny' }] }, 99),
      ).resolves.toBeDefined();
    });

    it('rejects an exception on a non-existent cell', async () => {
      const svc = new RbacUsersService(usersPrisma(), engineStub([], true), audit);
      await expect(
        svc.setExceptions(5, { changes: [{ resourceKey: 'nope', actionKey: 'view', state: 'allow' }] }, 1),
      ).rejects.toThrow(/غير صالحة/);
    });

    it('invalidates the target user cache after an exception change', async () => {
      const engine = engineStub([], true);
      const svc = new RbacUsersService(usersPrisma(), engine, audit);
      await svc.setExceptions(5, { changes: [] }, 1);
      expect(engine.invalidateUser).toHaveBeenCalledWith(5);
    });

    it('audits and invalidates when exceptions are cleared', async () => {
      const engine = engineStub([], true);
      const log = jest.fn().mockResolvedValue(undefined);
      const svc = new RbacUsersService(usersPrisma(), engine, { log } as never);
      await svc.clearExceptions(5, 77);
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 77, action: 'exception.clear', targetId: 5 }));
      expect(engine.invalidateUser).toHaveBeenCalledWith(5);
    });
  });

  describe('role assignment', () => {
    const assignPrisma = (roles: { id: number }[]) =>
      ({
        users: { findUnique: jest.fn().mockResolvedValue({ user_id: 5, username: 'u', name: 'n' }) },
        rbac_roles: { findMany: jest.fn().mockResolvedValue(roles) },
        rbac_user_roles: { deleteMany: jest.fn(), upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn().mockResolvedValue([]),
      }) as unknown as PrismaService;

    it('drops role ids that do not exist', async () => {
      const prisma = assignPrisma([{ id: 2 }]);
      const svc = new RbacUsersService(prisma, engineStub([], true), audit);
      await expect(svc.setUserRoles(5, { roleIds: [2, 4040] }, 1)).resolves.toEqual({ userId: 5, roleIds: [2] });
    });

    it('de-duplicates repeated role ids', async () => {
      const prisma = assignPrisma([{ id: 2 }]);
      const svc = new RbacUsersService(prisma, engineStub([], true), audit);
      await expect(svc.setUserRoles(5, { roleIds: [2, 2, 2] }, 1)).resolves.toEqual({ userId: 5, roleIds: [2] });
    });

    it('audits and invalidates the target user', async () => {
      const engine = engineStub([], true);
      const log = jest.fn().mockResolvedValue(undefined);
      const svc = new RbacUsersService(assignPrisma([{ id: 2 }]), engine, { log } as never);
      await svc.setUserRoles(5, { roleIds: [2] }, 77);
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 77, action: 'role.assign', targetId: 5 }));
      expect(engine.invalidateUser).toHaveBeenCalledWith(5);
    });

    /**
     * FINDING (H-1). saveMatrix and setExceptions both refuse to grant a permission the
     * editor does not hold, but setUserRoles applies no such check: a non-super-admin
     * holding `admin.roles:manage` can assign ANY role — including a super-admin role,
     * and including to themselves. This test pins the CURRENT behaviour; flip it to
     * `.rejects` once the gap is closed.
     */
    it('KNOWN GAP: assigning a super-admin role is not blocked for a non-super-admin editor', async () => {
      const prisma = assignPrisma([{ id: 1 }]); // role 1 = super_admin
      const svc = new RbacUsersService(prisma, engineStub(['admin.roles:manage']), audit);
      await expect(svc.setUserRoles(5, { roleIds: [1] }, 99)).resolves.toEqual({ userId: 5, roleIds: [1] });
    });

    it('KNOWN GAP: an admin can grant a role to their own account (self-escalation)', async () => {
      const prisma = assignPrisma([{ id: 1 }]);
      const svc = new RbacUsersService(prisma, engineStub(['admin.roles:manage']), audit);
      await expect(svc.setUserRoles(99, { roleIds: [1] }, 99)).resolves.toEqual({ userId: 99, roleIds: [1] });
    });
  });
});
