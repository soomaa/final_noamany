import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { flattenCatalog, permKey } from '../catalog/rbac.catalog';
import { PermissionEngineService } from '../engine/permission-engine.service';
import { effectiveForRole, StoredCell, unionRoles } from '../engine/permission-resolver';
import { RbacAuditService } from './audit.service';
import { AssignRolesDto, SaveMatrixDto } from './dto/role.dto';

@Injectable()
export class RbacUsersService {
  private readonly flat = flattenCatalog();
  private readonly validCells = new Set(
    this.flat.flatMap((r) => r.actions.map((a) => permKey(r.key, a))),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PermissionEngineService,
    private readonly audit: RbacAuditService,
  ) {}

  // ---- user picker --------------------------------------------------------------------

  /** Staff users + their role badges, for the exceptions/roles pickers. */
  async listUsers(search?: string) {
    const s = search?.trim();
    const users = await this.prisma.users.findMany({
      where: s
        ? { OR: [{ name: { contains: s } }, { username: { contains: s } }] }
        : undefined,
      select: { user_id: true, username: true, name: true, level: true },
      orderBy: { user_id: 'desc' },
      take: 100,
    });
    const ids = users.map((u) => u.user_id);
    const links = ids.length
      ? await this.prisma.rbac_user_roles.findMany({
          where: { user_id: { in: ids } },
          select: { user_id: true, role: { select: { name_ar: true, is_super_admin: true } } },
        })
      : [];
    const byUser = new Map<number, { name: string; superAdmin: boolean }[]>();
    for (const l of links) {
      const arr = byUser.get(l.user_id) ?? [];
      arr.push({ name: l.role?.name_ar ?? '', superAdmin: l.role?.is_super_admin ?? false });
      byUser.set(l.user_id, arr);
    }
    return users.map((u) => ({
      userId: u.user_id,
      username: u.username,
      name: u.name,
      level: u.level,
      roles: byUser.get(u.user_id) ?? [],
    }));
  }

  // ---- role assignment ----------------------------------------------------------------

  async getUserRoles(userId: number) {
    const user = await this.getUserOrThrow(userId);
    const [roles, links] = await Promise.all([
      this.prisma.rbac_roles.findMany({ orderBy: [{ is_super_admin: 'desc' }, { id: 'asc' }] }),
      this.prisma.rbac_user_roles.findMany({ where: { user_id: userId } }),
    ]);
    const assigned = new Map(links.map((l) => [l.role_id, l]));
    return {
      user: { userId: user.user_id, username: user.username, name: user.name, level: user.level },
      roles: roles.map((r) => ({
        id: r.id,
        nameAr: r.name_ar,
        isSuperAdmin: r.is_super_admin,
        assigned: assigned.has(r.id),
        expiresAt: assigned.get(r.id)?.expires_at ?? null,
      })),
    };
  }

  async setUserRoles(userId: number, dto: AssignRolesDto, actorUserId: number) {
    await this.getUserOrThrow(userId);
    const wanted = [...new Set(dto.roleIds)];
    const valid = await this.prisma.rbac_roles.findMany({
      where: { id: { in: wanted } },
      select: { id: true },
    });
    const validIds = new Set(valid.map((v) => v.id));
    const filtered = wanted.filter((id) => validIds.has(id));

    await this.prisma.$transaction([
      this.prisma.rbac_user_roles.deleteMany({ where: { user_id: userId, role_id: { notIn: filtered.length ? filtered : [-1] } } }),
      ...filtered.map((role_id) =>
        this.prisma.rbac_user_roles.upsert({
          where: { user_id_role_id: { user_id: userId, role_id } },
          update: {},
          create: { user_id: userId, role_id, created_by: actorUserId },
        }),
      ),
    ]);

    await this.audit.log({ actorUserId, action: 'role.assign', targetType: 'user', targetId: userId, detail: { roleIds: filtered } });
    this.engine.invalidateUser(userId);
    return { userId, roleIds: filtered };
  }

  // ---- exceptions ---------------------------------------------------------------------

  async getExceptions(userId: number) {
    const user = await this.getUserOrThrow(userId);
    const superAdmin = await this.engine.isSuperAdmin(userId);

    const roleNames = await this.userRoleBadges(userId);

    if (superAdmin) {
      return {
        user: { userId: user.user_id, username: user.username, name: user.name },
        roles: roleNames,
        superAdmin: true,
        cells: [],
        stats: { additionalAllows: 0, explicitDenies: 0, inheritedFromRoles: this.engine.getAllKeys().size },
      };
    }

    const [roleAllowSet, exceptions] = await Promise.all([
      this.roleOnlyAllowSet(userId),
      this.loadExceptionCells(userId),
    ]);
    const exMap = new Map(exceptions.map((e) => [permKey(e.resourceKey, e.actionKey), e.effect]));

    const cells = this.flat.flatMap((r) =>
      r.actions.map((actionKey) => {
        const k = permKey(r.key, actionKey);
        const explicit = exMap.get(k) ?? null;
        const roleEffective: 'allow' | 'deny' = roleAllowSet.has(k) ? 'allow' : 'deny';
        const effective: 'allow' | 'deny' =
          explicit === 'allow' ? 'allow' : explicit === 'deny' ? 'deny' : roleEffective;
        return {
          resourceKey: r.key,
          actionKey,
          explicit, // the exception tri-state the admin edits
          roleEffective, // baseline from the user's roles (ghost context)
          effective,
          inheritedFrom: explicit === null && roleEffective === 'allow' ? 'roles' : null,
        };
      }),
    );

    return {
      user: { userId: user.user_id, username: user.username, name: user.name },
      roles: roleNames,
      superAdmin: false,
      cells,
      stats: {
        additionalAllows: exceptions.filter((e) => e.effect === 'allow').length,
        explicitDenies: exceptions.filter((e) => e.effect === 'deny').length,
        inheritedFromRoles: [...roleAllowSet].length,
      },
    };
  }

