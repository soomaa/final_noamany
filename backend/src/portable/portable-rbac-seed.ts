import type { PrismaClient } from '@prisma/client';
import { HrPermissionCatalogAdapter } from '../ports/rbac/hr-permission-catalog.adapter';
import type { PermissionCatalogResource } from '../ports/rbac/permission-catalog.adapter';

const ACTION_LABELS: Record<string, readonly [string, string]> = {
  view: ['عرض', 'View'], create: ['إضافة', 'Create'], update: ['تعديل', 'Update'],
  delete: ['حذف', 'Delete'], approve: ['اعتماد', 'Approve'], reject: ['رفض', 'Reject'],
  export: ['تصدير', 'Export'], print: ['طباعة', 'Print'], audit: ['تدقيق', 'Audit'],
  configure: ['تهيئة', 'Configure'], execute: ['تنفيذ', 'Execute'],
};

const SENSITIVE_ACTIONS = new Set(['delete', 'approve', 'reject', 'configure', 'execute']);

export interface PortableRbacSeedPlan {
  actions: Array<{ key: string; labelAr: string; labelEn: string; sensitive: boolean; sortOrder: number }>;
  resources: Array<PermissionCatalogResource & { sortOrder: number }>;
  roles: Array<{
    key: 'super_admin' | 'hr_manager' | 'branch_manager' | 'employee';
    nameAr: string;
    nameEn: string;
    description: string;
    isSystem: boolean;
    isSuperAdmin: boolean;
    grants: Array<{ resourceKey: string; actionKey: string; effect: 'allow' }>;
    scopes: Array<{ resourceKey: string; scope: 'own' | 'branch' | 'global' }>;
  }>;
}

export function buildPortableRbacSeedPlan(
  resources = new HrPermissionCatalogAdapter().resources(),
): PortableRbacSeedPlan {
  const actionKeys = [...new Set(resources.flatMap((resource) => resource.actions))].sort();
  const moduleKeys = resources.filter((resource) => resource.type === 'module').map((resource) => resource.key);
  const moduleGrants = (actions: readonly string[]) => moduleKeys.flatMap((resourceKey) =>
    actions.map((actionKey) => ({ resourceKey, actionKey, effect: 'allow' as const })),
  );
  const grants = (resourceKeys: readonly string[], actions: readonly string[]) => resourceKeys.flatMap((resourceKey) =>
    actions.map((actionKey) => ({ resourceKey, actionKey, effect: 'allow' as const })),
  );

  return {
    actions: actionKeys.map((key, sortOrder) => ({
      key,
      labelAr: ACTION_LABELS[key]?.[0] ?? key,
      labelEn: ACTION_LABELS[key]?.[1] ?? key,
      sensitive: SENSITIVE_ACTIONS.has(key),
      sortOrder,
    })),
    resources: resources.map((resource, sortOrder) => ({ ...resource, sortOrder })),
    roles: [
      {
        key: 'super_admin', nameAr: 'مدير عام للنظام', nameEn: 'Super Admin',
        description: 'Portable HR super-admin bypass', isSystem: true, isSuperAdmin: true, grants: [], scopes: [],
      },
      {
        key: 'hr_manager', nameAr: 'مدير الموارد البشرية', nameEn: 'HR Manager',
        description: 'Full operational HR access', isSystem: true, isSuperAdmin: false,
        grants: moduleGrants(['view', 'create', 'update', 'delete', 'approve', 'reject', 'export', 'print', 'audit', 'configure', 'execute']),
        scopes: resources.map((resource) => ({ resourceKey: resource.key, scope: 'global' as const })),
      },
      {
        key: 'branch_manager', nameAr: 'مدير فرع', nameEn: 'Branch Manager',
        description: 'Branch-scoped HR viewing and approvals', isSystem: true, isSuperAdmin: false,
        grants: [
          ...grants(['employees', 'attendance', 'finance', 'leaves', 'reports'], ['view', 'export', 'print']),
          ...grants(['leaves.list', 'leaves.permissions', 'leaves.requests', 'leaves.missions'], ['approve', 'reject']),
        ],
        scopes: resources.map((resource) => ({ resourceKey: resource.key, scope: 'branch' as const })),
      },
      {
        key: 'employee', nameAr: 'موظف', nameEn: 'Employee',
        description: 'Own self-service requests only', isSystem: true, isSuperAdmin: false,
        grants: grants(['leaves.requests', 'leaves.permissions'], ['view', 'create']),
        scopes: resources.map((resource) => ({ resourceKey: resource.key, scope: 'own' as const })),
      },
    ],
  };
}

