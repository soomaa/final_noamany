import { HrPermissionCatalogAdapter } from '../ports/rbac/hr-permission-catalog.adapter';
import { buildPortableRbacSeedPlan } from './portable-rbac-seed';

describe('portable RBAC seed plan', () => {
  it('is deterministic, complete, host-neutral and provides safe starter roles', () => {
    const catalog = new HrPermissionCatalogAdapter().resources();
    const first = buildPortableRbacSeedPlan(catalog);
    const second = buildPortableRbacSeedPlan(catalog);

    expect(second).toEqual(first);
    expect(new Set(first.resources.map((resource) => resource.key)).size).toBe(first.resources.length);
    expect(new Set(first.actions.map((action) => action.key))).toEqual(
      new Set(catalog.flatMap((resource) => resource.actions)),
    );
    expect(first.roles.map((role) => role.key)).toEqual([
      'super_admin', 'hr_manager', 'branch_manager', 'employee',
    ]);
    expect(first.roles.find((role) => role.key === 'super_admin')?.isSuperAdmin).toBe(true);
    expect(first.roles.find((role) => role.key === 'hr_manager')?.scopes.every((item) => item.scope === 'global')).toBe(true);
    expect(first.roles.find((role) => role.key === 'branch_manager')?.scopes.every((item) => item.scope === 'branch')).toBe(true);
    expect(first.roles.find((role) => role.key === 'employee')?.scopes.every((item) => item.scope === 'own')).toBe(true);
    const hostTerms = new RegExp(['one' + '80', 'club', 'cafe', 'gym-sales', 'inventory'].join('|'), 'i');
    expect(JSON.stringify(first)).not.toMatch(hostTerms);
  });
});
