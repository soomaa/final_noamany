import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createFixtureServer } from './local-app-fixture-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ONE80_PLAYWRIGHT_MODULE || 'playwright');
const server = await createFixtureServer(process.env.USER_FILTER_STATIC_ROOT);
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const output = process.env.USER_FILTER_QA_DIR || '/tmp/one80-expense-user-filter-qa';
await mkdir(output, { recursive: true });
let ownOnly = false, failUsers = false;
let userRequests = 0;
const accounts = [{ id: 11, name: 'Abdelrahman' }, { id: 9, name: 'Radwa' }, { id: 10, name: 'Rahma' }];
const rows = [9, 10, 11, 10, 9].map((createdBy, index) => ({
  id: index + 1, expenseNumber: `EXP-${index + 1}`, expenseDate: '2026-10-11T16:00:00', createdAt: '2026-10-11T16:00:00',
  businessUnit: index === 4 ? 'cafe' : 'gym', branchId: 1, createdBy,
  createdByName: accounts.find((account) => account.id === createdBy).name,
  category: 'نظافة', vendor: null, amount: 1500, taxAmount: 0, totalAmount: 1500,
  paidAmount: 1500, remainingAmount: 0, paymentMethod: 'نقدي', paymentStatus: 'مدفوع', approvalStatus: 'موافق عليه',
}));
const listResponse = (userId, pageNumber = 1, size = 2) => (response) => {
  const url = new URL(response.url());
  return url.pathname === '/api/expenses' && url.searchParams.get('userId') === userId
    && Number(url.searchParams.get('page')) === pageNumber && Number(url.searchParams.get('pageSize')) === size;
};
try {
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.slice(4);
    let body = [];
    if (path === '/auth/me') body = { sub: ownOnly ? 9 : 1, name: ownOnly ? 'Radwa' : 'مدير النظام', level: ownOnly ? 2 : 1, branch: 1 };
    else if (path === '/me/permissions') body = { superAdmin: !ownOnly, keys: ['financial-reports.expenses:view'], scope: { 'financial-reports.expenses': ownOnly ? 'own' : 'branch' }, resourceActions: {}, routeMap: { '/finance/expenses': 'financial-reports.expenses' } };
    else if (path === '/me/shortcuts') body = { routes: ['/finance/expenses'] };
    else if (path === '/me/workspace') body = { homeRoute: '/finance/expenses', widgets: [] };
    else if (path === '/club/gym-policies') body = {};
    else if (path === '/expense-categories') body = [{ id: 1, name: 'نظافة', isActive: true }];
    else if (path === '/expenses/users') {
      userRequests++;
      if (failUsers) { await route.fulfill({ status: 503, json: { message: 'Fixture unavailable' } }); return; }
      body = ownOnly ? [accounts[1]] : accounts;
    } else if (path === '/expenses') {
      const userId = ownOnly ? '9' : url.searchParams.get('userId');
      const filtered = rows.filter((row) => row.businessUnit === (url.searchParams.get('businessUnit') || 'gym') && (!userId || row.createdBy === Number(userId)));
      const pageNumber = Number(url.searchParams.get('page')) || 1;
      const size = Number(url.searchParams.get('pageSize')) || 25;
      body = { data: filtered.slice((pageNumber - 1) * size, pageNumber * size), total: filtered.length, page: pageNumber, pageSize: size };
    } else if (path.endsWith('branches') || path.endsWith('branch-options')) body = [{ id: 1, name: 'الفرع الرئيسي' }];
    else if (path.endsWith('unread-count')) body = { count: 0 };
    await route.fulfill({ json: body });
  });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(`${origin}/finance/expenses?businessUnit=gym&page=2&pageSize=2`);
  const userFilter = page.getByRole('combobox', { name: 'المستخدم', exact: true });
  await userFilter.waitFor();
  await userFilter.click();
  await page.getByRole('option', { name: 'Radwa', exact: true }).waitFor();
  assert.equal(await page.getByRole('option', { name: 'Rahma', exact: true }).count(), 1);
  assert.equal(await page.getByRole('option', { name: 'كل المستخدمين', exact: true }).count(), 1);
  await page.keyboard.press('Escape');
  const filteredResponse = page.waitForResponse(listResponse('10'));
  await userFilter.click();
  await page.getByRole('option', { name: 'Rahma', exact: true }).click();
  await filteredResponse;
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2 && [...document.querySelectorAll('tbody tr')].every((row) => row.textContent.includes('Rahma')));
  assert.equal(new URL(page.url()).searchParams.get('page'), '1');
  await page.screenshot({ path: `${output}/desktop.png` });

  await page.getByRole('button', { name: 'تصدير', exact: true }).click();
  const exportedResponse = page.waitForResponse(listResponse('10', 1, 500));
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Excel', exact: true }).click();
  await exportedResponse;
  await download;
  await page.reload();
  await userFilter.getByText('Rahma', { exact: true }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await userFilter.scrollIntoViewIfNeeded();
  const box = await userFilter.boundingBox();
  assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= 390);
  await userFilter.click();
  await page.getByRole('option', { name: 'Rahma', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'مصروفات الكافيه', exact: true }).click();
  await page.getByRole('button', { name: 'مسح الفلاتر', exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get('businessUnit'), 'cafe');
  assert.equal(new URL(page.url()).searchParams.has('userId'), false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { localStorage.setItem('hr_locale', 'en'); localStorage.setItem('hr_theme', 'dark'); });
  await page.reload();
  await page.getByRole('combobox', { name: 'User', exact: true }).waitFor();
  const contrast = await page.getByRole('combobox', { name: 'User', exact: true }).evaluate((element) => {
    const style = getComputedStyle(element);
    const luminance = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number).map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const text = luminance(style.color), background = luminance(style.backgroundColor);
    return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
  });
  assert.ok(contrast >= 4.5, `user filter contrast must meet WCAG AA (received ${contrast})`);
  await page.screenshot({ path: `${output}/english-dark.png` });

  await page.evaluate(() => localStorage.setItem('hr_locale', 'ar'));
  failUsers = true;
  await page.reload();
  await page.getByRole('alert').getByText('تعذر تحميل المستخدمين').waitFor();
  assert.equal(await userFilter.isDisabled(), true);
  failUsers = false;
  await page.getByRole('alert').getByRole('button', { name: 'إعادة المحاولة' }).click();
  await page.waitForFunction(() => !document.querySelector('[role=combobox][aria-label="المستخدم"]')?.disabled);

  ownOnly = true;
  const priorRequests = userRequests;
  await page.goto(`${origin}/finance/expenses?businessUnit=gym&userId=10`);
  await page.reload();
  await page.getByText('مصروفاتي فقط', { exact: true }).waitFor();
  assert.equal(await userFilter.count(), 0);
  assert.equal(userRequests, priorRequests);
  await page.waitForFunction(() => [...document.querySelectorAll('tbody tr')].some((row) => row.textContent.includes('Radwa')));
  assert.equal(await page.locator('tbody').getByText('Rahma', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, screenshots: output, checks: ['all accessible creators across pages', 'user selection and page reset', 'filtered export', 'URL persistence', 'mobile fit and touch target', 'preserve cafe when clearing filters', 'English and dark mode', 'user-list error and retry', 'own-only scope with forged user filter'], errors }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