/** Atomic, idempotent catalog/role seed. It never creates users or assigns roles. */
export async function seedPortableRbac(
  prisma: Pick<PrismaClient, '$transaction'>,
  resources = new HrPermissionCatalogAdapter().resources(),
): Promise<{ actions: number; resources: number; roles: number }> {
  const plan = buildPortableRbacSeedPlan(resources);
  await prisma.$transaction(async (tx) => {
    const actionIds = new Map<string, number>();
    for (const action of plan.actions) {
      const row = await tx.rbac_actions.upsert({
        where: { key: action.key },
        update: { label_ar: action.labelAr, label_en: action.labelEn, sensitive: action.sensitive, sort_order: action.sortOrder },
        create: { key: action.key, label_ar: action.labelAr, label_en: action.labelEn, sensitive: action.sensitive, sort_order: action.sortOrder },
        select: { id: true },
      });
      actionIds.set(action.key, row.id);
    }

    const resourceIds = new Map<string, number>();
    for (const resource of plan.resources) {
      const parentId = resource.parentKey ? resourceIds.get(resource.parentKey) ?? null : null;
      const row = await tx.rbac_resources.upsert({
        where: { key: resource.key },
        update: {
          parent_id: parentId, type: resource.type ?? 'page', name_ar: resource.nameAr ?? resource.key,
          name_en: resource.nameEn ?? null, route: resource.route ?? null, icon: resource.icon ?? null,
          sort_order: resource.sortOrder, is_active: true,
        },
        create: {
          key: resource.key, parent_id: parentId, type: resource.type ?? 'page',
          name_ar: resource.nameAr ?? resource.key, name_en: resource.nameEn ?? null,
          route: resource.route ?? null, icon: resource.icon ?? null, sort_order: resource.sortOrder, is_active: true,
        },
        select: { id: true },
      });
      resourceIds.set(resource.key, row.id);
      const wantedActionIds = resource.actions.map((key) => actionIds.get(key)).filter((id): id is number => id != null);
      await tx.rbac_resource_actions.deleteMany({ where: { resource_id: row.id, action_id: { notIn: wantedActionIds } } });
      await tx.rbac_resource_actions.createMany({
        data: wantedActionIds.map((action_id) => ({ resource_id: row.id, action_id })),
        skipDuplicates: true,
      });
    }

    for (const role of plan.roles) {
      const row = await tx.rbac_roles.upsert({
        where: { key: role.key },
        update: {
          name_ar: role.nameAr, name_en: role.nameEn, description: role.description,
          is_system: role.isSystem, is_super_admin: role.isSuperAdmin,
        },
        create: {
          key: role.key, name_ar: role.nameAr, name_en: role.nameEn, description: role.description,
          is_system: role.isSystem, is_super_admin: role.isSuperAdmin,
        },
        select: { id: true },
      });
      if (await tx.rbac_role_permissions.count({ where: { role_id: row.id } }) === 0) {
        const cells = role.grants.flatMap((grant) => {
          const resource_id = resourceIds.get(grant.resourceKey);
          const action_id = actionIds.get(grant.actionKey);
          return resource_id && action_id
            ? [{ role_id: row.id, resource_id, action_id, effect: grant.effect }]
            : [];
        });
        if (cells.length) await tx.rbac_role_permissions.createMany({ data: cells, skipDuplicates: true });
      }
      for (const configured of role.scopes) {
        const resource_id = resourceIds.get(configured.resourceKey);
        if (!resource_id) continue;
        await tx.rbac_role_scopes.upsert({
          where: { role_id_resource_id: { role_id: row.id, resource_id } },
          update: { scope: configured.scope },
          create: { role_id: row.id, resource_id, scope: configured.scope },
        });
      }
    }
  });
  return { actions: plan.actions.length, resources: plan.resources.length, roles: plan.roles.length };
}
