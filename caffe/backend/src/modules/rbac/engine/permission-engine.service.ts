import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ActionKey,
  buildAncestry,
  flattenCatalog,
  permKey,
} from '../catalog/rbac.catalog';
import {
  EffectiveResult,
  PermissionCacheService,
} from './permission-cache.service';
import { legacyRoleKeyForLevel } from '../legacy-level-roles';
import {
  CellState,
  effectiveForUser,
  resolveMatrix,
  ResolveInput,
  StoredCell,
} from './permission-resolver';

/** Data-scope ranking for "broadest wins". */
const SCOPE_RANK: Record<string, number> = {
  own: 1,
  team: 2,
  branch: 3,
  department: 4,
  global: 5,
};

interface CatalogMaps {
  resourceIdToKey: Map<number, string>;
  actionIdToKey: Map<number, string>;
  resourceKeyToId: Map<string, number>;
  actionKeyToId: Map<string, number>;
}

/**
 * Runtime permission engine. Loads roles/cells/exceptions from the DB, resolves the
 * effective set via the pure resolver (src/.../permission-resolver.ts), short-circuits
 * super-admin, and caches per user. The catalog (rbac.catalog.ts) supplies the tree
 * shape (ancestry + applicable actions) so resolution matches the seeded DB exactly.
 */
@Injectable()
export class PermissionEngineService {
  private readonly flat = flattenCatalog();
  private readonly ancestry = buildAncestry(this.flat);
  private readonly resourceActions: Map<string, string[]> = new Map(
    this.flat.map((r) => [r.key, r.actions as string[]]),
  );
  private readonly resolveInput: ResolveInput = {
    resourceActions: this.resourceActions,
    ancestry: this.ancestry,
  };
  /** Every applicable permission key — used as the super-admin set. */
  private readonly allKeys: Set<string> = new Set(
    this.flat.flatMap((r) => r.actions.map((a) => permKey(r.key, a))),
  );

