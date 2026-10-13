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
 * The catalog defines available screens and actions; the DB stores grants.
 */
@Injectable()
export class RbacCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PermissionEngineService,
  ) {}

  /** Existing installations may predate sidebar pages added to the code catalog. */
  private async syncCatalogDefinitions(): Promise<void> {
    const flat = flattenCatalog();
    const [resources, actions, resourceActions] = await Promise.all([
      this.prisma.rbac_resources.findMany({ select: {
        id: true, key: true, parent_id: true, type: true, name_ar: true,
        name_en: true, route: true, icon: true, sort_order: true, is_active: true,
      } }),
      this.prisma.rbac_actions.findMany({ select: { id: true, key: true } }),
      this.prisma.rbac_resource_actions.findMany({ select: { resource_id: true, action_id: true } }),
    ]);
    const resourcesByKey = new Map(resources.map((resource) => [resource.key, resource]));
    const resourceIds = new Map(resources.map((resource) => [resource.key, resource.id]));
    const actionIds = new Map(actions.map((action) => [action.key, action.id]));
    const existingPairs = new Set(resourceActions.map((link) => `${link.resource_id}:${link.action_id}`));
    const needsResourceSync = (resource: typeof flat[number]) => {
      const row = resourcesByKey.get(resource.key);
      if (!row) return true;
      return !row.is_active
        || row.parent_id !== (resource.parentKey ? resourceIds.get(resource.parentKey) ?? null : null)
        || row.type !== resource.type
        || row.name_ar !== resource.nameAr
        || row.name_en !== (resource.nameEn ?? null)
        || row.route !== (resource.route ?? null)
        || row.icon !== (resource.icon ?? null)
        || row.sort_order !== resource.sortOrder;
    };
    const missingResources = flat.some(needsResourceSync);
    const missingActions = ACTIONS.some((action) => !actionIds.has(action.key));
    const missingLinks = flat.some((resource) => resource.actions.some((action) => {
      const resourceId = resourceIds.get(resource.key);
      const actionId = actionIds.get(action);
      return resourceId != null && actionId != null && !existingPairs.has(`${resourceId}:${actionId}`);
    }));
    if (!missingResources && !missingActions && !missingLinks) return;

    for (const action of ACTIONS) {
      if (actionIds.has(action.key)) continue;
      const row = await this.prisma.rbac_actions.upsert({
        where: { key: action.key },
        update: {},
        create: {
          key: action.key,
          label_ar: action.labelAr,
          label_en: action.labelEn,
          sensitive: action.sensitive,
          sort_order: action.sortOrder,
        },
        select: { id: true },
      });
      actionIds.set(action.key, row.id);
    }

    for (const resource of flat) {
      if (!needsResourceSync(resource)) continue;
      const values = {
        parent_id: resource.parentKey ? resourceIds.get(resource.parentKey) ?? null : null,
        type: resource.type,
        name_ar: resource.nameAr,
        name_en: resource.nameEn ?? null,
        route: resource.route ?? null,
        icon: resource.icon ?? null,
        sort_order: resource.sortOrder,
        is_active: true,
      };
      const row = await this.prisma.rbac_resources.upsert({
        where: { key: resource.key },
        update: values,
        create: { key: resource.key, ...values },
        select: { id: true },
      });
      resourceIds.set(resource.key, row.id);
    }

    const links = flat.flatMap((resource) => resource.actions.flatMap((action) => {
      const resourceId = resourceIds.get(resource.key);
      const actionId = actionIds.get(action);
      if (resourceId == null || actionId == null || existingPairs.has(`${resourceId}:${actionId}`)) return [];
      return [{ resource_id: resourceId, action_id: actionId }];
    }));
    if (links.length) await this.prisma.rbac_resource_actions.createMany({ data: links, skipDuplicates: true });
    this.engine.invalidateCatalog();
    this.engine.invalidateAll();
  }

  async getCatalog(): Promise<{ actions: CatalogActionDto[]; tree: CatalogNodeDto[] }> {
    await this.syncCatalogDefinitions();
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
}
