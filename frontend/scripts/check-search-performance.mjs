import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.ONE80_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const output = fileURLToPath(new URL('../../docs/search-performance-20261008/', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const url = `http://127.0.0.1:${port}/scripts/search-performance.html`;
const state = () => page.evaluate(() => ({ ...window.searchQA, external: undefined, unmountTable: undefined, mountTable: undefined }));
const load = async () => {
  await page.goto(url);
  await page.locator('#table input').waitFor();
  await page.clock.install();
};
try {
  await load();
  const before = await state();
  const input = page.locator('#table input');
  const term = '01012345678';
  await input.pressSequentially(term);
  assert.equal(await input.inputValue(), term);
  assert.equal((await state()).tableRenders, before.tableRenders, 'table must not render during typing');
  assert.deepEqual((await state()).commits, []);
  await page.clock.runFor(310);
  assert.deepEqual((await state()).commits, [term]);
  assert.equal((await state()).tableRenders, before.tableRenders + 1);
  await page.locator('#baseline input').pressSequentially(term);
  assert.equal((await state()).baselineRenders - before.baselineRenders, term.length);
  console.log(`PASS ${term.length} keystrokes: baseline ${term.length} parent renders, improved 0 while typing / 1 after pause`);

  await input.fill('منى محمد');
  await input.press('Enter');
  await page.clock.runFor(400);
  assert.deepEqual((await state()).commits, [term, 'منى محمد']);
  console.log('PASS Arabic paste + Enter: immediate, single commit');

  await page.evaluate(() => { window.searchQA.acknowledgementDelay = 60; });
  await input.fill('a');
  await page.clock.runFor(310);
  await input.fill('ab');
  await page.clock.runFor(65);
  assert.equal(await input.inputValue(), 'ab', 'late acknowledgement must not erase the new character');
  await page.clock.runFor(250);
  assert.equal((await state()).commits.at(-1), 'ab');
  console.log('PASS late parent acknowledgement retains newer typing');

  await page.clock.runFor(100);
  await page.evaluate(() => { window.searchQA.acknowledgementDelay = 0; window.searchQA.external('B000090'); });
  await page.waitForFunction(() => document.querySelector('#table input').value === 'B000090');
  await input.fill('pending');
  await page.evaluate(() => window.searchQA.external(''));
  await page.waitForFunction(() => document.querySelector('#table input').value === '');
  const commits = (await state()).commits.length;
  await page.clock.runFor(400);
  assert.equal((await state()).commits.length, commits, 'external reset must cancel pending search');
  console.log('PASS external reset cancels pending work');

  await input.dispatchEvent('compositionstart');
  await input.fill('محمد');
  await page.clock.runFor(500);
  assert.equal((await state()).commits.length, commits);
  await input.dispatchEvent('compositionend', { data: 'محمد' });
  await page.clock.runFor(310);
  assert.equal((await state()).commits.at(-1), 'محمد');
  console.log('PASS IME composition does not send partial text');

  await input.fill('unmounted');
  await page.evaluate(() => window.searchQA.unmountTable());
  await page.waitForFunction(() => !document.querySelector('#table input'));
  const atUnmount = (await state()).commits.length;
  await page.clock.runFor(400);
  assert.equal((await state()).commits.length, atUnmount);
  console.log('PASS unmount cancels pending search');

  const reception = page.locator('#reception input');
  await reception.fill('B000090');
  await reception.press('Enter');
  await page.clock.runFor(400);
  assert.deepEqual((await state()).submits, ['B000090']);
  await reception.fill('01011112222');
  await page.locator('#reception button').last().click();
  assert.deepEqual((await state()).submits, ['B000090', '01011112222']);
  console.log('PASS reception scanner Enter and search button use current draft');

  const requests = [];
  await page.route('**/api/club/search?**', async route => {
    requests.push(new URL(route.request().url()));
    await route.fulfill({ json: [{ id: 90, memberCode: 'B000090', name: 'منى محمد', phone: '01012345678',
      branchId: 2, gender: 'female', cardNumber: null, isActive: true, score: 1000, matchType: 'code',
      activeSubscriptionType: null, subscriptionStatus: null, remainingAmount: null, lastCheckIn: null }] });
  });
  const combo = page.locator('#combobox input');
  await combo.fill('منى');
  await page.clock.runFor(260);
  await page.locator('#combobox [role="option"]').waitFor();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get('brief'), 'true');
  assert.equal(requests[0].searchParams.get('branchId'), '2');
  assert.equal(requests[0].searchParams.get('limit'), '5');
  await combo.fill('م');
  await page.clock.runFor(300);
  assert.equal(await page.locator('#combobox [role="option"]').count(), 0);
  assert.equal(await page.locator('#combobox .animate-spin').count(), 0);
  console.log('PASS combobox uses brief, scoped search and clears short-query loading');
  for (const digit of ['7', '٧', '۷']) {
    const count = requests.length;
    await combo.fill(digit);
    await page.clock.runFor(310);
    await page.locator('#combobox [role="option"]').waitFor();
    assert.equal(requests.length, count + 1);
    assert.equal(requests.at(-1).searchParams.get('q'), digit);
  }
  console.log('PASS first-digit search accepts English, Arabic and Persian numerals');

  const labelRequests = [];
  await page.route('**/api/club/search/metadata?**', async route => {
    labelRequests.push(new URL(route.request().url()));
    await route.fulfill({ json: [{ id: 90, activeSubscriptionType: 'Monthly' }] });
  });
  const liveInput = page.locator('#live-reception input');
  const beforeLive = requests.length;
  await liveInput.fill('7');
  await page.clock.runFor(210);
  await page.locator('#live-reception [data-hit]').waitFor();
  assert.equal(requests.length, beforeLive + 1);
  assert.equal(requests.at(-1).searchParams.get('brief'), 'true');
  await page.clock.runFor(650);
  await page.locator('#live-reception [data-package]').filter({ hasText: 'Monthly' }).waitFor();
  assert.equal(labelRequests.length, 1);
  assert.equal(labelRequests[0].searchParams.get('memberIds'), '90');
  assert.equal(labelRequests[0].searchParams.get('branchId'), '2');
  assert.equal(labelRequests[0].searchParams.get('gender'), 'female');
  assert.equal(requests.length, beforeLive + 1, 'package labels must not repeat the member search');
  await page.clock.runFor(2_500);
  await liveInput.press('Enter');
  await page.locator('#live-reception [data-selected]').filter({ hasText: 'منى محمد' }).waitFor();
  assert.equal(requests.length, beforeLive + 1, 'Enter must reuse the current brief result');
  console.log('PASS reception uses one identity search, scoped ID-only labels and cached Enter');

  await page.unroute('**/api/club/search?**');
  let releaseOld;
  const aborted = [];
  page.on('requestfailed', request => aborted.push(request.url()));
  await page.route('**/api/club/search?**', async route => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q === 'old') await new Promise(resolve => { releaseOld = resolve; });
    await route.fulfill({ json: [{ id: 91, memberCode: 'B000091', name: q === 'old' ? 'Old result' : 'New result',
      branchId: 2, gender: 'female', phone: null, cardNumber: null, isActive: true,
      score: 50, matchType: 'name', activeSubscriptionType: null, subscriptionStatus: null,
      remainingAmount: null, lastCheckIn: null }] }).catch(() => {});
  });
  const oldRequest = page.waitForRequest(request => new URL(request.url()).searchParams.get('q') === 'old');
  await combo.fill('old');
  await page.clock.runFor(260);
  await oldRequest;
  await combo.fill('new');
  await page.clock.runFor(260);
  await page.locator('#combobox [role="option"]').filter({ hasText: 'New result' }).waitFor();
  releaseOld();
  await page.clock.runFor(300);
  assert.equal(await page.locator('#combobox [role="option"]').filter({ hasText: 'Old result' }).count(), 0);
  assert.ok(aborted.some(url => new URL(url).searchParams.get('q') === 'old'));
  console.log('PASS superseded search is aborted and cannot replace newer results');

  await page.evaluate(() => { window.searchQA.mountTable(); document.querySelector('#baseline').hidden = true; });
  await page.locator('#table input').waitFor();
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: `${output}desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile overflow');
  assert.deepEqual(errors, []);
  console.log('PASS desktop/mobile layout and no browser runtime errors');
} finally {
  await browser.close();
  await server.close();
}
