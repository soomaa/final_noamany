const { chromium } = require('C:/Users/ME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const baseUrl = process.env.UI_SMOKE_BASE_URL || 'http://localhost:5173';
const routes = [
  '/dashboard',
  '/hub/club',
  '/club/reception',
  '/club/members',
  '/club/subscriptions',
  '/club/fitness/inbody',
  '/club/cafe/products',
  '/inventory',
  '/sales',
  '/procurement',
  '/accounting',
  '/finance',
  '/hub/hr',
  '/employees',
  '/attendance',
  '/payroll',
  '/hub/app-management',
  '/hub/portal-management',
  '/reports',
  '/hub/settings',
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill(process.env.UI_SMOKE_PASSWORD || 'noamany@123');
  await page.locator('button[type="submit"]').click();
  await page.waitForFunction(() => location.pathname !== '/login', null, { timeout: 30000 });

  const results = [];
  for (const route of routes) {
    const apiProblems = [];
    const consoleErrors = [];
    const onConsole = (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 240));
    };
    const onResponse = async (response) => {
      if (!response.url().includes('/api/')) return;
      const path = new URL(response.url()).pathname;
      if (response.status() >= 400) {
        apiProblems.push(`${response.status()} ${path}`);
        return;
      }
      if (!(response.headers()['content-type'] || '').includes('application/json')) return;
      try {
        const body = await response.json();
        if (Number(body?.status) >= 400) apiProblems.push(`logical ${body.status} ${path}`);
      } catch {}
    };
    page.on('console', onConsole);
    page.on('response', onResponse);
    let error = null;
    try {
      await page.evaluate((nextRoute) => {
        window.history.pushState({}, '', nextRoute);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, route);
      await page.waitForTimeout(1800);
    } catch (reason) {
      error = String(reason?.message || reason).slice(0, 300);
    }
    results.push({
      requestedRoute: route,
      landedPath: new URL(page.url()).pathname,
      error,
      apiProblems: [...new Set(apiProblems)],
      consoleErrors: [...new Set(consoleErrors)],
    });
    page.off('console', onConsole);
    page.off('response', onResponse);
  }
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
