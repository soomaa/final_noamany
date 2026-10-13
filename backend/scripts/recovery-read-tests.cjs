// Read-only integration checks. Never bootstrap AppModule: that starts schedulers.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const root = path.resolve(__dirname, '..');
process.env.NODE_PATH = path.join(root, 'node_modules');
require('node:module').Module._initPaths();
const configured = process.argv.includes('--configured-database');
const currentData = process.argv.includes('--current-data');
const built = configured ? path.join(root, 'dist') : path.join(root, '.recovery-verified-dist');
const url = new URL(require('dotenv').parse(fs.readFileSync(process.env.NOAMANY_CONFIG_FILE || path.join(root, '.env'))).DATABASE_URL);
if (!configured) {
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Loopback only');
  url.pathname = currentData ? '/noamany_update_20261001_current' : '/noamany_recovery_20260930_20261001';
}
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
prisma.$use(async (params, next) => {
  const allowed = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'aggregate', 'count', 'groupBy', 'queryRaw']);
  if (!allowed.has(params.action)) throw new Error('Read-only recovery check blocked: ' + params.action);
  return next(params);
});
function load(relative, name) { return require(path.join(built, relative))[name]; }
const Scope = load('common/branch-scope/branch-scope.service.js', 'BranchScopeService');
const Cache = load('modules/rbac/engine/permission-cache.service.js', 'PermissionCacheService');
const Engine = load('modules/rbac/engine/permission-engine.service.js', 'PermissionEngineService');
const engine = new Engine(prisma, new Cache());
const scope = new Scope();
const blocked = new Proxy({}, { get: (_, name) => () => { throw new Error('Unused dependency invoked: ' + String(name)); } });
const Subscriptions = load('modules/club-subscriptions/club-subscriptions.service.js', 'ClubSubscriptionsService');
const Receipts = load('modules/club-subscriptions/club-receipts-crud.service.js', 'ClubReceiptsCrudService');
const Reports = load('modules/club-subscriptions/subscription-reports.service.js', 'SubscriptionReportsService');
const Lockers = load('modules/club-lockers/club-lockers.service.js', 'ClubLockersService');
const Closing = load('modules/finance/daily-closing-target.service.js', 'DailyClosingTargetService');
const Users = load('modules/rbac/admin/rbac-users.service.js', 'RbacUsersService');
const Roles = load('modules/rbac/admin/roles.service.js', 'RbacRolesService');
const Auth = load('modules/auth/auth.service.js', 'AuthService');
const Dashboard = load('modules/club-dashboard/club-dashboard.service.js', 'ClubDashboardService');
const Workspace = load('modules/rbac/workspace.service.js', 'WorkspaceService');
const Employees = load('modules/employees/employees.service.js', 'EmployeesService');
const ListSubs = load('modules/club-subscriptions/dto/list-club-subscriptions.dto.js', 'ListClubSubscriptionsDto');
const ListReceipts = load('modules/club-subscriptions/dto/club-receipts.dto.js', 'ListClubReceiptsDto');
const subscriptions = new Subscriptions(prisma, blocked, blocked, blocked, blocked, scope, engine, blocked, blocked);
const receipts = new Receipts(prisma, blocked, blocked, scope);
const tests = [];
async function check(name, fn) {
  const started = Date.now();
  try {
    const value = await fn();
    tests.push({ name, ok: true, ms: Date.now() - started, ...value });
  } catch (e) {
    tests.push({ name, ok: false, code: e.code || e.name, message: e.message.slice(-600) });
  }
  console.log(name + ': ' + (tests.at(-1).ok ? 'PASS' : 'FAIL'));
}
async function main() {
  if (!configured) {
    const n = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()');
    if (Number(n[0].n) < 464) throw new Error('Full recovery import has not completed');
  }
  const adminRow = await prisma.users.findFirst({ where: { level: 1 }, select: { user_id: true } });
  if (!adminRow) throw new Error('No restored administrator found');
  const admin = { sub: adminRow.user_id, level: 1, branch: 0, man_women_type: 3, emp_code: null };
  const list = plainToInstance(ListSubs, { page: '1', pageSize: '25' });
  await check('subscription DTO validation', async () => { if ((await validate(list)).length) throw new Error('Invalid DTO'); });
  await check('subscription list', async () => { const r = await subscriptions.list(list, admin); return { total: r.total, rows: r.data.length }; });
  await check('subscription list date filters', async () => {
    const q = plainToInstance(ListSubs, { page: '1', pageSize: '25', registrationDateFrom: '2026-09-30', registrationDateTo: '2026-09-30' });
    const r = await subscriptions.list(q, admin); return { total: r.total, rows: r.data.length };
  });
  await check('receipt DTO accepts 500', async () => { const q = plainToInstance(ListReceipts, { page: '1', pageSize: '500' }); if ((await validate(q)).length) throw new Error('Invalid receipt DTO'); });
  await check('receipt list', async () => { const r = await receipts.list(plainToInstance(ListReceipts, { page: '1', pageSize: '25' }), admin); return { total: r.total, rows: r.data.length }; });
  await check('receipt list 500 with payment breakdowns', async () => {
    const r = await receipts.list(plainToInstance(ListReceipts, { page: '1', pageSize: '500' }), admin);
    return { total: r.total, rows: r.data.length, hasBreakdowns: r.data.every(x => Array.isArray(x.payments)) };
  });
  await check('receipt details with subscription and member', async () => {
    const row = await prisma.club_receipts.findFirst({ where: { branch_id: { not: null } }, select: { id: true } });
    if (!row) throw new Error('No branch-linked receipt available for detail verification');
    await receipts.findOne(row.id, admin);
    return {};
  });
  await check('subscription statistics', () => subscriptions.statistics(undefined, admin, '2026-09-30', '2026-09-30').then(() => ({})));
  await check('subscription report summary', () => new Reports(prisma, scope).summary({ startDate: '2026-09-30', endDate: '2026-09-30' }, admin).then(() => ({})));
  await check('lockers list', async () => ({ rows: (await new Lockers(prisma, blocked, scope, blocked, blocked).listLockers({}, admin)).length }));
  await check('daily closing', () => new Closing(prisma, scope).dailyClosing({ fromDate: '2026-09-30', toDate: '2026-09-30' }, admin).then(() => ({})));
  await check('dashboard summary', () => new Dashboard(prisma, scope, engine).summary({ startDate: '2026-09-30', endDate: '2026-09-30' }, admin).then(() => ({})));
  await check('permission user picker', async () => ({ rows: (await new Users(prisma, engine, blocked).listUsers()).length }));
  await check('roles list read-only', () => new Roles(prisma, engine, blocked).list().then(r => ({ roles: r.roles.length })));
  const employees = await prisma.users.findMany({ where: { level: { in: [2, 3] }, approved: 1, emp_code: { not: null } }, select: { user_id: true }, take: 10 });
  const auth = new Auth(prisma, blocked, blocked, blocked);
  for (const row of employees) {
    await check('employee permissions ' + row.user_id, async () => { const r = await engine.getEffective(row.user_id); return { keys: r.keys.size, superAdmin: r.superAdmin }; });
    await check('employee profile claims ' + row.user_id, async () => {
      const r = await auth.getSessionUser(row.user_id);
      if (r.emp_code != null) await new Employees(prisma).profile(r.emp_code);
      return { branch: r.branch, hasEmployee: r.emp_code != null };
    });
    await check('employee workspace ' + row.user_id, () => new Workspace(engine, prisma).getWorkspace(row.user_id).then(r => ({ route: r.homeRoute, widgets: r.widgets.length })));
  }
  const output = configured ? path.join(root, 'release-read-tests.json') : path.resolve(root, currentData ? '../output/update-20261001/read-tests.json' : '../output/recovery-20261001/read-tests.json');
  fs.writeFileSync(output, JSON.stringify({ tests, passed: tests.filter(t => t.ok).length, failed: tests.filter(t => !t.ok).length }, null, 2));
  process.exitCode = tests.some(t => !t.ok) ? 1 : 0;
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