  async setExceptions(userId: number, dto: SaveMatrixDto, actorUserId: number) {
    await this.getUserOrThrow(userId);

    for (const c of dto.changes) {
      if (!this.validCells.has(permKey(c.resourceKey, c.actionKey))) {
        throw new BadRequestException(`خلية غير صالحة: ${c.resourceKey}:${c.actionKey}`);
      }
    }

    // Anti-escalation: an admin cannot ALLOW (via exception) a permission they don't hold.
    const editor = await this.engine.getEffective(actorUserId);
    if (!editor.superAdmin) {
      const escalations = dto.changes
        .filter((c) => c.state === 'allow')
        .map((c) => permKey(c.resourceKey, c.actionKey))
        .filter((k) => !editor.keys.has(k));
      if (escalations.length) {
        throw new ForbiddenException(
          `لا يمكنك منح صلاحيات لا تملكها: ${escalations.slice(0, 5).join(', ')}${escalations.length > 5 ? ' …' : ''}`,
        );
      }
    }

    const maps = await this.engine.getCatalogMaps();
    const ops = dto.changes.map((c) => {
      const resource_id = maps.resourceKeyToId.get(c.resourceKey)!;
      const action_id = maps.actionKeyToId.get(c.actionKey)!;
      if (c.state === 'inherit') {
        return this.prisma.rbac_user_exceptions.deleteMany({ where: { user_id: userId, resource_id, action_id } });
      }
      return this.prisma.rbac_user_exceptions.upsert({
        where: { user_id_resource_id_action_id: { user_id: userId, resource_id, action_id } },
        update: { effect: c.state, created_by: actorUserId },
        create: { user_id: userId, resource_id, action_id, effect: c.state, created_by: actorUserId },
      });
    });
    await this.prisma.$transaction(ops);

    await this.audit.log({ actorUserId, action: 'exception.update', targetType: 'user', targetId: userId, detail: { changes: dto.changes.length } });
    this.engine.invalidateUser(userId);
    return this.getExceptions(userId);
  }

  /** Reset every exception cell to inherit. */
  async clearExceptions(userId: number, actorUserId: number) {
    await this.getUserOrThrow(userId);
    await this.prisma.rbac_user_exceptions.deleteMany({ where: { user_id: userId } });
    await this.audit.log({ actorUserId, action: 'exception.clear', targetType: 'user', targetId: userId });
    this.engine.invalidateUser(userId);
    return this.getExceptions(userId);
  }

  // ---- helpers ------------------------------------------------------------------------

  private async getUserOrThrow(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { user_id: true, username: true, name: true, level: true },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  private async userRoleBadges(userId: number) {
    const links = await this.prisma.rbac_user_roles.findMany({
      where: { user_id: userId },
      select: { role: { select: { id: true, name_ar: true, is_super_admin: true } } },
    });
    return links
      .map((l) => l.role)
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map((r) => ({ id: r.id, nameAr: r.name_ar, isSuperAdmin: r.is_super_admin }));
  }

  /** Allow-set from the user's roles only (exceptions excluded) — context for the editor. */
  private async roleOnlyAllowSet(userId: number): Promise<Set<string>> {
    const now = new Date();
    const userRoles = await this.prisma.rbac_user_roles.findMany({
      where: { user_id: userId, OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
      select: { role_id: true },
    });
    const roleIds = userRoles.map((r) => r.role_id);
    if (!roleIds.length) return new Set();
    const [rows, maps] = await Promise.all([
      this.prisma.rbac_role_permissions.findMany({
        where: { role_id: { in: roleIds } },
        select: { role_id: true, resource_id: true, action_id: true, effect: true },
      }),
      this.engine.getCatalogMaps(),
    ]);
    const perRole = new Map<number, StoredCell[]>();
    for (const id of roleIds) perRole.set(id, []);
    for (const c of rows) {
      const resourceKey = maps.resourceIdToKey.get(c.resource_id);
      const actionKey = maps.actionIdToKey.get(c.action_id);
      if (!resourceKey || !actionKey) continue;
      perRole.get(c.role_id)?.push({ resourceKey, actionKey, effect: c.effect as 'allow' | 'deny' });
    }
    const input = this.engine.getResolveInput();
    return unionRoles([...perRole.values()].map((cells) => effectiveForRole(cells, input)));
  }

  private async loadExceptionCells(userId: number): Promise<StoredCell[]> {
    const [rows, maps] = await Promise.all([
      this.prisma.rbac_user_exceptions.findMany({
        where: { user_id: userId },
        select: { resource_id: true, action_id: true, effect: true },
      }),
      this.engine.getCatalogMaps(),
    ]);
    return rows
      .map((r) => ({
        resourceKey: maps.resourceIdToKey.get(r.resource_id)!,
        actionKey: maps.actionIdToKey.get(r.action_id)!,
        effect: r.effect as 'allow' | 'deny',
      }))
      .filter((c) => c.resourceKey && c.actionKey);
  }
}
