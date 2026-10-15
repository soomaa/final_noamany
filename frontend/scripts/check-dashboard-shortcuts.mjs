import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createFixtureServer } from './local-app-fixture-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ONE80_PLAYWRIGHT_MODULE || 'playwright');
const server = await createFixtureServer(process.env.SHORTCUTS_STATIC_ROOT);
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const defaults = ['/club/subscriptions/daily-cashier', '/finance/expenses', '/finance/profit-loss'];
const routeMap = { '/dashboard': 'admin.dashboard',
  '/club/subscriptions/daily-cashier': 'club.subscriptions.daily_cashier',
  '/finance/expenses': 'financial-reports.expenses', '/finance/profit-loss': 'financial-reports.profit_loss',
  '/club/members': 'club.members.management', '/settings/gym-policies': 'admin.gym-policies',
  '/finance/revenues': 'financial-reports.revenues' };
const catalog = [{ key: 'club', nameAr: 'الجيم', nameEn: 'Gym', type: 'module', route: null, clickable: false, children: [
  ...defaults.map((route, i) => ({ key: routeMap[route], route, nameAr: ['يومية الاستقبال', 'إدارة المصروفات', 'الأرباح والخسائر'][i], nameEn: ['Reception journal', 'Expenses', 'Profit & loss'][i], type: 'page', clickable: true, children: [] })),
  { key: routeMap['/club/members'], route: '/club/members', nameAr: 'إدارة الأعضاء', nameEn: 'Members', type: 'page', clickable: true, children: [] },
  { key: routeMap['/finance/revenues'], route: '/finance/revenues', nameAr: 'إدارة الإيرادات', nameEn: 'Revenues', type: 'page', clickable: true, children: [] },
] }];
const summary = {
  totalMembers: { total: 0, active: 0, inactive: 0, newThisMonth: 0 },
  financials: { revenue: 0, paid: 0, remaining: 0, expenses: 0, profit: 0, cafeRevenue: 0, margin: 0 },
  operations: { activeSubscriptions: 0, newSubscriptions: 0, checkinsToday: 0, checkinsInRange: 0, uniqueVisitors: 0,
    outstandingAmount: 0, outstandingCount: 0, expiring7: 0, expiring30: 0, lowStock: 0, employees: 0,
    trainers: 0, classesToday: 0, facilities: 0, quickSalesToday: 0, quickSalesAmountToday: 0, bookingsToday: 0 },
  trends: [], expenseBreakdown: [], revenueBreakdown: [], packagePerformance: [], membershipStatus: [],
  recentActivities: { members: [], payments: [] }, period: { start: '2026-10-01', end: '2026-10-11', days: 11 },
};
let userId = 1, admin = true, failDashboard = false;
const savedRoutes = new Map();
const output = process.env.SHORTCUTS_QA_DIR || '/tmp/one80-dashboard-shortcuts-qa';
await mkdir(output, { recursive: true });
try {
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.slice(4);
    let body = [];
    if (path === '/auth/me') body = { sub: userId, name: 'حساب معاينة', level: admin ? 1 : 2, branch: 1 };
    else if (path === '/me/permissions') body = { superAdmin: admin, keys: ['admin.dashboard:view', 'club.subscriptions.daily_cashier:view', 'financial-reports.expenses:view', 'club.members.management:view'], routeMap, resourceActions: {}, scope: {} };
    else if (path === '/me/nav') body = catalog;
    else if (path === '/me/shortcuts') {
      if (route.request().method() === 'PUT') savedRoutes.set(userId, route.request().postDataJSON().routes);
      body = { routes: (savedRoutes.get(userId) ?? defaults).filter((to) => admin || ['/club/subscriptions/daily-cashier', '/finance/expenses', '/club/members'].includes(to)) };
    }
    else if (path === '/club-subscriptions/daily-cashier') body = { rows: [], receiptRows: [], quickServiceRows: [], expenseRows: [], users: [], totals: {}, selectedUserId: userId, lockedUser: !admin };
    else if (path === '/me/workspace') body = { homeRoute: '/dashboard', widgets: [], roleHint: 'admin' };
    else if (path === '/dashboard/executive') {
      if (failDashboard) { await route.fulfill({ status: 500, json: { message: 'Fixture unavailable' } }); return; }
      body = summary;
    }
    else if (path.endsWith('branches') || path.endsWith('branch-options')) body = [{ id: 1, name: 'فرع المعاينة', isActive: true }];
    else if (path.endsWith('/unread-count')) body = { count: 0 };
    await route.fulfill({ json: body });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/dashboard`);
  const quick = page.getByRole('region', { name: 'الوصول السريع', exact: true });
  await quick.getByRole('link', { name: 'إدارة المصروفات', exact: true }).waitFor();
  assert.deepEqual(await quick.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href'))), defaults);
  await quick.getByRole('button', { name: 'إضافة اختصار', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const firstSave = page.waitForResponse((response) => response.url().endsWith('/api/me/shortcuts') && response.request().method() === 'PUT');
  await dialog.getByRole('button', { name: 'إدارة الأعضاء', exact: true }).click();
  await firstSave;
  assert.equal(await dialog.getByRole('button', { name: 'إدارة الأعضاء', exact: true }).getAttribute('aria-pressed'), 'true');
  await dialog.getByRole('textbox', { name: 'ابحث عن صفحة', exact: true }).fill('مصروف');
  assert.equal(await dialog.getByRole('button', { name: 'إدارة الأعضاء', exact: true }).count(), 0);
  assert.equal(await dialog.getByRole('button', { name: 'إدارة المصروفات', exact: true }).count(), 1);
  await page.keyboard.press('Escape');
  await page.reload();
  await quick.getByRole('link', { name: 'إدارة الأعضاء', exact: true }).waitFor();
  const headerButton = page.getByRole('banner').getByRole('button', { name: 'الوصول السريع', exact: true });
  await headerButton.click();
  const headerMenu = page.getByRole('dialog', { name: 'الوصول السريع', exact: true });
  await headerMenu.getByRole('link', { name: 'إدارة الأعضاء', exact: true }).waitFor();
  assert.equal(await headerMenu.getByRole('link').count(), 4);
  await headerMenu.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  await page.screenshot({ path: `${output}/header-desktop.png` });
  await headerMenu.getByRole('button', { name: 'تخصيص الاختصارات', exact: true }).click();
  await page.getByRole('dialog', { name: 'خصص الوصول السريع', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'خصص الوصول السريع', exact: true }).waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'الوصول السريع', undefined, { timeout: 2000 });
  assert.equal(await headerButton.evaluate((button) => button === document.activeElement), true);
  await page.screenshot({ path: `${output}/desktop.png` });
  await quick.getByRole('button', { name: 'إضافة اختصار', exact: true }).click();
  await dialog.getByRole('button', { name: 'إدارة الأعضاء', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/picker-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/picker-mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.keyboard.press('Escape');
  await headerButton.click();
  await headerMenu.waitFor();
  await headerMenu.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  await page.screenshot({ path: `${output}/header-mobile.png` });
  await page.setViewportSize({ width: 320, height: 700 });
  const bounds = await headerButton.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320, 'quick access must fit in the mobile header');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const removed = page.waitForResponse((response) => response.url().endsWith('/api/me/shortcuts') && response.request().method() === 'PUT');
  await quick.getByRole('button', { name: 'إزالة الاختصار: إدارة الأعضاء', exact: true }).click();
  await removed;
  await quick.getByRole('link', { name: 'إدارة الأعضاء', exact: true }).waitFor({ state: 'hidden' });
  await page.reload();
  await quick.getByRole('button', { name: 'إضافة اختصار', exact: true }).waitFor();
  assert.equal(await quick.getByRole('link', { name: 'إدارة الأعضاء', exact: true }).count(), 0);

  // Another employee has a separate server preference. Even stale catalog data
  // cannot reveal a page outside the account's current permissions.
  userId = 9; admin = false;
  savedRoutes.set(9, ['/finance/expenses', '/finance/revenues', '//example.com']);
  await page.reload();
  await quick.getByRole('link', { name: 'إدارة المصروفات', exact: true }).waitFor();
  assert.deepEqual(await quick.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href'))), ['/finance/expenses']);
  await quick.getByRole('button', { name: 'إضافة اختصار', exact: true }).click();
  assert.equal(await dialog.getByRole('button', { name: 'إدارة الإيرادات', exact: true }).count(), 0);
  await page.keyboard.press('Escape');
  userId = 1; admin = true;
  await page.reload();
  await quick.getByRole('link', { name: 'يومية الاستقبال', exact: true }).waitFor();
  await headerButton.click();
  await headerMenu.getByRole('link', { name: 'يومية الاستقبال', exact: true }).click();
  await page.waitForURL('**/club/subscriptions/daily-cashier');
  await headerButton.click();
  await headerMenu.getByRole('link', { name: 'إدارة المصروفات', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  userId = 9; admin = false;
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/dashboard`);
  await page.reload();

  await page.evaluate(() => { localStorage.setItem('hr_locale', 'en'); localStorage.setItem('hr_theme', 'dark'); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.getByRole('region', { name: 'Quick access' }).getByRole('button', { name: 'Add shortcut' }).waitFor();
  await page.screenshot({ path: `${output}/english.png` });
  failDashboard = true;
  await page.reload();
  await page.getByRole('region', { name: 'Quick access' }).getByRole('link', { name: 'Expenses', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, screenshots: output, checks: ['default shortcuts', 'catalog picker', 'search', 'add and persist', 'remove and persist', 'header navigation from another page', 'header and dashboard sync', 'keyboard focus return', 'mobile overflow at 320px', 'account isolation', 'permission filtering', 'English labels', 'dashboard failure resilience'], errors }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
