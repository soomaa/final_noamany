import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createFixtureServer } from './local-app-fixture-server.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ONE80_PLAYWRIGHT_MODULE || 'playwright');
const server = await createFixtureServer();
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const output = fileURLToPath(new URL('../../outputs/gym-operations-20261015/', import.meta.url));
await mkdir(output, { recursive: true });
const errors = [];
try {
  for (const [name, viewport, locale] of [['desktop', { width: 1440, height: 1000 }, 'ar'], ['mobile', { width: 390, height: 844 }, 'en']]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(value => localStorage.setItem('hr_locale', value), locale);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => { errors.push(error.message); console.log('PAGEERROR', error.message); });
    page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE', msg.text()); });
    const rows = [1, 2].map(id => ({ id, status: 'pending', startDate: '2026-10-20', days: 5,
      memberId: id, memberName: `عضو تجريبي ${id}`, memberCode: `A00000${id}`, memberPhone: null,
      subscriptionNumber: `S${id}`, subscriptionType: 'اشتراك شهري', subscriptionEndDate: '2026-11-30',
      reason: 'سفر', createdAt: '2026-10-15T09:00:00Z', decisionNote: null, decidedByName: null }));
    let writes = 0; let loads = 0; let releasePost; let onPost; let rejectFailed = false;
    const nextPost = () => new Promise(resolve => { onPost = resolve; });
    await page.route('**/api/**', async route => {
      const request = route.request(); const pathname = new URL(request.url()).pathname;
      if (!pathname.startsWith('/api/')) return route.fallback();
      const path = pathname.slice(4); let body = [];
      if (request.method() === 'POST' && path.startsWith('/club-freeze-requests/')) {
        writes++;
        await new Promise(resolve => { releasePost = resolve; onPost(); });
        if (path.endsWith('/reject') && !rejectFailed) { rejectFailed = true; return route.fulfill({ status: 503, json: { message: 'Temporary failure' } }); }
        const id = Number(path.split('/')[2]);
        rows.find(row => row.id === id).status = path.endsWith('/approve') ? 'scheduled' : 'rejected';
        body = { id, status: rows.find(row => row.id === id).status };
      } else if (path === '/club-freeze-requests') { loads++; body = { data: rows.filter(row => row.status === 'pending'), counts: { pending: rows.filter(row => row.status === 'pending').length } }; }
      else if (path === '/auth/me') body = { sub: 1, id: 1, name: 'Test Operator', level: 1, branch: 1 };
      else if (path === '/me/permissions') body = { superAdmin: true, keys: [], routeMap: {}, resourceActions: {}, scope: {} };
      else if (path === '/me/workspace') body = { homeRoute: '/club/subscriptions/freeze-requests', widgets: [], roleHint: 'admin' };
      else if (path.endsWith('branches') || path.endsWith('branch-options')) body = [{ id: 1, name: 'فرع تجريبي', isActive: true }];
      else if (path.endsWith('/unread-count')) body = { count: 0 };
      else if (path === '/shifts/schedule-status') body = { current: null, next: null, secondsUntilNext: null, alertActive: false };
      await route.fulfill({ json: body });
    });
    await page.goto(`${base}/club/subscriptions/freeze-requests`);
    const approve = page.getByRole('button', { name: /^(موافقة|Approve|Approval)$/i });
    await approve.first().waitFor().catch(async error => { console.log(await page.locator("body").innerText()); console.log("URL", page.url()); throw error; });
    await page.screenshot({ path: `${output}${name}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name} document overflow`);
    await approve.first().click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    await dialog.getByRole('button', { name: /^(إلغاء|Cancel)$/i }).click();
    await approve.first().waitFor({ state: 'visible' });
    await approve.first().click();
    let postStarted = nextPost();
    await dialog.getByRole('button', { name: /^(تأكيد|Confirm)$/i }).click();
    await postStarted;
    assert.equal(writes, 1);
    assert.equal(await approve.first().isDisabled(), true);
    const priorLoads = loads; releasePost();
    await page.waitForResponse(response => response.url().includes('/api/club-freeze-requests?') && response.request().method() === 'GET');
    assert.ok(loads > priorLoads, 'successful approval refreshes cached request data');
    const reject = page.getByRole('button', { name: /^(رفض|Reject)$/i }).first();
    await reject.click();
    const textarea = page.locator('#freeze-rejection-note'); await textarea.fill('يرجى مراجعة الاستقبال');
    assert.ok(await textarea.getAttribute('id'));
    await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); });
    await page.screenshot({ path: `${output}${name}-reject.png` });
    postStarted = nextPost();
    await dialog.getByRole('button', { name: /^(رفض الطلب|Reject request)$/i }).click();
    await postStarted;
    assert.equal(writes, 2); assert.equal(await textarea.isDisabled(), true);
    await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), true);
    releasePost();
    await page.getByText('Temporary failure', { exact: true }).last().waitFor();
    assert.equal(await textarea.inputValue(), 'يرجى مراجعة الاستقبال', 'failed rejection preserves its reason');
    postStarted = nextPost();
    await dialog.getByRole('button', { name: /^(رفض الطلب|Reject request)$/i }).click();
    await postStarted; assert.equal(writes, 3);
    releasePost(); await dialog.waitFor({ state: 'hidden' });
    console.log(`PASS ${name}: approve cancellation, pending actions, refresh, accessible rejection and duplicate prevention`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); await server.close(); }
