import { ForbiddenException } from '@nestjs/common';
import { JwtUser } from '../../common/types/jwt-user';
import { AccountingReportsService } from '../accounting/accounting-reports.service';
import { ClubDashboardService } from '../club-dashboard/club-dashboard.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { PermissionCacheService } from '../rbac/engine/permission-cache.service';
import { ExpensesService } from './expenses.service';
import { FinanceReportsService } from './finance-reports.service';
import { resolveFinanceCreatorScope } from './finance-user-scope';

const user = { sub: 9, level: 2, branchIds: [1] } as unknown as JwtUser;

function setup(options: { private?: boolean; admin?: boolean; scope?: string; creator?: number | null } = {}) {
  let privateFinancials = options.private ?? true;
  const row = { id: 41, expense_number: 'EXP-41', branch_id: 1, created_by: options.creator === undefined ? 10 : options.creator, is_deleted: false, total_amount: 100 };
  const prisma = {
    club_gym_policies: { findUnique: jest.fn(async () => ({ restrict_employee_financial_visibility: privateFinancials })) },
    fin_expenses: {
      findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(row), findUnique: jest.fn().mockResolvedValue(row),
      aggregate: jest.fn().mockResolvedValue({ _sum: { total_amount: 0 } }),
      groupBy: jest.fn().mockResolvedValue([]), update: jest.fn(),
    },
    users: { findMany: jest.fn().mockResolvedValue([]) },
    acc_journal_entry_lines: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const cache = new PermissionCacheService();
  cache.set(user.sub, {
    superAdmin: options.admin ?? false,
    keys: new Set(['financial-reports.expenses:view']),
    scope: new Map([
      ['financial-reports', options.scope ?? 'branch'],
      ['financial-reports.expenses', options.scope ?? 'branch'],
      ['financial-reports.profit_loss', options.scope ?? 'branch'],
      ['employees.list', 'branch'],
    ]),
  });
  const permissions = new PermissionEngineService(prisma as never, cache);
  const branch = { resolveListFilter: jest.fn(() => [1]), isBranchAllowed: jest.fn(() => true) };
  const ledger = { syncExpense: jest.fn() };
  const expenses = new ExpensesService(prisma as never, ledger as never, branch as never, permissions);
  return { prisma, permissions, expenses, branch, ledger, setPrivacy: (value: boolean) => { privateFinancials = value; } };
}

describe('employee financial privacy policy', () => {
  it('overrides broad role scopes, ignores forged user filters and leaves HR scopes unchanged', async () => {
    const s = setup({ scope: 'global' });
    await expect(resolveFinanceCreatorScope(s.permissions, user, '10', 'financial-reports.expenses')).resolves.toMatchObject({ lockedUser: true, selectedUserId: 9 });
    await expect(s.permissions.scopeFor(9, 'employees.list')).resolves.toBe('branch');
  });

  it('takes effect on the next request even when permissions are already cached', async () => {
    const s = setup({ private: false });
    await expect(resolveFinanceCreatorScope(s.permissions, user)).resolves.toMatchObject({ selectedUserId: null });
    s.setPrivacy(true);
    await expect(resolveFinanceCreatorScope(s.permissions, user)).resolves.toMatchObject({ selectedUserId: 9 });
    s.setPrivacy(false);
    await expect(resolveFinanceCreatorScope(s.permissions, user)).resolves.toMatchObject({ selectedUserId: null });
  });

  it('preserves system administrator visibility and selected-user filtering', async () => {
    const s = setup({ admin: true });
    await expect(resolveFinanceCreatorScope(s.permissions, user)).resolves.toMatchObject({ lockedUser: false, selectedUserId: null });
    await expect(resolveFinanceCreatorScope(s.permissions, user, '10')).resolves.toMatchObject({ selectedUserId: 10 });
  });

  it('keeps explicit own scope restricted when the global policy is off', async () => {
    const s = setup({ private: false, scope: 'own' });
    await expect(resolveFinanceCreatorScope(s.permissions, user, '10')).resolves.toMatchObject({ selectedUserId: 9 });
    await expect(resolveFinanceCreatorScope(s.permissions, undefined, '10')).resolves.toMatchObject({ selectedUserId: -1 });
  });

  it('applies the same creator and branch filter to expense rows, counts and every statistic', async () => {
    const s = setup();
    await s.expenses.list({ userId: '10', branchId: '1', skip: 0, take: 20, page: 1, pageSize: 20 } as never, user);
    const where = s.prisma.fin_expenses.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([{ created_by: 9 }, { branch_id: { in: [1] } }]));
    expect(s.prisma.fin_expenses.count).toHaveBeenCalledWith({ where });
    await s.expenses.statistics({ userId: '10', branchId: '1' } as never, user);
    for (const call of s.prisma.fin_expenses.groupBy.mock.calls) {
      expect(call[0].where.AND).toEqual(expect.arrayContaining([{ created_by: 9 }, { branch_id: { in: [1] } }]));
    }
    expect(s.prisma.fin_expenses.aggregate.mock.calls[0][0].where.AND).toContainEqual({ created_by: 9 });
  });

  it('lists only accessible expense creators with minimal user details, across all pages', async () => {
    const s = setup({ admin: true });
    s.prisma.fin_expenses.groupBy.mockResolvedValue([{ created_by: 9 }, { created_by: 10 }]);
    s.prisma.users.findMany.mockResolvedValue([{ user_id: 9, name: 'Radwa' }, { user_id: 10, name: 'Rahma' }]);
    await expect(s.expenses.userOptions({ businessUnit: 'cafe', branchId: '1' }, user)).resolves.toEqual([
      { id: 9, name: 'Radwa' }, { id: 10, name: 'Rahma' },
    ]);
    const query = s.prisma.fin_expenses.groupBy.mock.calls[0][0];
    expect(query.by).toEqual(['created_by']);
    expect(query.where.AND).toEqual(expect.arrayContaining([
      { created_by: { not: null } }, { business_unit: 'cafe' }, { branch_id: 1 }, { branch_id: { in: [1] } },
    ]));
    expect(query).not.toHaveProperty('take');
    expect(s.prisma.users.findMany).toHaveBeenCalledWith({
      where: { user_id: { in: [9, 10] } }, select: { user_id: true, name: true },
      orderBy: [{ name: 'asc' }, { user_id: 'asc' }],
    });
  });

  it('applies financial privacy to user options even if a caller forges a user filter', async () => {
    const s = setup({ scope: 'global' });
    s.prisma.fin_expenses.groupBy.mockResolvedValue([{ created_by: 9 }]);
    s.prisma.users.findMany.mockResolvedValue([{ user_id: 9, name: 'Radwa' }]);
    await expect(s.expenses.userOptions({ userId: '10' } as never, user)).resolves.toEqual([{ id: 9, name: 'Radwa' }]);
    expect(s.prisma.fin_expenses.groupBy.mock.calls[0][0].where.AND).toContainEqual({ created_by: 9 });
    expect(s.prisma.users.findMany.mock.calls[0][0].where).toEqual({ user_id: { in: [9] } });
  });

  it('keeps branch-scoped user options inside allowed branches without needing user administration', async () => {
    const s = setup({ private: false, scope: 'branch' });
    await expect(s.expenses.userOptions({ branchId: '99' }, user)).resolves.toEqual([]);
    expect(s.prisma.fin_expenses.groupBy.mock.calls[0][0].where.AND).toEqual(expect.arrayContaining([
      { branch_id: 99 }, { branch_id: { in: [1] } },
    ]));
    expect(s.prisma.users.findMany).not.toHaveBeenCalled();
    await s.expenses.userOptions({}, undefined);
    expect(s.prisma.fin_expenses.groupBy.mock.calls[1][0].where.AND).toContainEqual({ created_by: -1 });
  });

  it('honors an authorized user selection in expense rows, pagination counts and totals', async () => {
    const s = setup({ private: false, scope: 'branch' });
    await s.expenses.list({ userId: '10', branchId: '1', skip: 20, take: 20, page: 2, pageSize: 20 } as never, user);
    const where = s.prisma.fin_expenses.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ created_by: 10 });
    expect(s.prisma.fin_expenses.count).toHaveBeenCalledWith({ where });
    await s.expenses.statistics({ userId: '10' }, user);
    expect(s.prisma.fin_expenses.aggregate.mock.calls[0][0].where.AND).toContainEqual({ created_by: 10 });
  });

  it.each(['findOne', 'update', 'remove', 'approve', 'reject'] as const)('blocks %s on another employee expense before any mutation', async (operation) => {
    const s = setup();
    const request = operation === 'findOne' ? s.expenses.findOne(41, user)
      : operation === 'update' ? s.expenses.update(41, { amount: 200 }, user)
      : operation === 'remove' ? s.expenses.remove(41, user)
      : operation === 'approve' ? s.expenses.approve(41, 9, user)
      : s.expenses.reject(41, { notes: 'test' }, 9, user);
    await expect(request).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.prisma.fin_expenses.update).not.toHaveBeenCalled();
    expect(s.ledger.syncExpense).not.toHaveBeenCalled();
  });

  it('does not expose system-created expenses to an employee', async () => {
    const s = setup({ creator: null });
    await expect(s.expenses.findOne(41, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows reading the current employee expense and still enforces branch isolation', async () => {
    const s = setup({ creator: 9 });
    await expect(s.expenses.findOne(41, user)).resolves.toMatchObject({ id: 41, createdBy: 9 });
    s.branch.isBranchAllowed.mockReturnValue(false);
    await expect(s.expenses.findOne(41, user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scopes P&L to the current employee without the old all-payroll bypass', async () => {
    const s = setup();
    const accounting = new AccountingReportsService(s.prisma as never, s.branch as never);
    const reports = new FinanceReportsService(s.prisma as never, s.branch as never, accounting, s.permissions);
    await reports.profitLoss({ userId: '10', branchId: '1' }, user);
    const where = s.prisma.acc_journal_entry_lines.findMany.mock.calls[0][0].where;
    expect(where.entry).toMatchObject({ created_by: 9, branch_id: { in: [1] } });
    expect(where.entry).not.toHaveProperty('OR');
    expect(JSON.stringify(where)).not.toContain('payroll');
  });

  it('scopes executive dashboard money, recent receipts and cafe collections to the employee', async () => {
    const s = setup();
    const empty = () => ({ findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) });
    const db = {
      ...s.prisma, $queryRaw: jest.fn().mockResolvedValue([]),
      club_members: empty(), club_subscriptions: empty(), club_locker_subscriptions: empty(),
      club_attendance: empty(), club_halls: empty(), club_trainers: empty(), club_classes: empty(),
      club_spa_invoices: empty(), club_inbody_invoices: empty(), club_class_enrollments: empty(),
      club_receipts: empty(), club_subscription_refunds: empty(), employees: empty(), sales_bookings: empty(),
      sales_quick_sales: { ...empty(), aggregate: jest.fn().mockResolvedValue({ _sum: { collected_amount: 0 } }) },
    };
    const dashboard = new ClubDashboardService(db as never, s.branch as never, s.permissions);
    await dashboard.executive({ startDate: '2026-10-01', endDate: '2026-10-11' }, user);
    for (const model of [db.club_locker_subscriptions, db.club_spa_invoices, db.club_inbody_invoices,
      db.club_receipts, db.club_subscription_refunds, db.sales_quick_sales]) {
      expect(model.findMany.mock.calls[0][0].where).toMatchObject({ created_by: 9 });
    }
    const rangedSubscriptions = db.club_subscriptions.findMany.mock.calls.filter(([query]) => query.where.registration_date);
    expect(rangedSubscriptions).toHaveLength(2);
    for (const [query] of rangedSubscriptions) expect(query.where.created_by).toBe(9);
    expect(db.sales_quick_sales.aggregate.mock.calls[0][0].where).toMatchObject({ created_by: 9 });
    expect(db.club_class_enrollments.findMany.mock.calls[0][0].where).toMatchObject({ id: -1 });
    const fragments = db.$queryRaw.mock.calls[0].slice(1) as Array<{ sql?: string; values?: unknown[] }>;
    expect(fragments).toEqual(expect.arrayContaining([expect.objectContaining({ sql: 'AND e.created_by = ?', values: [9] })]));
  });
});
