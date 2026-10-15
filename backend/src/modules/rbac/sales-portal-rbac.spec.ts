import { defaultPermissionCellsForJobTitle } from './job-title-defaults';
import { flattenCatalog, RESOURCE_TREE } from './catalog/rbac.catalog';
import { WorkspaceService } from './workspace.service';

function workspaceFor(keys: string[]) {
  const engine = {
    getEffective: async () => ({ superAdmin: false, keys: new Set(keys) }),
  };
  const prisma = {
    users: { findUnique: jest.fn().mockResolvedValue({ emp_code: null }) },
    club_trainers: { findUnique: jest.fn() },
  };
  return new WorkspaceService(engine as never, prisma as never);
}

describe('personal sales RBAC and landing', () => {
  it.each(['أخصائي مبيعات', 'sales'])(
    'grants %s only the personal read-and-follow-up portal',
    (title) => {
      const cells = defaultPermissionCellsForJobTitle(title);

      expect(cells).toEqual(expect.arrayContaining([
        { resourceKey: 'sales.portal', actionKey: 'view', effect: 'allow' },
        { resourceKey: 'sales.portal', actionKey: 'update', effect: 'allow' },
      ]));
      expect(cells.some((cell) => cell.resourceKey === 'club.members')).toBe(false);
      expect(cells.some((cell) => cell.resourceKey === 'club.subscriptions')).toBe(false);
      expect(cells.some((cell) => cell.resourceKey === 'club.sales.reports')).toBe(false);
      expect(cells.some((cell) => cell.resourceKey === 'club.leads')).toBe(false);
    },
  );

  it('owns personal and management routes without changing POS route ownership', () => {
    const flat = flattenCatalog(RESOURCE_TREE);
    const byKey = new Map(flat.map((resource) => [resource.key, resource]));

    expect(byKey.get('sales.portal')?.route).toBe('/sales-portal');
    expect(byKey.get('club.leads')?.parentKey).toBe('club.sales-management');
    expect(byKey.get('club.sales.dashboard')?.route).toBe('/club/sales-dashboard');
    expect(byKey.get('club.sales.reports')?.route).toBe('/club/sales-reports');
    expect(byKey.get('club.sales.settings')?.route).toBe('/club/sales-settings');
    expect(byKey.get('gym-sales.sales.new_receipt')?.route).toBe('/sales/new');
  });

  it('lands a personal-sales user on the conflict-free portal even when POS is also allowed', async () => {
    const workspace = await workspaceFor([
      'sales.portal:view',
      'gym-sales.sales.new_receipt:view',
    ]).getWorkspace(1);

    expect(workspace.homeRoute).toBe('/sales-portal');
    expect(workspace.roleHint).toBe('sales');
  });

  it('keeps a cashier without personal-sales permission on POS', async () => {
    const workspace = await workspaceFor([
      'gym-sales.sales.new_receipt:view',
    ]).getWorkspace(1);

    expect(workspace.homeRoute).toBe('/sales/new');
    expect(workspace.roleHint).toBe('cafe');
  });
});