  private catalogMaps?: CatalogMaps;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PermissionCacheService,
  ) {}

  // ---- public API ---------------------------------------------------------------------

  /** Resolve (and cache) a user's effective permission set. */
  async getEffective(userId: number): Promise<EffectiveResult> {
    const cached = this.cache.get(userId);
    if (cached) return cached;

    const now = new Date();
    const legacyUser = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { level: true },
    });

    // Legacy CI parity: level 1 always had full admin access, even before RBAC was seeded.
    if (legacyUser?.level === 1) {
      const result = this.superAdminResult();
      this.cache.set(userId, result);
      return result;
    }

    const userRoles = await this.prisma.rbac_user_roles.findMany({
      where: { user_id: userId, OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
      select: { role_id: true, role: { select: { is_super_admin: true } } },
    });

    // Super-admin roles bypass all checks.
    if (userRoles.some((r) => r.role?.is_super_admin)) {
      const result = this.superAdminResult();
      this.cache.set(userId, result);
      return result;
    }

    let roleIds = userRoles.map((r) => r.role_id);

    // Un-roled accounts: derive the starter matrix from legacy users.level (same as seed-rbac).
    if (roleIds.length === 0) {
      const roleKey = legacyRoleKeyForLevel(legacyUser?.level);
      const fallback = await this.prisma.rbac_roles.findUnique({
        where: { key: roleKey },
        select: { id: true, is_super_admin: true },
      });
      if (fallback?.is_super_admin) {
        const result = this.superAdminResult();
        this.cache.set(userId, result);
        return result;
      }
      if (fallback) roleIds = [fallback.id];
    }

    if (roleIds.length === 0) {
      const result: EffectiveResult = { superAdmin: false, keys: new Set(), scope: new Map() };
      this.cache.set(userId, result);
      return result;
    }

    const result = await this.resolveFromRoleIds(userId, roleIds, now);
    this.cache.set(userId, result);
    return result;
  }

  private superAdminResult(): EffectiveResult {
    return {
      superAdmin: true,
      keys: this.allKeys,
      scope: new Map(this.flat.map((r) => [r.key, 'global'])),
    };
  }

  private async resolveFromRoleIds(
    userId: number,
    roleIds: number[],
    now: Date,
  ): Promise<EffectiveResult> {
    const maps = await this.getCatalogMaps();

    const [cells, exceptions, scopes] = await Promise.all([
      this.prisma.rbac_role_permissions.findMany({
        where: { role_id: { in: roleIds } },
        select: { role_id: true, resource_id: true, action_id: true, effect: true },
      }),
      this.prisma.rbac_user_exceptions.findMany({
        where: { user_id: userId, OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
        select: { resource_id: true, action_id: true, effect: true },
      }),
      this.prisma.rbac_role_scopes.findMany({
        where: { role_id: { in: roleIds } },
        select: { resource_id: true, scope: true },
      }),
    ]);

    const perRole = new Map<number, StoredCell[]>();
    for (const id of roleIds) perRole.set(id, []);
    for (const c of cells) {
      const resourceKey = maps.resourceIdToKey.get(c.resource_id);
      const actionKey = maps.actionIdToKey.get(c.action_id);
      if (!resourceKey || !actionKey) continue;
      perRole.get(c.role_id)?.push({ resourceKey, actionKey, effect: c.effect as 'allow' | 'deny' });
    }

    const exceptionCells: StoredCell[] = exceptions
      .map((e) => ({
        resourceKey: maps.resourceIdToKey.get(e.resource_id)!,
        actionKey: maps.actionIdToKey.get(e.action_id)!,
        effect: e.effect as 'allow' | 'deny',
      }))
      .filter((e) => e.resourceKey && e.actionKey);

    const keys = effectiveForUser([...perRole.values()], exceptionCells, this.resolveInput);

    const scope = new Map<string, string>();
    for (const s of scopes) {
      const resourceKey = maps.resourceIdToKey.get(s.resource_id);
      if (!resourceKey) continue;
      const prev = scope.get(resourceKey);
      if (!prev || SCOPE_RANK[s.scope] > SCOPE_RANK[prev]) scope.set(resourceKey, s.scope);
    }

    return { superAdmin: false, keys, scope };
  }

  /** Does the user have a specific permission? */
  async can(userId: number, resourceKey: string, action: ActionKey | string): Promise<boolean> {
    const eff = await this.getEffective(userId);
    return eff.superAdmin || eff.keys.has(permKey(resourceKey, action));
  }

  /** OR-logic: passes if the user has ANY of the given `resource:action` keys. */
  async canAny(userId: number, keys: string[]): Promise<boolean> {
    const eff = await this.getEffective(userId);
    if (eff.superAdmin) return true;
    return keys.some((k) => eff.keys.has(k));
  }

  async isSuperAdmin(userId: number): Promise<boolean> {
    return (await this.getEffective(userId)).superAdmin;
  }

  /** Effective data scope for a resource (default 'global' for super-admin, else undefined). */
  async scopeFor(userId: number, resourceKey: string): Promise<string | undefined> {
    const eff = await this.getEffective(userId);
    if (eff.superAdmin) return 'global';
    return eff.scope.get(resourceKey);
  }

  // ---- matrix helpers (for the role / exception editors) ------------------------------

  /** Per-cell resolution of ONE set of stored cells (a role, or a user's exceptions). */
  resolveCellStates(cells: StoredCell[]): CellState[] {
    return resolveMatrix(cells, this.resolveInput);
  }

  getResolveInput(): ResolveInput {
    return this.resolveInput;
  }

  getAllKeys(): Set<string> {
    return this.allKeys;
  }

  async getCatalogMaps(): Promise<CatalogMaps> {
    if (this.catalogMaps) return this.catalogMaps;
    const [resources, actions] = await Promise.all([
      this.prisma.rbac_resources.findMany({ select: { id: true, key: true } }),
      this.prisma.rbac_actions.findMany({ select: { id: true, key: true } }),
    ]);
    this.catalogMaps = {
      resourceIdToKey: new Map(resources.map((r) => [r.id, r.key])),
      actionIdToKey: new Map(actions.map((a) => [a.id, a.key])),
      resourceKeyToId: new Map(resources.map((r) => [r.key, r.id])),
      actionKeyToId: new Map(actions.map((a) => [a.key, a.id])),
    };
    return this.catalogMaps;
  }

  /** Drop the cached id<->key maps (call after re-seeding the catalog). */
  invalidateCatalog(): void {
    this.catalogMaps = undefined;
  }

  // ---- cache invalidation -------------------------------------------------------------

  invalidateUser(userId: number): void {
    this.cache.invalidateUser(userId);
  }

  invalidateUsers(userIds: Iterable<number>): void {
    this.cache.invalidateUsers(userIds);
  }

  /** Invalidate every user currently assigned the given role. */
  async invalidateRole(roleId: number): Promise<void> {
    const rows = await this.prisma.rbac_user_roles.findMany({
      where: { role_id: roleId },
      select: { user_id: true },
    });
    this.cache.invalidateUsers(rows.map((r) => r.user_id));
  }

  invalidateAll(): void {
    this.cache.invalidateAll();
  }
}
