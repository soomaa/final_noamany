/* eslint-disable no-console */
/**
 * Seeds the enterprise RBAC catalog + standard roles, and maps existing users to roles
 * by their legacy `users.level`. Idempotent:
 *   - actions / resources / resource_actions  -> upserted to match the catalog exactly
 *   - roles                                    -> upserted by key
 *   - starter role matrices                    -> only written when a role has NO cells yet
 *   - user_roles                               -> only assigned to users who have NO roles yet
 *
 * Run:  npx ts-node prisma/seed-rbac.ts
 */
import { PrismaClient } from '@prisma/client';
import {
  ACTIONS,
  ActionKey,
  flattenCatalog,
} from '../src/modules/rbac/catalog/rbac.catalog';
import {
  ensureRoleForJobTitle,
  jobTitleRoleKey,
  syncAllEmployeeUserRoles,
} from '../src/modules/rbac/job-title-role.util';
import { defaultPermissionCellsForJobTitle } from '../src/modules/rbac/job-title-defaults';
import { SALES_MEMBER_VIEWER_ROLE } from '../src/modules/rbac/sales-member-viewer-role';

const prisma = new PrismaClient();

type Cell = { resourceKey: string; actionKey: ActionKey; effect: 'allow' | 'deny' };

/** Top-level modules an HR manager runs day-to-day (HR grant inherits all HR sub-groups). */
const HR_MANAGER_MODULES = ['hr', 'club', 'gym-sales'];

/** Starter matrices (module-level grants inherit down). super_admin needs none (bypass). */
const ROLE_MATRICES: Record<string, Cell[]> = {
  [SALES_MEMBER_VIEWER_ROLE.key]: SALES_MEMBER_VIEWER_ROLE.cells,
  trainer: [
    { resourceKey: 'trainer.portal', actionKey: 'view', effect: 'allow' },
  ],
  hr_manager: HR_MANAGER_MODULES.flatMap((m) =>
    (['view', 'create', 'update', 'approve', 'reject', 'export', 'print', 'audit'] as ActionKey[]).map(
      (actionKey) => ({ resourceKey: m, actionKey, effect: 'allow' as const }),
    ),
  ),
  branch_manager: [
    ...(['employees', 'attendance', 'leaves', 'reports', 'club'] as const).flatMap((m) =>
      (['view', 'export', 'print'] as ActionKey[]).map((actionKey) => ({
        resourceKey: m,
        actionKey,
        effect: 'allow' as const,
      })),
    ),
    // Branch managers approve/reject leave & permission requests.
    ...(['leaves.list', 'leaves.permissions', 'leaves.requests', 'leaves.missions'] as const).flatMap(
      (r) =>
        (['approve', 'reject'] as ActionKey[]).map((actionKey) => ({
          resourceKey: r,
          actionKey,
          effect: 'allow' as const,
        })),
    ),
  ],
  employee: [
    // Self-service: submit & view their own leave/permission requests.
    ...(['leaves.requests', 'leaves.permissions'] as const).flatMap((r) =>
      (['view', 'create'] as ActionKey[]).map((actionKey) => ({
        resourceKey: r,
        actionKey,
        effect: 'allow' as const,
      })),
    ),
  ],
};

const ROLES: Array<{
  key: string;
  nameAr: string;
  nameEn: string;
  description: string;
  isSystem: boolean;
  isSuperAdmin: boolean;
}> = [
  { key: 'super_admin', nameAr: 'مدير عام للنظام', nameEn: 'Super Admin', description: 'يتجاوز كل الصلاحيات', isSystem: true, isSuperAdmin: true },
  { key: 'hr_manager', nameAr: 'مدير الموارد البشرية', nameEn: 'HR Manager', description: 'صلاحيات تشغيلية واسعة على وحدات الموارد البشرية', isSystem: false, isSuperAdmin: false },
  { key: 'branch_manager', nameAr: 'مدير فرع/إدارة', nameEn: 'Branch Manager', description: 'عرض واعتماد طلبات فرعه', isSystem: false, isSuperAdmin: false },
  { key: 'employee', nameAr: 'موظف', nameEn: 'Employee', description: 'خدمة ذاتية محدودة', isSystem: false, isSuperAdmin: false },
  {
    key: SALES_MEMBER_VIEWER_ROLE.key,
    nameAr: SALES_MEMBER_VIEWER_ROLE.nameAr,
    nameEn: SALES_MEMBER_VIEWER_ROLE.nameEn,
    description: SALES_MEMBER_VIEWER_ROLE.description,
    isSystem: true,
    isSuperAdmin: false,
  },
  { key: 'trainer', nameAr: 'صلاحيات المدربين', nameEn: 'Trainer Permissions', description: 'وصول المدرب إلى جدوله وحضوره ومستحقاته فقط', isSystem: true, isSuperAdmin: false },
];

