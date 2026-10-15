import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ONE80_PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const requests = [];
const releases = new Map();
async function waitForHeldRequest(key) {
  const deadline = Date.now() + 10_000;
  while (!releases.has(key)) {
    assert.ok(Date.now() < deadline, `Timed out waiting for ${key}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
const hit = (q, brief) => ({ id: q === '3333' ? 1 : 2, memberCode: q, name: `Member ${q}`,
  branchId: 2, gender: 'female', phone: null, cardNumber: null, isActive: true,
  matchType: 'code', score: 1000, activeSubscriptionType: brief ? null : 'Monthly',
  subscriptionStatus: null, remainingAmount: null, lastCheckIn: null });
try {
  await page.route('**/api/club/search?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    const q = params.get('q');
    const brief = params.get('brief') === 'true';
    requests.push({ q, brief, branch: params.get('branchId'), gender: params.get('gender') });
    if (!brief || q === 'slow') await new Promise(resolve => releases.set(`${q}:${brief}`, resolve));
    if (q === 'fail' && !brief) await route.fulfill({ status: 500, json: {} }).catch(() => {});
    else await route.fulfill({ json: q === 'empty' ? [] : [hit(q, brief)] }).catch(() => {});
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/scripts/search-performance.html`);
  const section = page.locator('#live-reception');
  const input = section.locator('input');
  await input.waitFor();
  const started = Date.now();
  await input.fill('3333');
  await section.locator('[data-hit]').waitFor();
  const identitiesMs = Date.now() - started;
  await page.waitForFunction(() => document.querySelector('#live-reception [data-hit]'));
  await waitForHeldRequest('3333:false');
  assert.equal(await section.locator('[data-package]').textContent(), '');
  await section.locator('[data-hit]').click();
  assert.equal(await section.locator('[data-selected]').textContent(), 'Member 3333');
  await new Promise(resolve => setTimeout(resolve, 1200));
  const legacyWaitMs = Date.now() - started;
  releases.get('3333:false')();
  await section.locator('[data-package]').filter({ hasText: 'Monthly' }).waitFor();
  console.log(`PASS controlled history delay: identities selectable at ${identitiesMs}ms; full response held until ${legacyWaitMs}ms (not production latency)`);
  assert.ok(identitiesMs < legacyWaitMs);
  assert.ok(requests.every(r => r.branch === '2' && r.gender === 'female'));

  await input.fill('slow');
  await waitForHeldRequest('slow:true');
  await input.fill('7');
  const searchButton = section.locator('button').nth(1);
  assert.equal(await searchButton.isEnabled(), true);
  await searchButton.click();
  await section.locator('[data-selected]').filter({ hasText: 'Member 7' }).waitFor();
  releases.get('slow:true')();
  await section.locator('[data-hit]').filter({ hasText: 'Member 7' }).waitFor();
  assert.equal(await section.locator('[data-hit]').filter({ hasText: 'Member slow' }).count(), 0);
  assert.equal(requests.filter(r => r.q === '7' && r.brief).length, 1);
  console.log('PASS new query submits during old request, one-digit codes, shared request, no stale results');

  await input.fill('empty');
  await page.waitForFunction(() => !document.querySelector('#live-reception [data-hit]'));
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.equal(requests.filter(r => r.q === 'empty' && !r.brief).length, 0);
  await input.fill('fail');
  await section.locator('[data-hit]').filter({ hasText: 'Member fail' }).waitFor();
  await waitForHeldRequest('fail:false');
  releases.get('fail:false')();
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(await section.locator('[data-hit]').count(), 1);
  assert.deepEqual(errors, []);
  console.log('PASS empty search skips history; metadata failure leaves identities selectable');
} finally {
  for (const release of releases.values()) release();
  await browser.close();
  await server.close();
}
