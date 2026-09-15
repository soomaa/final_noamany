import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async getCatalog(): Promise<{ actions: CatalogActionDto[]; tree: CatalogNodeDto[] }> {
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