/** legacy users.level -> role key. */
const LEVEL_TO_ROLE: Record<number, string> = { 1: 'super_admin', 3: 'branch_manager', 2: 'employee' };

async function seedActions() {
  for (const a of ACTIONS) {
    await prisma.rbac_actions.upsert({
      where: { key: a.key },
      update: { label_ar: a.labelAr, label_en: a.labelEn, sensitive: a.sensitive, sort_order: a.sortOrder },
      create: { key: a.key, label_ar: a.labelAr, label_en: a.labelEn, sensitive: a.sensitive, sort_order: a.sortOrder },
    });
  }
  console.log(`  actions: ${ACTIONS.length}`);
}

async function seedResources() {
  const flat = flattenCatalog();
  const keyToId = new Map<string, number>();
  const actionRows = await prisma.rbac_actions.findMany({ select: { id: true, key: true } });
  const actionKeyToId = new Map(actionRows.map((r) => [r.key, r.id]));

  for (const r of flat) {
    const parentId = r.parentKey ? keyToId.get(r.parentKey) ?? null : null;
    const row = await prisma.rbac_resources.upsert({
      where: { key: r.key },
      update: {
        parent_id: parentId,
        type: r.type,
        name_ar: r.nameAr,
        name_en: r.nameEn ?? null,
        route: r.route ?? null,
        icon: r.icon ?? null,
        sort_order: r.sortOrder,
        is_active: true,
      },
      create: {
        key: r.key,
        parent_id: parentId,
        type: r.type,
        name_ar: r.nameAr,
        name_en: r.nameEn ?? null,
        route: r.route ?? null,
        icon: r.icon ?? null,
        sort_order: r.sortOrder,
        is_active: true,
      },
      select: { id: true },
    });
    keyToId.set(r.key, row.id);

    // Sync applicable actions for this resource to the catalog set.
    const wantIds = r.actions.map((a) => actionKeyToId.get(a)).filter((x): x is number => x != null);
    await prisma.rbac_resource_actions.deleteMany({
      where: { resource_id: row.id, action_id: { notIn: wantIds } },
    });
    await prisma.rbac_resource_actions.createMany({
      data: wantIds.map((action_id) => ({ resource_id: row.id, action_id })),
      skipDuplicates: true,
    });
  }
  console.log(`  resources: ${flat.length}`);

  // Retire catalog entries that were removed from the tree (keeps the matrix in sync).
  const activeKeys = flat.map((r) => r.key);
  const retired = await prisma.rbac_resources.updateMany({
    where: { key: { notIn: activeKeys }, is_active: true },
    data: { is_active: false },
  });
  if (retired.count) console.log(`  resources deactivated: ${retired.count}`);

  return { keyToId, actionKeyToId };
}

