import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '/Users/fatmaatefkasem/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const password = process.env.NOAMANY_E2E_PASSWORD;
if (!password) throw new Error('NOAMANY_E2E_PASSWORD is required');

const adminBase = 'http://127.0.0.1:5176';
const publicBase = 'http://127.0.0.1:5175';
const apiBase = 'http://127.0.0.1:4000/api';
const evidenceRoot = new URL('../review/client-requirements-2026-09-09/', import.meta.url);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'ar-EG',
  timezoneId: 'Africa/Cairo',
  colorScheme: 'light',
});

const login = await context.request.post(`${apiBase}/auth/login`, {
  data: { username: 'admin', password },
});
if (!login.ok()) throw new Error(`Local admin login failed (${login.status()})`);
const loginBody = await login.json();
const authHeaders = { Authorization: `Bearer ${loginBody.accessToken}` };

async function firstMatchingId(path, predicate = () => true, fallback = 1) {
  try {
    const response = await context.request.get(`${apiBase}${path}`, { headers: authHeaders });
    if (!response.ok()) return fallback;
    const body = await response.json();
    const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
    return Number((rows.find(predicate) ?? rows[0])?.id ?? fallback);
  } catch {
    return fallback;
  }
}

const [trainerId, memberId] = await Promise.all([
  firstMatchingId('/club-trainers?page=1&pageSize=200', (row) => Number(row?.employeeId) > 0),
  firstMatchingId('/club-members?page=1&pageSize=1'),
]);

const captures = [
  ['TGT-01', `${adminBase}/club/fitness/trainer-payments`],
  ['TGT-02', `${adminBase}/club/fitness/trainers/${trainerId}?tab=target`],
  ['TGT-03', `${adminBase}/club/targets`],
  ['TGT-04', `${adminBase}/club/targets?tab=sales`],
  ['EVAL-01', `${adminBase}/hr/evaluations?tab=criteria`],
  ['EVAL-02', `${adminBase}/hr/evaluations?tab=monthly`],
  ['EVAL-03', `${adminBase}/me/evaluations`],
  ['EVAL-04', `${adminBase}/me/permissions`],
  ['MEM-01', `${adminBase}/club/members/${memberId}?tab=documents`],
  ['BAR-01', `${adminBase}/club/reception`],
  ['BAR-02', `${adminBase}/club/members/barcode-management?tab=staff`],
  ['BAR-03', `${adminBase}/club/members/barcode-management?tab=classes`],
  ['BAR-04', `${adminBase}/club/reception?scanner=open`],
  ['IA-01', `${adminBase}/club/members`],
  ['SCOPE-01', `${adminBase}/club/members/new`],
  ['SCOPE-02', `${adminBase}/club/subscriptions/reports`],
  ['SCOPE-03', `${adminBase}/users/1/permissions`],
  ['CS-01', `${adminBase}/club/customer-service?tab=follow-up`],
  ['CS-02', `${adminBase}/club/customer-service?tab=questions`],
  ['CS-03', `${adminBase}/club/customer-service?tab=opinions`],
  ['CAFE-01', `${adminBase}/club/cafe/inventory?tab=management-withdrawals`],
  ['CAFE-02', `${adminBase}/club/cafe/reports`],
  ['CAFE-03', `${adminBase}/club/targets?tab=sales`],
  ['SUB-01', `${adminBase}/club/subscriptions/reports?preset=today`],
  ['SUB-02', `${adminBase}/club/subscriptions/reports`],
  ['LOCK-01', `${adminBase}/club/lockers?tab=inventory`],
  ['LOCK-02', `${adminBase}/club/lockers?tab=inventory-review`],
  ['REP-01', `${adminBase}/club/subscriptions/reports?tab=monthly-analysis`],
  ['REP-02', `${adminBase}/club/subscriptions/daily-cashier`],
  ['WEB-01', `${adminBase}/portal/section-settings`],
  ['APP-03', `${publicBase}/memberships.html`],
  ['APP-04', `${adminBase}/portal/payment-methods`],
  ['APP-05', `${publicBase}/membership-checkout.html`],
  ['APP-06', `${adminBase}/club/subscriptions/online`],
  ['APP-07', `${adminBase}/club/subscriptions/online`],
];

const adminPage = await context.newPage();
await adminPage.goto(`${adminBase}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
await adminPage.waitForTimeout(800);
if (adminPage.url().includes('/login')) throw new Error('Local admin session did not bootstrap');
const publicPage = await context.newPage();
const results = [];

for (const [id, url] of captures) {
  const targetDir = new URL(`${id}/`, evidenceRoot);
  await mkdir(targetDir, { recursive: true });
  const entry = { id, requestedUrl: url, desktop: null, mobile: null, errors: [] };
  const isAdmin = url.startsWith(adminBase);
  const page = isAdmin ? adminPage : publicPage;
  if (isAdmin) {
    const target = new URL(url);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate((path) => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, `${target.pathname}${target.search}`);
    await page.waitForTimeout(1_200);
    if (id === 'MEM-01') {
      const documents = page.getByText('ملف العضوية والمستندات', { exact: true });
      await documents.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => undefined);
      await documents.scrollIntoViewIfNeeded().catch(() => undefined);
      await page.waitForTimeout(300);
    }
    if (id === 'BAR-04') {
      const scannerButton = page.getByRole('button', { name: /مسح الكارت/ }).first();
      if (await scannerButton.isVisible().catch(() => false)) await scannerButton.click();
      await page.waitForTimeout(300);
    }
  }
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    await page.setViewportSize(viewport);
    let response = null;
    if (!isAdmin && name === 'desktop') {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    }
    await page.waitForTimeout(isAdmin ? 300 : 800);
    const finalUrl = page.url();
    const title = await page.title();
    const text = (await page.locator('body').innerText()).slice(0, 500);
    const loginRedirect = finalUrl.includes('/login');
    const path = new URL(`${id}/${name}.png`, evidenceRoot);
    await page.screenshot({ path: path.pathname, fullPage: false });
    entry[name] = { status: response?.status() ?? (isAdmin ? 200 : null), finalUrl, title, loginRedirect, text };
    if (loginRedirect) entry.errors.push(`${name}: redirected to login`);
  }
  results.push(entry);
}

await writeFile(
  new URL('capture-report.json', evidenceRoot),
  JSON.stringify({ capturedAt: new Date().toISOString(), trainerId, memberId, results }, null, 2),
);
await browser.close();

const failures = results.filter((row) => row.errors.length);
process.stdout.write(`Captured ${results.length} requirement routes; login redirects: ${failures.length}\n`);
if (failures.length) process.exitCode = 2;
