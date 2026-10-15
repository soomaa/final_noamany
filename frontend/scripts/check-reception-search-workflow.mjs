import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { createFixtureServer } from './local-app-fixture-server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ONE80_PLAYWRIGHT_MODULE || 'playwright');
const server = await createFixtureServer(process.env.SEARCH_STATIC_ROOT);
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12_000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const member = { id: 7, memberCode: 'A000007', name: 'Search Regression Member', branchId: 1,
  phone: null, cardNumber: null, gender: 'male', isActive: true, matchType: 'code', score: 1000,
  activeSubscriptionType: null, subscriptionStatus: null, remainingAmount: null, lastCheckIn: null };
let releaseSearch;
let failed = false;
let hold = true;
const writes = [];
const started = [];
let empty = false;
const output = fileURLToPath(new URL('../../outputs/reception-search-investigation-20261008/', import.meta.url));

try {
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(4);
    let body = [];
    let status = 200;
    if (request.method() !== 'GET' && path !== '/club/entitlement/validate') writes.push(path);
    if (path === '/auth/me') body = { sub: 1, id: 1, name: 'Test Operator', level: 1, branch: 1 };
    else if (path === '/me/permissions') body = { superAdmin: true, keys: [], routeMap: {}, resourceActions: {}, scope: {} };
    else if (path === '/me/workspace') body = { homeRoute: '/club/reception', widgets: [], roleHint: 'admin' };
    else if (path === '/me/workspace/widgets') body = { config: { widgets: [] }, data: {} };
    else if (path.endsWith('branches') || path.endsWith('branch-options')) body = [{ id: 1, name: 'Test Branch', isActive: true }];
    else if (path === '/club-lockers/handoffs/open') body = { holding: [], availableLockers: [] };
    else if (path === '/club/search') {
      started.push(url.searchParams.get('q'));
      if (hold) await new Promise(resolve => { releaseSearch = resolve; });
      status = failed ? 503 : 200;
      body = failed ? { message: 'Search temporarily unavailable' } : empty ? [] : [member];
    }
    else if (path === '/club-members/7') body = member;
    else if (path === '/club/entitlement/validate') body = { allowed: true, member, reasons: [], warnings: [] };
    else if (path === '/club-subscriptions' || path === '/club-attendance') body = { data: [], total: 0, page: 1, pageSize: 25 };
    else if (path === '/club-attendance/statistics') body = { todayCheckIns: 0, todayCheckOuts: 0, activeCheckIns: 0, totalRecords: 0 };
    else if (path.endsWith('/unread-count')) body = { count: 0 };
    await route.fulfill({ status, json: body }).catch(() => {});
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/club/reception`);
  const input = page.getByRole('textbox', { name: 'بحث سريع عن العضو', exact: true });
  await input.waitFor();
  if (process.env.SEARCH_PROFILE) {
    hold = false;
    await page.waitForTimeout(500);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
      window.typingQA = { frames: [], longTasks: [] };
      new PerformanceObserver(list => window.typingQA.longTasks.push(...list.getEntries().map(e => e.duration)))
        .observe({ type: 'longtask', buffered: false });
      document.addEventListener('keydown', event => {
        if (event.key.length !== 1) return;
        const start = performance.now();
        requestAnimationFrame(() => window.typingQA.frames.push(performance.now() - start));
      }, true);
    });
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
    await input.pressSequentially('01012345678', { delay: 240 });
    await page.waitForTimeout(900);
    const { profile } = await cdp.send('Profiler.stop');
    const metrics = await page.evaluate(() => window.typingQA);
    const names = new Map(profile.nodes.map(n => [n.id, `${n.callFrame.functionName} ${n.callFrame.url}`]));
    const samples = new Map();
    profile.samples.forEach((id, i) => samples.set(names.get(id), (samples.get(names.get(id)) ?? 0) + profile.timeDeltas[i] / 1000));
    const report = { cpuThrottle: 4, typing: metrics, hotFunctionsMs: [...samples].sort((a, b) => b[1] - a[1]).slice(0, 18) };
    await mkdir(output, { recursive: true });
    await writeFile(`${output}typing-${process.env.SEARCH_PROFILE}.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!process.env.SEARCH_PROFILE.startsWith('before')) {
      assert.ok(Math.max(0, ...metrics.longTasks) < 200, 'typing must not trigger long UI stalls');
    }
  } else {
  await input.fill('7');
  await input.press('Enter');
  const deadline = Date.now() + 10_000;
  while (!releaseSearch) {
    assert.ok(Date.now() < deadline, 'search must start');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await input.fill('');
  releaseSearch();
  await page.waitForTimeout(700);
  assert.equal(await page.getByRole('heading', { name: member.name, exact: true }).count(), 0,
    'clearing a submitted search must prevent its delayed response from opening a member');
  assert.equal(await input.inputValue(), '', 'delayed search must not replace the cleared draft');
  console.log('PASS actual reception: clearing a pending Enter search does not open the old member');

  hold = false;
  failed = true;
  await input.fill('unavailable');
  await page.getByRole('alert').filter({ hasText: 'Search temporarily unavailable' }).waitFor();
  console.log('PASS actual reception: failed autocomplete explains the failure');

  failed = false;
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await page.getByRole('button').filter({ hasText: member.name }).waitFor();
  assert.equal(started.filter(q => q === 'unavailable').length, 2, 'retry should send one new request');
  console.log('PASS actual reception: retry recovers results without retyping');

  empty = true;
  await input.fill('nothing');
  await page.getByRole('status').filter({ hasText: 'لا توجد نتائج مطابقة.' }).waitFor();
  console.log('PASS actual reception: empty results are explicit');

  empty = false;
  hold = true;
  releaseSearch = undefined;
  await input.fill('slow');
  await input.press('Enter');
  const heldDeadline = Date.now() + 10_000;
  while (!releaseSearch) {
    assert.ok(Date.now() < heldDeadline);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const newerResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get('q') === 'newer');
  await input.fill('newer');
  // Resolve before the 200ms debounce: invalidate on the raw edit, not just the query key.
  releaseSearch();
  hold = false;
  await newerResponse;
  await page.getByRole('button').filter({ hasText: member.name }).waitFor();
  assert.equal(await page.getByRole('heading', { name: member.name, exact: true }).count(), 0);
  assert.equal(await input.inputValue(), 'newer');
  console.log('PASS actual reception: a response during the debounce cannot replace newer typing');

  const beforeEnter = started.length;
  await input.press('Enter');
  await page.getByRole('heading', { name: member.name, exact: true }).waitFor();
  assert.equal(started.length, beforeEnter, 'Enter reuses the current result');
  await page.getByRole('button', { name: 'إغلاق', exact: true }).last().click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="بحث سريع عن العضو"]')?.value === '');
  assert.equal(await input.inputValue(), '');
  console.log('PASS actual reception: current Enter opens the member and close resets search');

  hold = true;
  releaseSearch = undefined;
  await input.fill('scoped');
  await input.press('Enter');
  const scopeDeadline = Date.now() + 10_000;
  while (!releaseSearch) {
    assert.ok(Date.now() < scopeDeadline);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Test Branch' }) }).selectOption('1');
  releaseSearch();
  await page.waitForTimeout(300);
  assert.equal(await page.getByRole('heading', { name: member.name, exact: true }).count(), 0);
  assert.equal(await input.inputValue(), '');
  console.log('PASS actual reception: changing branch invalidates pending submissions');

  hold = true;
  releaseSearch = undefined;
  await input.fill('timeout');
  const waiting = page.getByRole('status').filter({ hasText: 'جاري البحث' });
  await waiting.waitFor();
  await page.getByRole('alert').filter({ hasText: 'تعذر البحث عن العضو' }).waitFor();
  releaseSearch?.();
  console.log('PASS actual reception: unresponsive requests exit loading after 10 seconds');

  await mkdir(output, { recursive: true });
  const searchCard = page.getByRole('heading', { name: 'بحث سريع عن العضو', exact: true }).locator('..').locator('..');
  await searchCard.screenshot({ path: `${output}desktop-error.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await searchCard.screenshot({ path: `${output}mobile-error.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  hold = false;
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/club/reception?scan=A000007`);
  await page.getByRole('heading', { name: member.name, exact: true }).waitFor();
  console.log('PASS scanner URL opens the exact member on initial mount');
  await page.getByRole('button', { name: 'إغلاق', exact: true }).last().click();
  await page.getByRole('button', { name: 'تبديل اللغة', exact: true }).click();
  await page.getByRole('heading', { name: 'Quick member search', exact: true }).waitFor();
  empty = true;
  await page.getByRole('textbox', { name: 'Quick member search', exact: true }).fill('english');
  await page.getByRole('status').filter({ hasText: 'No matching results.' }).waitFor();
  console.log('PASS English overlays and live locale switching remain intact');
  assert.deepEqual(writes, [], 'search tests must never record attendance or mutate members');
  assert.deepEqual(errors, []);
  }
} finally {
  releaseSearch?.();
  await browser.close();
  await server.close();
}