async function seedRoles(
  keyToId: Map<string, number>,
  actionKeyToId: Map<string, number>,
) {
  for (const role of ROLES) {
    const row = await prisma.rbac_roles.upsert({
      where: { key: role.key },
      update: {
        name_ar: role.nameAr,
        name_en: role.nameEn,
        description: role.description,
        is_system: role.isSystem,
        is_super_admin: role.isSuperAdmin,
      },
      create: {
        key: role.key,
        name_ar: role.nameAr,
        name_en: role.nameEn,
        description: role.description,
        is_system: role.isSystem,
        is_super_admin: role.isSuperAdmin,
      },
      select: { id: true },
    });

    const matrix = ROLE_MATRICES[role.key];
    if (matrix?.length) {
      const existing = await prisma.rbac_role_permissions.count({ where: { role_id: row.id } });
      if (existing === 0) {
        const data = matrix
          .map((c) => {
            const resource_id = keyToId.get(c.resourceKey);
            const action_id = actionKeyToId.get(c.actionKey);
            if (!resource_id || !action_id) return null;
            return { role_id: row.id, resource_id, action_id, effect: c.effect };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        if (data.length) await prisma.rbac_role_permissions.createMany({ data, skipDuplicates: true });
        console.log(`  role ${role.key}: seeded ${data.length} cells`);
      } else {
        console.log(`  role ${role.key}: ${existing} cells already present (left as-is)`);
      }
    }
  }
}

async function assignUsersByLevel() {
  const roleRows = await prisma.rbac_roles.findMany({ select: { id: true, key: true } });
  const roleKeyToId = new Map(roleRows.map((r) => [r.key, r.id]));

  const users = await prisma.users.findMany({ select: { user_id: true, level: true } });
  const alreadyAssigned = new Set(
    (await prisma.rbac_user_roles.findMany({ select: { user_id: true } })).map((r) => r.user_id),
  );

  const toCreate: Array<{ user_id: number; role_id: number }> = [];
  for (const u of users) {
    if (alreadyAssigned.has(u.user_id)) continue;
    const roleKey = LEVEL_TO_ROLE[u.level ?? 0] ?? 'employee';
    const role_id = roleKeyToId.get(roleKey);
    if (role_id) toCreate.push({ user_id: u.user_id, role_id });
  }
  if (toCreate.length) {
    await prisma.rbac_user_roles.createMany({ data: toCreate, skipDuplicates: true });
  }

  const counts = await prisma.rbac_user_roles.groupBy({ by: ['role_id'], _count: { _all: true } });
  const idToKey = new Map(roleRows.map((r) => [r.id, r.key]));
  console.log(`  assigned ${toCreate.length} new user-role rows`);
  for (const c of counts) console.log(`    ${idToKey.get(c.role_id)}: ${c._count._all} users`);
}

async function seedEmptyJobTitleMatrices(
  keyToId: Map<string, number>,
  actionKeyToId: Map<string, number>,
) {
  const jobs = await prisma.department_jobs.findMany({ orderBy: { id: 'asc' } });
  for (const job of jobs) {
    const role = await ensureRoleForJobTitle(prisma, job);
    const existing = await prisma.rbac_role_permissions.count({ where: { role_id: role.id } });
    if (existing > 0) {
      console.log(`  job title ${job.name}: ${existing} cells already present (left as-is)`);
      continue;
    }

    const cells = defaultPermissionCellsForJobTitle(job.name);
    const data = cells
      .map((cell) => {
        const resource_id = keyToId.get(cell.resourceKey);
        const action_id = actionKeyToId.get(cell.actionKey);
        if (!resource_id || !action_id) return null;
        return { role_id: role.id, resource_id, action_id, effect: cell.effect };
      })
      .filter((cell): cell is NonNullable<typeof cell> => cell !== null);

    if (data.length) {
      await prisma.rbac_role_permissions.createMany({ data, skipDuplicates: true });
    }
    console.log(`  job title ${job.name}: seeded ${data.length} starter cells`);
  }
}

async function seedClubPermissions(
  keyToId: Map<string, number>,
  actionKeyToId: Map<string, number>,
) {
  const clubGrants: Array<{ roleKey: string; cells: Cell[] }> = [
    {
      roleKey: 'hr_manager',
      cells: (['club', 'club.members', 'club.dashboard', 'club.subscriptions', 'club.lockers', 'club.fitness'] as const).flatMap(
        (r) =>
          (['view', 'create', 'update', 'delete', 'export', 'print', 'audit'] as ActionKey[]).map((actionKey) => ({
            resourceKey: r,
            actionKey,
            effect: 'allow' as const,
          })),
      ),
    },
    {
      roleKey: 'branch_manager',
      cells: (['club', 'club.members', 'club.dashboard', 'club.subscriptions', 'club.lockers', 'club.fitness'] as const).flatMap((r) =>
        (['view', 'export', 'print'] as ActionKey[]).map((actionKey) => ({
          resourceKey: r,
          actionKey,
          effect: 'allow' as const,
        })),
      ),
    },
  ];

  for (const { roleKey, cells } of clubGrants) {
    const role = await prisma.rbac_roles.findUnique({ where: { key: roleKey }, select: { id: true } });
    if (!role) continue;
    const data = cells
      .map((c) => {
        const resource_id = keyToId.get(c.resourceKey);
        const action_id = actionKeyToId.get(c.actionKey);
        if (!resource_id || !action_id) return null;
        return { role_id: role.id, resource_id, action_id, effect: c.effect };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (data.length) {
      await prisma.rbac_role_permissions.createMany({ data, skipDuplicates: true });
      console.log(`  role ${roleKey}: upserted ${data.length} club cells`);
    }
  }
}

async function seedFinancialReportsPermissions(
  keyToId: Map<string, number>,
  actionKeyToId: Map<string, number>,
) {
  const grants: Array<{ roleKey: string; cells: Cell[] }> = [
    {
      roleKey: 'hr_manager',
      cells: (
        [
          'financial-reports',
          'financial-reports.dashboard',
          'financial-reports.expenses',
          'financial-reports.revenues',
          'financial-reports.reports',
          'financial-reports.revenue_reports',
          'financial-reports.analysis',
          'financial-reports.profit_loss',
        ] as const
      ).flatMap((r) =>
        (
          [
            'view',
            'create',
            'update',
            'delete',
            'approve',
            'reject',
            'export',
            'print',
            'audit',
          ] as ActionKey[]
        ).map((actionKey) => ({
          resourceKey: r,
          actionKey,
          effect: 'allow' as const,
        })),
      ),
    },
  ];

  for (const { roleKey, cells } of grants) {
    const role = await prisma.rbac_roles.findUnique({ where: { key: roleKey }, select: { id: true } });
    if (!role) continue;
    const data = cells
      .map((c) => {
        const resource_id = keyToId.get(c.resourceKey);
        const action_id = actionKeyToId.get(c.actionKey);
        if (!resource_id || !action_id) return null;
        return { role_id: role.id, resource_id, action_id, effect: c.effect };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (data.length) {
      await prisma.rbac_role_permissions.createMany({ data, skipDuplicates: true });
      console.log(`  role ${roleKey}: upserted ${data.length} financial-reports cells`);
    }
  }
}

async function seedGymSalesPermissions(
  keyToId: Map<string, number>,
  actionKeyToId: Map<string, number>,
) {
  const grants: Array<{ roleKey: string; cells: Cell[] }> = [
    {
      roleKey: 'hr_manager',
      cells: (
        ['gym-sales', 'gym-sales.inventory', 'gym-sales.procurement', 'gym-sales.sales'] as const
      ).flatMap((r) =>
        (
          [
            'view',
            'create',
            'update',
            'delete',
            'approve',
            'reject',
            'export',
            'print',
            'audit',
          ] as ActionKey[]
        ).map((actionKey) => ({
          resourceKey: r,
          actionKey,
          effect: 'allow' as const,
        })),
      ),
    },
    {
      roleKey: 'branch_manager',
      cells: (['gym-sales', 'gym-sales.inventory'] as const).flatMap((r) =>
        (['view', 'export', 'print'] as ActionKey[]).map((actionKey) => ({
          resourceKey: r,
          actionKey,
          effect: 'allow' as const,
        })),
      ),
    },
  ];

  for (const { roleKey, cells } of grants) {
    const role = await prisma.rbac_roles.findUnique({ where: { key: roleKey }, select: { id: true } });
    if (!role) continue;
    const data = cells
      .map((c) => {
        const resource_id = keyToId.get(c.resourceKey);
        const action_id = actionKeyToId.get(c.actionKey);
        if (!resource_id || !action_id) return null;
        return { role_id: role.id, resource_id, action_id, effect: c.effect };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (data.length) {
      await prisma.rbac_role_permissions.createMany({ data, skipDuplicates: true });
      console.log(`  role ${roleKey}: upserted ${data.length} gym-sales cells`);
    }
  }
}

async function seedAccountingAndAppPermissions(
  keyToId: Map<string, number>,
  actionKeyToId: Map<string, number>,
) {
  const grants: Array<{ roleKey: string; cells: Cell[] }> = [
    {
      roleKey: 'hr_manager',
      cells: (
        [
          'accounting',
          'accounting.dashboard',
          'accounting.journal',
          'accounting.accounts',
          'accounting.reports',
          'accounting.reports.gl',
          'accounting.reports.statement',
          'accounting.reports.income',
          'accounting.reports.balance',
          'accounting.reports.cashflow',
          'accounting.settings',
          'app-management',
          'portal-management',
          'app-management.about',
          'app-management.invitations',
          'app-management.invitations.accepted',
          'app-management.invitations.attended',
          'app-management.invitations.rejected',
          'app-management.offers',
          'app-management.trainers',
          'app-management.exercise-categories',
          'app-management.exercises',
          'app-management.news',
          'app-management.ads',
          'app-management.notifications',
        ] as const
      ).flatMap((r) =>
        (
          [
            'view',
            'create',
            'update',
            'delete',
            'approve',
            'reject',
            'export',
            'print',
            'audit',
            'manage',
          ] as ActionKey[]
        ).map((actionKey) => ({
          resourceKey: r,
          actionKey,
          effect: 'allow' as const,
        })),
      ),
    },
    {
      roleKey: 'branch_manager',
      cells: (
        [
          'accounting',
          'accounting.dashboard',
          'accounting.reports',
          'accounting.reports.gl',
          'accounting.reports.statement',
          'app-management',
          'app-management.invitations',
          'app-management.invitations.accepted',
          'app-management.invitations.attended',
          'app-management.invitations.rejected',
          'app-management.offers',
          'app-management.trainers',
          'app-management.exercises',
          'app-management.news',
        ] as const
      ).flatMap((r) =>
        (['view', 'export', 'print'] as ActionKey[]).map((actionKey) => ({
          resourceKey: r,
          actionKey,
          effect: 'allow' as const,
        })),
      ),
    },
  ];

  for (const { roleKey, cells } of grants) {
    const role = await prisma.rbac_roles.findUnique({ where: { key: roleKey }, select: { id: true } });
    if (!role) continue;
    const data = cells
      .map((c) => {
        const resource_id = keyToId.get(c.resourceKey);
        const action_id = actionKeyToId.get(c.actionKey);
        if (!resource_id || !action_id) return null;
        return { role_id: role.id, resource_id, action_id, effect: c.effect };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (data.length) {
      await prisma.rbac_role_permissions.createMany({ data, skipDuplicates: true });
      console.log(`  role ${roleKey}: upserted ${data.length} accounting/app-management cells`);
    }
  }
}

async function seedAdminGymPoliciesPermissions(
  keyToId: Map<string, number>,
  actionKeyToId: Map<string, number>,
) {
  const grants: Array<{ roleKey: string; cells: Cell[] }> = [
    {
      roleKey: 'hr_manager',
      cells: (['view', 'update', 'configure', 'audit'] as ActionKey[]).map((actionKey) => ({
        resourceKey: 'admin.gym-policies',
        actionKey,
        effect: 'allow' as const,
      })),
    },
    {
      roleKey: 'branch_manager',
      cells: (['view', 'update'] as ActionKey[]).map((actionKey) => ({
        resourceKey: 'admin.gym-policies',
        actionKey,
        effect: 'allow' as const,
      })),
    },
  ];

  for (const { roleKey, cells } of grants) {
    const role = await prisma.rbac_roles.findUnique({ where: { key: roleKey }, select: { id: true } });
    if (!role) continue;
    const data = cells
      .map((c) => {
        const resource_id = keyToId.get(c.resourceKey);
        const action_id = actionKeyToId.get(c.actionKey);
        if (!resource_id || !action_id) return null;
        return { role_id: role.id, resource_id, action_id, effect: c.effect };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (data.length) {
      await prisma.rbac_role_permissions.createMany({ data, skipDuplicates: true });
      console.log(`  role ${roleKey}: upserted ${data.length} admin.gym-policies cells`);
    }
  }
}

export async function seedRbac() {
  console.log('▶ RBAC…');
  await seedActions();
  const { keyToId, actionKeyToId } = await seedResources();
  await seedRoles(keyToId, actionKeyToId);
  await seedClubPermissions(keyToId, actionKeyToId);
  await seedGymSalesPermissions(keyToId, actionKeyToId);
  await seedFinancialReportsPermissions(keyToId, actionKeyToId);
  await seedAccountingAndAppPermissions(keyToId, actionKeyToId);
  await seedAdminGymPoliciesPermissions(keyToId, actionKeyToId);
  await seedEmptyJobTitleMatrices(keyToId, actionKeyToId);
  await assignUsersByLevel();
  await syncAllEmployeeUserRoles(prisma);
  const cafeJob = await prisma.department_jobs.findFirst({ where: { name: 'إدارة الكافيه' }, select: { id: true } });
  if (cafeJob) {
    const cafeRole = await prisma.rbac_roles.findUnique({ where: { key: jobTitleRoleKey(cafeJob.id) }, select: { id: true } });
    const cafeActions = await prisma.rbac_resource_actions.findMany({
      where: { resource: { OR: [{ key: { startsWith: 'gym-sales' } }, { key: { startsWith: 'club.cafe' } }] } },
      select: { resource_id: true, action_id: true },
    });
    if (cafeRole && cafeActions.length) {
      await prisma.rbac_role_permissions.createMany({
        data: cafeActions.map((cell) => ({ role_id: cafeRole.id, ...cell, effect: 'allow' as const })),
        skipDuplicates: true,
      });
    }
  }
  console.log('✔ RBAC done');
}

// Standalone: `ts-node prisma/seed-rbac.ts`
if (require.main === module) {
  seedRbac()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
