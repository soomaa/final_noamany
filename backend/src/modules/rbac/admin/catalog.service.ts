import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ACTIONS, flattenCatalog } from '../catalog/rbac.catalog';
import { PermissionEngineService } from '../engine/permission-engine.service';

export interface CatalogActionDto {
  key: string;
  labelAr: string;
  labelEn: string;
  sensitive: boolean;
  sortOrder: number;
}

export interface CatalogNodeDto {
  key: string;
  type: 'module' | 'group' | 'page';
  nameAr: string;
  nameEn: string | null;
  route: string | null;
  icon: string | null;
  sortOrder: number;
  /** action keys applicable on this node (the matrix cells that exist for it). */
  actions: string[];
  children: CatalogNodeDto[];
}

/**
 * Serves the DB-backed resource tree + action set for the permission matrix.
 * The DB is the source of truth (respects is_active and any future admin edits);
 * it was seeded from src/modules/rbac/catalog/rbac.catalog.ts.
 */
@Injectable()
export class RbacCatalogService {
  private syncPromise?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PermissionEngineService,
  ) {}

  async getCatalog(): Promise<{ actions: CatalogActionDto[]; tree: CatalogNodeDto[] }> {
    // The runtime resolver uses the TypeScript catalog. Reconcile the DB metadata before
    // serving the editor so the matrix can never display a different tree/action set.
    await this.ensureCatalogSynced();
    const [actions, resources, resourceActions] = await Promise.all([
      this.prisma.rbac_actions.findMany({ orderBy: { sort_order: 'asc' } }),
      this.prisma.rbac_resources.findMany({
        where: { is_active: true },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.rbac_resource_actions.findMany(),
    ]);

    const actionKeyById = new Map(actions.map((a) => [a.id, a.key]));
    const actionsByResource = new Map<number, string[]>();
    for (const ra of resourceActions) {
      const key = actionKeyById.get(ra.action_id);
      if (!key) continue;
      const arr = actionsByResource.get(ra.resource_id) ?? [];
      arr.push(key);
      actionsByResource.set(ra.resource_id, arr);
    }
    // keep action order stable (matches the actions[] column order)
    const actionOrder = new Map(actions.map((a, i) => [a.key, i]));
    const sortActions = (keys: string[]) =>
      [...keys].sort((a, b) => (actionOrder.get(a) ?? 99) - (actionOrder.get(b) ?? 99));

    const nodeById = new Map<number, CatalogNodeDto>();
    for (const r of resources) {
      nodeById.set(r.id, {
        key: r.key,
        type: r.type as CatalogNodeDto['type'],
        nameAr: r.name_ar,
        nameEn: r.name_en,
        route: r.route,
        icon: r.icon,
        sortOrder: r.sort_order,
        actions: sortActions(actionsByResource.get(r.id) ?? []),
        children: [],
      });
    }
    const roots: CatalogNodeDto[] = [];
    for (const r of resources) {
      const node = nodeById.get(r.id)!;
      if (r.parent_id && nodeById.has(r.parent_id)) nodeById.get(r.parent_id)!.children.push(node);
      else roots.push(node);
    }

    return {
      actions: actions.map((a) => ({
        key: a.key,
        labelAr: a.label_ar,
        labelEn: a.label_en,
        sensitive: a.sensitive,
        sortOrder: a.sort_order,
      })),
      tree: roots,
    };
  }

  /**
   * Additively reconciles catalog metadata without touching role grants, user exceptions,
   * scopes, or assignments. Removed resources are only marked inactive, so their historic
   * permission rows remain recoverable if the resource returns later.
   */
  private ensureCatalogSynced(): Promise<void> {
    if (!this.syncPromise) {
      this.syncPromise = this.syncCatalog().catch((error) => {
        this.syncPromise = undefined;
        throw error;
      });
    }
    return this.syncPromise;
  }

  private async syncCatalog(): Promise<void> {
    const flat = flattenCatalog();
    const [dbActions, dbResources, dbResourceActions] = await Promise.all([
      this.prisma.rbac_actions.findMany(),
      this.prisma.rbac_resources.findMany(),
      this.prisma.rbac_resource_actions.findMany(),
    ]);

    const actionByKey = new Map(dbActions.map((action) => [action.key, action]));
    let changed = false;
    for (const action of ACTIONS) {
      const current = actionByKey.get(action.key);
      if (
        !current
        || current.label_ar !== action.labelAr
        || current.label_en !== action.labelEn
        || current.sensitive !== action.sensitive
        || current.sort_order !== action.sortOrder
      ) {
        await this.prisma.rbac_actions.upsert({
          where: { key: action.key },
          update: {
            label_ar: action.labelAr,
            label_en: action.labelEn,
            sensitive: action.sensitive,
            sort_order: action.sortOrder,
          },
          create: {
            key: action.key,
            label_ar: action.labelAr,
            label_en: action.labelEn,
            sensitive: action.sensitive,
            sort_order: action.sortOrder,
          },
        });
        changed = true;
      }
    }

    // Refresh actions after possible inserts so every wanted action has an id.
    const actionRows = changed
      ? await this.prisma.rbac_actions.findMany()
      : dbActions;
    const actionIdByKey = new Map(actionRows.map((action) => [action.key, action.id]));
    const resourceByKey = new Map(dbResources.map((resource) => [resource.key, resource]));
    const resourceIdByKey = new Map(dbResources.map((resource) => [resource.key, resource.id]));

    // flattenCatalog is parent-first, so newly inserted parents are available to children.
    for (const resource of flat) {
      const parentId = resource.parentKey ? resourceIdByKey.get(resource.parentKey) ?? null : null;
      const current = resourceByKey.get(resource.key);
      if (
        !current
        || current.parent_id !== parentId
        || current.type !== resource.type
        || current.name_ar !== resource.nameAr
        || current.name_en !== (resource.nameEn ?? null)
        || current.route !== (resource.route ?? null)
        || current.icon !== (resource.icon ?? null)
        || current.sort_order !== resource.sortOrder
        || !current.is_active
      ) {
        const row = await this.prisma.rbac_resources.upsert({
          where: { key: resource.key },
          update: {
            parent_id: parentId,
            type: resource.type,
            name_ar: resource.nameAr,
            name_en: resource.nameEn ?? null,
            route: resource.route ?? null,
            icon: resource.icon ?? null,
            sort_order: resource.sortOrder,
            is_active: true,
          },
          create: {
            key: resource.key,
            parent_id: parentId,
            type: resource.type,
            name_ar: resource.nameAr,
            name_en: resource.nameEn ?? null,
            route: resource.route ?? null,
            icon: resource.icon ?? null,
            sort_order: resource.sortOrder,
            is_active: true,
          },
        });
        resourceIdByKey.set(resource.key, row.id);
        changed = true;
      }
    }

    const activeKeys = new Set(flat.map((resource) => resource.key));
    const staleIds = dbResources
      .filter((resource) => resource.is_active && !activeKeys.has(resource.key))
      .map((resource) => resource.id);
    if (staleIds.length) {
      await this.prisma.rbac_resources.updateMany({
        where: { id: { in: staleIds } },
        data: { is_active: false },
      });
      changed = true;
    }

    // Refresh ids after resource inserts, then make each active resource's applicable
    // action set exactly match the runtime catalog. Stored grants are deliberately kept.
    const resourceRows = changed
      ? await this.prisma.rbac_resources.findMany({ select: { id: true, key: true } })
      : dbResources;
    const finalResourceIdByKey = new Map(resourceRows.map((resource) => [resource.key, resource.id]));
    const existingByResource = new Map<number, Set<number>>();
    for (const cell of dbResourceActions) {
      const set = existingByResource.get(cell.resource_id) ?? new Set<number>();
      set.add(cell.action_id);
      existingByResource.set(cell.resource_id, set);
    }

    for (const resource of flat) {
      const resourceId = finalResourceIdByKey.get(resource.key);
      if (!resourceId) continue;
      const wanted = resource.actions
        .map((action) => actionIdByKey.get(action))
        .filter((id): id is number => id != null);
      const existing = existingByResource.get(resourceId) ?? new Set<number>();
      const wantedSet = new Set(wanted);
      const missing = wanted.filter((id) => !existing.has(id));
      const extra = [...existing].filter((id) => !wantedSet.has(id));
      if (missing.length) {
        await this.prisma.rbac_resource_actions.createMany({
          data: missing.map((action_id) => ({ resource_id: resourceId, action_id })),
          skipDuplicates: true,
        });
        changed = true;
      }
      if (extra.length) {
        await this.prisma.rbac_resource_actions.deleteMany({
          where: { resource_id: resourceId, action_id: { in: extra } },
        });
        changed = true;
      }
    }

    if (changed) this.engine.invalidateCatalog();
  }
}
