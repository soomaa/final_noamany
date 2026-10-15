import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DashboardShortcutsService } from './dashboard-shortcuts.service';

function setup() {
  const users = new Map<number, string[] | null>([[9, null], [10, ['/finance/expenses']]]);
  const keys = new Set(['club.subscriptions.daily_cashier:view', 'financial-reports.expenses:view']);
  const effective = { superAdmin: false, keys, scope: new Map() };
  const prisma = { users: {
    findUnique: jest.fn(async ({ where }) => ({ dashboard_shortcuts: users.get(where.user_id) })),
    update: jest.fn(async ({ where, data }) => { users.set(where.user_id, data.dashboard_shortcuts); return {}; }),
  } };
  const permissions = { getEffective: jest.fn(async () => effective), getEffectiveFresh: jest.fn(async () => effective) };
  return { service: new DashboardShortcutsService(prisma as never, permissions as never), prisma, permissions, effective, users };
}

describe('account dashboard shortcuts', () => {
  it('filters defaults and saved shortcuts to current view permissions', async () => {
    const s = setup();
    await expect(s.service.get(9)).resolves.toEqual({ routes: ['/club/subscriptions/daily-cashier', '/finance/expenses'] });
    s.users.set(9, ['/finance/expenses', '/finance/profit-loss']);
    await expect(s.service.get(9)).resolves.toEqual({ routes: ['/finance/expenses'] });
  });
  it('saves only to the signed-in user and preserves a deliberately empty selection', async () => {
    const s = setup();
    await s.service.save(9, []);
    await expect(s.service.get(9)).resolves.toEqual({ routes: [] });
    await expect(s.service.get(10)).resolves.toEqual({ routes: ['/finance/expenses'] });
    expect(s.prisma.users.update).toHaveBeenCalledWith({ where: { user_id: 9 }, data: { dashboard_shortcuts: [] } });
  });
  it('deduplicates entries and verifies permissions afresh before saving', async () => {
    const s = setup();
    await expect(s.service.save(9, ['/finance/expenses', '/finance/expenses'])).resolves.toEqual({ routes: ['/finance/expenses'] });
    expect(s.permissions.getEffectiveFresh).toHaveBeenCalledWith(9);
    s.effective.keys.delete('financial-reports.expenses:view');
    await expect(s.service.save(9, ['/finance/expenses'])).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.prisma.users.update).toHaveBeenCalledTimes(1);
  });
  it('rejects forged or external paths even for a system administrator', async () => {
    const s = setup();
    s.effective.superAdmin = true;
    for (const path of ['//example.com', '/finance/expenses/999', '/dashboard', '/unknown', 'https://example.com', 'toString', '__proto__']) {
      await expect(s.service.save(9, [path])).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(s.prisma.users.update).not.toHaveBeenCalled();
    await expect(s.service.save(9, ['/finance/profit-loss'])).resolves.toMatchObject({ routes: ['/finance/profit-loss'] });
  });
});
